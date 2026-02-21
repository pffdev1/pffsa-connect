import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../../../shared/infrastructure/supabaseClient';
import { COLORS } from '../../../../constants/theme';

const resetSchema = z
  .object({
    newPassword: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres.'),
    confirmPassword: z.string().min(1, 'Debes confirmar la contrasena.')
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las contrasenas no coinciden.',
        path: ['confirmPassword']
      });
    }
  });

const parseAuthTokensFromUrl = (url = '') => {
  if (!url) return {};

  const hashIndex = url.indexOf('#');
  const queryString = hashIndex >= 0 ? url.slice(hashIndex + 1) : url.split('?')[1] || '';
  const params = new URLSearchParams(queryString);

  return {
    access_token: params.get('access_token') || '',
    refresh_token: params.get('refresh_token') || '',
    code: params.get('code') || '',
    type: params.get('type') || ''
  };
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [canReset, setCanReset] = useState(false);

  const paramUrl = useMemo(() => {
    if (typeof params?.url === 'string') return params.url;
    return '';
  }, [params]);
  const paramAuthPayload = useMemo(
    () => ({
      access_token: typeof params?.access_token === 'string' ? params.access_token : '',
      refresh_token: typeof params?.refresh_token === 'string' ? params.refresh_token : '',
      code: typeof params?.code === 'string' ? params.code : '',
      type: typeof params?.type === 'string' ? params.type : ''
    }),
    [params]
  );

  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

  useEffect(() => {
    let mounted = true;

    const trySetSessionFromPayload = async (payload = {}) => {
      const accessToken = String(payload?.access_token || '').trim();
      const refreshToken = String(payload?.refresh_token || '').trim();
      const code = String(payload?.code || '').trim();
      const type = String(payload?.type || '').trim().toLowerCase();
      if (type && type !== 'recovery') return false;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return !error;
      }

      if (!accessToken || !refreshToken) return false;
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      return !error;
    };

    const trySetSessionFromUrl = async (url) => {
      const payload = parseAuthTokensFromUrl(url);
      return trySetSessionFromPayload(payload);
    };

    const checkSession = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const fromInitial = await trySetSessionFromUrl(initialUrl || '');
        const fromParamUrl = await trySetSessionFromUrl(paramUrl);
        const fromRouteParams = await trySetSessionFromPayload(paramAuthPayload);

        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setCanReset(Boolean(session) || fromInitial || fromParamUrl || fromRouteParams);
      } catch (_error) {
        if (!mounted) return;
        setCanReset(false);
      } finally {
        if (mounted) setVerifying(false);
      }
    };

    checkSession();

    const subscription = Linking.addEventListener('url', async ({ url }) => {
      const ok = await trySetSessionFromUrl(url);
      if (ok) setCanReset(true);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [paramAuthPayload, paramUrl]);

  const handleResetPassword = handleSubmit(async ({ newPassword }) => {
    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (error) throw error;

      alert('Tu contrasena fue actualizada correctamente.');
      router.replace('/login?refresh=1');
    } catch (error) {
      alert(error.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setSaving(false);
    }
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Restablecer contrasena</Text>
          <Text style={styles.subtitle}>Ingresa una nueva contrasena para tu cuenta.</Text>

          {verifying ? (
            <Text style={styles.infoText}>Validando enlace de recuperacion...</Text>
          ) : !canReset ? (
            <>
              <Text style={styles.errorText}>El enlace es invalido o expiro. Solicita uno nuevo desde Login.</Text>
              <Button mode="contained" buttonColor={COLORS.primary} onPress={() => router.replace('/login')}>
                VOLVER A LOGIN
              </Button>
            </>
          ) : (
            <>
              <Controller
                control={control}
                name="newPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    mode="outlined"
                    label="Nueva contrasena"
                    placeholder="Minimo 6 caracteres"
                    secureTextEntry={!showPassword}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(errors.newPassword)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    style={styles.input}
                    right={
                      <TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword((prev) => !prev)} />
                    }
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
                    placeholder="Repite la contrasena"
                    secureTextEntry={!showConfirmPassword}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(errors.confirmPassword)}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    textColor={COLORS.text}
                    style={styles.input}
                    right={
                      <TextInput.Icon
                        icon={showConfirmPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowConfirmPassword((prev) => !prev)}
                      />
                    }
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(errors.confirmPassword)} style={styles.helperText}>
                {errors.confirmPassword?.message}
              </HelperText>

              <Button
                mode="contained"
                buttonColor={COLORS.primary}
                style={styles.submitButton}
                loading={saving}
                disabled={saving}
                onPress={handleResetPassword}
              >
                ACTUALIZAR CONTRASENA
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#E7ECF2',
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFF'
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { marginTop: 6, marginBottom: 14, color: COLORS.textLight, fontSize: 13 },
  infoText: { color: COLORS.textLight, marginBottom: 12 },
  errorText: { color: '#B00020', marginBottom: 12 },
  input: { backgroundColor: COLORS.white },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  submitButton: { marginTop: 10, borderRadius: 10 }
});
