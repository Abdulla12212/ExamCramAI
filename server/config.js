const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    const error = new Error(`Missing required environment variable: ${name}`);
    error.code = 'CONFIG';
    throw error;
  }
  return String(value).trim();
}

export function envOr(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export const EMBEDDING_DIMENSIONS = Number(envOr('EMBEDDING_DIMENSIONS', '768'));
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = new Set(['pdf', 'pptx']);
export const ALLOWED_DOCUMENT_TYPES = new Set(['course_material', 'past_exam']);
