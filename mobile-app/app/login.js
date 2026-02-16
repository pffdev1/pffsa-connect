import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, HelperText, TextInput } from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../src/services/supabaseClient';
import { COLORS } from '../src/constants/theme';

const PRIMARY_LOGO = require('../assets/logo.png');
const FALLBACK_LOGO = require('../assets/mainlogo.png');

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

  const handleLogin = handleSubmit(async ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error) {
      alert('Error: Credenciales invalidas');
      setLoading(false);
    } else {
      router.replace('/(tabs)/clientes');
    }
  });

  const handleForgotPassword = async () => {
    const userEmail = getValues('email').trim().toLowerCase();
    if (!userEmail) {
      alert('Ingresa tu correo para enviar el enlace de recuperacion.');
      return;
    }
    if (!userEmail.endsWith('@pffsa.com')) {
      alert('Solo se permite recuperacion con correos institucionales @pffsa.com.');
      return;
    }

    try {
      setSendingReset(true);
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
      if (error) throw error;
      alert('Te enviamos un enlace para restablecer tu contrasena. Se abrira en navegador segun la configuracion de Supabase.');
    } catch (error) {
      alert(error.message || 'No se pudo enviar el enlace de recuperacion.');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView key={String(refresh || 'default')} contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Image
            source={useFallbackLogo ? FALLBACK_LOGO : PRIMARY_LOGO}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setUseFallbackLogo(true)}
          />
          <Text style={styles.appName}>Pedersen Connect</Text>
        </View>

        <View style={styles.form}>
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
          <Text style={styles.footerSub}>P.F.F.S.A. (c) 2026 | Version 1.0.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 25 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 180, height: 80 },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 10,
    letterSpacing: 1
  },
  form: { width: '100%' },
  label: { color: COLORS.text, fontWeight: '600', marginBottom: 5, fontSize: 14 },
  passwordLabel: { marginTop: 10 },
  paperInput: { backgroundColor: COLORS.white },
  inputContent: { fontSize: 16, color: COLORS.text },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  loginButton: {
    marginTop: 18,
    borderRadius: 8
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
  footer: { marginTop: 50, alignItems: 'center' },
  footerMain: { color: COLORS.textLight, fontSize: 12, fontWeight: 'bold' },
  footerSub: { color: COLORS.textLight, fontSize: 10, marginTop: 4 }
});
