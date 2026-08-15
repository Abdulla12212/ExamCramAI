import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { AppError, ERRORS } from './errors.js';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
).href;
const CMAP_URL = `${pathToFileURL(join(pdfjsRoot, 'cmaps')).href}/`;

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
  const bytes = buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)
    ? buffer
    : new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalizeWhitespace(
      content.items
        .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
    );
    pages.push({
      document_name: filename,
      page_number: pageNumber,
      slide_number: null,
      text,
    });
  }

  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const textfulPages = pages.filter((page) => page.text.length >= MIN_PAGE_CHARS).length;

  if (pdf.numPages > 0 && (totalChars < MIN_DOCUMENT_CHARS || textfulPages === 0)) {
    throw new AppError(
      ERRORS.SCANNED_PDF.code,
      "This PDF appears to be scanned/image-based. OCR is not supported in the MVP.\nWe couldn't extract text from this PDF. It may be image-based. OCR will be added later.",
      ERRORS.SCANNED_PDF.status
    );
  }

  return {
    fileType: 'pdf',
    pages: pdf.numPages,
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
