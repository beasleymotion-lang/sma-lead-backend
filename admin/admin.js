// admin/admin.js
// Vanilla JS — no build step, no framework, matches the site's own approach.

const API_BASE_URL = ''; // set to the deployed backend origin if admin is served from elsewhere

let authToken = sessionStorage.getItem('sma_admin_token') || null;
let currentView = 'dashboard';
let propertiesCache = [];
let editingPropertyId = null;
let formImages = []; // {url, order} for existing + {dataUri, isNew} for pending uploads
const MAX_LISTING_PHOTOS = 20;
const PHOTO_UPLOAD_BATCH_SIZE = 3;
let formTags = { highlights: [], features: [], amenities: [] };

/* ============ AUTH ============ */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errBox = document.getElementById('login-error');
  errBox.classList.remove('show');
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed.');
    authToken = data.token;
    sessionStorage.setItem('sma_admin_token', authToken);
    showApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await apiFetch('/api/admin/logout', { method: 'POST' }); } catch {}
  authToken = null;
  sessionStorage.removeItem('sma_admin_token');
  document.getElementById('app').classList.remove('show');
  document.getElementById('login-screen').style.display = 'flex';
});

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('show');
  loadView('dashboard');
}

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
  if (res.status === 401) {
    authToken = null;
    sessionStorage.removeItem('sma_admin_token');
    document.getElementById('app').classList.remove('show');
    document.getElementById('login-screen').style.display = 'flex';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

if (authToken) showApp();

/* ============ NAV ============ */
document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => loadView(btn.dataset.view));
});
function loadView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'dashboard') renderDashboard();
  if (view === 'properties') renderPropertiesView();
  if (view === 'leads') renderLeadsView();
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}
function fmtPrice(price, currency) {
  return `${currency === 'MXN' ? 'MXN $' : '$'}${Math.round(price || 0).toLocaleString('en-US')}`;
}
function statusLabel(s) {
  return { for_sale: 'For Sale', for_rent: 'For Rent', pending: 'Pending', sold: 'Sold' }[s] || s;
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  el.innerHTML = `<div class="page-head"><div><h2>Dashboard</h2><p>An overview of your listings and pipeline.</p></div>
    <button class="btn btn-gold" onclick="openPropertyForm()">+ Add Property</button></div>
    <div id="dash-stats" class="stats-grid"></div>
    <div class="dash-grid">
      <div class="panel"><h4>Most Viewed Listings</h4><div id="dash-most-viewed"></div></div>
      <div class="panel"><h4>Recent Leads</h4><div id="dash-recent-leads"></div></div>
    </div>`;
  try {
    const { stats } = await apiFetch('/api/admin/dashboard-stats');
    document.getElementById('dash-stats').innerHTML = [
      ['Total', stats.total], ['Featured', stats.featured], ['For Sale', stats.forSale],
      ['For Rent', stats.forRent], ['Pending', stats.pending], ['Sold', stats.sold],
    ].map(([lbl, n]) => `<div class="stat-card"><div class="num">${n}</div><div class="lbl">${lbl}</div></div>`).join('');
    document.getElementById('dash-most-viewed').innerHTML = stats.mostViewed.length
      ? stats.mostViewed.map((p) => `<div class="panel-row"><span>${p.title}</span><span class="mono">${p.views} views</span></div>`).join('')
      : `<p class="hint">No views tracked yet.</p>`;
  } catch (err) { toast(err.message, true); }
  try {
    const { leads } = await apiFetch('/api/admin/leads-recent');
    document.getElementById('dash-recent-leads').innerHTML = leads.length
      ? leads.map((l) => `<div class="panel-row"><span>${l.name} — ${l.property_title || 'General inquiry'}</span><span class="mono">${l.stage}</span></div>`).join('')
      : `<p class="hint">No leads yet.</p>`;
  } catch (err) { /* non-fatal */ }
}

