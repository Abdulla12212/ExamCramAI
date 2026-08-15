const TARGET_CHARS = 2800;
const MIN_CHARS = 2000;
const MAX_CHARS = 4000;
const OVERLAP_CHARS = 500;

function normalize(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  const pieces = String(text || '').split(/(?<=[.!?])\s+/);
  return pieces.map((part) => part.trim()).filter(Boolean);
}

function overlapTail(text, size = OVERLAP_CHARS) {
  if (!text || text.length <= size) return text || '';
  const slice = text.slice(-size);
  const boundary = slice.search(/[.!?]\s/);
  if (boundary >= 0 && boundary < size * 0.8) {
    return slice.slice(boundary + 2).trim();
  }
  const space = slice.indexOf(' ');
  return (space >= 0 ? slice.slice(space + 1) : slice).trim();
}

function packUnits(units, preferKeepWhole) {
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const content = buffer.trim();
    if (content) chunks.push(content);
    buffer = overlapTail(content);
  };

  for (const unit of units) {
    if (!unit) continue;
    if (preferKeepWhole && unit.length <= MAX_CHARS) {
      if (buffer && buffer.length + unit.length + 1 > MAX_CHARS) flush();
      buffer = buffer ? `${buffer} ${unit}` : unit;
      if (buffer.length >= MIN_CHARS) flush();
      continue;
    }

    if (unit.length <= MAX_CHARS) {
      if (buffer && buffer.length + unit.length + 1 > TARGET_CHARS) flush();
      buffer = buffer ? `${buffer} ${unit}` : unit;
      if (buffer.length >= TARGET_CHARS) flush();
      continue;
    }

    const sentences = splitSentences(unit);
    for (const sentence of sentences) {
      if (sentence.length > MAX_CHARS) {
        if (buffer) flush();
        for (let i = 0; i < sentence.length; i += TARGET_CHARS - OVERLAP_CHARS) {
          chunks.push(sentence.slice(i, i + TARGET_CHARS).trim());
        }
        buffer = '';
        continue;
      }
      if (buffer && buffer.length + sentence.length + 1 > TARGET_CHARS) flush();
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.filter((chunk) => chunk.length > 0);
}

export function chunkUnits(parsed, meta) {
  const { courseId, documentId, documentName } = meta;
  const results = [];
  let chunkIndex = 0;

  for (const unit of parsed.units || []) {
    const text = normalize(unit.text);
    if (!text) continue;

    const preferKeepWhole = Number.isInteger(unit.slide_number);
    const pieces = preferKeepWhole && text.length <= MAX_CHARS
      ? [text]
      : packUnits(splitParagraphs(text).length ? splitParagraphs(text) : [text], preferKeepWhole);

    for (const content of pieces) {
      results.push({
        course_id: courseId,
        document_id: documentId,
        document_name: documentName,
        page_number: unit.page_number ?? null,
        slide_number: unit.slide_number ?? null,
        chunk_index: chunkIndex,
        content,
      });
      chunkIndex += 1;
    }
  }

  return results;
}
