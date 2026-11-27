/* Lightweight catalogue data. The heavy processing modules load only on tool pages. */
export const proToolCatalog = [
  { id: 'word-to-pdf', name: 'Word to PDF', desc: 'Convert a .docx document into a paginated PDF.', href: '/tools/word-to-pdf.html', type: 'pdf', icon: 'convert', tone: '' },
  { id: 'pdf-to-word', name: 'PDF to Word', desc: 'Extract PDF text into an editable Word file.', href: '/tools/pdf-to-word.html', type: 'pdf', icon: 'file', tone: 'orange' },
  { id: 'excel-to-pdf', name: 'Excel to PDF', desc: 'Print every worksheet as a clean PDF table.', href: '/tools/excel-to-pdf.html', type: 'pdf', icon: 'convert', tone: 'lav' },
  { id: 'pdf-to-excel', name: 'PDF to Excel', desc: 'Turn PDF text and rows into an .xlsx workbook.', href: '/tools/pdf-to-excel.html', type: 'pdf', icon: 'file', tone: '' },
  { id: 'pptx-to-pdf', name: 'PowerPoint to PDF', desc: 'Rebuild slides and images as a PDF deck.', href: '/tools/pptx-to-pdf.html', type: 'pdf', icon: 'convert', tone: 'orange' },
  { id: 'pdf-to-pptx', name: 'PDF to PowerPoint', desc: 'Create editable slides from PDF pages.', href: '/tools/pdf-to-pptx.html', type: 'pdf', icon: 'file', tone: 'lav' },
  { id: 'html-to-pdf', name: 'HTML to PDF', desc: 'Render pasted or uploaded HTML as an A4 PDF.', href: '/tools/html-to-pdf.html', type: 'pdf', icon: 'convert', tone: '' },
  { id: 'pdf-to-pdfa', name: 'PDF/A Preparation', desc: 'Clean up a PDF before archival submission.', href: '/tools/pdf-to-pdfa.html', type: 'pdf', icon: 'shield', tone: 'orange' },
  { id: 'organize-pdf', name: 'Organize PDF Pages', desc: 'Reorder or repeat pages in any sequence.', href: '/tools/organize-pdf.html', type: 'pdf', icon: 'merge', tone: 'lav' },
  { id: 'delete-pdf-pages', name: 'Delete PDF Pages', desc: 'Remove chosen pages from a PDF.', href: '/tools/delete-pdf-pages.html', type: 'pdf', icon: 'split', tone: '' },
  { id: 'extract-pdf-pages', name: 'Extract PDF Pages', desc: 'Copy selected pages into a new file.', href: '/tools/extract-pdf-pages.html', type: 'pdf', icon: 'split', tone: 'orange' },
  { id: 'add-page-numbers', name: 'Add Page Numbers', desc: 'Stamp page numbers in a consistent position.', href: '/tools/add-page-numbers.html', type: 'pdf', icon: 'file', tone: 'lav' },
  { id: 'watermark-pdf', name: 'Add Watermark', desc: 'Mark every page with text or an image.', href: '/tools/watermark-pdf.html', type: 'pdf', icon: 'image', tone: '' },
  { id: 'crop-pdf', name: 'Crop PDF', desc: 'Trim page margins with exact point values.', href: '/tools/crop-pdf.html', type: 'pdf', icon: 'crop', tone: 'orange' },
  { id: 'protect-pdf', name: 'Protect PDF', desc: 'Require a password to open your PDF.', href: '/tools/protect-pdf.html', type: 'pdf', icon: 'shield', tone: 'lav' },
  { id: 'sign-pdf', name: 'Sign PDF', desc: 'Add a typed or image signature to pages.', href: '/tools/sign-pdf.html', type: 'pdf', icon: 'file', tone: '' },
  { id: 'edit-pdf', name: 'Edit PDF', desc: 'Stamp extra text or a small image onto a page.', href: '/tools/edit-pdf.html', type: 'pdf', icon: 'resize', tone: 'orange' },
  { id: 'repair-pdf', name: 'Repair PDF', desc: 'Try to rebuild a damaged or unreadable PDF.', href: '/tools/repair-pdf.html', type: 'pdf', icon: 'check', tone: 'lav' },
  { id: 'ocr-pdf', name: 'OCR PDF', desc: 'Make scanned pages searchable in the browser.', href: '/tools/ocr-pdf.html', type: 'pdf', icon: 'search', tone: '' },
  { id: 'pdf-to-text', name: 'PDF to Text', desc: 'Export selectable PDF text as a plain .txt file.', href: '/tools/pdf-to-text.html', type: 'pdf', icon: 'file', tone: 'lav' },
  { id: 'pdf-to-markdown', name: 'PDF to Markdown', desc: 'Turn PDF text into a clean Markdown document.', href: '/tools/pdf-to-markdown.html', type: 'pdf', icon: 'convert', tone: '' },
  { id: 'compare-pdf', name: 'Compare PDFs', desc: 'See a line-by-line text difference report.', href: '/tools/compare-pdf.html', type: 'pdf', icon: 'check', tone: 'orange' },
  { id: 'redact-pdf', name: 'Redact PDF', desc: 'Cover sensitive areas before rebuilding pages.', href: '/tools/redact-pdf.html', type: 'pdf', icon: 'shield', tone: 'lav' },
  { id: 'unlock-pdf', name: 'Unlock PDF', desc: 'Rebuild a password-protected PDF without its lock.', href: '/tools/unlock-pdf.html', type: 'pdf', icon: 'shield', tone: '' },
  { id: 'flatten-pdf', name: 'Flatten PDF', desc: 'Rebuild pages as images for consistent display.', href: '/tools/flatten-pdf.html', type: 'pdf', icon: 'resize', tone: 'orange' },
  { id: 'pdf-to-grayscale', name: 'PDF to Grayscale', desc: 'Convert PDF pages to black and white.', href: '/tools/pdf-to-grayscale.html', type: 'pdf', icon: 'image', tone: '' },
  { id: 'pdf-metadata', name: 'Edit PDF Metadata', desc: 'Change title, author, subject, keywords and more.', href: '/tools/pdf-metadata.html', type: 'pdf', icon: 'file', tone: 'lav' }
];

export const proToolIds = new Set(proToolCatalog.map(tool => tool.id));