/* ============ PROPERTIES VIEW ============ */
async function renderPropertiesView(filters = {}) {
  const el = document.getElementById('view-properties');
  el.innerHTML = `<div class="page-head"><div><h2>Properties</h2><p>Add, edit, and manage every listing on your site.</p></div>
    <button class="btn btn-gold" onclick="openPropertyForm()">+ Add Property</button></div>
    <div class="table-toolbar">
      <input type="text" id="prop-search" placeholder="Search properties…" style="min-width:220px;">
      <select id="prop-status-filter"><option value="">All Statuses</option><option value="for_sale">For Sale</option><option value="for_rent">For Rent</option><option value="pending">Pending</option><option value="sold">Sold</option></select>
      <select id="prop-sort"><option value="newest">Newest</option><option value="price_low">Price: Low to High</option><option value="price_high">Price: High to Low</option><option value="featured">Featured First</option></select>
    </div>
    <div id="prop-table-wrap"></div>`;

  document.getElementById('prop-search').addEventListener('input', debounce(loadProperties, 300));
  document.getElementById('prop-status-filter').addEventListener('change', loadProperties);
  document.getElementById('prop-sort').addEventListener('change', loadProperties);
  loadProperties();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function loadProperties() {
  const search = document.getElementById('prop-search')?.value || '';
  const status = document.getElementById('prop-status-filter')?.value || '';
  const sort = document.getElementById('prop-sort')?.value || 'newest';
  const params = new URLSearchParams({ includeArchived: 'false', sort });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const res = await fetch(`${API_BASE_URL}/api/properties?${params}`);
    const data = await res.json();
    propertiesCache = data.properties || [];
    renderPropertiesTable();
  } catch (err) { toast('Could not load properties.', true); }
}

