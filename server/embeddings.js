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
  if (!Array.isArray(values) || values.length !== dimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${dimensions}, received ${values?.length || 0}.`
    );
  }
  return l2Normalize(values);
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
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Embedding request failed (${response.status})`);
    error.status = response.status;
    error.details = payload;
    if (isQuotaError(error)) throw quotaError(error);
    throw error;
  }
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
    if (/batchEmbedContents|not found|invalid/i.test(message) || response.status === 404) {
      const results = [];
      for (const text of texts) {
        results.push(await geminiEmbedOne(text, taskType));
      }
      return results;
    }
    const error = new Error(message || `Embedding request failed (${response.status})`);
    error.status = response.status;
    error.details = payload;
    if (isQuotaError(error)) throw quotaError(error);
    throw error;
  }

  const embeddings = payload?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error('Embedding provider returned an unexpected response.');
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
