import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './config.js';
import { AppError, ERRORS } from './errors.js';

let client;

export function getSupabase() {
  if (!client) {
    client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function wrapDatabaseError(error) {
  if (!error) return new AppError(ERRORS.DATABASE.code, ERRORS.DATABASE.message, ERRORS.DATABASE.status);
  const message = error.message || ERRORS.DATABASE.message;
  return new AppError(ERRORS.DATABASE.code, ERRORS.DATABASE.message, ERRORS.DATABASE.status, {
    original: message,
  });
}
