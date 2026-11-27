# KriXo — Market and Product Strategy

Research snapshots: 17 November 2026 and 25 November 2026 (competitor-gap pass). Geography: India-first, usable worldwide.

## Executive decision

Build **KriXo**, an upload-readiness toolkit for PDF and image files. The user should be able to check a file against requirements they enter, then fix it with the relevant tool without hunting through separate websites.

This is a competitive market. There is no honest basis to promise that a new site will “defeat” iLovePDF, Smallpdf or PDF24. The defensible first step is a narrower workflow, a cleaner mobile experience, reliable outputs, transparent limitations and original search pages that answer one user task well.

## Search-demand signals

A third-party keyword report for India, updated 9 November 2026, reported:

| Query | Estimated average monthly searches | SEO difficulty in the report |
|---|---:|---:|
| compress image | 500,000 | 88/100 |
| compress image to 50 KB | 82,000 | 30/100 |
| compress image to 100 KB | 67,000 | 23/100 |
| compress image to 20 KB | 55,000 | 21/100 |
| compress image to 200 KB | 33,000 | 29/100 |
| compress pdf | 2,700,000 | not shown for this related-keyword row |
| pdf to image | 370,000 | not shown for this related-keyword row |
| jpg to pdf | 7,500,000 | not shown for this related-keyword row |

These are estimates from a third-party keyword dataset, not Google Search Console impressions, actual website visitors or a traffic guarantee. The report itself lists very high difficulty for the broad “compress image” head term, while several target-KB phrases show lower estimated difficulty. Search volume can vary by tool, time, language and query grouping.

Source: https://www.kwstrends.com/keywords/in/compress-image

## Competitor review

### Broad PDF suites

- **iLovePDF** — https://www.ilovepdf.com/ — broad set: merge, split, compress, convert, organise, edit, protect, unlock, sign, OCR and PDF intelligence. Its page also offers a Hindi language option. Lesson: clear categories and a wide set of related PDF jobs matter.
- **Smallpdf** — https://smallpdf.com/pdf-tools — compress, convert, OCR, merge, split, edit, annotate, forms, signing and AI document tools. Lesson: polished task-focused flows are expected; AI features are not an initial requirement for KriXo.
- **PDF24** — https://tools.pdf24.org/en/ — broad PDF tools, advertises free access without artificial limits and explains server-side processing and temporary file deletion. Lesson: useful free access and transparent privacy language are competitive strengths.
- **Sejda** — https://www.sejda.com/ — offers advanced split options such as page ranges, bookmarks, size and text, plus edit/sign, security and conversions. Lesson: specialised PDF operations can make a suite useful beyond basic merge/compress.
- **Adobe Acrobat online** — https://helpx.adobe.com/in/document-cloud/faq/try-acrobat-online-services.html — familiar PDF operations and extensive conversion support, with documented file and page limits. Lesson: avoid promising every advanced conversion in a small first release.

### Broad image suites

- **iLoveIMG** — https://www.iloveimg.com/ — compress, resize, crop, convert, edit, watermark, blur, upscale and remove backgrounds; its pricing page describes limited processing on the free tier and more capacity on Premium. Lesson: a basic compress/resize/convert trio is not unique by itself.
- **Squoosh** — https://squoosh.app/ and https://github.com/GoogleChromeLabs/squoosh — local browser processing, before/after comparison and quality controls. Lesson: local processing and visible quality review are meaningful trust features.
- **ImageResizer** — https://imageresizer.com/ — simple resize flow, target size, no registration/watermark; its page says images are uploaded and deleted automatically within six hours. Lesson: keep the workflow simple, and be explicit about whether processing is local or server-based.

### India-focused exact-size competitors

- **PhotoSuvidha** — https://photosuvidha.in/en — exam/photo/signature presets, custom dimensions, target KB, thumb/declaration tools and browser-local processing claims.
- **ExamPic** — https://exampic.com/ — exam and ID photo/signature presets, exact pixels/KB and local-processing claims.
- **KbSnap** — https://www.kbsnap.in/ — image and PDF tools, photo/signature resizing, photo/signature joining, passport sheet, PDF compression and merge.
- **ZYM Labs** — https://zymlabs.in/tools/compress-pdf/ — target-size PDF compression presets such as 100/200/500 KB, with a browser-local processing claim.
- **MuftTools** — https://mufttools.in/compress-pdf/ — PDF target-size presets and browser-local compression claims.

This competitor set is important: KriXo should not be positioned as the first tool to compress a photo or PDF to a specific KB value. The exact-size niche already has direct competitors.


### Second-pass competitors and product overlap

A second pass found more direct overlaps than the first shortlist suggested:

