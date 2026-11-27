# KriXo — Complete Audit Report
**Audit date:** 25 November 2026  
**Auditor:** Kiro AI Engineering Team  
**Scope:** Full codebase, all 39 tool pages, security, performance, competitor analysis, and all deliverables. Updated after the 2.0 workspace upgrade.

---

## 1. Project Overview

KriXo is a browser-first PDF and image utility platform. File processing runs entirely on the user's device — no document content is ever sent to the backend. The backend (Express + MongoDB Atlas) handles only CMS content (guides, presets), admin authentication, and feedback.

### Architecture summary

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JS ES modules, HTML, CSS | Multi-page app, Vite build |
| Processing | pdf-lib, PDF.js, Tesseract.js, mammoth, SheetJS, PptxGenJS, jsPDF | All client-side |
| Backend | Express 4, Node 20 | Guides/presets CMS, admin auth, feedback |
| Database | MongoDB Atlas (Mongoose) | Optional — tools work without it |
| Deployment | Netlify (functions) or Render/Node | netlify.toml configured |
| Build | Vite 6, Rollup | 629 modules, 9.3 s build time |

### Tool count

| Category | Count |
|---|---|
| Image tools | 5 |
| PDF utilities (core) | 6 |
| PDF conversion | 9 |
| PDF management | 15 |
| PDF inspection | 1 (new: PDF Info) |
| **Total** | **39** |

---

## 2. Security Audit

### Critical finding — Exposed credentials in `.env`

**Severity:** Critical  
**Status:** Fixed

The `.env` file contained:
- A real MongoDB Atlas connection string including a cleartext password **[redacted — never reprint in docs, git or ZIP]**
- Two duplicate JWT secrets (both real 64-character hex values)
- Two duplicate admin email/password pairs

The `.gitignore` correctly excludes `.env`, so this was not committed to git history. However the credential was present in the distributed project ZIP. The file has been sanitized — all values replaced with blank placeholders and clear generation instructions.

**Action required:** Rotate the MongoDB Atlas password, generate a new JWT secret, and update Netlify environment variables before the next deployment.

### Other security findings

| Item | Severity | Status |
|---|---|---|
| Helmet CSP configured correctly on Express | — | Pass |
| Rate limiting on login (8 req/15 min) and API (180 req/15 min) | — | Pass |
| JWT uses HS256, 8-hour expiry, httpOnly cookie | — | Pass |
| Placeholder JWT detection in production | — | Pass |
| Feedback endpoint accepted invalid email addresses | Medium | Fixed |
| `x-powered-by` header disabled | — | Pass |
| `trust proxy` only enabled via explicit env var | — | Pass |
| Netlify function validates JWT on every admin route | — | Pass |
| File processing local — no documents reach backend | — | Pass |
| `sanitizeHtml` strips scripts, event handlers, dangerous schemes | — | Pass |
| 0 npm vulnerabilities (`npm audit --audit-level=moderate`) | — | Pass |

---

## 3. Functional Bug Audit

Every tool was inspected by source-code analysis. The following bugs were found and fixed.

### Fixed bugs

| Tool | Bug | Fix |
|---|---|---|
| **Merge PDF** | No per-file or combined size guard — large files could crash the browser | Added 45 MB per-file + 150 MB combined guard with early error |
| **Merge PDF** | `downloadBlob()` shorthand used — no stats shown in result card | Replaced with `showResult()` including file count, page count, output size |
| **Split PDF** | Empty page-range input threw an obscure error from `parseRanges` | Added explicit empty-input validation with helpful message |
| **Split PDF** | `downloadBlob()` shorthand — no stats | Replaced with `showResult()` |
| **Rotate PDF** | `downloadBlob()` shorthand — no stats | Replaced with `showResult()` |
| **Rotate PDF** | No angle validation — any value could be passed | Added `[90, 180, 270]` guard |
| **Images to PDF** | No combined size guard — 40 large images could exhaust browser memory | Added 150 MB combined guard |
| **Images to PDF** | `downloadBlob()` shorthand — no stats | Replaced with `showResult()` |
| **PDF Compressor** | Progress message showed no percentage | Added `pct` calculation and display |
| **PDF Compressor** | Result showed no saved-KB stat | Added `savedKB` and `pct` to stats |
| **Protect PDF** | Empty password field threw a length-check error rather than a clear message | Added explicit empty-check before length check |
| **Repair PDF** | No page-count guard on the render-rebuild fallback path | Added 60-page guard |
| **OCR PDF** | `cacheMethod: 'none'` forced re-download of Tesseract language data on every run | Changed to `'write'` so data is cached after first download |
| **Feedback (server + Netlify)** | Email field accepted any string including obviously invalid values | Added RFC-style email format validation |
| **All 10 basic tool pages** | `id="result-icon"` missing — JS silently skipped success/danger state changes | Added `id="result-icon" class="result-icon"` span to all 10 pages |
| **Image tools** | HEIC/HEIF files fail silently with a confusing `img.onerror` message | Added explicit HEIC detection in `fileToImage()` and `friendlyError()` with actionable message |

