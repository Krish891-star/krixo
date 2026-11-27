# KriXo — content strategy

## Principle

One URL owns one intent. Tool pages are transactional and should stay short, honest and format-specific. Guides and requirement pages are informational and should earn links. Category hubs hold head terms. Never use one page to rank for two different output formats or two different jobs.

## Current verified state

- `[FIXED]` Homepage title/H1/hero copy now match `lang="en"` and "All Tools" shows all 39 tools.
- `[FIXED]` `split-pdf`, `extract-pdf-pages`, `image-converter`, `rotate-pdf`, `jpg-to-pdf`, `merge-pdf` and `image-compressor` copy bugs were corrected.
- `[FIXED]` Sitemap has 58 URLs with `<lastmod>`; canonical fallbacks are injected into 57 indexable HTML files after build.
- `[NOT VERIFIED]` Rankings, impressions, search volumes, backlink counts and field Core Web Vitals: no GSC/GA/paid SEO access.

## Content tiers

### Tier 1 — Transactional tool pages (39 URLs)

Keep for each page:

- Title = primary keyword + output/format + brand, under ~60 characters where practical.
- H1 = the same intent in natural language.
- First paragraph = what changes, what stays unchanged, accepted formats, maximum size/count.
- FAQ = only questions that match the tool's real behaviour; remove any answer that contradicts the implementation.
- JSON-LD = `FAQPage` and `SoftwareApplication` with real name/description; `BreadcrumbList` from static markup.
- One related link: reverse conversion, checker or guide. No "all-in-one converter" language.

Priority fixes already applied are listed in `SEO-PAGE-MAP.md`. No further visible rewrites were made without evidence.

### Tier 2 — Requirement and limit guides (new, informational)

Publish these as dated, source-backed articles under `/guides/`:

1. `image-upload-size-limits-explained.html` — KB vs KiB, bytes vs dimensions, why a portal rejects a file.
2. `photo-and-signature-for-online-forms.html` — px + KB workflow, with dated portal examples and citations.
3. `pdf-upload-limits-for-email-and-portals.html` — MB/KB caps, compression trade-offs, quality checks.
4. `pdf-conversion-limitations.html` — which conversions keep layout, which produce plain text, which need OCR.
5. `how-to-verify-a-browser-file-tool-does-not-upload.html` — DevTools network-tab audit, matching competitor proof pages.

Each guide must include a date, sources, a plain-language summary and a link to the single tool that performs the job. Do not invent portal requirements.

### Tier 3 — Category hubs (head terms)

Two focused category hubs are now part of the site: `/pdf-tools/` for PDF/document workflows and `/image-tools/` for image workflows. The homepage links to both hubs and includes a static HTML fallback list of all 39 tools. Broad category terms such as `PDF tools online` and `image tools online` belong on these hubs; each individual tool page keeps one specific conversion or editing intent.

## Internal linking rules

- Every tool page links to its category hub and relevant sibling tools.
- Each category hub links to its collection of tools with ordinary HTML anchors, not JavaScript-only navigation.
- Guides link to one transactional tool and one sibling guide, not to every tool.
- Use descriptive anchors (`compress an image to 100 KB`), not "click here".
- Do not add links to pages that do not exist in `dist`; the static link check currently reports 0 broken internal targets.

## Freshness and measurement

- `sitemap.xml` uses the same clean, extensionless canonical routes that Netlify serves. `<lastmod>` is omitted until a trustworthy source-control timestamp is available; do not stamp every URL with the build date.
- Once GSC is connected, validate the highest-priority terms from `SEO-KEYWORD-MAP.md`: `resize image`, `compress PDF`, `merge PDF`, `JPG to PDF`, `PDF to Word`, `PDF to Excel`, `compress image to KB`, `OCR PDF`, `add watermark to PDF`, `edit PDF`, `sign PDF`.
- Do not add volume numbers to the keyword map until real data is available.