- **FileMitra** — https://www.filemitra.com/ — India-facing PDF/image utility suite with many tools and application/document workflows.
- **FileFit** — https://filefit.space/tools — file-preparation tools including exact size and dimension workflows.
- **ReadyFile** — https://usereadyfile.com/tools/ — upload-ready document tools and requirement-oriented workflows.
- **FilePrep** — a recent public launch post describes a free, privacy-first browser toolkit for image compression to target KB, resizing, cropping, image-to-PDF and PDF compression: https://www.linkedin.com/ (search the post title “I’ve launched FilePrep”).
- **PDS PDF** — https://www.pdspdf.com/ — a broad PDF/image/utility directory listing 63 tools, including target-KB compression and government-form photo resizing.
- **MiniImgTools** — https://miniimgtools.com/ — advertises 185 free image/PDF tools, including exact target-KB options.
- **NoCloud Tools** — https://nocloud.tools/ — browser-local tools with many image/PDF utilities and target-KB compression.
- **FileChak** — https://filechak.kr/en — Korea-specific file preparation for applications, including upload checks, PDF/image tools, privacy-first processing and local application workflows.
- **FormPrep (Android app)** — https://play.google.com/store/apps/details?id=com.qubitsoftech.formprep — exam/job/passport photo and signature presets, exact KB/pixel checks, PDF tools, batch mode and Hindi among 17 languages.

This changes the strategic conclusion: the broad “all-in-one, browser-local PDF/image tools” idea is already being copied and expanded by many small products, not only by global incumbents. A bigger tool count is not a meaningful differentiator.

### Third pass: official competitor pages (25 November 2026)

