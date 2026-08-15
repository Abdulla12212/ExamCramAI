import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid, MAX_UPLOAD_BYTES, ALLOWED_DOCUMENT_TYPES } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { parseDocument } from '../../server/parsers.js';
import { chunkUnits } from '../../server/chunking.js';
import { generateEmbeddings } from '../../server/embeddings.js';
import { getSupabase, wrapDatabaseError } from '../../server/supabase.js';
import { getCourse, listDocuments } from '../../server/retrieval.js';

function decodeBase64(contentBase64) {
  const cleaned = String(contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length) {
    throw new AppError('INVALID_FILE', 'The uploaded file was empty or could not be read.', 400);
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(ERRORS.FILE_TOO_LARGE.code, ERRORS.FILE_TOO_LARGE.message, 413);
  }
  return buffer;
}

function safeFilename(name) {
  return String(name || 'upload')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod === 'GET') {
      const courseId = event.queryStringParameters?.courseId;
      if (!isUuid(courseId)) {
        throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
      }
      const course = await getCourse(courseId);
      if (!course) {
        throw new AppError(ERRORS.INVALID_COURSE.code, 'Course not found.', 404);
      }
      const documents = await listDocuments(courseId);
      return json(200, { success: true, course, documents });
    }

    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const courseId = body.courseId;
    if (!isUuid(courseId)) {
      throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
    }

    const course = await getCourse(courseId);
    if (!course) {
      throw new AppError(ERRORS.INVALID_COURSE.code, 'Course not found. Create a course first.', 404);
    }

    const filename = safeFilename(body.filename);
    const documentType = ALLOWED_DOCUMENT_TYPES.has(body.documentType)
      ? body.documentType
      : 'course_material';
    const buffer = decodeBase64(body.contentBase64);

    const parsed = await parseDocument(buffer, filename);
    const supabase = getSupabase();

    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        course_id: courseId,
        filename,
        file_type: parsed.fileType,
        document_type: documentType,
      })
      .select('id, filename, file_type, document_type, created_at')
      .single();

    if (documentError) throw wrapDatabaseError(documentError);

    const chunks = chunkUnits(parsed, {
      courseId,
      documentId: document.id,
      documentName: filename,
    });

    if (!chunks.length) {
      await supabase.from('documents').delete().eq('id', document.id);
      throw new AppError(ERRORS.EMPTY_DOCUMENT.code, ERRORS.EMPTY_DOCUMENT.message, 422);
    }

    const embeddings = await generateEmbeddings(
      chunks.map((chunk) => chunk.content),
      { taskType: 'RETRIEVAL_DOCUMENT' }
    );

    const rows = chunks.map((chunk, index) => ({
      course_id: chunk.course_id,
      document_id: chunk.document_id,
      content: chunk.content,
      page_number: chunk.page_number,
      slide_number: chunk.slide_number,
      chunk_index: chunk.chunk_index,
      embedding: embeddings[index],
    }));

    const { error: chunkError } = await supabase.from('document_chunks').insert(rows);
    if (chunkError) throw wrapDatabaseError(chunkError);

    return json(200, {
      success: true,
      filename,
      pages: parsed.pages || parsed.slides,
      chunks: chunks.length,
      document,
    });
  });
}
