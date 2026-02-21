import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { COLORS } from '../../../../constants/theme';
import { login, restoreSessionAccess } from '../../application/loginUseCase';
import { sendRecoveryLink } from '../../application/sendRecoveryLinkUseCase';

const PRIMARY_LOGO = require('../../../../../assets/logo.png');
const FALLBACK_LOGO = require('../../../../../assets/mainlogo.png');
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

export default function Login() {
  const router = useRouter();
  const { refresh } = useLocalSearchParams();
  const resetRedirectTo = useMemo(() => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/reset-password`;
  }

  return Linking.createURL('reset-password', { scheme: 'pffsa-connect' });
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
        const result = await restoreSessionAccess();
        if (!mounted) return;
        if (result.ok) {
          router.replace('/(tabs)/home');
          return;
        }
        if (result.code === 'VERSION_BLOCKED') {
          Alert.alert('Actualizacion requerida', result.message);
          return;
        }
        if (result.code === 'ACCOUNT_DISABLED' || result.code === 'ROLE_NOT_ALLOWED') {
          Alert.alert('Acceso restringido', 'Tu usuario no tiene acceso activo a esta aplicacion.');
        }
      } catch (_error) {
        // Silent: keep login form visible if restore flow fails.
      }
    };

    restoreSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = handleSubmit(async ({ email, password }) => {
    try {
      setLoading(true);
      const result = await login({ email, password });
      if (!result.ok) {
        if (result.code === 'COOLDOWN_ACTIVE') {
          Alert.alert(
            'Espera un momento',
            `Por seguridad, intenta de nuevo en ${Math.ceil((result.cooldownMs || 0) / 1000)} segundos.`
          );
          return;
        }
        if (result.code === 'VERSION_BLOCKED') {
          Alert.alert('Actualizacion requerida', result.message);
          return;
        }
        if (result.code === 'LOCKED') {
          Alert.alert(
            'Demasiados intentos',
            `Por seguridad, espera ${Math.ceil((result.cooldownMs || 0) / 1000)} segundos para volver a intentar.`
          );
          return;
        }
        if (result.code === 'INVALID_CREDENTIALS') {
          Alert.alert(
            'Credenciales invalidas',
            `Verifica tu correo y contrasena. Intentos restantes: ${result.remaining}.`
          );
          return;
        }
        if (result.code === 'CONNECTION_ERROR') {
          Alert.alert('Sin conexion', 'No se pudo validar el acceso por red. Intenta nuevamente.');
          return;
        }
        if (result.code === 'ACCOUNT_DISABLED') {
          Alert.alert('Usuario desactivado', 'Tu cuenta esta desactivada. Contacta al administrador.');
          return;
        }
        if (result.code === 'ROLE_NOT_ALLOWED') {
          Alert.alert('Acceso restringido', 'Tu rol actual no tiene acceso a esta app.');
          return;
        }
        if (result.code === 'NO_PROFILE') {
          Alert.alert('Perfil incompleto', 'No existe perfil para este usuario. Contacta a IT.');
          return;
        }
        Alert.alert('Error', 'No se pudo iniciar sesion. Intenta nuevamente.');
        return;
      }
      router.replace('/(tabs)/home');
    } catch (_error) {
      Alert.alert('Error', 'No se pudo iniciar sesion. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  });

  const handleForgotPassword = async () => {
    try {
      setSendingReset(true);
      const result = await sendRecoveryLink(getValues('email'), resetRedirectTo);
      if (!result.ok) {
        if (result.code === 'EMAIL_REQUIRED') {
          Alert.alert('Correo requerido', 'Ingresa tu correo para enviar el enlace de recuperacion.');
          return;
        }
        if (result.code === 'INVALID_DOMAIN') {
          Alert.alert('Dominio no permitido', 'Solo se permite recuperacion con correos @pffsa.com.');
          return;
        }
        if (result.code === 'CONNECTION_ERROR') {
          Alert.alert('Sin conexion', 'No se pudo enviar el enlace por problemas de red.');
          return;
        }
        Alert.alert('Error', result.message || 'No se pudo enviar el enlace de recuperacion.');
        return;
      }
      Alert.alert('Enlace enviado', 'Te enviamos un enlace para restablecer tu contrasena.');
    } catch (_error) {
      Alert.alert('Error', 'No se pudo enviar el enlace de recuperacion.');
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
