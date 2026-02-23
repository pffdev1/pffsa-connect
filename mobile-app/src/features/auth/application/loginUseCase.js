import { clearLocalSupabaseSession, isInvalidRefreshTokenError, supabase } from '../../../shared/infrastructure/supabaseClient';
import Constants from 'expo-constants';
import { assertProfileAccess } from '../domain/authPolicy';
import { logLoginEvent } from '../infrastructure/authAuditRepository';
import { AUTH_COOLDOWN_MS, clearAuthGuard, getCooldownRemainingMs, registerFailedAttempt } from '../infrastructure/authGuardStorage';
import { fetchProfileByUserId } from '../infrastructure/profileRepository';
import { getRuntimeConfig } from '../infrastructure/runtimeConfigRepository';

const AUTH_TIMEOUT_MS = 12000;
const LOCAL_APP_VERSION = String(Constants?.expoConfig?.version || '0.0.0');

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

const isMissingTableError = (error) => {
  const raw = `${error?.message || ''}`.toLowerCase();
  return String(error?.code || '').trim() === '42P01' || raw.includes('does not exist');
};

export const isConnectionLikeError = (error) => {
  const raw = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    String(error?.code || '').trim().toUpperCase() === 'AUTH_TIMEOUT' ||
    raw.includes('timeout') ||
    raw.includes('timed out') ||
    raw.includes('network request failed') ||
    raw.includes('failed to fetch') ||
    raw.includes('offline')
  );
};

const normalizeVersion = (value) =>
  String(value || '0.0.0')
    .trim()
    .split('.')
    .slice(0, 3)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });

const compareVersion = (left, right) => {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
};

const checkVersionGate = async () => {
  try {
    const { data, error } = await getRuntimeConfig();
    if (error) {
      if (isMissingTableError(error)) return { blocked: false };
      return { blocked: false };
    }
    if (!data) return { blocked: false };

    const minVersion = String(data?.min_version || '').trim();
    const forceUpdate = Boolean(data?.force_update);
    if (forceUpdate && minVersion && compareVersion(LOCAL_APP_VERSION, minVersion) < 0) {
      return {
        blocked: true,
        message: String(data?.message || `Debes actualizar la app a la version ${minVersion} para continuar.`)
      };
    }
    return { blocked: false };
  } catch (_error) {
    return { blocked: false };
  }
};

const validateUserProfileAccess = async (userId) => {
  const { data: profile, error } = await withTimeout(fetchProfileByUserId(userId));
  if (error) throw error;
  return assertProfileAccess(profile);
};

export const restoreSessionAccess = async () => {
  try {
    const {
      data: { session }
    } = await withTimeout(supabase.auth.getSession());

    if (!session?.user?.id) return { ok: false, code: 'NO_SESSION' };

    await validateUserProfileAccess(session.user.id);
    const versionGate = await checkVersionGate();
    if (versionGate.blocked) {
      return { ok: false, code: 'VERSION_BLOCKED', message: versionGate.message };
    }

    return { ok: true };
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearLocalSupabaseSession();
      return { ok: false, code: 'INVALID_REFRESH_TOKEN' };
    }
    const code = String(error?.code || '').trim();
    if (code === 'ACCOUNT_DISABLED' || code === 'ROLE_NOT_ALLOWED') {
      await clearLocalSupabaseSession();
      await supabase.auth.signOut();
      return { ok: false, code };
    }
    return { ok: false, code: code || 'SESSION_RESTORE_FAILED' };
  }
};

export const login = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const cooldownMs = await getCooldownRemainingMs();
  if (cooldownMs > 0) {
    return { ok: false, code: 'COOLDOWN_ACTIVE', cooldownMs };
  }

  try {
    const versionGate = await checkVersionGate();
    if (versionGate.blocked) {
      return { ok: false, code: 'VERSION_BLOCKED', message: versionGate.message };
    }

    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: normalizedEmail, password }));
    if (error) {
      const failed = await registerFailedAttempt();
      await logLoginEvent({
        type: 'login_failed',
        email: normalizedEmail,
        message: error?.message || 'Credenciales invalidas'
      });
      if (failed.locked) {
        return { ok: false, code: 'LOCKED', cooldownMs: AUTH_COOLDOWN_MS };
      }
      return { ok: false, code: 'INVALID_CREDENTIALS', remaining: failed.remaining };
    }

    const {
      data: { user }
    } = await withTimeout(supabase.auth.getUser());
    if (!user?.id) {
      return { ok: false, code: 'SESSION_VALIDATION_FAILED' };
    }

    await validateUserProfileAccess(user.id);
    await clearAuthGuard();
    await logLoginEvent({
      type: 'login_success',
      email: normalizedEmail,
      userId: user.id,
      message: 'Acceso concedido'
    });
    return { ok: true };
  } catch (error) {
    const code = String(error?.code || '').trim();
    if (isConnectionLikeError(error)) {
      return { ok: false, code: 'CONNECTION_ERROR' };
    }
    if (code === 'ACCOUNT_DISABLED' || code === 'ROLE_NOT_ALLOWED' || code === 'NO_PROFILE') {
      await supabase.auth.signOut();
      return { ok: false, code };
    }
    return { ok: false, code: 'LOGIN_UNKNOWN_ERROR' };
  }
};
