import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActivityIndicator, Button, Card, HelperText, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';

const passwordSchema = z
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
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' }
  });

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

      let countQuery = supabase.from('customers').select('*', { count: 'exact', head: true }).not('Nivel', 'ilike', 'EMPLEADOS');

      if (profileRole !== 'admin') {
        countQuery = countQuery.eq('Vendedor', normalizeSellerName(profileName));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setClientesCount(count || 0);
    } catch (_error) {
      setFullName('No disponible');
      setRole('vendedor');
      setClientesCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = handleSubmit(async ({ newPassword }) => {
    try {
      setSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (error) throw error;

      reset({ newPassword: '', confirmPassword: '' });
      alert('Contrasena actualizada correctamente.');
    } catch (error) {
      alert(error.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setSavingPassword(false);
    }
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Mi Perfil' }} />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <Card style={[styles.card, GLOBAL_STYLES.shadow]} mode="contained">
          <Card.Content>
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
                  style={styles.paperInput}
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
                  style={styles.paperInput}
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
              loading={savingPassword}
              disabled={savingPassword}
              onPress={handleChangePassword}
            >
              ACTUALIZAR CONTRASENA
            </Button>
          </Card.Content>
        </Card>
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
    borderRadius: 14
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
  paperInput: { backgroundColor: COLORS.white },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  submitButton: { marginTop: 12, borderRadius: 10 }
});
