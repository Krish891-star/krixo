# KriXo — PDF & Image Tools

A mobile-first PDF and image utility website. File processing runs entirely in the browser — no document content is ever uploaded to the server. The backend handles only guides (CMS), admin authentication, and feedback.

Built with HTML, CSS, vanilla JavaScript (ES modules), Node.js 20, Express 4, and MongoDB Atlas.

> `KriXo` is a working project name. Check domain and trademark availability before launch.

---

## Tools (39 total)

### Image (5)
- **Compress Image to KB** — Reduce JPG, PNG or WebP to a target file size; up to 20 images per batch, downloaded as a ZIP
- **Resize Image** — Set exact pixel dimensions with optional aspect-ratio lock; batch up to 20 images
- **Photo & Signature Resizer** — Custom dimensions + KB target with centre-crop
- **Convert Image** — JPG/PNG/WebP/GIF/BMP → JPG/PNG/WebP; batch up to 20 images in one ZIP
- **File Requirements Checker** — Check file size, image dimensions and type against portal limits

### PDF — Core (6)
- **Compress PDF** — Fit a PDF under a KB target (lossy rasterisation — read the warning)
- **Merge PDF** — Combine up to 150 MB of PDFs with a visual drag/keyboard reorderable file list and live page counts
- **Split PDF** — Extract pages by range (e.g. `1-3,5,8-10`) into a new PDF
- **Rotate PDF** — Rotate all pages 90°, 180° or 270°
- **JPG to PDF** — Convert up to 40 images into a paginated A4/Letter PDF
- **PDF to JPG** — Export PDF pages as JPG, PNG or WebP in a ZIP

### PDF — Inspection (1)
- **PDF Info** — Read-only: page count, dimensions, metadata, encryption status *(new)*

### PDF — Conversion (9)
- **Word to PDF** — DOCX → paginated A4 PDF via mammoth + html2canvas
- **PDF to Word** — Selectable text → editable DOCX
- **Excel to PDF** — XLSX/XLS/CSV worksheets → paginated table PDF
- **PDF to Excel** — Tab-separated PDF text → XLSX workbook
- **PowerPoint to PDF** — PPTX slide text + images → PDF deck
- **PDF to PowerPoint** — PDF pages → editable PPTX (text positioned, scanned pages as images)
- **HTML to PDF** — Paste or upload sanitised HTML → paginated A4 PDF
- **PDF/A Preparation** — Structural cleanup + XMP metadata (not certified archival)
- **PDF to Text** — Selectable PDF text → plain `.txt`
- **PDF to Markdown** — Selectable PDF text → `.md` with optional page headings

### PDF — Management (15)
- **Organize PDF Pages** — Reorder or repeat pages in any sequence
- **Delete PDF Pages** — Remove specific pages
- **Extract PDF Pages** — Copy selected pages to a new file
- **Add Page Numbers** — Stamp numbers at bottom-centre, bottom-right, top-centre or top-right
- **Add Watermark** — Text or image watermark with opacity and angle control
- **Crop PDF** — Trim margins with exact point values
- **Protect PDF** — Password-protect via page rasterisation + PDFKit encryption
- **Sign PDF** — Visual typed or image signature (not cryptographic)
- **Edit PDF** — Stamp text or a small image onto one page
- **Repair PDF** — Re-save structure, then render-rebuild fallback
- **OCR PDF** — Add invisible searchable text layer via Tesseract.js (English)
- **Compare PDFs** — Line-by-line text diff → HTML report
- **Redact PDF** — Cover coordinate-specified boxes, then rebuild pages as images
- **Unlock PDF** — Render password-protected pages into an open PDF
- **Flatten PDF** — Rebuild pages as images (removes forms, annotations)
- **PDF to Grayscale** — Render pages in greyscale and rebuild
- **Edit PDF Metadata** — Read and write Title, Author, Subject, Keywords, Creator, Producer

---

## Architecture