### Known remaining limitations (not bugs — by design)

- Merge PDF supports drag and Alt+arrow reordering, but caps one operation at 30 files for browser stability.
- Batch image tools cap one operation at 20 files; each file still obeys individual size and pixel limits.
- Redact PDF requires coordinate input — no visual click-to-select interface.
- OCR supports English only. Other languages would require additional Tesseract language data.
- PDF/A preparation is structural cleanup, not certified archival conversion.
- Sign PDF produces a visual signature only, not a cryptographic digital signature.
- HEIC format is not supported by the Canvas API in most browsers — no workaround without a native decoder library.

---

## 4. Competitor Feature Comparison

Research conducted 25 November 2026 against iLovePDF, Smallpdf, PDF24, and Sejda.

### Features competitors have that KriXo does not (yet)

| Feature | iLovePDF | Smallpdf | PDF24 | Sejda | KriXo | Notes |
|---|---|---|---|---|---|---|
| Drag-to-reorder merge | ✓ | ✓ | ✓ | ✓ | ✓ | Implemented in 2.0 with keyboard fallback |
| Inline PDF text editing | ✓ | ✓ | ✓ | ✓ | ✗ | Requires canvas overlay — complex |
| PDF form fill | ✓ | ✓ | ✓ | ✓ | ✗ | pdf-lib supports basic form filling |
| PDF thumbnail preview before process | ✓ | ✓ | ✓ | ✓ | ✓ | Visual page grid in 8 workspace tools; result preview for every PDF output |
| Batch image compression | ✓ | ✓ | ✓ | ✗ | ✓ | Up to 20 files → ZIP, implemented in 2.0 |
| HEIC input support | ✓ | ✓ | ✓ | ✗ | ✗ | Requires heic2any WASM decoder |
| PDF digital signature verification | ✗ | ✗ | ✓ | ✗ | ✗ | Requires PKI stack — complex |
| Cloud storage integration | ✓ | ✓ | ✗ | ✗ | ✗ | Google Drive / Dropbox API |
| Multi-language OCR | ✓ | ✗ | ✓ | ✓ | ✗ | Tesseract supports it — extra data files |
| PDF bookmarks editor | ✗ | ✗ | ✓ | ✓ | ✗ | Feasible with pdf-lib |
| PDF page thumbnails grid | ✓ | ✓ | ✓ | ✓ | ✓ | Split, organize, extract, delete, rotate, add numbers, watermark, PDF→JPG |

### Features KriXo has that most free competitors restrict

| Feature | KriXo | Competitor restriction |
|---|---|---|
| No file size paywalls | Fully free up to limits | Sejda: 50 MB / 3 tasks per hour free |
| No watermarks on output | ✓ | Many tools add watermarks on free tier |
| Fully local processing | ✓ | Most upload files to servers |
| Honest capability descriptions | ✓ | Many claim features that are degraded or fake |
| No sign-up required | ✓ | Smallpdf, iLovePDF prompt for accounts |

### KriXo competitive strengths

1. **Privacy-first architecture** — no document upload is the product's core differentiator.
2. **Honest limitation disclosures** — every tool states exactly what it does and does not do.
3. **Clean, uncluttered UX** — competitors are increasingly ad-heavy and subscription-pushy.
4. **39 genuinely working tools** — no placeholder buttons or fake AI features.

