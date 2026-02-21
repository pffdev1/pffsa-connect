import { supabase } from '../../../shared/infrastructure/supabaseClient';
import { isConnectionLikeError } from './loginUseCase';

const AUTH_TIMEOUT_MS = 12000;

const timeoutError = () => {
  const error = new Error('AUTH_TIMEOUT');
  error.code = 'AUTH_TIMEOUT';
  return error;
};

const withTimeout = (promise, ms = AUTH_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(timeoutError()), ms);
    })
  ]);

export const sendRecoveryLink = async (email, redirectTo) => {
  const userEmail = String(email || '').trim().toLowerCase();
  if (!userEmail) {
    return { ok: false, code: 'EMAIL_REQUIRED' };
  }
  if (!userEmail.endsWith('@pffsa.com')) {
    return { ok: false, code: 'INVALID_DOMAIN' };
  }

  try {
    const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(userEmail, { redirectTo }));
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    if (isConnectionLikeError(error)) {
      return { ok: false, code: 'CONNECTION_ERROR' };
    }
    return { ok: false, code: 'RECOVERY_UNKNOWN_ERROR', message: error?.message || '' };
  }
};
