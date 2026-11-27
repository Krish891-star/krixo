/* Single source of truth for tool cards, workspace pages, docs and SEO.
   Pro tools remain in pro-catalog.js so heavy handlers stay lazy-loaded. */
import { proToolCatalog } from './pro-catalog.js';

export const coreToolCatalog = [
  { id: 'image-compressor', name: 'Compress Image to KB', desc: 'Reduce JPG, PNG, WebP, GIF or BMP to a target file size.', href: '/tools/image-compressor.html', type: 'image', icon: 'compress', tone: '' },
  { id: 'image-resizer', name: 'Resize Image', desc: 'Set exact width and height in pixels.', href: '/tools/image-resizer.html', type: 'image', icon: 'resize', tone: 'orange' },
  { id: 'photo-signature-resizer', name: 'Photo & Signature Resizer', desc: 'Prepare custom photo or signature dimensions and KB.', href: '/tools/photo-signature-resizer.html', type: 'image', icon: 'crop', tone: 'lav' },
  { id: 'image-converter', name: 'Convert Image', desc: 'Convert JPG, PNG, WebP, GIF or BMP into JPG, PNG or WebP.', href: '/tools/image-converter.html', type: 'image', icon: 'convert', tone: '' },
  { id: 'file-checker', name: 'File Requirements Checker', desc: 'Check file size and image dimensions.', href: '/tools/file-checker.html', type: 'image', icon: 'check', tone: 'orange' },
  { id: 'pdf-compressor', name: 'Compress PDF', desc: 'Try to fit a PDF under a size limit.', href: '/tools/pdf-compressor.html', type: 'pdf', icon: 'compress', tone: 'lav' },
  { id: 'merge-pdf', name: 'Merge PDF', desc: 'Combine several PDFs in the order you choose.', href: '/tools/merge-pdf.html', type: 'pdf', icon: 'merge', tone: '' },
  { id: 'split-pdf', name: 'Split PDF', desc: 'Extract selected pages into a new PDF.', href: '/tools/split-pdf.html', type: 'pdf', icon: 'split', tone: 'orange' },
  { id: 'rotate-pdf', name: 'Rotate PDF', desc: 'Rotate pages visually or by one angle.', href: '/tools/rotate-pdf.html', type: 'pdf', icon: 'rotate', tone: 'lav' },
  { id: 'jpg-to-pdf', name: 'JPG to PDF', desc: 'Turn JPG, PNG, WebP, GIF or BMP images into a PDF.', href: '/tools/jpg-to-pdf.html', type: 'pdf', icon: 'file', tone: '' },
  { id: 'pdf-to-jpg', name: 'PDF to JPG', desc: 'Export PDF pages as JPG, PNG or WebP images in a ZIP.', href: '/tools/pdf-to-jpg.html', type: 'pdf', icon: 'image', tone: 'orange' },
  { id: 'pdf-info', name: 'PDF Info', desc: 'Check page count, metadata, dimensions and encryption status.', href: '/tools/pdf-info.html', type: 'pdf', icon: 'check', tone: 'lav' }
];

export const allTools = [...coreToolCatalog, ...proToolCatalog];
export const toolById = new Map(allTools.map(tool => [tool.id, tool]));