The official public pages for iLovePDF (https://www.ilovepdf.com/), Smallpdf (https://smallpdf.com/) and PDF24 (https://tools.pdf24.org/en/) were reviewed again to identify specific jobs a user may expect from a complete PDF suite. The useful gaps that can be implemented honestly with browser JavaScript/WASM were:

- iLovePDF exposes unlock, sign, OCR, edit and “PDF intelligence”; KriXo now has unlock, visual sign, OCR and edit, but does not claim AI document intelligence.
- Smallpdf groups conversion, edit, annotate, forms, sign and AI; KriXo now has text/Markdown/image extraction, editing, flattening, redaction and metadata tools, without claiming AI summarisation or translation.
- PDF24 offers a very broad free tool list; KriXo added compare, redact, unlock, flatten, grayscale and metadata editing with explicit on-page limits instead of copying a long feature list.

**Implemented:** PDF→Text, PDF→Markdown, Compare PDFs, Redact PDF, Unlock PDF, Flatten PDF, PDF→Grayscale and Edit PDF Metadata. Image→PDF and PDF→Image now also accept JPG/PNG/WebP/GIF/BMP and export WebP. The catalogue is now 39 tool pages with runtime canonicals, unique descriptions, FAQs and sitemap entries.

**Not implemented honestly:** AI chat/summarisation/translation, server-quality OCR, certified PDF/A and cryptographic e-signatures are not claimed. These need external services or engines that are deliberately not bundled.

This pass increases genuine utility without a redesign; it does not change the product conclusion that guided upload-readiness and trustworthy output are the differentiators.

### Fourth pass: 2.0 workspaces and batch workflows (25 November 2026)

The competitor review showed that a long flat tool list is not useful on mobile, and that visual page control plus batch processing are the most visible gaps. The 2.0 build addresses those without adding a paywall or server processing:

- Eight primary workspaces group the 39 tools by job while every standalone tool URL still works and stays searchable.
- `/formats.html` publishes an honest support matrix. It explicitly names unsupported DOC/ODT/RTF/ODS/PPT/ODP, AVIF/TIFF/HEIC, certified PDF/A and cryptographic signatures. This is a trust differentiator against competitors that imply universal support.
- Merge PDF now has drag and keyboard reordering with live page counts; image compress/resize/convert now handle up to 20 files per batch and export a ZIP.
- A shared Cancel control and per-file progress statuses make long local jobs predictable without collecting telemetry.
- PDF outputs get a real first-page preview generated locally from the result blob.

The strategic conclusion is unchanged: KriXo should win on trustworthy output, clear limits, no upload and guided upload-readiness — not on tool-count claims or fake AI features.

### Brand check

The name **FileSathi** was rejected because filesathi.com is already used by a document-tracking product. **KriXo** is a working name chosen after an exact-name web search returned no obvious result; this does not confirm domain availability, trademark availability or legal clearance. Check the registrar and relevant trademark databases before buying a domain or using the brand commercially.

## What appears underserved enough to test

No clearly empty feature was validated in this research. The most sensible wedge to test is a joined-up, India-first guided workflow—not a claim of being the first or only tool:

1. User enters a requirement (file type, maximum KB, optional minimum KB, image width/height, or PDF size/page rules).
2. The checker reports exactly which checks pass or fail.
3. The user gets a direct “fix this” path to the matching image or PDF tool.
4. The output is checked again and the result shows actual file size/dimensions.
5. If a portal-specific preset exists, show the official source URL and last-checked date. Do not publish unverified exam values.

This is a product hypothesis, not proof of a market gap. Existing tools already cover several parts of the workflow. The current starter build contains the basic tools and a simple “what went wrong?” router, but it does not yet contain a maintained official portal database. Validate the guided workflow with real users before investing in more features.

## Initial information architecture

- Home: search tools, grouped PDF and Image categories, file-readiness proposition.
- Image tools: compress to KB, resize, photo/signature custom resizer, convert JPG/PNG/WebP, file checker.
- PDF tools: compress, merge, split by page ranges, rotate, images-to-PDF, PDF-to-JPG/WebP, PDF→Text/Markdown, compare, redact, unlock, flatten, grayscale, metadata, plus the Phase 1 conversion/edit/OCR set.
- Guides: KB vs pixels, PDF compression quality, photo upload checklist.
- Trust pages: About, Contact, Privacy, Terms.
- Admin: manage guides, create/delete requirement presets, review feedback.

## Product decisions

### Build now

- Core tasks with understandable inputs and output validation.
- Browser-local file processing for privacy and low hosting costs.
- A checker that explains pass/fail against values the user enters.
- A responsive design that works on phones, since form uploads often happen on mobile.
- A small number of dedicated SEO landing pages, each with unique copy, FAQs and internal links.
- A simple Node/Express backend for content, verified presets, feedback and admin authentication.

### Do not build in the first release

- Original first-release scope excluded PDF-to-Word/Excel/PPT, OCR, editing, e-signatures and password removal. Phase 1 and the 25 November pass now deliver browser-based versions with documented fidelity limits (rasterised output for protect/unlock/redact/flatten, visual-only signature, OCR text layer). AI PDF chat/summarisation/translation, AI background removal and image upscaling remain out of scope because they need external models or server processing.
- Dozens of thin pages for every exam or university. A page should exist only when the official requirement is verified and the content provides real help.
- User accounts for basic tools. They add friction without improving the main file workflow.

## Technical strategy

- HTML/CSS/vanilla JavaScript frontend bundled with Vite.
- `pdf-lib` for PDF merge/split/rotate/create; `pdfjs-dist` for rendering PDF pages; `JSZip` for multi-page image exports.
- Browser Canvas for image resizing/compression/conversion.
- Node.js + Express backend, MongoDB/Mongoose for guide content, verified presets and feedback; bcrypt password hashing; JWT in HttpOnly cookie; rate limits and Helmet headers.
- File contents stay in the browser and are not uploaded to the Node API in this release.

### Known trade-offs

- Strong PDF target-size compression rasterises pages. Text may no longer be selectable and links/forms/metadata may be lost. This is disclosed in the tool UI.
- Exact image KB targets can fail for some content. The tool must say when it cannot reach the target without excessive quality/dimension loss.
- Browser memory limits large files. The app sets page/file guardrails and should be tested on low-memory Android devices.
- Exam presets must be maintained against official notices, with a source and last-checked date.

## Monetisation and SEO

- Do not put ads near file selection, processing or download buttons; accidental clicks harm users and ad-policy compliance.
- Apply for display advertising only after publishing genuinely useful original content and reviewing the provider's policies. Approval and earnings are not guaranteed.
- Measure real performance with Search Console: impressions, clicks, queries, country, device and landing page. Do not estimate revenue from keyword volume alone.
- Start with a small number of high-intent pages (image compressor to target KB, photo/signature custom resizer, PDF compressor, PDF to JPG) but avoid near-duplicate pages that simply swap one number. Competing sites already publish many exact-KB pages, so only create a page when it adds a real workflow, tested guidance or unique evidence.
- Add clear internal links between related tasks and guides. Keep technical SEO basics: unique title/description, canonical URL, sitemap, robots, fast page load, accessible controls and mobile usability.

## Success criteria for the first 30-day test

- At least 15–25 real users test the site on phones and laptops.
- Track successful processing completion and failure messages without collecting file contents.
- Record the top 5 requested tasks and top 5 reasons users abandon the workflow.
- Fix usability and output-quality issues before expanding the tool catalogue.
- Use Search Console impressions and real query data to decide which landing pages deserve more depth.

## Research sources

- iLovePDF tools: https://www.ilovepdf.com/
- Smallpdf tools: https://smallpdf.com/pdf-tools
- PDF24 tools and privacy: https://tools.pdf24.org/en/ and https://www.pdf24.org/en/privacy-policy.html
- Sejda: https://www.sejda.com/
- Adobe Acrobat online FAQ: https://helpx.adobe.com/in/document-cloud/faq/try-acrobat-online-services.html
- iLoveIMG tools and pricing: https://www.iloveimg.com/ and https://www.iloveimg.com/pricing
- Squoosh: https://squoosh.app/ and https://github.com/GoogleChromeLabs/squoosh
- ImageResizer: https://imageresizer.com/
- PhotoSuvidha: https://photosuvidha.in/en
- ExamPic: https://exampic.com/
- KbSnap: https://www.kbsnap.in/
- ZYM Labs: https://zymlabs.in/tools/compress-pdf/
- MuftTools: https://mufttools.in/compress-pdf/
- India keyword estimates: https://www.kwstrends.com/keywords/in/compress-image
