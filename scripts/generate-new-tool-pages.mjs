import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(root, 'public', 'tools');

const esc = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const dropzone = (accept, multiple, label, browse) => `<div class="dropzone" id="dropzone"><input class="file-input" id="file-input" type="file" aria-label="Choose a file" accept="${accept}"${multiple ? ' multiple' : ''}><span class="drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/></svg></span><strong id="dropzone-label">Drop your ${label} here</strong><p id="dropzone-sub">or browse files from your device · processed locally</p><button class="browse-btn" type="button" id="browse-btn" aria-describedby="dropzone-sub">${browse}</button></div>`;
const resultCard = `<div id="result-card" class="result-card"><div class="result-top"><strong id="result-title">Your file is ready</strong><span aria-hidden="true">✓</span></div><p id="result-detail" class="muted-note"></p><div id="result-stats" class="result-stats"></div><img id="result-preview" class="result-preview hidden" alt="Processed preview"><p><a id="download-result" class="download-btn">Download result ↓</a></p></div>`;

function faq(items) {
  return items.map(([question, answer]) => `<details class="faq"><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('');
}

function infoLines(lines) {
  return lines.map(line => `<div class="info-line"><span class="info-dot" aria-hidden="true"></span><span>${esc(line)}</span></div>`).join('');
}

function render(page) {
  const controls = page.controls ? `<div class="form-grid">${page.controls}</div>` : '';
  const extraButtons = page.extraButtons || '';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f7f7f2"><title>${esc(page.title)} — KriXo</title><meta name="description" content="${esc(page.description)}"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="apple-touch-icon" href="/favicon-180x180.png"><link rel="manifest" href="/site.webmanifest"><link rel="alternate icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/assets/styles.css"><script type="module" src="/assets/main.js"></script></head><body data-tool="${page.id}"><header id="site-header"></header><main><section class="shell page-hero"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> / ${esc(page.crumb)}</nav><span class="eyebrow"><i class="eyebrow-dot"></i>${esc(page.eyebrow || 'PDF management')}</span><h1>${esc(page.heading)}</h1><p>${esc(page.intro)}</p></section><section class="shell tool-workspace"><div class="tool-panel">${dropzone(page.accept || 'application/pdf', Boolean(page.multiple), page.dropLabel || 'PDF', page.browseLabel || 'Choose file')}<div id="file-list" class="file-list"></div>${controls}<div class="action-row"><button class="btn-primary" id="process-btn" type="button">${esc(page.button)}</button>${extraButtons}<button class="btn-quiet" id="clear-btn" type="button">Clear</button></div><div id="tool-status" class="tool-status" role="status"></div>${resultCard}</div><aside><div class="side-panel"><h2>How it works</h2><p>${esc(page.how)}</p>${infoLines(page.info || ['No sign-up needed for this tool.', 'File processing happens in your browser.'])}</div><div class="side-panel"><h2>Before you download</h2><ul>${page.warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p>Questions or a bug? <a href="/contact.html" style="color:var(--green);font-weight:800">Send feedback</a>.</p></div></aside></section><section class="shell tool-section"><div class="content-panel"><h2>${esc(page.aboutTitle || `About ${page.crumb}`)}</h2><p>${esc(page.about || page.intro)}</p><h3>Frequently asked questions</h3>${faq(page.faq || [
    ['Are my files uploaded to a server?', 'No. This tool uses your browser to read and process the selected file. File contents are not sent to the KriXo backend.'],
    ['Is this tool free?', 'Yes. It is free to use without an account. Browser memory and device performance may limit very large files.'],
    ['What if the output is not exactly what I expected?', 'Every conversion is performed by a browser library with known limits. Check the “How it works” panel above, then try a smaller or simpler file if needed.']
  ])}</div></section></main><footer id="site-footer"></footer></body></html>\n`;
}

const pageQuality = (id, label, value = '1.5') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" value="${value}" min="1" max="2.5" step="0.1"><small>Higher values keep more detail but use more browser memory.</small></div>`;
const pageField = `<div class="field full"><label for="pages">Pages</label><input id="pages" type="text" placeholder="e.g. 1-3,7"><small>Leave blank to process the whole document.</small></div>`;
const privacyFaq = [
  ['Are my files uploaded to a server?', 'No. The PDF is opened and processed in your browser. File contents are not sent to the KriXo backend.'],
  ['Is this tool free?', 'Yes. It is free to use without an account. Browser memory and device performance may limit very large files.'],
  ['What if the output is not exactly what I expected?', 'Browser-based processing has known limits. Check the “How it works” panel above, then try a smaller or simpler file if needed.']
];

const pages = [
  {
    id: 'pdf-to-text', crumb: 'PDF to Text', title: 'PDF to Text Converter', eyebrow: 'PDF conversion',
    description: 'Extract selectable text from a PDF into a plain text file in your browser. No upload or sign-up required.',
    heading: 'Extract text from a PDF', intro: 'Download the selectable text as a .txt file. This tool reads the text layer already inside the PDF.',
    button: 'Extract text', how: 'PDF.js reads each page’s selectable text and KriXo writes it into a plain text file on your device.',
    warnings: ['Scanned pages with no text layer need OCR PDF first.', 'Columns and page artwork are not rebuilt in the text file.'],
    controls: `<div class="field checkbox full"><label for="text-page-headings"><input id="text-page-headings" type="checkbox" checked> Add page headings</label><small>Makes it easier to find which page each line came from.</small></div>`,
    info: ['No sign-up needed for this tool.', 'Text is extracted locally in your browser.', 'Works best on PDFs with selectable text.']
  },
  {
    id: 'pdf-to-markdown', crumb: 'PDF to Markdown', title: 'PDF to Markdown Converter', eyebrow: 'PDF conversion',
    description: 'Convert selectable PDF text into a Markdown document in your browser. No upload or sign-up required.',
    heading: 'Convert PDF text to Markdown', intro: 'Create a .md file from the text layer in your PDF, with optional page headings and cleaned line breaks.',
    button: 'Create Markdown', how: 'KriXo reads the PDF’s selectable text, adds Markdown page headings when requested, and builds the file locally.',
    warnings: ['This is text-based Markdown; exact layout and images are not preserved.', 'Scanned PDFs need OCR PDF first.'],
    controls: `<div class="field checkbox full"><label for="markdown-page-headings"><input id="markdown-page-headings" type="checkbox" checked> Add “Page N” headings</label></div><div class="field checkbox full"><label for="markdown-clean"><input id="markdown-clean" type="checkbox" checked> Remove repeated blank lines</label></div>`,
    info: ['No sign-up needed for this tool.', 'Markdown is generated in your browser.', 'Useful for notes, documentation and static sites.']
  },
  {
    id: 'compare-pdf', crumb: 'Compare PDFs', title: 'Compare Two PDF Files Online', eyebrow: 'PDF intelligence',
    description: 'Compare two PDFs by their selectable text and download a line-by-line difference report. No upload required.',
    heading: 'Compare two PDF documents', intro: 'Select two PDFs and get a clear report of lines only in the first file, only in the second file, or in both.',
    button: 'Compare PDFs', dropLabel: 'PDFs', browseLabel: 'Choose two PDFs', multiple: true,
    how: 'Both PDFs are opened in the browser, their selectable text is extracted, and a line-by-line difference report is generated as an HTML file.',
    warnings: ['Only the first two selected PDFs are compared.', 'Scanned PDFs need OCR PDF first.', 'This compares text, not visual layout or images.'],
    info: ['No sign-up needed for this tool.', 'Both files stay on your device.', 'The report opens in any browser.']
  },
  {
    id: 'redact-pdf', crumb: 'Redact PDF', title: 'Redact PDF Online', eyebrow: 'PDF security',
    description: 'Cover sensitive areas of a PDF with black boxes in your browser. Pages are rebuilt as images so the covered text is removed.',
    heading: 'Redact sensitive PDF areas', intro: 'Enter boxes in PDF points and KriXo covers them before rebuilding the selected pages as images.',
    button: 'Redact PDF',
    how: 'The selected pages are rendered, the marked rectangles are painted black, and a fresh image-based PDF is created from those pages.',
    warnings: ['Redaction works on rendered pages, so selectable text is not preserved.', 'Check the output carefully before sharing it.', 'Boxes use PDF points from the bottom-left corner (72 pt = 1 inch).'],
    controls: `${pageField}<div class="field full"><label for="redaction-boxes">Boxes to cover</label><textarea id="redaction-boxes" rows="3" placeholder="e.g. 72,720,540,770; 60,60,300,100"></textarea><small>Format: x1,y1,x2,y2 per box. Separate boxes with semicolons. Boxes apply to every selected page.</small></div>${pageQuality('redaction-quality', 'Render quality')}`,
    info: ['No sign-up needed for this tool.', 'Redaction happens locally in your browser.', 'The covered content is not present in the downloaded PDF.']
  },
  {
    id: 'unlock-pdf', crumb: 'Unlock PDF', title: 'Unlock Password-Protected PDF Online', eyebrow: 'PDF security',
    description: 'Open a password-protected PDF and rebuild an unlocked copy in your browser. No upload required.',
    heading: 'Unlock a password-protected PDF', intro: 'Enter the PDF password to create a new copy that opens without one.',
    button: 'Unlock PDF',
    how: 'PDF.js opens the document with the password you enter, renders the pages, and KriXo builds a new PDF without the open password.',
    warnings: ['You must know the document password.', 'Only use this on files you are allowed to modify.', 'The rebuilt PDF is image-based: selectable text, links and form fields are not preserved.'],
    controls: `<div class="field full"><label for="unlock-password">PDF password</label><input id="unlock-password" type="password" autocomplete="current-password" placeholder="Enter the current PDF password"></div>${pageQuality('unlock-quality', 'Render quality')}`,
    info: ['No sign-up needed for this tool.', 'The password is used only in your browser.', 'The unlocked copy is generated locally.']
  },
  {
    id: 'flatten-pdf', crumb: 'Flatten PDF', title: 'Flatten PDF Online', eyebrow: 'PDF management',
    description: 'Rebuild PDF pages as images for consistent display. Browser-based processing with no upload.',
    heading: 'Flatten a PDF', intro: 'Turn each page into an image-based page so annotations, forms and fonts display consistently.',
    button: 'Flatten PDF',
    how: 'KriXo renders the selected pages and embeds them into a new PDF at the original page sizes.',
    warnings: ['Selectable text and form fields are not preserved.', 'Print quality depends on the render quality you choose.', 'Check the output before sending it to a portal or printer.'],
    controls: `${pageField}${pageQuality('flatten-quality', 'Render quality')}`,
    info: ['No sign-up needed for this tool.', 'Flattening happens locally in your browser.', 'Useful before sharing or printing.']
  },
  {
    id: 'pdf-to-grayscale', crumb: 'PDF to Grayscale', title: 'Convert PDF to Grayscale Online', eyebrow: 'PDF management',
    description: 'Convert PDF pages to black and white in your browser. No upload or sign-up required.',
    heading: 'Convert a PDF to grayscale', intro: 'Render your PDF pages in greyscale and download a new PDF made from those pages.',
    button: 'Convert to grayscale',
    how: 'Each selected page is rendered, converted to greyscale pixel data, and embedded into a new PDF at the original page size.',
    warnings: ['Selectable text is not preserved.', 'Very fine coloured lines may become hard to read.', 'Higher render quality keeps more detail.'],
    controls: `${pageField}${pageQuality('grayscale-quality', 'Render quality')}`,
    info: ['No sign-up needed for this tool.', 'Conversion happens locally in your browser.', 'Useful for black-and-white printing.']
  },
  {
    id: 'pdf-metadata', crumb: 'Edit PDF Metadata', title: 'Edit PDF Metadata Online', eyebrow: 'PDF management',
    description: 'Change the title, author, subject, keywords, creator and producer fields of a PDF in your browser.',
    heading: 'Edit PDF document properties', intro: 'Update the metadata stored inside a PDF and download the revised file. Fields you leave blank are cleared.',
    button: 'Save metadata',
    how: 'KriXo opens the PDF locally, updates the document information fields you provide, and writes a new PDF.',
    warnings: ['Metadata does not change the visible page content.', 'Clearing a field removes it from the downloaded copy.', 'Keep a backup of the original document.'],
    extraButtons: `<button class="btn-quiet" id="read-metadata-btn" type="button">Read current</button>`,
    controls: `<div class="field full"><label for="meta-title">Title</label><input id="meta-title" type="text" placeholder="Document title"></div><div class="field"><label for="meta-author">Author</label><input id="meta-author" type="text" placeholder="Author name"></div><div class="field"><label for="meta-subject">Subject</label><input id="meta-subject" type="text" placeholder="Subject"></div><div class="field full"><label for="meta-keywords">Keywords</label><input id="meta-keywords" type="text" placeholder="comma, separated, keywords"></div><div class="field"><label for="meta-creator">Creator</label><input id="meta-creator" type="text" placeholder="Original application"></div><div class="field"><label for="meta-producer">Producer</label><input id="meta-producer" type="text" placeholder="PDF producer"></div>`,
    info: ['No sign-up needed for this tool.', 'Metadata is read and written in your browser.', 'Use “Read current” to fill the fields from your PDF.'],
    faq: [
      ['Are my files uploaded to a server?', 'No. The PDF is opened and edited in your browser. File contents are not sent to the KriXo backend.'],
      ['Will this change the document pages?', 'No. Only the document information fields are changed; the visible pages stay the same.'],
      ['What happens if I leave a field blank?', 'That metadata field is cleared in the downloaded copy.']
    ]
  }
];

for (const page of pages) {
  const target = path.join(toolsDir, `${page.id}.html`);
  await writeFile(target, render({ ...page, faq: page.faq || privacyFaq }), { encoding: 'utf8', flag: 'wx' });
  console.log(`[new-tools] created tools/${page.id}.html`);
}
