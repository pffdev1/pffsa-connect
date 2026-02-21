import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { clearLocalSupabaseSession, supabase } from '../../../../shared/infrastructure/supabaseClient';
import { COLORS } from '../../../../constants/theme';

const PRIMARY_LOGO = require('../../../../../assets/logo.png');
const FALLBACK_LOGO = require('../../../../../assets/mainlogo.png');
const AUTH_GUARD_KEY = 'auth:login-guard:v1';
const AUTH_WINDOW_MS = 5 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const AUTH_COOLDOWN_MS = 30 * 1000;
const AUTH_TIMEOUT_MS = 12000;
const ALLOWED_ROLES = new Set(['admin', 'vendedor']);
const LOCAL_APP_VERSION = String(Constants?.expoConfig?.version || '0.0.0');

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'El correo es obligatorio.')
    .email('Ingresa un correo valido.')
    .refine((value) => value.toLowerCase().endsWith('@pffsa.com'), {
      message: 'Debes usar un correo @pffsa.com.'
    }),
  password: z.string().min(1, 'La contrasena es obligatoria.')
});

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

const isConnectionLikeError = (error) => {
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

const readAuthGuard = async () => {
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

const writeAuthGuard = async (guard) => {
  await AsyncStorage.setItem(AUTH_GUARD_KEY, JSON.stringify(guard));
};

const clearAuthGuard = async () => {
  await AsyncStorage.removeItem(AUTH_GUARD_KEY);
};

const getCooldownRemainingMs = async () => {
  const guard = await readAuthGuard();
  const now = Date.now();
  return guard.lockUntilMs > now ? guard.lockUntilMs - now : 0;
};

const registerFailedAttempt = async () => {
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

const isMissingTableError = (error) => {
  const raw = `${error?.message || ''}`.toLowerCase();
  return String(error?.code || '').trim() === '42P01' || raw.includes('does not exist');
};

const logLoginEvent = async ({ type, email, userId, message }) => {
  const payload = {
    event_type: String(type || 'unknown'),
    email: String(email || '').trim().toLowerCase(),
    user_id: userId || null,
    app_version: LOCAL_APP_VERSION,
    platform: Platform.OS,
    details: String(message || ''),
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('auth_login_events').insert(payload);
    if (error && !isMissingTableError(error)) {
      // Silent: audit should not block login flow.
    }
  } catch (_error) {
    // Silent: audit should not block login flow.
  }
};

const checkVersionGate = async () => {
  try {
    const { data, error } = await supabase
      .from('app_runtime_config')
      .select('*')
      .eq('enabled', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
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

const resolveProfileAccess = (profileRow) => {
  const role = String(profileRow?.role || '').trim().toLowerCase();
  const statusRaw = String(profileRow?.status ?? '').trim().toLowerCase();
  const activeRaw = profileRow?.active;
  const isActiveByBoolean = typeof activeRaw === 'boolean' ? activeRaw : null;
  const isActiveByStatus =
    statusRaw === ''
      ? null
      : statusRaw === 'active' || statusRaw === 'enabled' || statusRaw === '1' || statusRaw === 'true';
  const isActive = isActiveByBoolean ?? isActiveByStatus ?? true;
  return { role, isActive };
};

const validateUserProfileAccess = async (userId) => {
  const { data: profile, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
  );
  if (error) throw error;
  if (!profile) {
    const e = new Error('NO_PROFILE');
    e.code = 'NO_PROFILE';
    throw e;
  }

  const { role, isActive } = resolveProfileAccess(profile);
  if (!isActive) {
    const e = new Error('ACCOUNT_DISABLED');
    e.code = 'ACCOUNT_DISABLED';
    throw e;
  }
  if (!ALLOWED_ROLES.has(role)) {
    const e = new Error('ROLE_NOT_ALLOWED');
    e.code = 'ROLE_NOT_ALLOWED';
    throw e;
  }
  return { role, profile };
};

export default function Login() {
  const router = useRouter();
  const { refresh } = useLocalSearchParams();
  const resetRedirectTo = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/reset-password`;
    }
    return Linking.createURL('reset-password');
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [useFallbackLogo, setUseFallbackLogo] = useState(false);
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  useEffect(() => {
    setUseFallbackLogo(false);
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const {
          data: { session }
        } = await withTimeout(supabase.auth.getSession());
        if (!mounted || !session?.user?.id) return;

        await validateUserProfileAccess(session.user.id);
        const versionGate = await checkVersionGate();
        if (versionGate.blocked) {
          Alert.alert('Actualizacion requerida', versionGate.message);
          return;
        }
        router.replace('/(tabs)/home');
      } catch (error) {
        if (!mounted) return;
        if (String(error?.code || '') === 'ACCOUNT_DISABLED' || String(error?.code || '') === 'ROLE_NOT_ALLOWED') {
          await clearLocalSupabaseSession();
          await supabase.auth.signOut();
          Alert.alert('Acceso restringido', 'Tu usuario no tiene acceso activo a esta aplicacion.');
        }
      }
    };

    restoreSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = handleSubmit(async ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const cooldownMs = await getCooldownRemainingMs();
    if (cooldownMs > 0) {
      Alert.alert(
        'Espera un momento',
        `Por seguridad, intenta de nuevo en ${Math.ceil(cooldownMs / 1000)} segundos.`
      );
      return;
    }

    try {
      setLoading(true);
      const versionGate = await checkVersionGate();
      if (versionGate.blocked) {
        Alert.alert('Actualizacion requerida', versionGate.message);
        return;
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      );
      if (error) {
        const failed = await registerFailedAttempt();
        await logLoginEvent({
          type: 'login_failed',
          email: normalizedEmail,
          message: error?.message || 'Credenciales invalidas'
        });
        if (failed.locked) {
          Alert.alert(
            'Demasiados intentos',
            `Por seguridad, espera ${Math.ceil(AUTH_COOLDOWN_MS / 1000)} segundos para volver a intentar.`
          );
        } else {
          Alert.alert(
            'Credenciales invalidas',
            `Verifica tu correo y contrasena. Intentos restantes: ${failed.remaining}.`
          );
        }
        return;
      }

      const {
        data: { user }
      } = await withTimeout(supabase.auth.getUser());
      if (!user?.id) {
        throw new Error('No fue posible validar tu sesion.');
      }

      await validateUserProfileAccess(user.id);
      await clearAuthGuard();
      await logLoginEvent({
        type: 'login_success',
        email: normalizedEmail,
        userId: user.id,
        message: 'Acceso concedido'
      });
      router.replace('/(tabs)/home');
    } catch (error) {
      if (isConnectionLikeError(error)) {
        Alert.alert('Sin conexion', 'No se pudo validar el acceso por red. Intenta nuevamente.');
      } else if (String(error?.code || '') === 'ACCOUNT_DISABLED') {
        await supabase.auth.signOut();
        Alert.alert('Usuario desactivado', 'Tu cuenta esta desactivada. Contacta al administrador.');
      } else if (String(error?.code || '') === 'ROLE_NOT_ALLOWED') {
        await supabase.auth.signOut();
        Alert.alert('Acceso restringido', 'Tu rol actual no tiene acceso a esta app.');
      } else if (String(error?.code || '') === 'NO_PROFILE') {
        await supabase.auth.signOut();
        Alert.alert('Perfil incompleto', 'No existe perfil para este usuario. Contacta a IT.');
      } else {
        Alert.alert('Error', 'No se pudo iniciar sesion. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  });

  const handleForgotPassword = async () => {
    const userEmail = getValues('email').trim().toLowerCase();
    if (!userEmail) {
      Alert.alert('Correo requerido', 'Ingresa tu correo para enviar el enlace de recuperacion.');
      return;
    }
    if (!userEmail.endsWith('@pffsa.com')) {
      Alert.alert('Dominio no permitido', 'Solo se permite recuperacion con correos @pffsa.com.');
      return;
    }

    try {
      setSendingReset(true);
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: resetRedirectTo })
      );
      if (error) throw error;
      Alert.alert(
        'Enlace enviado',
        'Te enviamos un enlace para restablecer tu contrasena.'
      );
    } catch (error) {
      if (isConnectionLikeError(error)) {
        Alert.alert('Sin conexion', 'No se pudo enviar el enlace por problemas de red.');
      } else {
        Alert.alert('Error', error?.message || 'No se pudo enviar el enlace de recuperacion.');
      }
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <LinearGradient colors={['#EAF3FF', '#F6FAFF', '#FFFFFF']} style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView key={String(refresh || 'default')} contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroEyebrow}>Acceso seguro</Text>
                <View style={styles.heroIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
                </View>
              </View>
              <Image
                source={useFallbackLogo ? FALLBACK_LOGO : PRIMARY_LOGO}
                style={styles.logo}
                resizeMode="contain"
                onError={() => setUseFallbackLogo(true)}
              />
              <Text style={styles.appName}>Pedersen Connect</Text>
              <Text style={styles.heroSub}>Ingresa con tu cuenta corporativa para continuar.</Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.label}>Correo Institucional</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    placeholder="usuario@pffsa.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    returnKeyType="next"
                    error={Boolean(errors.email)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    placeholderTextColor={COLORS.textLight}
                    style={styles.paperInput}
                    contentStyle={styles.inputContent}
                    theme={{ colors: { surface: COLORS.white, background: COLORS.white } }}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(errors.email)} style={styles.helperText}>
                {errors.email?.message}
              </HelperText>

              <Text style={[styles.label, styles.passwordLabel]}>Contrasena</Text>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    placeholder="********"
                    secureTextEntry={!showPassword}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(errors.password)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    placeholderTextColor={COLORS.textLight}
                    style={styles.paperInput}
                    contentStyle={styles.inputContent}
                    theme={{ colors: { surface: COLORS.white, background: COLORS.white } }}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword((prev) => !prev)}
                      />
                    }
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(errors.password)} style={styles.helperText}>
                {errors.password?.message}
              </HelperText>

              <Button
                mode="contained"
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                buttonColor={COLORS.primary}
                style={styles.loginButton}
                contentStyle={styles.loginButtonContent}
                labelStyle={styles.loginButtonLabel}
              >
                {loading ? 'ACCEDIENDO...' : 'ENTRAR'}
              </Button>

              <Button
                mode="outlined"
                onPress={handleForgotPassword}
                disabled={sendingReset}
                style={styles.forgotButton}
                contentStyle={styles.forgotButtonContent}
                labelStyle={styles.forgotText}
                textColor={COLORS.primary}
              >
                {sendingReset ? 'ENVIANDO ENLACE...' : 'Has olvidado tu contrasena?'}
              </Button>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerMain}>Desarrollado por el Dpto. de IT e Innovacion</Text>
              <Text style={styles.footerSub}>Pedersen Fine Foods (c) 2026 | Version {LOCAL_APP_VERSION}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#EAF3FF' },
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  heroCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAF4'
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  heroIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logo: { width: 170, height: 68, marginTop: 10, alignSelf: 'center' },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 6,
    letterSpacing: 0.6,
    textAlign: 'center'
  },
  heroSub: { marginTop: 6, color: COLORS.textLight, fontSize: 13, textAlign: 'center' },
  formCard: {
    width: '100%',
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAF4',
    padding: 14
  },
  label: { color: COLORS.text, fontWeight: '600', marginBottom: 5, fontSize: 14 },
  passwordLabel: { marginTop: 10 },
  paperInput: { backgroundColor: COLORS.white },
  inputContent: { fontSize: 16, color: COLORS.text },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  loginButton: {
    marginTop: 18,
    borderRadius: 10
  },
  loginButtonContent: { height: 48 },
  loginButtonLabel: { color: '#FFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.3 },
  forgotButton: {
    marginTop: 14,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 999
  },
  forgotButtonContent: { paddingHorizontal: 6 },
  forgotText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  footer: { marginTop: 22, alignItems: 'center' },
  footerMain: { color: COLORS.textLight, fontSize: 12, fontWeight: 'bold' },
  footerSub: { color: COLORS.textLight, fontSize: 10, marginTop: 4 }
});
