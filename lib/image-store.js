// lib/image-store.js
// Permanent property photo storage in Supabase Storage.
// Render's filesystem is intentionally NOT used for listing photos.

const crypto = require('crypto');
const supabase = require('./supabase');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'property-images';
let bucketReady = false;

const DATA_URI_RE = /^data:(image\/[\w.+-]+);base64,(.+)$/s;

async function ensureBucket() {
  if (bucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const existing = (buckets || []).find((b) => b.name === BUCKET);
  if (!existing) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '15MB',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
    });
    if (error && !/already exists/i.test(error.message || '')) throw error;
  } else if (existing.public === false) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: true });
    if (error) throw error;
  }

  bucketReady = true;
}

function extensionForMime(mime) {
  const clean = String(mime || '').toLowerCase();
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif'
  })[clean] || 'jpg';
}

function publicUrl(pathname) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(pathname);
  return data.publicUrl;
}

async function saveBase64Image(dataUri, { basename } = {}) {
  const match = DATA_URI_RE.exec(dataUri || '');
  if (!match) throw new Error('Expected a base64 image data URI (data:image/...;base64,...)');

  await ensureBucket();

  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Image upload was empty.');

  const ext = extensionForMime(mime);
  const id = String(basename || `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `properties/${id}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: '31536000'
    });

  if (error) throw error;

  return {
    filename: storagePath,
    path: storagePath,
    url: publicUrl(storagePath),
    format: ext,
    converted: false
  };
}

async function saveImages(dataUris = []) {
  const results = [];
  for (let i = 0; i < dataUris.length; i++) {
    const saved = await saveBase64Image(dataUris[i], {
      basename: `${Date.now()}_${i}_${crypto.randomBytes(4).toString('hex')}`
    });
    results.push({ url: saved.url, path: saved.path, order: i });
  }
  return results;
}

function storagePathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

async function deleteImage(url) {
  const storagePath = storagePathFromUrl(url);
  if (!storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error('[image-store] delete failed:', error.message);
}

module.exports = {
  saveBase64Image,
  saveImages,
  deleteImage,
  bucket: BUCKET,
  publicUrl,
  sharpAvailable: false
};
