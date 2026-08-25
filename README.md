# SMA Lead Backend

Lead capture, PDF guide delivery, and a 5-touch email nurture sequence for the
San Miguel de Allende real estate site's "Download the Guide" flow.

## What this is

A small, self-contained Node/Express service:

- `POST /api/guide-request` — validates the form, saves the lead to SQLite,
  emails the visitor their PDF guide, emails you a "New Website Lead" alert,
  and schedules the 4 follow-up nurture emails (day 2 / 5 / 8 / 12).
- `scripts/send-nurture.js` — run on a daily schedule, sends whatever nurture
  emails are due today.
- `public/guides/*.pdf` — the three magazine-style guides, already generated.

This is real, runnable code — but it isn't deployed anywhere yet. You (or a
developer) need to host it and connect it to Resend before it actually sends
an email. See **Deploying** below.

## Local setup

```bash
npm install
cp .env.example .env        # fill in RESEND_API_KEY, FROM_EMAIL, NOTIFY_EMAIL, SITE_URL
npm run init-db
npm start                   # http://localhost:3001
```

## Release checks

Run these before deployment:

```bash
npm ci
npm run test:syntax
npm run test:smoke
npm audit --omit=dev --audit-level=high
```

GitHub Actions runs the same verification on pull requests and pushes to `main`.

For production, `ALLOWED_ORIGIN` defaults to `SITE_URL`; use a comma-separated allowlist only for additional approved frontend domains. Never use `*`. `ADMIN_PASSWORD` is required for admin login and must be a long, unique secret.

Test it:
```bash
curl -X POST http://localhost:3001/api/guide-request \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Jane","lastName":"Doe","email":"jane@example.com","intent":"buying","guide":"buyer"}'
```

Without a real `RESEND_API_KEY`, emails are logged to the console instead of
sent, so you can test the full flow before connecting a real inbox.

## Connecting to the website

The site's guide-download modal (in `san-miguel-luxury-realty.html`) posts to:

```
POST {API_BASE_URL}/api/guide-request
```

Set `API_BASE_URL` in the site's `<script>` config (search for `API_BASE_URL`
near the top of the guide-modal script) to wherever you deploy this backend,
e.g. `https://api.yourdomain.com`.

## Deploying (the real, tested path)

I can't deploy this myself — no internet access in the environment I built it in, so no ability to create accounts, push to GitHub, or call a hosting platform's API. What I *did* do is prepare everything so your actual deploy is copy-paste steps, and test the exact code path Render's cron would run against a live local server (see `render.yaml` and `scripts/ping-nurture.js`).

**Why Render specifically:** this uses SQLite, which needs an always-on process with a real, persistent disk — not a serverless/Vercel-style deploy where the filesystem resets on every function call (see "Known limitations" further down). Render's free tier supports exactly that.

### Steps

1. **Push this folder to GitHub.**
   ```bash
   cd sma-backend
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/sma-backend.git
   git push -u origin main
   ```
   (`.gitignore` already excludes `node_modules/`, `.env`, and `data/` — your secrets and local database never get committed.)

