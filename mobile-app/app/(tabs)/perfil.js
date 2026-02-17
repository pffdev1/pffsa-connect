import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActivityIndicator, Button, Card, HelperText, SegmentedButtons, TextInput } from 'react-native-paper';
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

const ORDERS_PAGE_SIZE = 12;

export default function Perfil() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('vendedor');
  const [clientesCount, setClientesCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState([]);
  const [authUserId, setAuthUserId] = useState('');
  const [ordersNextFrom, setOrdersNextFrom] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [activeTab, setActiveTab] = useState('pedidos');
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

  const formatDateTime = (value) => {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
    return parsed.toLocaleString('es-PA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resolveOrderStatus = (status = '') => {
    const normalized = String(status).trim().toLowerCase();
    if (normalized === 'sent') return { label: 'Enviado', color: '#27AE60' };
    if (normalized === 'pending') return { label: 'Pendiente', color: '#F39C12' };
    if (normalized === 'error') return { label: 'Con error', color: '#E74C3C' };
    return { label: status || 'Sin estado', color: COLORS.textLight };
  };

  const refreshOrdersFirstPage = useCallback(async (userId) => {
    if (!userId) return;

    try {
      setOrdersLoading(true);
      const { data: orders, error: ordersError } = await supabase
        .from('sales_orders')
        .select('id, card_code, status, sap_docnum, created_at, doc_due_date')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .range(0, ORDERS_PAGE_SIZE - 1);

      if (ordersError) throw ordersError;

      const rows = orders || [];
      setRecentOrders(rows);
      setHasMoreOrders(rows.length === ORDERS_PAGE_SIZE);
      setOrdersNextFrom(rows.length);
    } catch (_error) {
      setRecentOrders([]);
      setHasMoreOrders(false);
      setOrdersNextFrom(0);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadOrders = async (userId, { reset = false } = {}) => {
    if (!userId) return;
    if (reset) {
      await refreshOrdersFirstPage(userId);
      return;
    }
    if (!reset && (loadingMoreOrders || !hasMoreOrders)) return;

    try {
      if (reset) setOrdersLoading(true);
      if (!reset) setLoadingMoreOrders(true);
      const from = reset ? 0 : ordersNextFrom;
      const to = from + ORDERS_PAGE_SIZE - 1;

      const { data: orders, error: ordersError } = await supabase
        .from('sales_orders')
        .select('id, card_code, status, sap_docnum, created_at, doc_due_date')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (ordersError) throw ordersError;

      const rows = orders || [];
      setRecentOrders((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMoreOrders(rows.length === ORDERS_PAGE_SIZE);
      setOrdersNextFrom(from + rows.length);
    } catch (_error) {
      if (reset) {
        setRecentOrders([]);
        setHasMoreOrders(false);
        setOrdersNextFrom(0);
      }
    } finally {
      if (reset) setOrdersLoading(false);
      if (!reset) setLoadingMoreOrders(false);
    }
  };

  const loadPerfil = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setLoading(true);
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user?.id) throw new Error('Sin sesion');
      setAuthUserId(user.id);

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
      if (showLoader) setLoading(false);
      loadOrders(user.id, { reset: true });
    } catch (_error) {
      setFullName('No disponible');
      setRole('vendedor');
      setClientesCount(0);
      setRecentOrders([]);
      setHasMoreOrders(false);
      setOrdersNextFrom(0);
      if (showLoader) setLoading(false);
    } finally {
      // no-op: loading handled explicitly to avoid hiding orders skeletons.
    }
  };

  useEffect(() => {
    loadPerfil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!authUserId) return undefined;
      refreshOrdersFirstPage(authUserId);
      return undefined;
    }, [authUserId, refreshOrdersFirstPage])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPerfil({ showLoader: false });
    setRefreshing(false);
  };

  const handleLoadMoreOrders = async () => {
    if (!authUserId) return;
    await loadOrders(authUserId, { reset: false });
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
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

              <SegmentedButtons
                value={activeTab}
                onValueChange={setActiveTab}
                style={styles.tabs}
                buttons={[
                  { value: 'pedidos', label: 'Pedidos', icon: 'receipt-text-outline' },
                  { value: 'seguridad', label: 'Seguridad', icon: 'shield-lock-outline' }
                ]}
              />

              {activeTab === 'pedidos' ? (
                <>
                  <Text style={styles.sectionTitle}>Mis ultimos pedidos</Text>
                  {ordersLoading ? (
                    <View style={styles.ordersList}>
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <View key={`order-skeleton-${idx}`} style={styles.orderSkeletonRow}>
                          <View style={styles.orderSkeletonLineLg} />
                          <View style={styles.orderSkeletonLineMd} />
                          <View style={styles.orderSkeletonLineSm} />
                        </View>
                      ))}
                    </View>
                  ) : recentOrders.length === 0 ? (
                    <Text style={styles.ordersEmpty}>Aun no hay pedidos recientes.</Text>
                  ) : (
                    <View style={styles.ordersList}>
                      {recentOrders.map((order) => {
                        const statusInfo = resolveOrderStatus(order?.status);
                        return (
                          <View key={order.id} style={styles.orderRow}>
                            <View style={styles.orderMain}>
                              <Text style={styles.orderTitle}>
                                {order?.sap_docnum ? `Pedido SAP #${order.sap_docnum}` : `Pedido ${order?.id?.slice(0, 8) || ''}`}
                              </Text>
                              <Text style={styles.orderMeta}>
                                Cliente: {order?.card_code || 'N/A'} | Entrega: {order?.doc_due_date || 'N/A'}
                              </Text>
                              <Text style={styles.orderDate}>{formatDateTime(order?.created_at)}</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: `${statusInfo.color}22` }]}>
                              <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {hasMoreOrders && (
                    <Button
                      mode="outlined"
                      style={styles.loadMoreButton}
                      loading={loadingMoreOrders}
                      disabled={loadingMoreOrders}
                      onPress={handleLoadMoreOrders}
                    >
                      CARGAR MAS
                    </Button>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </Card.Content>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  scrollContent: { paddingBottom: 24 },
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
  tabs: { marginTop: 12, marginBottom: 6 },
  sectionTitle: { marginTop: 12, marginBottom: 8, color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  ordersEmpty: { color: COLORS.textLight, fontSize: 13, marginBottom: 8 },
  ordersList: { marginBottom: 6 },
  orderSkeletonRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  orderSkeletonLineLg: {
    width: '68%',
    height: 12,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderSkeletonLineMd: {
    marginTop: 8,
    width: '84%',
    height: 10,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderSkeletonLineSm: {
    marginTop: 8,
    width: '42%',
    height: 9,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  orderMain: { flex: 1, marginRight: 8 },
  orderTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  orderMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  orderDate: { color: COLORS.textLight, fontSize: 11, marginTop: 3 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  loadMoreButton: { marginTop: 4, borderRadius: 8 },
  paperInput: { backgroundColor: COLORS.white },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  submitButton: { marginTop: 12, borderRadius: 10 }
});
