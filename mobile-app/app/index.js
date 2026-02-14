import React, { useEffect, useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  Image, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../src/constants/theme';
import { Ionicons } from '@expo/vector-icons'; // Viene con Expo

const PRIMARY_LOGO = require('../assets/logo.png');
const FALLBACK_LOGO = require('../assets/mainlogo.png');

export default function Login() {
  const router = useRouter();
  const { refresh } = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [useFallbackLogo, setUseFallbackLogo] = useState(false);

  useEffect(() => {
    setUseFallbackLogo(false);
  }, [refresh]);

  const handleLogin = async () => {
    // 1. Validar Dominio
    if (!email.toLowerCase().endsWith('@pffsa.com')) {
      alert('Acceso restringido: Debe usar su correo de @pffsa.com');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      alert('Error: Credenciales inválidas');
      setLoading(false);
    } else {
      router.replace('/(tabs)/clientes');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView key={String(refresh || 'default')} contentContainerStyle={styles.scrollContainer}>
        
        {/* Logo y Nombre de la App */}
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
          <TextInput
            style={GLOBAL_STYLES.input}
            placeholder="usuario@pffsa.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 15 }]}>Contraseña</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity 
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={22} 
                color={COLORS.textLight} 
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[GLOBAL_STYLES.buttonPrimary, { marginTop: 30 }]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'ACCEDIENDO...' : 'ENTRAR'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer con créditos */}
        <View style={styles.footer}>
          <Text style={styles.footerMain}>Desarrollado por el Dpto. de IT e Innovación</Text>
          <Text style={styles.footerSub}>P.F.F.S.A. © 2026 | Versión 1.0.0</Text>
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeIcon: { padding: 10 },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  footer: { marginTop: 50, alignItems: 'center' },
  footerMain: { color: COLORS.textLight, fontSize: 12, fontWeight: 'bold' },
  footerSub: { color: COLORS.textLight, fontSize: 10, marginTop: 4 }
});
