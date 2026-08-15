export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const ERRORS = {
  UNSUPPORTED_FILE: {
    code: 'UNSUPPORTED_FILE',
    message: "This file type isn't supported. Please upload PDF or PPTX.",
    status: 400,
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'That file is too large. Please upload a file under 4.5 MB.',
    status: 413,
  },
  SCANNED_PDF: {
    code: 'SCANNED_PDF',
    message:
      "We couldn't extract text from this PDF. It may be image-based. OCR will be added later.",
    status: 422,
  },
  NO_ANSWER: {
    code: 'NO_ANSWER',
    message:
      "I couldn't find enough information in your uploaded course material to answer that confidently.",
    status: 200,
  },
  LLM_LIMIT: {
    code: 'LLM_LIMIT',
    message: 'The free AI usage limit has been reached. Please try again later.',
    status: 429,
  },
  DATABASE: {
    code: 'DATABASE',
    message: "We couldn't access your course index. Please try again.",
    status: 503,
  },
  INVALID_COURSE: {
    code: 'INVALID_COURSE',
    message: 'A valid course is required.',
    status: 400,
  },
  EMPTY_DOCUMENT: {
    code: 'EMPTY_DOCUMENT',
    message: 'We could not find extractable text in that file.',
    status: 422,
  },
  CONFIG: {
    code: 'CONFIG',
    message: 'The server is missing required configuration.',
    status: 500,
  },
};

export function quotaError(cause) {
  const error = new AppError(
    ERRORS.LLM_LIMIT.code,
    'AI usage limit reached. Please try again later or configure another LLM provider.',
    429,
    { cause: cause instanceof Error ? cause.message : undefined }
  );
  return error;
}

export function isQuotaError(error) {
  if (!error) return false;
  if (error.code === 'LLM_LIMIT' || error.code === 429) return true;
  const text = `${error.message || ''} ${error.status || ''} ${JSON.stringify(error.details || {})}`.toLowerCase();
  return (
    error.status === 429 ||
    text.includes('resource_exhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests')
  );
}