---

## 5. Supported Format Matrix

### Image input

| Format | Tools that accept it | Notes |
|---|---|---|
| JPG / JPEG | All image tools, JPG to PDF, File Checker | Fully supported |
| PNG | All image tools, JPG to PDF, File Checker | Fully supported, including transparency |
| WebP | All image tools, JPG to PDF | Fully supported |
| GIF | Image Converter, JPG to PDF | First frame only — animation not preserved |
| BMP | Image Converter, JPG to PDF | Fully supported |
| HEIC / HEIF | None | Explicitly rejected with actionable error message |
| AVIF | Not supported | Canvas toBlob does not output AVIF in most browsers |
| TIFF | Not supported | No browser-native TIFF decode |
| SVG | Not supported | Requires rasterisation step |

### Image output

| Format | Available in |
|---|---|
| JPG | Image Compressor, Image Resizer, Photo Resizer, Image Converter |
| PNG | Image Compressor, Image Resizer, Image Converter |
| WebP | Image Compressor, Image Resizer, Image Converter |

### Document input

| Format | Tool | Quality |
|---|---|---|
| PDF | All PDF tools | Full support |
| DOCX | Word to PDF | Good — layout approximated |
| XLSX / XLS | Excel to PDF, Excel to PDF | Good — tables, up to 1000 rows / 40 columns |
| CSV | Excel to PDF | Good |
| PPTX | PowerPoint to PDF | Partial — text and images, no animations |
| HTML / HTM | HTML to PDF | Good — sanitised and paginated |
| TXT | HTML to PDF | Accepted as plain text |

### Document output

| Format | Tool |
|---|---|
| PDF | All PDF tools, Word/Excel/PowerPoint/HTML to PDF |
| DOCX | PDF to Word |
| XLSX | PDF to Excel |
| PPTX | PDF to PowerPoint |
| TXT | PDF to Text |
| Markdown (.md) | PDF to Markdown |
| HTML report | Compare PDFs |

---

## 6. Performance Assessment

### Build metrics

| Metric | Value |
|---|---|
| Total modules transformed | 642 |
| Build time | ~39 s |
| Main JS bundle (gzip) | 521 KB |
| Pro-tools bundle (gzip) | 879 KB |
| CSS (gzip) | 6.3 KB |
| Tool HTML pages | 39 |
| Workspace pages | 9 (index + 8 workspaces) |
| Sitemap URLs | 58 |

### Runtime considerations

- Pro-tools bundle is loaded lazily via `import('./pro-tools.js')` only when a pro tool button is clicked. The homepage and basic tools load only `main.js` (~521 KB gzip).
- PDF.js worker runs in a separate thread — UI remains responsive during page rendering.
- Each tool enforces memory limits (35–45 MB per file, pixel limits on images) to prevent browser crashes.
- Canvas elements are explicitly cleared (`canvas.width = 1; canvas.height = 1`) after use to release GPU memory.
- Object URLs are revoked on clear and on new file selection.

### Chunk size warning

The `pro-tools-*.js` chunk at 879 KB (gzip) is a known pre-existing issue. It bundles all heavy libraries (PDF.js data, Tesseract, PptxGenJS, pdf-lib, mammoth, SheetJS, jsPDF, docx). It is already lazily loaded. Further splitting would require per-tool dynamic imports — a worthwhile future optimisation but not a correctness problem.

---

## 7. Accessibility Assessment

| Item | Status |
|---|---|
| Skip-to-main link | ✓ Present and functional |
| All interactive elements have accessible labels | ✓ |
| Dropzone has `aria-label` on file input | ✓ |
| Status messages use `role="status"` / `role="alert"` | ✓ |
| Result card announces with `aria-live="polite"` | ✓ |
| Focus management after result | ✓ — `result-title` receives focus |
| Keyboard navigation throughout tool panel | ✓ — Enter submits form |
| Mobile menu has `aria-expanded` and `aria-label` | ✓ |
| `prefers-reduced-motion` media query | ✓ |
| Minimum touch target 44 × 44 px | ✓ — enforced via `min-height: 44px` |
| Color contrast — green on white (`#176b52` on `#fff`) | ✓ — 5.3:1 (AA pass) |
| Focus ring visible | ✓ — 3 px solid `#0b5c47` |