2. **Go to [render.com](https://render.com) → New → Blueprint**, and connect that repo. Render reads `render.yaml` automatically and sets up two services:
   - `sma-backend` — the actual web app (API + admin dashboard)
   - `sma-nurture-ping` — a daily cron job that triggers the nurture emails

3. **Render will prompt you for the secret values** (anything marked `sync: false` in `render.yaml`):
   - `RESEND_API_KEY` — from resend.com after verifying a sending domain
   - `FROM_EMAIL` — e.g. `Blaze Beasley <blaze@yourdomain.com>`
   - `NOTIFY_EMAIL` — your real inbox
   - `ADMIN_PASSWORD` — a strong password for `/admin`
   - `SITE_URL` — fill this in *after* step 4, then redeploy (see below)
   - `ALLOWED_ORIGIN` — your website's domain, once you know it
   - `INTERNAL_CRON_KEY` — any long random string (e.g. `openssl rand -hex 32`); **use the exact same value** on both services, Render will ask for it twice

4. **Deploy.** You'll get a URL like `https://sma-backend-xxxx.onrender.com`. Go back into the `sma-backend` service's environment settings and set `SITE_URL` to that exact URL, then trigger a redeploy — a few things (email links, the sitemap, OG tags) need to know the site's own address.

5. **Connect the website.** In `san-miguel-luxury-realty.html`, near the top of the `<script>` tag, set:
   ```js
   const API_BASE_URL = 'https://sma-backend-xxxx.onrender.com';
   ```
   Re-upload that file wherever the site itself is hosted (Netlify, etc.).

6. **Log into `/admin`** on your new URL with the password from step 3, and add your first real property.

### A free-tier quirk worth knowing
Render's free web services spin down after inactivity and take a few seconds to wake back up on the next request. The cron job will wake it once a day regardless. If the live listings feel slow to load the first time after a quiet period, that's why — a paid "Starter" instance ($7/mo at time of writing) keeps it always warm, worth it once this is handling real traffic.


**Resend setup:**
1. Create a Resend account and verify a sending domain (test mode lets you
   send to your own verified email before that's done).
2. Generate an API key, put it in `.env` as `RESEND_API_KEY`.
3. Update `FROM_EMAIL` to an address on your verified domain.

## Spam protection

- **Rate limiting** — 8 submissions per IP per 10 minutes (`express-rate-limit`).
- **Honeypot field** — the form includes a hidden `company` field real visitors
  never fill in. If it's filled, the request is silently accepted but nothing
  is saved or sent (bots think they succeeded; you don't get spam leads).
- **Duplicate guard** — the same email submitting twice within 2 minutes is
  deduplicated (handles accidental double-clicks).

For higher-traffic sites, consider adding Cloudflare Turnstile or hCaptcha to
the form for an extra layer — not included here to keep the form frictionless,
but straightforward to add to the `/api/guide-request` handler.

## One thing I did not fabricate: the Day 8 email

The Day 8 nurture email ("client success story") ships as a clearly marked
template — `[PLACEHOLDER — replace with a real client story]` — rather than
an invented case study. Writing a fake client success story would mean
putting words in a real person's mouth about an experience that didn't
happen. Swap in a real story (with that client's permission) before this
email goes live; see `lib/email.js` → `NURTURE_CONTENT.day8`.

## Admin CMS (Properties, Media, SEO Automation, Leads CRM)

This backend also includes a full property-management admin dashboard at `/admin`, so you can add and edit listings without touching code.

### What it does
- **Properties**: add / edit / duplicate / delete / archive / mark featured / change status (for sale, for rent, pending, sold) / reorder
- **On publish, automatically**: generates the URL slug (e.g. `/properties/casa-cantera`), SEO title, meta description, Open Graph tags, and Schema.org `RealEstateListing` structured data — all editable if you want to override the auto-generated version
- **Media**: drag-and-drop photo upload from the dashboard (reads files client-side, uploads as base64 — no multipart dependency needed), drag-to-reorder, first photo becomes the featured image
- **Image handling**: listing photos are stored in Supabase Storage in their supplied format. Optimize and resize images before upload until a verified server-side image pipeline is introduced.
- **Dashboard home**: total/featured/for-sale/for-rent/pending/sold counts, most-viewed listings, recent leads
- **Leads (CRM)**: every inquiry from the website's property pages automatically creates a lead — name, email, phone, which property, timestamp — with a 7-stage pipeline (New → Contacted → Showing Scheduled → Negotiating → Under Contract → Closed → Lost), notes, and search/filter
- **Email notifications**: every inquiry sends the visitor a confirmation and you an internal alert, using the same Resend integration as the guide-download flow
- **Sitemap**: `/sitemap.xml` is generated live from your actual property list — no manual updates needed

### Setting it up
1. `npm install` (see root README for the general setup)
2. In `.env`, set `ADMIN_PASSWORD` to something strong — this is a single shared password, not a real multi-user auth system (see limitations below)
3. Visit `/admin` on your deployed backend, log in, and start adding properties

### How it connects to the public website
The main site (`san-miguel-luxury-realty.html`) fetches live listings from `GET /api/properties` if `API_BASE_URL` (near the top of its `<script>` tag) is set to your deployed backend. If it's left blank, or the request fails for any reason, the site falls back to its built-in static demo listings — visitors never see a broken page either way. This means you don't have to touch the website's code again after the first deploy: publish a property in the dashboard, and it appears on the live site.

### Known limitations — read before relying on this in production
- **Auth is intentionally minimal.** `lib/auth.js` uses a single shared password and an in-memory session store (Node's built-in `crypto`, no external library) — I couldn't verify a real JWT library end-to-end without npm access in the environment I built this in, so I didn't ship one. This means: sessions reset on server restart, it won't work correctly across multiple server instances, and there's no per-user accounts. Fine for one person testing this; **swap in a real auth solution (e.g. a proper session store, or a verified JWT library) before this handles real client data at scale.**
- **Image uploads are base64-over-JSON, not true multipart streaming.** This was a deliberate choice to avoid adding `multer` as an unverified dependency, and it works, but it's not the most efficient approach for dozens of large photos at once. Fine for typical listing photo counts; if you're regularly uploading 50+ large images per property, consider moving to real multipart uploads.
- **Image optimization is not performed server-side.** Use appropriately sized WebP or AVIF uploads where practical, and validate image quality on property pages before publishing.
- **SQLite doesn't persist on serverless platforms** (same caveat as the guide-request backend — see the main README section above). Deploy this as an always-on process (Render, Railway, a VPS), not as Vercel/Lambda functions, unless you swap the database layer for something hosted.



## File map

```
sma-backend/
  render.yaml                   Render Blueprint — one-click deploy config (see "Deploying" above)
  .gitignore                     Keeps node_modules/.env/data out of git
  server.js                     Express app entry point
  admin/
    index.html                  Admin dashboard shell (login + layout)
    admin.js                    Admin dashboard logic (properties, media, CRM)
  routes/
    guide-request.js            POST /api/guide-request — validation, spam guard, orchestration
    properties.js                Public property list/detail + admin CRUD/status/featured/reorder
    leads.js                     Public property-inquiry form + admin CRM endpoints
    admin-auth.js                POST /api/admin/login, /api/admin/logout
    sitemap.js                   GET /sitemap.xml, generated live from your properties
  lib/
    db.js                        SQLite schema + guide-download lead/nurture-queue helpers
    email.js                     Resend client + guide-download email templates
    properties-db.js             SQLite schema + property CRUD
    crm-db.js                    SQLite schema + CRM lead storage
    seo.js                       Slug + SEO title/meta/OG/structured-data generation
    auth.js                      Minimal admin session auth (see limitations above)
    image-store.js                Base64 image upload handling + optional sharp/WebP conversion
    property-inquiry-email.js    Email templates for the property-inquiry flow
    nurture-runner.js            Shared "send whatever's due" logic (used by both the CLI script and the HTTP cron endpoint)
  scripts/
    init-db.js                   One-time DB setup
    send-nurture.js              CLI nurture worker, for a real crontab on an always-on server
    ping-nurture.js              HTTP-trigger version, for Render's cron job (see render.yaml)
  public/
    guides/*.pdf                 The three generated guide PDFs
    uploads/                     Property photos land here (created automatically)
  .env.example                   All required environment variables
```

