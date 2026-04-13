import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../../../constants/theme';
import { clearLocalSupabaseSession, supabase } from '../../../../shared/infrastructure/supabaseClient';

const resetSchema = z
  .object({
    newPassword: z.string().trim().min(6, 'La contrasena debe tener al menos 6 caracteres.'),
    confirmPassword: z.string().trim().min(1, 'Debes confirmar la contrasena.')
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contrasenas no coinciden.'
  });

const parseUrlParams = (url) => {
  const params = {};
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return params;

  const queryIndex = safeUrl.indexOf('?');
  const hashIndex = safeUrl.indexOf('#');

  const queryRaw =
    queryIndex >= 0
      ? safeUrl.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : '';
  const hashRaw = hashIndex >= 0 ? safeUrl.slice(hashIndex + 1) : '';

  const queryParams = new URLSearchParams(queryRaw);
  for (const [key, value] of queryParams.entries()) {
    params[key] = value;
  }

  const hashPayload = hashRaw.includes('?') ? hashRaw.slice(hashRaw.indexOf('?') + 1) : hashRaw;
  const hashParams = new URLSearchParams(hashPayload);
  for (const [key, value] of hashParams.entries()) {
    params[key] = value;
  }

  return params;
};

const flattenLocalParams = (localParams) => {
  const normalized = {};
  Object.entries(localParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized[key] = String(value[0] || '').trim();
      return;
    }
    normalized[key] = String(value || '').trim();
  });
  return normalized;
};

async function establishRecoverySession(params = {}) {
  const {
    data: { session: existingSession }
  } = await supabase.auth.getSession();
  if (existingSession?.user) return true;

  const code = String(params?.code || '').trim();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  }

  const accessToken = String(params?.access_token || '').trim();
  const refreshToken = String(params?.refresh_token || '').trim();
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
  }

  const tokenHash = String(params?.token_hash || '').trim();
  if (tokenHash) {
    const rawType = String(params?.type || 'recovery').trim().toLowerCase();
    const type = rawType === 'recovery' ? 'recovery' : 'recovery';
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) throw error;
  }

  const {
    data: { session: nextSession }
  } = await supabase.auth.getSession();

  return Boolean(nextSession?.user);
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const localParams = useLocalSearchParams();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

  const mergedLocalParams = useMemo(() => flattenLocalParams(localParams), [localParams]);

  const resolveRecoverySession = useCallback(async (extraParams = {}) => {
    try {
      setSessionError('');
      const initialUrl = await Linking.getInitialURL();
      const initialUrlParams = parseUrlParams(initialUrl);
      const mergedParams = {
        ...mergedLocalParams,
        ...initialUrlParams,
        ...extraParams
      };

      const ok = await establishRecoverySession(mergedParams);
      if (!ok) {
        setSessionReady(false);
        setSessionError('El enlace de recuperacion no es valido o ya expiro. Solicita uno nuevo desde Login.');
        return;
      }

      setSessionReady(true);
    } catch (error) {
      setSessionReady(false);
      setSessionError(error?.message || 'No pudimos validar el enlace de recuperacion.');
    } finally {
      setBootstrapping(false);
    }
  }, [mergedLocalParams]);

  useEffect(() => {
    resolveRecoverySession();
  }, [resolveRecoverySession]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const eventParams = parseUrlParams(url);
      resolveRecoverySession(eventParams);
    });

    return () => {
      subscription.remove();
    };
  }, [resolveRecoverySession]);

  const handleGoLogin = useCallback(() => {
    router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
  }, [router]);

  const handleSubmitPassword = handleSubmit(async ({ newPassword }) => {
    if (!sessionReady) {
      Alert.alert('Sesion no valida', 'Solicita un nuevo enlace de recuperacion desde Login.');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (error) throw error;

      Alert.alert(
        'Contrasena actualizada',
        'Tu contrasena fue actualizada exitosamente. Inicia sesion nuevamente.'
      );
      await clearLocalSupabaseSession();
      handleGoLogin();
    } catch (error) {
      Alert.alert('No se pudo actualizar', error?.message || 'No pudimos actualizar tu contrasena.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <LinearGradient colors={['#EAF3FF', '#F6FAFF', '#FFFFFF']} style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={styles.title}>Restablecer contrasena</Text>
              <Text style={styles.subtitle}>
                Crea tu nueva contrasena para acceder nuevamente a Pedersen Connect.
              </Text>

              {bootstrapping ? (
                <Text style={styles.statusText}>Validando enlace de recuperacion...</Text>
              ) : sessionError ? (
                <Text style={styles.errorText}>{sessionError}</Text>
              ) : (
                <Text style={styles.statusText}>Enlace validado. Ya puedes crear tu nueva contrasena.</Text>
              )}

              <Controller
                control={control}
                name="newPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Nueva contrasena"
                    secureTextEntry={!showNewPassword}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(errors.newPassword)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    style={styles.paperInput}
                    right={<TextInput.Icon icon={showNewPassword ? 'eye-off' : 'eye'} onPress={() => setShowNewPassword((prev) => !prev)} />}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(errors.newPassword)} style={styles.helperText}>
                {errors.newPassword?.message}
              </HelperText>

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Confirmar contrasena"
                    secureTextEntry={!showConfirmPassword}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(errors.confirmPassword)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    style={styles.paperInput}
                    right={<TextInput.Icon icon={showConfirmPassword ? 'eye-off' : 'eye'} onPress={() => setShowConfirmPassword((prev) => !prev)} />}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(errors.confirmPassword)} style={styles.helperText}>
                {errors.confirmPassword?.message}
              </HelperText>

              <Button
                mode="contained"
                onPress={handleSubmitPassword}
                loading={saving}
                disabled={saving || bootstrapping || !sessionReady}
                buttonColor={COLORS.primary}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
              >
                {saving ? 'GUARDANDO...' : 'GUARDAR NUEVA CONTRASENA'}
              </Button>
              <Button mode="text" onPress={handleGoLogin} disabled={saving} textColor={COLORS.primary}>
                VOLVER A LOGIN
              </Button>
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
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAF4',
    padding: 16
  },
  title: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.textLight,
    fontSize: 13
  },
  statusText: {
    marginTop: 10,
    marginBottom: 8,
    color: COLORS.text,
    fontSize: 12
  },
  errorText: {
    marginTop: 10,
    marginBottom: 8,
    color: '#C0392B',
    fontSize: 12
  },
  paperInput: { backgroundColor: COLORS.white, marginTop: 8 },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  submitButton: { marginTop: 16, borderRadius: 10 },
  submitButtonContent: { height: 46 }
});
