/* Content-level file checks shared by every tool.
   A filename extension is only a hint: we also inspect the bytes so renamed or
   corrupt files fail early with a clear, honest message. No data leaves the device. */

const SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],                 // %PDF-
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  zip: [0x50, 0x4b, 0x03, 0x04],
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  ole: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
};

const ACCEPTED_KINDS = {
  pdf: ['pdf'],
  png: ['png'],
  jpg: ['jpg'],
  jpeg: ['jpg'],
  webp: ['webp'],
  gif: ['gif'],
  bmp: ['bmp'],
  docx: ['docx'],
  xlsx: ['xlsx', 'xls'],
  xls: ['xls', 'xlsx'],
  csv: ['text'],
  txt: ['text'],
  md: ['text'],
  html: ['html', 'text'],
  htm: ['html', 'text'],
  pptx: ['pptx']
};

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(head, start = 0, length = head.length) {
  let text = '';
  const end = Math.min(head.length, start + length);
  for (let index = start; index < end; index++) text += String.fromCharCode(head[index]);
  return text;
}

function hasSignatureNearStart(bytes, signature, limit = 1024) {
  const head = bytes.subarray(0, Math.min(bytes.length, limit));
  for (let index = 0; index <= head.length - signature.length; index++) {
    let match = true;
    for (let offset = 0; offset < signature.length; offset++) {
      if (head[index + offset] !== signature[offset]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

export function extensionOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

/* Returns a conservative content type, or null when the bytes are not recognisable binary data. */
export function detectFileKind(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.length) return null;
  if (hasSignatureNearStart(data, SIGNATURES.pdf)) return 'pdf';
  if (startsWith(data, SIGNATURES.png)) return 'png';
  if (startsWith(data, SIGNATURES.jpg)) return 'jpg';
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return 'webp';
  if (/^GIF8[79]a/.test(ascii(data, 0, 6))) return 'gif';
  if (ascii(data, 0, 2) === 'BM') return 'bmp';
  if (startsWith(data, SIGNATURES.zip) || startsWith(data, SIGNATURES.zipEmpty)) {
    // ZIP entry names appear in the central directory near the end; also check the start.
    const text = ascii(data, 0, Math.min(data.length, 256 * 1024)) +
      ascii(data, Math.max(0, data.length - 1024 * 1024), Math.min(data.length, 1024 * 1024));
    if (text.includes('word/document.xml')) return 'docx';
    if (text.includes('xl/workbook.xml')) return 'xlsx';
    if (text.includes('ppt/presentation.xml')) return 'pptx';
    return 'zip';
  }
  if (startsWith(data, SIGNATURES.ole)) return 'xls';
  const head = ascii(data, 0, Math.min(data.length, 8192));
  if (head.includes('\u0000')) return null;
  if (/^\s*<(!doctype\s+)?html/i.test(head) || /^\s*<\?xml/i.test(head)) return 'html';
  return 'text';
}

/* Validate that the bytes match the claimed extension. Called by every handler via bytesOf(). */
export function assertRealFile(file, bytes) {
  const ext = extensionOf(file?.name);
  const accepted = ACCEPTED_KINDS[ext];
  if (!accepted) return; // Unknown extensions are rejected by assertExtension in each tool.
  const detected = detectFileKind(bytes);
  const label = `.${ext}`;
  if (detected === null) {
    throw new Error(`"${file.name}" does not appear to be a valid ${label} file. It may be empty or corrupted.`);
  }
  if (!accepted.includes(detected)) {
    const names = { pdf: 'PDF', png: 'PNG', jpg: 'JPEG', webp: 'WebP', gif: 'GIF', bmp: 'BMP', docx: 'Word .docx', xlsx: 'Excel .xlsx', xls: 'Excel .xls', pptx: 'PowerPoint .pptx', html: 'HTML', text: 'plain text', zip: 'ZIP archive' };
    throw new Error(`"${file.name}" is named ${label} but its contents look like a ${names[detected] || detected} file. Choose a genuine ${label} file.`);
  }
}