```
krixo/
├── public/              Static site (HTML pages + assets)
│   ├── assets/
│   │   ├── main.js          Core frontend — basic tools, dispatcher, batch UI, previews
│   │   ├── pro-core.js      Shared processing helpers (PDF.js, pdf-lib, canvas)
│   │   ├── pro-catalog.js   Pro tool metadata (lazy-loaded tool list)
│   │   ├── tool-manifest.js Single source of truth for all 39 tools
│   │   ├── workspaces.js    Eight-workspace manifest + honest output contracts
│   │   ├── pro-workspace.js Visual PDF page thumbnails, selection, rotation, reorder
│   │   ├── pro-tools.js     Pro-runner factory (lazy-loaded)
│   │   ├── pro-convert.js   Document conversion handlers
│   │   ├── pro-manage.js    PDF management handlers
│   │   ├── pro-extra.js     Extra PDF handlers (text, compare, redact, etc.)
│   │   ├── styles.css       Design system
│   │   └── seo.js           Canonical + JSON-LD injection
│   ├── tools/           39 HTML tool pages (direct URLs preserved)
│   ├── workspaces/      1 index + 8 primary workspace pages
│   └── formats.html     Honest supported / partial / unsupported matrix
├── server/
│   └── models.js        Mongoose schemas (Guide, Preset, Feedback, Admin)
├── netlify/
│   └── functions/api.mjs  Netlify serverless function (mirrors server.js routes)
├── scripts/
│   ├── copy-static.js              Copies favicon/robots into dist/
│   ├── generate-workspace-pages.mjs Generates workspaces + formats from manifests
│   ├── generate-seo.mjs            Writes sitemap.xml, robots.txt, _headers into dist/
│   ├── seed-admin.js               Creates/updates admin account
│   └── set-mongo-uri.mjs           Interactive MongoDB URI helper
├── server.js            Express server (API + static serving)
├── vite.config.js       Build configuration
├── netlify.toml         Netlify build/deploy configuration
├── AUDIT-REPORT.md      Full audit findings and deliverables
└── RESEARCH-AND-STRATEGY.md  Product strategy notes
```

**Privacy model:** tool files are never sent to the backend. The Node.js/Netlify backend handles only text-based CMS, admin auth, and feedback. This keeps infrastructure costs low and makes a strong privacy claim credible.

---

## Requirements

- Node.js 20 or later
- npm
- MongoDB Atlas (optional — all 39 browser tools work without it; only admin CMS and feedback need it)

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — fill in at least NODE_ENV, PORT, APP_URL
# For admin/CMS: also set MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

# 3. (Optional) Save Atlas URI interactively
npm run set:mongo

# 4. (Optional) Create admin account
npm run seed:admin

# 5. Start development servers
npm run dev
# Vite dev server: http://localhost:5173
# Express API:     http://localhost:3000
```

After `npm run build`, Express on port 3000 serves the full built site.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | Yes | Express port (default 3000) |
| `APP_URL` | Yes | Public origin, e.g. `https://krixo.netlify.app` |
| `MONGODB_URI` | No | Atlas connection string — omit to disable CMS |
| `JWT_SECRET` | If CMS | ≥ 32 random characters. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_EMAIL` | If CMS | Used once by `npm run seed:admin` |
| `ADMIN_PASSWORD` | If CMS | ≥ 12 characters, used once by seed |
| `TRUST_PROXY` | No | Set `true` only behind a known reverse proxy |
| `CORS_ORIGINS` | No | Comma-separated origins (leave blank for same-origin only) |

---

## Production build

```bash
npm run build
npm start
```

Builds into `dist/`, generates `sitemap.xml`, `robots.txt` and `_headers`, then Express serves it on `$PORT`.

---

## Deploy to Netlify + MongoDB Atlas

1. Push to GitHub and connect the repo to Netlify.
2. In **Netlify → Site configuration → Environment variables**, add:
   - `MONGODB_URI` — Atlas connection string
   - `JWT_SECRET` — new random 64-character hex string
   - `APP_URL` — your Netlify domain, e.g. `https://krixo.netlify.app`
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` — used once for seeding
3. Seed admin locally: `npm run set:mongo && npm run seed:admin`
4. Deploy. Check `https://YOUR-SITE/api/health` returns `"database":"connected"`.
5. Test the contact form, admin sign-in, and several tools on mobile.

Without `MONGODB_URI` the browser tools remain fully usable; CMS endpoints return a clear "not configured" message.

---

## Deploy to Render

1. Create a **Web Service** from the GitHub repo.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Set environment variables as above.
5. After deploy, run `npm run seed:admin` from a Render shell.

---

## Admin panel

URL: `/admin.html`

Sections: Guides (create/edit/delete), Presets (verified photo/document requirements with source URL), Feedback (view and triage user messages).

**Preset quality rule:** never publish a preset without checking its values against the latest official notice. Include source URL and checked date.

---

## Security checklist before launch

- [ ] **Rotate MongoDB Atlas password** — the original was included in the distributed ZIP.
- [ ] **Generate a new JWT secret** — 64-character random hex.
- [ ] **Set strong `ADMIN_PASSWORD`** — ≥ 12 characters.
- [ ] Never commit `.env` to any repository.
- [ ] Review MongoDB Atlas network access — restrict to your server's IP where possible.
- [ ] Check Netlify / Render logs for unexpected errors after first deployment.
- [ ] Update Privacy and Terms pages with real owner/contact details before launch.
- [ ] Test on current Chrome, Firefox, Edge and Android Chrome.