---

## 8. Responsive Design Assessment

| Breakpoint | Layout | Status |
|---|---|---|
| ≥ 1160 px | 4-column tool grid, 2-col workspace | ✓ |
| 900–1160 px | 2-column tool grid, 1-col workspace | ✓ |
| 650–900 px | Mobile nav, 2-col tool grid, side panels side-by-side | ✓ |
| < 650 px | 1-column everything, stacked nav, single-col tool grid | ✓ |
| Minimum width | 320 px enforced on `body` | ✓ |

---

## 9. What Was Not Changed

The following items were inspected and found to be working correctly — no changes were made:

- All pro tool handlers in `pro-convert.js`, `pro-extra.js` (beyond the OCR cache fix)
- Backend admin CRUD routes (guides, presets, feedback)
- JWT authentication flow
- MongoDB models and schema validation
- Vite configuration and build pipeline
- SEO metadata injection (`seo.js`)
- Guide article rendering
- Contact form
- Admin panel UI
- Footer and header rendering
- 404 page
- All guide pages
- Privacy, Terms, About, Contact static pages

---

## 10. 2.0 Upgrade — Implemented

The following items from the earlier roadmap are now in the codebase and browser-verified:

1. **Drag-to-reorder merge UI** — `#merge-list` renders files with live page counts, drag reorder, Alt+arrow keyboard reorder and remove buttons. Tool order controls `window.selectedFiles`.
2. **Batch image processing** — Compress, Resize and Convert Image accept up to 20 files, show per-file status cards, and export a ZIP. Single files still download directly.
3. **PDF page thumbnail grid** — `pro-workspace.js` supplies visual page selection/rotation for 8 PDF tools; manual page inputs remain available.
4. **Result previews** — `showResult()` renders page 1 of any PDF output using PDF.js; image outputs use their own thumbnail.
5. **Workspaces + formats** — `/workspaces/` and 8 workspace pages are generated from `public/assets/workspaces.js`; `/formats.html` publishes the honest format matrix.
6. **Cancel control** — A dynamically injected Cancel button invalidates the active job token; batch and PDF loops stop at their next check.
7. **Delete-page semantics** — Delete PDF Pages no longer preselects all pages; empty selection produces a clear error instead of a misleading "keep one page" message.
8. **Netlify security parity** — 120 req/5 min per-IP API limit, 200 KB body cap, admin DB role recheck, and feedback email validation now mirror Express protections.
9. **Single catalog** — `tool-manifest.js` removes the 38/39 tool drift; sitemap is generated from the same workspace manifest (58 URLs).

### Verified after implementation

- `npm run check` — pass
- `npm run build` — pass, 642 modules, 58 sitemap URLs
- `npm audit --audit-level=high` — pass
- Browser smoke tests — workspace index, 8 workspace pages, formats matrix, merge drag/keyboard reorder, merge output, delete-page selection + empty-selection error, batch image ZIP, single-image direct download, PDF result preview, Cancel button presence — all pass with zero console errors.

---

## 11. Remaining Future Work (not implemented)

1. **PDF form fill** — `pdf-lib` supports `PDFDocument.getForm()` and field filling; needs a new tool page and handler.
2. **Multi-language OCR** — Tesseract.js supports more languages; add a selector and serve additional `.traineddata.gz` files.
3. **HEIC support** — Add `heic2any` (MIT, ~200 KB) to decode HEIC before canvas processing.
4. **Compress PDF chunk splitting** — Move heavy handlers into per-tool dynamic imports to reduce initial bundle size.
5. **Visual redaction selection** — Replace coordinate inputs with click-and-drag boxes; verify text removal after raster rebuild.
6. **MongoDB Atlas password rotation** — Must be done before launch by the site owner; never store the value in docs, git or ZIP.
7. **Rich-text guide editor in admin** — Replace plain textarea with a minimal `contenteditable` editor.
8. **Netlify GitHub auto-deploy** — Confirm the GitHub integration/webhook is active; push alone has not triggered a new deploy.