function renderPropertiesTable() {
  const wrap = document.getElementById('prop-table-wrap');
  if (!propertiesCache.length) {
    wrap.innerHTML = `<div id="empty-state">No properties yet. <br><button class="btn btn-gold" style="margin-top:14px;" onclick="openPropertyForm()">Add Your First Property</button></div>`;
    return;
  }
  wrap.innerHTML = `<table>
    <thead><tr><th></th><th>Title</th><th>Neighborhood</th><th>Price</th><th>Status</th><th>Featured</th><th>Views</th><th></th></tr></thead>
    <tbody>
      ${propertiesCache.map((p) => `
        <tr>
          <td><img class="thumb" src="${p.featured_image || ''}" alt="" onerror="this.style.visibility='hidden'"></td>
          <td><b>${p.title}</b><div class="hint">${p.bedrooms || 0} bd · ${p.bathrooms || 0} ba · ${p.construction_size || '—'} m²</div></td>
          <td>${p.neighborhood || '—'}</td>
          <td>${fmtPrice(p.price, p.currency)}</td>
          <td><span class="badge badge-${p.status}">${statusLabel(p.status)}</span></td>
          <td><button class="icon-btn star-btn ${p.featured ? 'active' : ''}" onclick="toggleFeatured(${p.id}, ${!p.featured})" title="Toggle featured">
            <svg viewBox="0 0 24 24" fill="${p.featured ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/></svg>
          </button></td>
          <td class="mono">${p.views}</td>
          <td><div class="row-actions">
            <button class="icon-btn" title="Edit" onclick="openPropertyForm(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></svg></button>
            <button class="icon-btn" title="Duplicate" onclick="duplicateProperty(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
            <select class="stage-select" style="font-size:10.5px;" onchange="changeStatus(${p.id}, this.value)">
              ${['for_sale','for_rent','pending','sold'].map(s => `<option value="${s}" ${p.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
            </select>
            <button class="icon-btn" title="Archive" onclick="archiveProperty(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="4"/><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8"/><path d="M10 12h4"/></svg></button>
            <button class="icon-btn" title="Delete" onclick="deleteProperty(${p.id})" style="color:var(--cantera); border-color:var(--cantera);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
          </div></td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

async function toggleFeatured(id, featured) {
  try { await apiFetch(`/api/admin/properties/${id}/featured`, { method: 'POST', body: JSON.stringify({ featured }) }); toast(featured ? 'Marked as featured.' : 'Removed from featured.'); loadProperties(); }
  catch (err) { toast(err.message, true); }
}
async function changeStatus(id, status) {
  try { await apiFetch(`/api/admin/properties/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); toast('Status updated.'); loadProperties(); }
  catch (err) { toast(err.message, true); }
}
async function archiveProperty(id) {
  if (!confirm('Archive this property? It will be hidden from the site but not deleted.')) return;
  try { await apiFetch(`/api/admin/properties/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) }); toast('Property archived.'); loadProperties(); }
  catch (err) { toast(err.message, true); }
}
async function deleteProperty(id) {
  if (!confirm('Permanently delete this property? This cannot be undone.')) return;
  try { await apiFetch(`/api/admin/properties/${id}`, { method: 'DELETE' }); toast('Property deleted.'); loadProperties(); }
  catch (err) { toast(err.message, true); }
}
async function duplicateProperty(id) {
  try { await apiFetch(`/api/admin/properties/${id}/duplicate`, { method: 'POST' }); toast('Property duplicated.'); loadProperties(); }
  catch (err) { toast(err.message, true); }
}

/* ============ PROPERTY FORM ============ */
function openPropertyForm(id = null) {
  editingPropertyId = id;
  const existing = id ? propertiesCache.find((p) => p.id === id) : null;
  formImages = existing ? existing.images.map((i) => ({ ...i, isNew: false })) : [];
  formTags = {
    highlights: existing?.highlights || [],
    features: existing?.features || [],
    amenities: existing?.amenities || [],
  };

  document.getElementById('form-box').innerHTML = `
    <div class="form-head"><h3>${existing ? 'Edit Property' : 'Add Property'}</h3><button class="form-close" onclick="closePropertyForm()">&times;</button></div>
    <form id="property-form">
      <div class="form-body">
        <div class="form-section">
          <div class="form-section-title">Basic Information</div>
          <div class="field"><label>Property Title</label><input id="f-title" required value="${esc(existing?.title)}"></div>
          <div class="form-grid3">
            <div class="field"><label>Price</label><input id="f-price" type="number" required value="${existing?.price ?? ''}"></div>
            <div class="field"><label>Currency</label><select id="f-currency"><option ${cur('USD')}>USD</option><option ${cur('MXN')}>MXN</option></select></div>
            <div class="field"><label>Status</label><select id="f-status">${['for_sale','for_rent','pending','sold'].map(s=>`<option value="${s}" ${existing?.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div>
          </div>
          <div class="form-grid2">
            <div class="field"><label>Property Type</label><input id="f-type" value="${esc(existing?.property_type)}" placeholder="Casa, Condo, Villa…"></div>
            <div class="field"><label>Neighborhood</label><input id="f-neighborhood" value="${esc(existing?.neighborhood)}" placeholder="Centro, Guadiana…"></div>
          </div>
          <div class="field"><label>Address</label><input id="f-address" value="${esc(existing?.address)}"></div>
          <div class="form-grid2">
            <div class="field"><label>Map Latitude</label><input id="f-lat" type="number" step="any" value="${existing?.map_lat ?? ''}"></div>
            <div class="field"><label>Map Longitude</label><input id="f-lng" type="number" step="any" value="${existing?.map_lng ?? ''}"></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Property Details</div>
          <div class="form-grid3">
            <div class="field"><label>Bedrooms</label><input id="f-bedrooms" type="number" value="${existing?.bedrooms ?? ''}"></div>
            <div class="field"><label>Bathrooms</label><input id="f-bathrooms" type="number" step="0.5" value="${existing?.bathrooms ?? ''}"></div>
            <div class="field"><label>Half Bathrooms</label><input id="f-half-bathrooms" type="number" value="${existing?.half_bathrooms ?? ''}"></div>
          </div>
          <div class="form-grid3">
            <div class="field"><label>Parking Spaces</label><input id="f-parking" type="number" value="${existing?.parking ?? ''}"></div>
            <div class="field"><label>Construction (m²)</label><input id="f-construction" type="number" value="${existing?.construction_size ?? ''}"></div>
            <div class="field"><label>Lot Size (m²)</label><input id="f-lot" type="number" value="${existing?.lot_size ?? ''}"></div>
          </div>
          <div class="form-grid2">
            <div class="field"><label>Year Built</label><input id="f-year" type="number" value="${existing?.year_built ?? ''}"></div>
            <div class="field"><label>Floors</label><input id="f-floors" type="number" value="${existing?.floors ?? ''}"></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Descriptions</div>
          <div class="field"><label>Short Description</label><textarea id="f-short-desc" rows="2">${esc(existing?.short_description)}</textarea></div>
          <div class="field"><label>Luxury Marketing Description</label><textarea id="f-luxury-desc" rows="5">${esc(existing?.luxury_description)}</textarea></div>
          ${tagInputSection('Highlights', 'highlights')}
          ${tagInputSection('Features', 'features')}
          ${tagInputSection('Amenities', 'amenities')}
        </div>

        <div class="form-section">
          <div class="form-section-title">Media</div>
          <div class="dropzone" id="dropzone">Drag &amp; drop photos here, or click to browse<br><span class="hint">Up to 20 photos. First photo is featured. Photos are stored securely in Supabase. Drag tiles to reorder.</span></div>
          <input type="file" id="file-input" accept="image/*" multiple style="display:none;">
          <div class="image-grid" id="image-grid"></div>
        </div>

        <div class="form-section">
          <div class="form-section-title">SEO (optional — auto-generated if left blank)</div>
          <div class="field"><label>SEO Title</label><input id="f-seo-title" value="${esc(existing?.seo_title)}"></div>
          <div class="field"><label>Meta Description</label><textarea id="f-meta-desc" rows="2">${esc(existing?.meta_description)}</textarea></div>
        </div>
      </div>
      <div class="form-footer">
        <label class="checkbox-row"><input type="checkbox" id="f-featured" ${existing?.featured ? 'checked' : ''}> Mark as Featured</label>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn btn-ghost" onclick="closePropertyForm()">Cancel</button>
          <button type="submit" class="btn btn-gold" id="publish-btn">${existing ? 'Save Changes' : 'Publish Property'}</button>
        </div>
      </div>
    </form>`;

  function cur(c) { return existing?.currency === c || (!existing && c === 'USD') ? 'selected' : ''; }
  renderImageGrid();
  setupDropzone();
  document.getElementById('property-form').addEventListener('submit', submitPropertyForm);
  document.getElementById('form-overlay').classList.add('show');
}

function esc(v) { return v == null ? '' : String(v).replace(/"/g, '&quot;'); }

function val(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function tagInputSection(label, key) {
  return `<div class="field">
    <label>${label}</label>
    <div style="display:flex; gap:8px;">
      <input type="text" id="tag-input-${key}" placeholder="Type and press Enter">
      <button type="button" class="btn btn-ghost btn-sm" onclick="addTag('${key}')">Add</button>
    </div>
    <div class="tag-input-list" id="tag-list-${key}"></div>
  </div>`;
}
function renderAllTagLists() { ['highlights','features','amenities'].forEach(renderTagList); }
function renderTagList(key) {
  const el = document.getElementById(`tag-list-${key}`);
  if (!el) return;
  el.innerHTML = formTags[key].map((t, i) => `<span class="tag-chip">${esc(t)}<button type="button" onclick="removeTag('${key}',${i})">&times;</button></span>`).join('');
}
function addTag(key) {
  const input = document.getElementById(`tag-input-${key}`);
  const val = input.value.trim();
  if (val) { formTags[key].push(val); input.value = ''; renderTagList(key); }
}
function removeTag(key, i) { formTags[key].splice(i, 1); renderTagList(key); }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('tag-input-')) {
    e.preventDefault();
    addTag(e.target.id.replace('tag-input-', ''));
  }
});
// initial render once the form is in the DOM
const _origOpenForm = openPropertyForm;

function setupDropzone() {
  const zone = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => handleFiles(input.files));
}
function handleFiles(fileList) {
  const remaining = MAX_LISTING_PHOTOS - formImages.length;
  if (remaining <= 0) {
    toast(`You can add up to ${MAX_LISTING_PHOTOS} photos per listing.`, true);
    return;
  }

  const imageFiles = [...fileList].filter(file => file.type.startsWith('image/'));
  const files = imageFiles.slice(0, remaining);
  if (imageFiles.length > remaining) {
    toast(`Only ${MAX_LISTING_PHOTOS} photos are allowed per listing.`, true);
  }

  files.forEach((file) => {
    const item = { isNew: true, processing: true, order: formImages.length };
    formImages.push(item);
    renderImageGrid();

    item.ready = compressPhoto(file)
      .then((dataUri) => {
        item.dataUri = dataUri;
        item.processing = false;
        delete item.ready;
        renderImageGrid();
      })
      .catch((err) => {
        const idx = formImages.indexOf(item);
        if (idx !== -1) formImages.splice(idx, 1);
        console.error('[admin] photo preparation failed:', err);
        toast(`Could not prepare ${file.name}.`, true);
        renderImageGrid();
      });
  });
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxSide = 2400;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function renderImageGrid() {
  const grid = document.getElementById('image-grid');
  if (!grid) return;
  grid.innerHTML = formImages.map((img, i) => `
    <div class="image-tile ${i === 0 ? 'featured' : ''}" draggable="true" data-idx="${i}">
      ${img.processing ? '<div class="image-processing">Preparing…</div>' : `<img src="${img.url || img.dataUri}" alt="">`}
      <button type="button" class="rm" onclick="removeImage(${i})">&times;</button>
    </div>`).join('');
  // simple drag-to-reorder
  let dragIdx = null;
  grid.querySelectorAll('.image-tile').forEach((tile) => {
    tile.addEventListener('dragstart', () => { dragIdx = Number(tile.dataset.idx); });
    tile.addEventListener('dragover', (e) => e.preventDefault());
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIdx = Number(tile.dataset.idx);
      if (dragIdx === null || dragIdx === dropIdx) return;
      const [moved] = formImages.splice(dragIdx, 1);
      formImages.splice(dropIdx, 0, moved);
      renderImageGrid();
    });
  });
}
function removeImage(i) { formImages.splice(i, 1); renderImageGrid(); }

function closePropertyForm() {
  document.getElementById('form-overlay').classList.remove('show');
  editingPropertyId = null;
}

async function submitPropertyForm(e) {
  e.preventDefault();
  const btn = document.getElementById('publish-btn');
  btn.disabled = true;
  const originalLabel = btn.textContent;

  try {
    // Wait for every selected image to finish browser-side compression before
    // we calculate the payload. This prevents a fast Save click from losing
    // photos that are still being prepared.
    const processing = formImages
      .filter(img => img.isNew && img.processing && img.ready)
      .map(img => img.ready);
    if (processing.length) {
      btn.textContent = `Preparing ${processing.length} photo${processing.length === 1 ? '' : 's'}…`;
      await Promise.all(processing);
    }

    const existingImages = formImages
      .filter(i => !i.isNew && i.url)
      .map((i, idx) => ({ url: i.url, path: i.path, order: idx }));
    const pendingImages = formImages.filter(i => i.isNew && i.dataUri);

    if (formImages.some(i => i.isNew && i.processing)) {
      throw new Error('Please wait for the photos to finish preparing.');
    }
    if (existingImages.length + pendingImages.length > MAX_LISTING_PHOTOS) {
      throw new Error(`A listing can contain up to ${MAX_LISTING_PHOTOS} photos.`);
    }

    const payload = {
      title: val('f-title'), price: Number(val('f-price')) || 0, currency: val('f-currency'),
      status: val('f-status'), property_type: val('f-type'), neighborhood: val('f-neighborhood'),
      address: val('f-address'), map_lat: val('f-lat') || null, map_lng: val('f-lng') || null,
      bedrooms: val('f-bedrooms') || null, bathrooms: val('f-bathrooms') || null,
      half_bathrooms: val('f-half-bathrooms') || null, parking: val('f-parking') || null,
      construction_size: val('f-construction') || null, lot_size: val('f-lot') || null,
      year_built: val('f-year') || null, floors: val('f-floors') || null,
      short_description: val('f-short-desc'), luxury_description: val('f-luxury-desc'),
      highlights: formTags.highlights, features: formTags.features, amenities: formTags.amenities,
      seo_title: val('f-seo-title'), meta_description: val('f-meta-desc'),
      featured: document.getElementById('f-featured').checked,
      images: existingImages,
    };

    btn.textContent = pendingImages.length
      ? `Saving property · 0/${pendingImages.length} photos`
      : 'Saving property…';

    let property;
    if (editingPropertyId) {
      ({ property } = await apiFetch(`/api/admin/properties/${editingPropertyId}`, {
        method: 'PUT', body: JSON.stringify(payload)
      }));
    } else {
      ({ property } = await apiFetch('/api/admin/properties', {
        method: 'POST', body: JSON.stringify(payload)
      }));
    }

    // Upload each batch to Supabase. Keep the returned images in the exact
    // order the user selected them instead of trying to infer positions from
    // the server's full gallery after every batch.
    const uploadedNewImages = [];
    for (let start = 0; start < pendingImages.length; start += PHOTO_UPLOAD_BATCH_SIZE) {
      const batchItems = pendingImages.slice(start, start + PHOTO_UPLOAD_BATCH_SIZE);
      const result = await apiFetch(`/api/admin/properties/${property.id}/images`, {
        method: 'POST',
        body: JSON.stringify({ newImageUploads: batchItems.map(i => i.dataUri) }),
      });
      const savedBatch = Array.isArray(result.savedImages)
        ? result.savedImages
        : (Array.isArray(result.images) ? result.images.slice(-batchItems.length) : []);
      uploadedNewImages.push(...savedBatch);
      btn.textContent = `Saving property · ${Math.min(start + batchItems.length, pendingImages.length)}/${pendingImages.length} photos`;
    }

    const finalImages = [];
    let newIndex = 0;
    formImages.forEach((item) => {
      if (!item.isNew && item.url) {
        finalImages.push({ url: item.url, path: item.path, order: finalImages.length });
      } else if (item.isNew) {
        const saved = uploadedNewImages[newIndex++];
        if (saved?.url) {
          finalImages.push({ url: saved.url, path: saved.path, order: finalImages.length });
        }
      }
    });

    if (finalImages.length > MAX_LISTING_PHOTOS) {
      throw new Error(`A listing can contain up to ${MAX_LISTING_PHOTOS} photos.`);
    }

    await apiFetch(`/api/admin/properties/${property.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, images: finalImages }),
    });

    toast(editingPropertyId ? 'Property updated.' : 'Property published.');
    closePropertyForm();
    loadProperties();
  } catch (err) {
    toast(err.message || 'Could not save property.', true);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function renderLeadsView() {
  const el = document.getElementById('view-leads');
  el.innerHTML = `<div class="page-head"><div><h2>Leads (CRM)</h2><p>Every inquiry from your website, organized by stage.</p></div></div>
    <div class="table-toolbar">
      <input type="text" id="lead-search" placeholder="Search leads…" style="min-width:220px;">
      <select id="lead-stage-filter">
        <option value="">All Stages</option>
        <option value="new">New Lead</option>
        <option value="contacted">Contacted</option>
        <option value="showing_scheduled">Showing Scheduled</option>
        <option value="negotiating">Negotiating</option>
        <option value="under_contract">Under Contract</option>
        <option value="closed">Closed</option>
        <option value="lost">Lost</option>
      </select>
    </div>
    <div id="leads-list"></div>`;
  document.getElementById('lead-search').addEventListener('input', debounce(loadLeads, 300));
  document.getElementById('lead-stage-filter').addEventListener('change', loadLeads);
  loadLeads();
}
async function loadLeads() {
  const search = document.getElementById('lead-search')?.value || '';
  const stage = document.getElementById('lead-stage-filter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (stage) params.set('stage', stage);
  try {
    const { leads } = await apiFetch(`/api/admin/leads?${params}`);
    const wrap = document.getElementById('leads-list');
    wrap.innerHTML = leads.length ? leads.map(leadCard).join('') : `<div id="empty-state">No leads yet — they'll show up here automatically as visitors inquire.</div>`;
  } catch (err) { toast(err.message, true); }
}
const STAGE_LABELS = { new: 'New Lead', contacted: 'Contacted', showing_scheduled: 'Showing Scheduled', negotiating: 'Negotiating', under_contract: 'Under Contract', closed: 'Closed', lost: 'Lost' };
function leadCard(l) {
  return `<div class="lead-card">
    <div class="lead-card-top">
      <div><div class="lead-name">${esc(l.name)}</div><div class="lead-meta">${esc(l.email)} ${l.phone ? '· ' + esc(l.phone) : ''} · ${esc(l.property_title || 'General inquiry')}</div></div>
      <select class="stage-select" onchange="updateLeadStage(${l.id}, this.value)">
        ${Object.entries(STAGE_LABELS).map(([k, v]) => `<option value="${k}" ${l.stage === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <textarea class="lead-notes" placeholder="Notes…" onblur="updateLeadNotes(${l.id}, this.value)">${esc(l.notes)}</textarea>
  </div>`;
}
async function updateLeadStage(id, stage) {
  try { await apiFetch(`/api/admin/leads/${id}`, { method: 'PUT', body: JSON.stringify({ stage }) }); toast('Lead updated.'); }
  catch (err) { toast(err.message, true); }
}
async function updateLeadNotes(id, notes) {
  try { await apiFetch(`/api/admin/leads/${id}`, { method: 'PUT', body: JSON.stringify({ notes }) }); }
  catch (err) { toast(err.message, true); }
}
