import { envOr } from './config.js';
import { AppError, isQuotaError, quotaError } from './errors.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function llmConfig() {
  return {
    provider: envOr('LLM_PROVIDER', 'gemini'),
    model: envOr('GEMINI_MODEL', envOr('LLM_MODEL', 'gemini-3.5-flash')),
    apiKey: process.env.GEMINI_API_KEY,
  };
}

function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;

  const typeMap = {
    object: 'OBJECT',
    array: 'ARRAY',
    string: 'STRING',
    number: 'NUMBER',
    integer: 'INTEGER',
    boolean: 'BOOLEAN',
  };

  const convert = (node) => {
    if (!node || typeof node !== 'object') return { type: 'STRING' };
    const type = typeMap[String(node.type || 'string').toLowerCase()] || 'STRING';
    const out = { type };
    if (node.description) out.description = node.description;
    if (type === 'ARRAY') out.items = convert(node.items || { type: 'string' });
    if (type === 'OBJECT') {
      out.properties = {};
      for (const [key, value] of Object.entries(node.properties || {})) {
        out.properties[key] = convert(value);
      }
      if (Array.isArray(node.required)) out.required = node.required;
    }
    return out;
  };

  return convert(schema);
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part?.text || '')
    .join('')
    .trim();
}

function looksBlocked(payload) {
  const candidate = payload?.candidates?.[0];
  const reason = candidate?.finishReason || payload?.promptFeedback?.blockReason;
  return ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(reason);
}

async function geminiGenerate({ prompt, schema, temperature = 0.2 }, flags = {}) {
  const { model, apiKey } = llmConfig();
  if (!apiKey) {
    throw new AppError('CONFIG', 'Missing GEMINI_API_KEY.', 500);
  }

  const generationConfig = {
    temperature,
    maxOutputTokens: 4096,
  };

  if (!flags.disableThinkingConfig) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    if (!flags.disableResponseSchema) {
      const geminiSchema = toGeminiSchema(schema);
      if (geminiSchema) generationConfig.responseSchema = geminiSchema;
    }
  }

  const url = `${GEMINI_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `LLM request failed (${response.status})`;
    if (!flags.disableThinkingConfig && /thinking/i.test(message)) {
      return geminiGenerate({ prompt, schema, temperature }, { ...flags, disableThinkingConfig: true });
    }
    if (schema && !flags.disableResponseSchema && /schema|responseMimeType|response_schema/i.test(message)) {
      return geminiGenerate({ prompt, schema, temperature }, { ...flags, disableResponseSchema: true });
    }
    const error = new Error(message);
    error.status = response.status;
    error.details = payload;
    if (isQuotaError(error)) throw quotaError(error);
    throw error;
  }

  if (looksBlocked(payload)) {
    throw new AppError(
      'NO_ANSWER',
      "I couldn't find enough information in your course material to answer that confidently.",
      200
    );
  }

  const text = extractText(payload);
  if (!text) {
    throw new AppError(
      'NO_ANSWER',
      "I couldn't find enough information in your course material to answer that confidently.",
      200
    );
  }

  return text;
}

async function generateWithProvider(options) {
  const { provider } = llmConfig();

  switch (provider) {
    case 'gemini':
      return geminiGenerate(options);
    case 'cloudflare':
    case 'local':
    case 'openai':
    case 'anthropic':
      throw new AppError(
        'CONFIG',
        `LLM provider "${provider}" is not implemented in this MVP. Set LLM_PROVIDER=gemini.`,
        500
      );
    default:
      throw new AppError(
        'CONFIG',
        `Unknown LLM provider "${provider}". Supported stub names: gemini, cloudflare, local, openai, anthropic.`,
        500
      );
  }
}

export async function generateText(prompt) {
  return generateWithProvider({ prompt, temperature: 0.2 });
}

export async function generateStructured(prompt, schema) {
  const raw = await generateWithProvider({ prompt, schema, temperature: 0.1 });
  if (typeof raw === 'object') return raw;
  const cleaned = String(raw)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError('LLM_PARSE', 'The model returned invalid structured output. Please try again.', 502);
  }
}

export function llmProviderName() {
  return llmConfig().provider;
}

export function llmModelName() {
  return llmConfig().model;
}
