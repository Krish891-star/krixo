# KriXo — competitor analysis

Method: findings below are from live web-search result pages and the competitors' own visible page copy during this audit. `[3P-V]` means the claim is visible on that competitor's page in the search result snippet; `[SERP]` means the query family was observed in the live SERP; `[EST]` is an assessment, not measured data. No rank tracking, paid SEO data, GSC or analytics were available, so no search volumes or backlink counts are claimed.

## Verified competitor set

| # | Competitor | Verified position / claim | Source | Relevance to KriXo |
|---:|---|---|---|---|
| 1 | SwiftShrink | `[3P-V]` Exact-KB presets 10 KB–2 MB, custom target, browser-only Canvas processing, batch, no upload/sign-up. | https://swiftshrink.com/ | Direct competitor for `compress image to 100 KB`. |
| 2 | Clean.tools | `[3P-V]` 100 KB preset, optional KB target, automatic quality search, browser-only. | https://clean.tools/compress-image-to-100kb/ | Direct exact-KB intent; explicitly admits resize may be needed. |
| 3 | Photo2KB | `[3P-V]` Target-KB binary search within ±2 KB, batch, freemium limits (10 compressions/session, 3 MB/image on free). | https://photo2kb.com/ | Shows exact-KB intent is commercial, not first-mover. |
| 4 | SqueezeKB | `[3P-V]` Exact cap, real encoded-size examples, honest "target not reached" warning, JPG/PNG only, custom 10–5000 KB. | https://squeezekb.com/ | Strong model for honest failure states and measured examples. |
| 5 | ShrinkTo | `[3P-V]` Exact KB targeting, JPG/PNG/WebP/AVIF/HEIC, batch ZIP, form-use presets. | https://shrinkto.com/ | Broader format coverage; targets the same form-upload jobs. |
| 6 | ImageCompressor.pics | `[3P-V]` 7 input formats, 6 output formats, 20-file batch, states GIF output is static and HEIC export is unavailable. | https://imagecompressor.pics/ | Strong honest-limitation copy; covers KriXo image compressor/resizer/converter overlap. |
| 7 | Softery.io | `[3P-V]` Distinguishes KB (1000 bytes) from KiB (1024), shows exact byte cap, asks before shrinking pixels, discloses analytics. | https://softery.io/tools/compress-image-to-kb | Best-in-class transparency; KriXo should copy the KB/KiB explainer pattern, not the wording. |
| 8 | WayPDF | `[3P-V]` 19 browser PDF tools, zero uploads, WASM, PWA/offline capable, 100 MB max. | https://waypdf.com/ | Direct PDF-suite competitor with a strong privacy proposition. |
| 9 | FeelPDF | `[3P-V]` Browser-first PDF suite; explicitly badges the Office-conversion server exception as honest. | https://feelpdf.com/ | Shows that KriXo's browser-local claim must be precise per tool. |
| 10 | StayPDF | `[3P-V]` Browser-only PDF tools, CSP protection, no third-party scripts, DevTools-verifiable no-upload claim. | https://staypdf.com/en/ | Raises the proof bar for privacy claims. |

Adjacent players observed: [3P-V] PDFree (https://pdfree.io/pdf-tools-no-upload/), ToAny (https://toany.io/), Docfeather (https://docfeather.com/), ToolBox (https://www.toolbox-kit.com/blog/best-free-pdf-tools-compared), image.dev (https://image.dev/convert), PicConverter (https://picconverter.org/), Image Wrench (https://www.imagewrench.com/), raster.gg (https://raster.gg/convert), plus branded server-based incumbents iLovePDF, SmallPDF and PDF24 referenced in the ToolBox/ToAny comparisons.

## Brand and SERP context

- `[SERP]` Searching "Krixo" is dominated by an unrelated cybersecurity company at `krixo.io`; KriXo's own Netlify URL did not appear for the brand term in the observed results.
- `[EST]` A custom domain plus consistent "KriXo Tools" naming is the single highest-leverage authority fix. Using only `krixo.netlify.app` makes every link and citation weaker and harder to recognise.
- `[SERP]` Exact-KB, no-upload and "check before upload" query families are actively served by dedicated pages. KriXo must not claim first-mover status.

## Gaps competitors leave open

1. **Exact-size with honest failure states.** Several competitors hit a target or show a warning; few combine a real byte cap, a clear "not reached" message and an explanation of why. KriXo's image compressor and file checker can own this.
2. **Requirement checker.** Form portals reject for both bytes and pixels. A single checker that reports KB, dimensions, format and likely portal mismatch is a sharper long-tail target than a generic "file size checker".
3. **Dated, source-backed form requirements.** Competitors list preset jobs but rarely date the requirement or cite the portal. KriXo can publish sourced, dated requirement pages.
4. **Honest format limitations.** Many pages bury GIF/BMP/HEIC/AVIF limits. KriXo already uses explicit accepted-format lists; keep and expand them.
5. **Batch and mobile form prep.** Competitors emphasise batch and ZIP. KriXo should add batch/ZIP where it truly exists and state device-memory limits honestly.
6. **Privacy-audit explainers.** StayPDF/FeelPDF prove that "verify it in DevTools" content earns trust. KriXo can publish a no-upload audit page with network-tab steps.

## What KriXo should not do

- Do not target head terms first: `jpg to pdf`, `compress PDF`, `merge PDF`, `image converter` are high-difficulty `[EST]` and already crowded by strong brands.
- Do not claim "split PDF into multiple files" on `split-pdf`; the implementation saves selected pages into one PDF.
- Do not imply every tool is server-free if any future tool adds a server step; label per tool.
- Do not copy competitor volume claims, benchmark numbers or "first/only" language.

## Priority implication

Lead with long-tail exact-KB, exact-pixel, privacy-verifiable and requirement-checker intents. Build category hubs for head terms. Earn authority with a custom domain, sourced requirement guides and genuinely unique tooling (checker + form prep), not by out-spending incumbents on generic conversion keywords.
