import React, { useState } from 'react';
import { View, Image, TextInput, TouchableOpacity, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../src/constants/theme'; // IMPORTAMOS EL BRANDING

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      setLoading(false);
    } else {
      router.push('/clientes');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../assets/mainlogo.png')} style={styles.logo} resizeMode="contain" />
        
        <Text style={styles.title}>Fuerza de Ventas</Text>
        
        <View style={styles.form}>
          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput 
            style={GLOBAL_STYLES.input} 
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
          />
          
          <Text style={[styles.label, {marginTop: 15}]}>Contraseña</Text>
          <TextInput 
            style={GLOBAL_STYLES.input} 
            secureTextEntry 
            value={password} 
            onChangeText={setPassword} 
          />

          <TouchableOpacity 
            style={[GLOBAL_STYLES.buttonPrimary, {marginTop: 30}]} 
            onPress={handleLogin}
          >
            {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.btnText}>ENTRAR</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, justifyContent: 'center', padding: 30 },
  logo: { width: '100%', height: 80, marginBottom: 20 },
  title: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: COLORS.primary, 
    textAlign: 'center', 
    marginBottom: 40 
  },
  form: { width: '100%' },
  label: { color: COLORS.textLight, marginBottom: 5, fontSize: 14, fontWeight: '600' },
  btnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 }
});