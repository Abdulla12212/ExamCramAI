import { AppError, ERRORS, isQuotaError } from './errors.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

export function handleOptions() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

export function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}

function publicErrorMessage(error) {
  const message = String(error?.message || '').trim();
  if (!message) return 'Something went wrong. Please try again.';
  if (/api[_-]?key|service[_-]?role|bearer\s+[a-z0-9]|password=/i.test(message)) {
    return 'Something went wrong. Please try again.';
  }
  return message;
}

export function errorResponse(error) {
  if (isQuotaError(error)) {
    return json(429, {
      success: false,
      code: 'LLM_LIMIT',
      error: ERRORS.LLM_LIMIT.message,
    });
  }

  if (error instanceof AppError) {
    return json(error.status, {
      success: false,
      code: error.code,
      error: error.message,
    });
  }

  if (error?.code === 'CONFIG' || /missing required environment/i.test(error?.message || '')) {
    return json(500, {
      success: false,
      code: 'CONFIG',
      error: ERRORS.CONFIG.message,
    });
  }

  console.error(error);
  return json(500, {
    success: false,
    code: 'UNKNOWN',
    error: publicErrorMessage(error),
  });
}

export async function withHandler(event, fn) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  try {
    return await fn(event);
  } catch (error) {
    return errorResponse(error);
  }
}
