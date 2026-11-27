/** Eight primary workspaces. Each tool keeps one home; pages and search still open it directly. */
export const workspaces = [
  {
    id: 'pdf-pages',
    href: '/workspaces/pdf-pages.html',
    name: 'PDF Workspace',
    summary: 'See pages as thumbnails, then split, reorder, extract, delete, rotate or crop them. Manual page numbers stay available.',
    note: 'Thumbnails are rendered from your PDF on this device. Select pages visually or type page numbers and ranges under Manual page input.',
    tools: ['split-pdf', 'organize-pdf', 'extract-pdf-pages', 'delete-pdf-pages', 'rotate-pdf', 'crop-pdf'],
    also: [{ href: '/workspaces/merge-combine.html', label: 'Merge & Combine' }]
  },
  {
    id: 'pdf-editor',
    href: '/workspaces/pdf-editor.html',
    name: 'PDF Editor',
    summary: 'Stamp text or an image, add a visual signature, watermark pages, number them, or flatten annotations. These edits are visual, not a full layout editor.',
    note: 'Signatures are images placed on the page, not cryptographic or legally certified e-signatures. Open the result and check placement before use.',
    tools: ['edit-pdf', 'sign-pdf', 'watermark-pdf', 'add-page-numbers', 'flatten-pdf'],
    also: [{ href: '/workspaces/pdf-pages.html', label: 'Crop lives in PDF Workspace' }]
  },
  {
    id: 'image-studio',
    href: '/workspaces/image-studio.html',
    name: 'Image Studio',
    summary: 'Compress, resize or convert JPG, PNG, WebP, GIF and BMP. Process up to 20 images in one batch and download them as a ZIP.',
    note: 'JPG, PNG and WebP are true output formats. GIF and BMP are accepted as input and use their first frame. HEIC, AVIF and TIFF are not supported in this browser build.',
    tools: ['image-compressor', 'image-resizer', 'photo-signature-resizer', 'image-converter', 'file-checker'],
    also: [{ href: '/workspaces/merge-combine.html', label: 'Images to PDF' }]
  },
  {
    id: 'file-converter',
    href: '/workspaces/file-converter.html',
    name: 'File Converter',
    summary: 'Convert the formats this browser build can actually read. Layout is reconstructed, not identical to Word, Excel or PowerPoint.',
    note: 'PDF to Word, Excel and PowerPoint uses text and position inference. Complex tables, columns and fonts need review. Scanned PDFs need OCR first.',
    tools: ['word-to-pdf', 'pdf-to-word', 'excel-to-pdf', 'pdf-to-excel', 'pptx-to-pdf', 'pdf-to-pptx', 'html-to-pdf', 'pdf-to-jpg', 'pdf-to-text', 'pdf-to-markdown'],
    also: [{ href: '/formats.html', label: 'Supported format matrix' }]
  },
  {
    id: 'pdf-security',
    href: '/workspaces/pdf-security.html',
    name: 'PDF Security',
    summary: 'Password-protect by rebuilding pages, unlock a PDF you can already open, cover redaction areas, and edit metadata. Protection here is not certificate signing.',
    note: 'Protect rebuilds pages as images. Unlock needs the password you already know. After redaction, extract text from the output to confirm nothing sensitive remains.',
    tools: ['protect-pdf', 'unlock-pdf', 'redact-pdf', 'pdf-metadata'],
    also: []
  },
  {
    id: 'pdf-intelligence',
    href: '/workspaces/pdf-intelligence.html',
    name: 'PDF Intelligence',
    summary: 'Read document facts, compare selectable text, and add an English OCR text layer on scanned pages. This is not an AI summary.',
    note: 'OCR is English-only, limited to 20 pages, and downloads language data on first use. Compare needs a selectable text layer — scanned PDFs need OCR first.',
    tools: ['pdf-info', 'compare-pdf', 'ocr-pdf'],
    also: [{ href: '/workspaces/file-converter.html', label: 'PDF to Text and Excel' }]
  },
  {
    id: 'pdf-optimizer',
    href: '/workspaces/pdf-optimizer.html',
    name: 'PDF Optimizer',
    summary: 'Shrink a PDF by rasterising pages, repair structure, convert to grayscale, or prepare PDF/A metadata. Compression makes text non-selectable.',
    note: 'Strong compression converts pages to images, so text and tags may be lost. PDF/A Preparation sets archival-friendly metadata but is not certified validation.',
    tools: ['pdf-compressor', 'repair-pdf', 'pdf-to-grayscale', 'pdf-to-pdfa'],
    also: []
  },
  {
    id: 'merge-combine',
    href: '/workspaces/merge-combine.html',
    name: 'Merge & Combine',
    summary: 'Combine PDFs or images in the order you set. Drag, move or remove files, then download one document.',
    note: 'Merge PDF and JPG to PDF both show an ordered list with drag, keyboard move and remove controls. The list order becomes the output order. Files stay on your device; password-protected PDFs are not supported.',
    tools: ['merge-pdf', 'jpg-to-pdf'],
    also: [{ href: '/workspaces/pdf-pages.html', label: 'Organise pages inside one PDF' }]
  }
];

export const workspaceByTool = new Map(workspaces.flatMap(ws => ws.tools.map(id => [id, ws])));
