import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';

const normalizeSellerName = (value = '') =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export default function Perfil() {
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('vendedor');
  const [clientesCount, setClientesCount] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    loadPerfil();
  }, []);

  const loadPerfil = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user?.id) throw new Error('Sin sesion');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const profileName = (profile?.full_name || '').trim();
      const profileRole = (profile?.role || 'vendedor').trim().toLowerCase();
      setFullName(profileName);
      setRole(profileRole);

      let countQuery = supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .not('Nivel', 'ilike', 'EMPLEADOS');

      if (profileRole !== 'admin') {
        countQuery = countQuery.eq('Vendedor', normalizeSellerName(profileName));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setClientesCount(count || 0);
    } catch (error) {
      setFullName('No disponible');
      setRole('vendedor');
      setClientesCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const pwd = (newPassword || '').trim();
    const pwd2 = (confirmPassword || '').trim();

    if (!pwd || !pwd2) {
      Alert.alert('Validacion', 'Debes completar ambos campos de contrasena.');
      return;
    }
    if (pwd.length < 6) {
      Alert.alert('Validacion', 'La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (pwd !== pwd2) {
      Alert.alert('Validacion', 'Las contrasenas no coinciden.');
      return;
    }

    try {
      setSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Exito', 'Contrasena actualizada correctamente.');
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Mi Perfil' }} />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={[styles.card, GLOBAL_STYLES.shadow]}>
          <View style={styles.header}>
            <Ionicons name="person-circle" size={58} color={COLORS.primary} />
            <Text style={styles.name}>{fullName || 'Sin nombre'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Rol</Text>
            <Text style={styles.value}>{role === 'admin' ? 'Admin' : 'Vendedor'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Clientes Asignados</Text>
            <Text style={styles.value}>{clientesCount}</Text>
          </View>

          <Text style={styles.sectionTitle}>Seguridad</Text>
          <Text style={styles.inputLabel}>Nueva contrasena</Text>
          <TextInput
            style={GLOBAL_STYLES.input}
            secureTextEntry
            placeholder="Minimo 6 caracteres"
            placeholderTextColor={COLORS.textLight}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Text style={[styles.inputLabel, { marginTop: 10 }]}>Confirmar contrasena</Text>
          <TextInput
            style={GLOBAL_STYLES.input}
            secureTextEntry
            placeholder="Repite la contrasena"
            placeholderTextColor={COLORS.textLight}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <TouchableOpacity
            style={[GLOBAL_STYLES.buttonPrimary, { marginTop: 14 }, savingPassword && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={savingPassword}
          >
            {savingPassword ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>ACTUALIZAR CONTRASENA</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    marginTop: 10,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18
  },
  header: { alignItems: 'center', marginBottom: 20 },
  name: { marginTop: 8, fontSize: 20, fontWeight: '700', color: COLORS.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F4',
    paddingVertical: 12
  },
  label: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  value: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sectionTitle: { marginTop: 12, marginBottom: 8, color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  inputLabel: { color: COLORS.textLight, fontSize: 12, marginBottom: 6, fontWeight: '600' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  buttonDisabled: { opacity: 0.7 }
});
