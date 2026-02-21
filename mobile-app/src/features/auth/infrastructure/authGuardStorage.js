import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_GUARD_KEY = 'auth:login-guard:v1';
const AUTH_WINDOW_MS = 5 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_COOLDOWN_MS = 30 * 1000;

export { AUTH_COOLDOWN_MS };

export const readAuthGuard = async () => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_GUARD_KEY);
    if (!raw) return { attempts: [], lockUntilMs: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts.filter((item) => Number.isFinite(item)) : [],
      lockUntilMs: Number.isFinite(parsed?.lockUntilMs) ? parsed.lockUntilMs : 0
    };
  } catch (_error) {
    return { attempts: [], lockUntilMs: 0 };
  }
};

export const writeAuthGuard = async (guard) => {
  await AsyncStorage.setItem(AUTH_GUARD_KEY, JSON.stringify(guard));
};

export const clearAuthGuard = async () => {
  await AsyncStorage.removeItem(AUTH_GUARD_KEY);
};

export const getCooldownRemainingMs = async () => {
  const guard = await readAuthGuard();
  const now = Date.now();
  return guard.lockUntilMs > now ? guard.lockUntilMs - now : 0;
};

export const registerFailedAttempt = async () => {
  const now = Date.now();
  const guard = await readAuthGuard();
  const validAttempts = guard.attempts.filter((ts) => now - ts <= AUTH_WINDOW_MS);
  validAttempts.push(now);
  if (validAttempts.length >= AUTH_MAX_ATTEMPTS) {
    const nextGuard = { attempts: [], lockUntilMs: now + AUTH_COOLDOWN_MS };
    await writeAuthGuard(nextGuard);
    return { locked: true, remaining: 0, lockUntilMs: nextGuard.lockUntilMs };
  }
  const nextGuard = { attempts: validAttempts, lockUntilMs: 0 };
  await writeAuthGuard(nextGuard);
  return { locked: false, remaining: Math.max(0, AUTH_MAX_ATTEMPTS - validAttempts.length), lockUntilMs: 0 };
};
