import { EMBEDDING_DIMENSIONS, envOr } from './config.js';
import { AppError, isQuotaError, quotaError } from './errors.js';

const GEMINI_EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function l2Normalize(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return values;
  return values.map((value) => value / norm);
}

function embeddingConfig() {
  return {
    provider: envOr('EMBEDDING_PROVIDER', 'gemini'),
    model: envOr('EMBEDDING_MODEL', 'gemini-embedding-001'),
    dimensions: EMBEDDING_DIMENSIONS,
    apiKey: process.env.EMBEDDING_API_KEY || process.env.GEMINI_API_KEY,
  };
}

function readValues(item, dimensions) {
  const values = item?.values || item?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new AppError('EMBEDDING', 'Embedding provider returned an empty vector.', 502);
  }
  const sliced = values.length > dimensions ? values.slice(0, dimensions) : values;
  if (sliced.length !== dimensions) {
    throw new AppError(
      'EMBEDDING',
      `Embedding dimension mismatch: expected ${dimensions}, received ${values.length}. Check EMBEDDING_DIMENSIONS matches supabase/schema.sql.`,
      500
    );
  }
  return l2Normalize(sliced);
}

function throwEmbeddingError(response, payload) {
  const message = payload?.error?.message || `Embedding request failed (${response.status})`;
  const error = new Error(message);
  error.status = response.status;
  error.details = payload;
  if (isQuotaError(error)) throw quotaError(error);
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new AppError(
      'EMBEDDING',
      'The embedding API rejected the request. Check GEMINI_API_KEY and EMBEDDING_MODEL.',
      502
    );
  }
  throw new AppError('EMBEDDING', message, 502);
}

async function geminiEmbedOne(text, taskType) {
  const { model, dimensions, apiKey } = embeddingConfig();
  const url = `${GEMINI_EMBED_URL}/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: dimensions,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throwEmbeddingError(response, payload);
  return readValues(payload.embedding || payload, dimensions);
}

async function geminiEmbedBatch(texts, taskType) {
  const { model, dimensions, apiKey } = embeddingConfig();
  if (!apiKey) {
    throw new AppError('CONFIG', 'Missing EMBEDDING_API_KEY or GEMINI_API_KEY.', 500);
  }

  const url = `${GEMINI_EMBED_URL}/${model}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: dimensions,
      })),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || '';
    const batchMissing =
      response.status === 404 || /batchEmbedContents.*(not found|not supported)/i.test(message);
    if (batchMissing && texts.length <= 4) {
      const results = [];
      for (const text of texts) {
        results.push(await geminiEmbedOne(text, taskType));
      }
      return results;
    }
    throwEmbeddingError(response, payload);
  }

  const embeddings = payload?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new AppError('EMBEDDING', 'Embedding provider returned an unexpected response.', 502);
  }

  return embeddings.map((item) => readValues(item, dimensions));
}

async function embedWithProvider(texts, taskType) {
  const { provider } = embeddingConfig();
  if (provider !== 'gemini') {
    throw new AppError(
      'CONFIG',
      `Embedding provider "${provider}" is not implemented. Set EMBEDDING_PROVIDER=gemini.`,
      500
    );
  }
  return geminiEmbedBatch(texts, taskType);
}

const BATCH_SIZE = 16;

export async function generateEmbeddings(texts, options = {}) {
  const taskType = options.taskType || 'RETRIEVAL_DOCUMENT';
  const clean = texts.map((text) => String(text || '').slice(0, 8000));
  const results = [];

  for (let i = 0; i < clean.length; i += BATCH_SIZE) {
    const slice = clean.slice(i, i + BATCH_SIZE);
    const batch = await embedWithProvider(slice, taskType);
    results.push(...batch);
  }

  return results;
}

export async function generateEmbedding(text, options = {}) {
  const [embedding] = await generateEmbeddings([text], {
    taskType: options.taskType || 'RETRIEVAL_QUERY',
  });
  return embedding;
}

export function embeddingProviderName() {
  return embeddingConfig().provider;
}