---

## Known limitations

| Limitation | Explanation |
|---|---|
| PDF compression is lossy | Pages become JPEG images — text stops being selectable |
| Conversion output is approximate | PDF → Word/Excel/PPT preserves text and structure, not exact artwork |
| OCR supports English only | Tesseract language data for other languages not bundled |
| HEIC/HEIF not supported | Browser Canvas API cannot decode HEIC without a WASM decoder library |
| Merge has a 30-file practical cap | Reordering works by drag or Alt+arrow keys; page counts are read locally before merging |
| Redact requires coordinate input | No visual click-to-select interface |
| Batch image processing is capped at 20 files | Batches download as one ZIP; each file still obeys the 35 MB / 45 MP limits |
| PDF/A not certified | Structural cleanup only — validate with veraPDF before official archiving |
| Sign PDF is visual only | Not a cryptographic digital signature |
| OCR up to 20 pages per run | Browser memory constraint |
| PDF compressor up to 60 pages / 45 MB | Browser stability constraint |
| Pro-tools bundle is large (1 MB gzip) | Lazily loaded — does not affect homepage or basic tools |

---

## Changelog — 25 November 2026 (2.0 workspace upgrade)

### Product & UX
- Added `/workspaces/` plus eight primary workspace pages generated from `public/assets/workspaces.js`
- Added `/formats.html` with a truthful supported / partial / not-supported matrix
- Merge PDF now has a visual file list: drag reorder, Alt+arrow keyboard reorder, remove, and local page counts
- Compress / Resize / Convert Image now accept up to 20 files and export one ZIP; single files still download directly
- Added per-file batch status cards and a global Cancel button that invalidates the active job token
- PDF result cards now render a real page-1 preview automatically; no extra upload is needed
- Delete PDF Pages no longer preselects every page; empty selection now gives a clear error

### Architecture & SEO
- `public/assets/tool-manifest.js` is now the single catalog source for cards, workspaces, docs and the generator
- Sitemap generated from the same workspace manifest — 58 canonical URLs (39 tools + 9 workspace pages + formats + guides/info pages)
- Build now runs `generate-workspace-pages.mjs` before Vite; `npm run check` validates all new modules

### Security parity
- Netlify API: added a 120-request / 5-minute per-IP API limit, a 200 KB request-body cap, and an admin DB role recheck on every authenticated admin request
- Express and Netlify now both validate feedback email format and reject placeholder JWT secrets

---

## Changelog — 25 November 2026 upgrade

### Security
- Sanitized `.env` — removed real MongoDB password, JWT secrets, and admin credentials

### Bug fixes
- Merge PDF: added 45 MB per-file + 150 MB combined size guard
- Merge PDF: result card now shows file count, page count, and output size
- Split PDF: empty page-range input now shows a clear error message
- Split/Rotate/Images-to-PDF: switched from `downloadBlob()` shorthand to `showResult()` with full stats
- Rotate PDF: added `[90, 180, 270]` angle validation
- Images to PDF: added 150 MB combined size guard
- PDF Compressor: progress now shows percentage; result shows saved KB and % reduction
- Protect PDF: empty password now gives a clear error before the length check
- Repair PDF: added 60-page guard on the render-rebuild fallback path
- OCR PDF: `cacheMethod` changed from `'none'` to `'write'` — language data is now cached
- Feedback (server + Netlify): email field now validates format before saving

### UX improvements
- Added `id="result-icon"` to all 10 basic tool pages — success/danger state now updates visually
- Merge PDF page: rewritten with file limits, hint notice, and improved FAQ
- PDF Compressor page: rewritten with explicit warning notice about lossy output
- Split PDF page: rewritten with range format guide and `<code>` examples
- Rotate PDF page: improved option labels with direction indicators
- Image Compressor page: improved format selector labels and format-specific guidance
- HEIC/HEIF: explicit rejection with an actionable error message in all image tools

### CSS
- Added `.notice.warning` variant (amber) for strong warnings
- Added `code` element styling for inline examples
- Fixed `result-stats` word-break to prevent overflow on long filenames

### New tool
- **PDF Info** (`/tools/pdf-info.html`) — read-only tool that shows page count, dimensions, metadata, PDF version, and encryption status without modifying the file

### Catalog & SEO
- PDF Info added to the tool catalog and all three sitemaps (server.js, generate-seo.mjs, Netlify function)
- Sitemap covered 48 URLs at that release (58 after the 2.0 workspace upgrade)
