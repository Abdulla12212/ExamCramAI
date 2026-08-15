import { extractText, getDocumentProxy } from 'unpdf';
import JSZip from 'jszip';
import { AppError, ERRORS } from './errors.js';

const MIN_PAGE_CHARS = 20;
const MIN_DOCUMENT_CHARS = 40;

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)) return buffer;
  return new Uint8Array(buffer);
}

function detectFileType(filename, buffer) {
  const name = String(filename || '').toLowerCase();
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ascii = bytes.subarray(0, 8).toString('ascii');

  if (ascii.startsWith('%PDF') || name.endsWith('.pdf')) return 'pdf';
  if (ascii.startsWith('PK') && name.endsWith('.pptx')) return 'pptx';
  if (ascii.startsWith('PK') && name.endsWith('.ppt')) {
    throw new AppError(
      ERRORS.UNSUPPORTED_FILE.code,
      'Legacy .ppt files are not supported. Please upload PPTX.',
      400
    );
  }
  if (name.endsWith('.pptx')) return 'pptx';
  throw new AppError(ERRORS.UNSUPPORTED_FILE.code, ERRORS.UNSUPPORTED_FILE.message, 400);
}

async function parsePdf(buffer, filename) {
  const data = toUint8Array(buffer);
  let pdf;
  try {
    pdf = await getDocumentProxy(data, {
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
  } catch (error) {
    throw new AppError(
      'PARSE_PDF',
      `We couldn't read that PDF (${error.message || 'parse error'}). Try exporting it again as a text-based PDF.`,
      422
    );
  }

  const extracted = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  const pages = pageTexts.map((text, index) => ({
    document_name: filename,
    page_number: index + 1,
    slide_number: null,
    text: normalizeWhitespace(text),
  }));

  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const textfulPages = pages.filter((page) => page.text.length >= MIN_PAGE_CHARS).length;

  if (pages.length > 0 && (totalChars < MIN_DOCUMENT_CHARS || textfulPages === 0)) {
    throw new AppError(
      ERRORS.SCANNED_PDF.code,
      "This PDF appears to be scanned/image-based. OCR is not supported in the MVP.\nWe couldn't extract text from this PDF. It may be image-based. OCR will be added later.",
      ERRORS.SCANNED_PDF.status
    );
  }

  return {
    fileType: 'pdf',
    pages: extracted.totalPages || pages.length,
    slides: 0,
    units: pages,
  };
}

function extractSlideText(xml) {
  const withBreaks = xml
    .replace(/<\/a:p>/g, '\n')
    .replace(/<a:br\b[^>]*\/>/g, '\n');
  const parts = [];
  const re = /<a:t\b[^>]*>([^<]*)<\/a:t>/g;
  let match = re.exec(withBreaks);
  while (match) {
    parts.push(decodeXmlEntities(match[1]));
    match = re.exec(withBreaks);
  }
  return normalizeWhitespace(parts.join(' '));
}

function slideNumberFromPath(path) {
  const match = path.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : 0;
}

async function parsePptx(buffer, filename) {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumberFromPath(a) - slideNumberFromPath(b));

  if (slidePaths.length === 0) {
    throw new AppError(
      ERRORS.EMPTY_DOCUMENT.code,
      'We could not find any slides in that PowerPoint file.',
      422
    );
  }

  const units = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('string');
    units.push({
      document_name: filename,
      page_number: null,
      slide_number: slideNumberFromPath(path),
      text: extractSlideText(xml),
    });
  }

  const totalChars = units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (totalChars < MIN_DOCUMENT_CHARS) {
    throw new AppError(
      ERRORS.EMPTY_DOCUMENT.code,
      'We could not find extractable text in that PowerPoint file. Images inside slides are not OCR’d in this MVP.',
      422
    );
  }

  return {
    fileType: 'pptx',
    pages: 0,
    slides: units.length,
    units: units.filter((unit) => unit.text.length > 0),
  };
}

export async function parseDocument(buffer, filename) {
  const fileType = detectFileType(filename, buffer);
  if (fileType === 'pdf') return parsePdf(buffer, filename);
  return parsePptx(buffer, filename);
}
