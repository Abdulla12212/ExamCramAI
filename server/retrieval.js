import { generateEmbedding } from './embeddings.js';
import { getSupabase, wrapDatabaseError } from './supabase.js';
import { AppError, ERRORS } from './errors.js';
import { isUuid } from './config.js';

function formatSource(chunk) {
  return {
    id: chunk.id,
    document: chunk.document_name,
    page: chunk.page_number ?? null,
    slide: chunk.slide_number ?? null,
    documentType: chunk.document_type,
    similarity: Number(chunk.similarity ?? 0),
    content: chunk.content,
    chunkIndex: chunk.chunk_index,
  };
}

export async function searchCourse(courseId, query, limit = 6) {
  if (!isUuid(courseId)) {
    throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
  }

  const embedding = await generateEmbedding(query, { taskType: 'RETRIEVAL_QUERY' });
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: embedding,
    match_count: limit,
    course_id: courseId,
  });

  if (error) throw wrapDatabaseError(error);

  return (data || []).map(formatSource);
}

export async function listDocuments(courseId) {
  if (!isUuid(courseId)) {
    throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, file_type, document_type, created_at')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });

  if (error) throw wrapDatabaseError(error);
  return data || [];
}

export async function getCourse(courseId) {
  if (!isUuid(courseId)) {
    throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('courses')
    .select('id, name, created_at')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw wrapDatabaseError(error);
  return data;
}

export async function createCourse(name = 'My Course') {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('courses')
    .insert({ name: String(name || 'My Course').slice(0, 120) })
    .select('id, name, created_at')
    .single();
  if (error) throw wrapDatabaseError(error);
  return data;
}

export async function sampleCourseChunks(courseId, documentType, limit = 24) {
  if (!isUuid(courseId)) {
    throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
  }

  const supabase = getSupabase();
  let query = supabase
    .from('document_chunks')
    .select('id, content, page_number, slide_number, chunk_index, document_id, documents!inner(filename, document_type)')
    .eq('course_id', courseId)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (documentType) {
    query = query.eq('documents.document_type', documentType);
  }

  const { data, error } = await query;
  if (error) throw wrapDatabaseError(error);

  return (data || []).map((row) => ({
    id: row.id,
    content: row.content,
    page_number: row.page_number,
    slide_number: row.slide_number,
    chunk_index: row.chunk_index,
    document_id: row.document_id,
    document_name: row.documents?.filename,
    document_type: row.documents?.document_type,
  }));
}

export function sourceLabel(source) {
  if (Number.isInteger(source.slide) || Number.isInteger(source.slide_number)) {
    return `${source.document || source.document_name} — Slide ${source.slide ?? source.slide_number}`;
  }
  if (Number.isInteger(source.page) || Number.isInteger(source.page_number)) {
    return `${source.document || source.document_name} — Page ${source.page ?? source.page_number}`;
  }
  return source.document || source.document_name || 'Source';
}

export function toClientSources(chunks) {
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const document = chunk.document || chunk.document_name;
    const slide = chunk.slide ?? chunk.slide_number ?? null;
    const page = chunk.page ?? chunk.page_number ?? null;
    const key = `${document}::${slide ?? ''}::${page ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = { document };
    if (slide != null) item.slide = slide;
    if (page != null) item.page = page;
    sources.push(item);
  }
  return sources;
}
