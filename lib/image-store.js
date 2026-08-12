// lib/image-store.js
//
// Property photo storage. Accepts base64 data URIs from the admin dashboard
// (drag-and-drop reads files client-side via FileReader) rather than
// multipart/form-data — this avoids adding multer as a dependency and was
// something I could actually test end-to-end in this environment.
//
// WebP conversion + compression: this file tries to use `sharp` if it's
// installed. I could NOT verify this path — this sandbox has no internet
// access to `npm install sharp`, which also requires native binary
// downloads at install time. The code is written against sharp's real,
// documented API and should work once you run `npm install sharp` in a
// real environment, but treat it as unverified until you've tested it.
// If sharp isn't installed, images are saved as-is (whatever format the
// browser gives us) with a clear log message — nothing breaks, you just
// don't get automatic WebP conversion until sharp is added.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let sharp = null;
try {
  sharp = require('sharp'); // optional — see note above
} catch {
  sharp = null;
}

const DATA_URI_RE = /^data:(image\/\w+);base64,(.+)$/;

async function saveBase64Image(dataUri, { basename } = {}) {
  const match = DATA_URI_RE.exec(dataUri || '');
  if (!match) throw new Error('Expected a base64 image data URI (data:image/...;base64,...)');
  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, 'base64');

  const id = basename || crypto.randomBytes(8).toString('hex');

  if (sharp) {
    // Real conversion path — written against sharp's documented API,
    // unverified in this sandbox (see file header).
    try {
      const filename = `${id}.webp`;
      const outPath = path.join(UPLOAD_DIR, filename);
      await sharp(buffer)
        .resize({ width: 2000, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outPath);
      return { filename, url: `/uploads/${filename}`, format: 'webp', converted: true };
    } catch (err) {
      console.error('[image-store] sharp conversion failed, falling back to raw save:', err.message);
    }
  }

  // Fallback: save the original bytes as-is.
  const ext = mime.split('/')[1] || 'jpg';
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return { filename, url: `/uploads/${filename}`, format: ext, converted: false };
}

async function saveImages(dataUris = []) {
  const results = [];
  for (let i = 0; i < dataUris.length; i++) {
    const saved = await saveBase64Image(dataUris[i], { basename: `${Date.now()}_${i}_${crypto.randomBytes(4).toString('hex')}` });
    results.push({ url: saved.url, order: i });
  }
  return results;
}

function deleteImage(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(url));
  fs.unlink(filePath, () => {}); // best-effort, ignore errors
}

module.exports = { saveBase64Image, saveImages, deleteImage, sharpAvailable: !!sharp };
