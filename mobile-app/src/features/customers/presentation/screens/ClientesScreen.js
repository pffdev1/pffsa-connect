import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Avatar, Button, Chip, Searchbar, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { clearLocalSupabaseSession, isInvalidRefreshTokenError } from '../../../../shared/infrastructure/supabaseClient';
import { getCachedJson, setCachedJson } from '../../../../shared/infrastructure/offlineService';
import { useCart } from '../../../../shared/state/cart/CartContext';
import { APP_LAYOUT, COLORS } from '../../../../constants/theme';
import CustomerGrid from '../components/CustomerGrid';
import {
  fetchAuthUser,
  fetchCustomersPage,
  fetchProfileById,
  removeCustomersRealtimeChannel,
  subscribeCustomersRealtime
} from '../../infrastructure/customersRepository';
import { isConnectionLikeError, withTimeout } from '../../application/customersQueryPolicy';
import {
  deriveProfileName,
  isClientBlocked,
  matchesSearchTerm,
  normalizeSellerName,
  sanitizeSearchTerm
} from '../../domain/customerRules';

const PAGE_SIZE = 50;
const MIN_SKELETON_MS = 700;
const SEARCH_DEBOUNCE_MS = 280;
const CATALOG_RESET_ON_FOCUS_KEY = 'catalog:reset-client-on-focus:v1';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Clientes() {
  const insets = useSafeAreaInsets();
  const actionBottomInset = Math.max(insets.bottom, 12);
  const [clientes, setClientes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authUserId, setAuthUserId] = useState('');
  const isMounted = useRef(true);
  const clientesRef = useRef([]);
  const realtimeErrorRef = useRef('');
  const isLoadingMoreRef = useRef(false);
  const hasInitializedSearchRef = useRef(false);
  const handledOrderCompletedRef = useRef('');
  const router = useRouter();
  const { orderCompleted } = useLocalSearchParams();
  const { clearCart } = useCart();
  const clearCartRef = useRef(clearCart);

  useEffect(() => {
    clearCartRef.current = clearCart;
  }, [clearCart]);

  const clientesScreenOptions = useMemo(
    () => ({
      headerShown: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: COLORS.background, height: APP_LAYOUT.HEADER_HEIGHT }
    }),
    []
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(sanitizeSearchTerm(search));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const completedToken = Array.isArray(orderCompleted) ? String(orderCompleted[0] || '') : String(orderCompleted || '');
    if (!completedToken) return;
    if (handledOrderCompletedRef.current === completedToken) return;
    handledOrderCompletedRef.current = completedToken;
    clearCartRef.current?.();
    AsyncStorage.setItem(CATALOG_RESET_ON_FOCUS_KEY, '1').catch(() => {});
    setSelectedClient(null);
    setSearch('');
    setDebouncedSearch('');
  }, [orderCompleted]);

  useFocusEffect(
    useCallback(() => {
      setSelectedClient(null);
      setSearch('');
      setDebouncedSearch('');
    }, [])
  );

  useEffect(() => {
    isMounted.current = true;
    (async () => {
      let bootstrapUserId = '';
      let bootstrapRole = 'vendedor';
      const startedAt = Date.now();
      try {
        setLoading(true);
        setErrorMsg('');
        const {
          data: { user },
          error: userError
        } = await withTimeout(fetchAuthUser());

        if (userError) throw userError;
        if (!user?.id) throw new Error('No hay sesion activa');
        bootstrapUserId = user.id;

        const { data: p, error: profileError } = await withTimeout(fetchProfileById(user.id));

        if (profileError && profileError.code !== 'PGRST116') throw profileError;

        const nextProfile = {
          fullName: deriveProfileName(p, user),
          role: (p?.role || 'vendedor').trim().toLowerCase()
        };
        bootstrapRole = nextProfile.role;

        if (!isMounted.current) return;
        setAuthUserId(user.id);
        setProfile(nextProfile);
        setClientes(null);
        setHasMore(true);

        const { data, error } = await withTimeout(fetchCustomersPage({ from: 0, to: PAGE_SIZE - 1 }));
        if (error) throw error;

        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SKELETON_MS) {
          await wait(MIN_SKELETON_MS - elapsed);
        }
        if (!isMounted.current) return;

        const nuevos = data || [];
        setClientes(nuevos);
        setHasMore(nuevos.length === PAGE_SIZE);
        const cacheKey = `offline:clientes:first_page:${user.id}:${nextProfile.role}`;
        await setCachedJson(cacheKey, nuevos);
      } catch (error) {
        if (!isMounted.current) return;
        const rawMessage = String(error?.message || '').toLowerCase();
        if (isInvalidRefreshTokenError(error)) {
          await clearLocalSupabaseSession();
          router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
          return;
        }
        if (rawMessage.includes('sesion') || rawMessage.includes('jwt') || rawMessage.includes('auth')) {
          setErrorMsg('Tu sesion no es valida. Vuelve a iniciar sesion.');
        } else {
          const userId = String(bootstrapUserId || '').trim();
          const roleKey = String(bootstrapRole || 'vendedor').trim();
          const cacheKey = userId ? `offline:clientes:first_page:${userId}:${roleKey}` : null;
          const cached = cacheKey ? await getCachedJson(cacheKey, null) : null;
          if (Array.isArray(cached) && cached.length > 0) {
            setClientes(cached);
            setHasMore(false);
            setErrorMsg('Sin conexion: mostrando clientes en cache.');
          } else {
            setErrorMsg('No se pudo cargar tu perfil. Contacta a IT.');
          }
        }
        console.error('clientes bootstrap failed:', {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint
        });
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted.current = false;
    };
  // Run bootstrap once on mount; re-running causes repeated state churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile) return undefined;

    const channel = subscribeCustomersRealtime({
      role: profile.role,
      onCustomerUpdated: (payload) => {
        if (!payload?.new?.CardCode) return;
        setClientes((prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((item) => (item.CardCode === payload.new.CardCode ? { ...item, ...payload.new } : item));
        });
      },
      onStatusChanged: (status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const errorText = String(err?.message || err?.error || 'unknown_error');
          if (realtimeErrorRef.current !== errorText) {
            realtimeErrorRef.current = errorText;
            console.error('Realtime customers channel error:', {
              status,
              filter: '(none)',
              reason: errorText
            });
          }
        }
      }
    });

    return () => {
      removeCustomersRealtimeChannel(channel);
    };
  }, [profile]);

  const fetchClientes = useCallback(async (reset = false, currentProfile = profile, searchTerm = debouncedSearch, showConnectionAlert = false) => {
    const startedAt = Date.now();

    try {
      if (!isMounted.current || !currentProfile) return;
      if (reset) {
        setLoading(true);
        setErrorMsg('');
        isLoadingMoreRef.current = false;
      } else {
        if (!hasMore || loadingMore || isLoadingMoreRef.current) return;
        isLoadingMoreRef.current = true;
        setLoadingMore(true);
      }

      const from = reset ? 0 : clientes?.length || 0;
      const to = from + PAGE_SIZE - 1;
      const querySearch = sanitizeSearchTerm(searchTerm);
      const normalizedSearch = normalizeSellerName(querySearch);

      const { data, error } = await withTimeout(
        fetchCustomersPage({
          from,
          to,
          searchTerm: normalizedSearch ? querySearch : ''
        })
      );
      if (error) throw error;
      if (!isMounted.current) return;

      if (reset) {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SKELETON_MS) {
          await wait(MIN_SKELETON_MS - elapsed);
        }
        if (!isMounted.current) return;
      }

      const fetchedRows = data || [];
      const nuevos = fetchedRows.filter((item) => matchesSearchTerm(item, normalizedSearch));
      setClientes((prev) => (reset ? nuevos : [...(prev || []), ...nuevos]));
      setHasMore(fetchedRows.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error cargando clientes:', error.message);
      if (!isMounted.current) return;
      const connectionError = isConnectionLikeError(error);
      const hasExistingRows = Array.isArray(clientesRef.current) && clientesRef.current.length > 0;

      if (reset && connectionError) {
        if (!hasExistingRows) {
          const userId = String(authUserId || '').trim();
          const roleKey = String(currentProfile?.role || 'vendedor').trim();
          const cacheKey = userId ? `offline:clientes:first_page:${userId}:${roleKey}` : null;
          const cached = cacheKey ? await getCachedJson(cacheKey, null) : null;
          if (Array.isArray(cached) && cached.length > 0) {
            setClientes(cached);
            setHasMore(false);
          }
        }

        setErrorMsg('Problemas de conexion: mostrando la ultima informacion cargada. Intenta nuevamente mas tarde.');
        if (showConnectionAlert) {
          Alert.alert(
            'Problemas de conexion',
            'No pudimos actualizar los clientes. Se mostrara la ultima informacion cargada. Intenta nuevamente mas tarde.'
          );
        }
      } else {
        setErrorMsg(
          reset ? 'No se pudo cargar la lista de clientes. Intenta nuevamente.' : 'No se pudieron cargar mas clientes.'
        );
      }
    } finally {
      if (!isMounted.current) return;
      if (reset) {
        setLoading(false);
      } else {
        isLoadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [authUserId, clientes?.length, debouncedSearch, hasMore, loadingMore, profile]);

  useEffect(() => {
    clientesRef.current = Array.isArray(clientes) ? clientes : [];
  }, [clientes]);

  useEffect(() => {
    if (!profile) return;
    if (!hasInitializedSearchRef.current) {
      hasInitializedSearchRef.current = true;
      return;
    }

    setHasMore(true);
    fetchClientes(true, profile, debouncedSearch);
    // `fetchClientes` depends on pagination/loading state; this reset should run only on profile/search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, profile]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || !profile || !Array.isArray(clientes)) return;
    fetchClientes(false, profile, debouncedSearch);
  }, [clientes, debouncedSearch, fetchClientes, hasMore, loading, loadingMore, profile]);

  const handleRefresh = useCallback(async () => {
    if (!profile) return;
    try {
      setRefreshing(true);
      setHasMore(true);
      await fetchClientes(true, profile, debouncedSearch, true);
    } finally {
      setRefreshing(false);
    }
  }, [debouncedSearch, fetchClientes, profile]);

  const openClientInfo = useCallback((item) => {
    setSelectedClient(item);
  }, []);

  const closeClientInfo = useCallback(() => {
    setSelectedClient(null);
  }, []);

  const handleOpenCatalog = useCallback((item) => {
    if (isClientBlocked(item)) {
      Alert.alert('Cliente bloqueado', 'No puedes crear pedidos para este cliente mientras este bloqueado.');
      return;
    }

    router.push({
      pathname: '/catalogo',
      params: {
        cardCode: item.CardCode,
        cardName: item.CardFName || item.CardName,
        zona: item.Zona || '',
        idRuta: item.IDRuta || item.IdRuta || item.Ruta || ''
      }
    });
  }, [router]);

  const handleLiftOrderFromSheet = useCallback(() => {
    const c = selectedClient;
    closeClientInfo();
    if (!c) return;
    handleOpenCatalog(c);
  }, [selectedClient, closeClientInfo, handleOpenCatalog]);

  const balanceValue = Number(selectedClient?.Balance);
  const hasValidBalance = Number.isFinite(balanceValue);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Stack.Screen options={clientesScreenOptions} />

      <LinearGradient colors={['#0E3D75', '#1664A0', '#1A77BC']} style={styles.heroWrap}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>Directorio comercial</Text>
          <View style={styles.heroBadge}>
            <Ionicons name="people-outline" size={15} color="#FFF" />
          </View>
        </View>
        <Text style={styles.heroTitle}>Socios de negocio</Text>
        <Text style={styles.heroSub}>
          Busca clientes por nombre, RUC o codigo para levantar pedidos rapido.
        </Text>

        <View style={styles.searchDock}>
          <Searchbar
            placeholder="Buscar por nombre, RUC o codigo..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
            iconColor={COLORS.textLight}
            placeholderTextColor="#999"
          />
        </View>
      </LinearGradient>

      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <CustomerGrid
        data={clientes}
        onPressCustomer={handleOpenCatalog}
        onPressInfo={openClientInfo}
        viewerRole={profile?.role || 'vendedor'}
        viewerSellerName={profile?.fullName || ''}
        onEndReached={handleLoadMore}
        loadingMore={loadingMore}
        hasMore={hasMore}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        emptyText={search ? `No se encontraron clientes para "${search}"` : 'No hay clientes disponibles'}
      />

      <Modal visible={Boolean(selectedClient)} animationType="slide" onRequestClose={closeClientInfo}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'left', 'right']}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ficha del Cliente</Text>
            <Pressable onPress={closeClientInfo} style={styles.sheetCloseButton} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.primary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: actionBottomInset + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {selectedClient && (
              <Animated.View entering={FadeInDown.duration(280).springify().damping(18)}>
                <Surface style={styles.sheetHero} elevation={1}>
                  <Avatar.Icon size={42} icon="domain" color="#FFF" style={styles.sheetAvatar} />
                  <View style={styles.sheetHeroText}>
                    <Text style={styles.sheetHeroName}>{selectedClient.CardFName || selectedClient.CardName || 'Cliente'}</Text>
                    <Chip compact style={styles.sheetHeroChip} textStyle={styles.sheetHeroChipText}>
                      {selectedClient.CardCode || 'Sin codigo'}
                    </Chip>
                  </View>
                  <View style={styles.sheetHeroBalanceWrap}>
                    <Text style={styles.sheetHeroBalanceLabel}>Balance</Text>
                    <Text
                      style={[
                        styles.sheetHeroBalanceValue,
                        {
                          color: hasValidBalance ? (balanceValue > 0 ? '#E74C3C' : '#27AE60') : COLORS.textLight
                        }
                      ]}
                    >
                      {hasValidBalance ? `$${balanceValue.toFixed(2)}` : 'No disponible'}
                    </Text>
                  </View>
                </Surface>

                <View style={styles.sheetBody}>
                  <DetailRow icon="business-outline" label="Razon Social" value={selectedClient.CardName} />
                  <DetailRow icon="storefront-outline" label="Nombre Comercial" value={selectedClient.CardFName} />
                  <DetailRow icon="card-outline" label="RUC / DV" value={`${selectedClient.RUC || 'N/A'} - ${selectedClient.DV || 'N/A'}`} />
                  <DetailRow icon="mail-outline" label="Correo" value={selectedClient.Correo || selectedClient.correo} />
                  <DetailRow icon="person-outline" label="Vendedor" value={selectedClient.Vendedor} />
                  <DetailRow icon="navigate-outline" label="Ruta / Zona" value={`${selectedClient.Ruta || 'N/A'} (${selectedClient.Zona || 'N/A'})`} />
                  <DetailRow icon="location-outline" label="Direccion de Entrega" value={selectedClient.Direccion} />
                  <DetailRow icon="calendar-outline" label="Dia de Entrega" value={selectedClient.DiasEntrega} />
                  <DetailRow icon="time-outline" label="Horario de Atencion" value={selectedClient.Horario} />
                </View>
              </Animated.View>
            )}
          </ScrollView>

          <View style={[styles.sheetActions, { paddingBottom: actionBottomInset }]}>
            <Button mode="outlined" style={styles.sheetActionButton} onPress={closeClientInfo}>
              CERRAR
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              style={styles.sheetActionButton}
              onPress={handleLiftOrderFromSheet}
              disabled={!selectedClient}
            >
              LEVANTAR PEDIDO
            </Button>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const DetailRow = ({ icon, label, value, color = COLORS.text }) => (
  <Surface style={styles.detailRow} elevation={0}>
    <View style={styles.detailIconWrap}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
    </View>
    <View style={styles.detailTextWrap}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, { color }]}>{value || 'No disponible'}</Text>
    </View>
  </Surface>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  heroWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  heroEyebrow: {
    color: '#D9EBFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  heroBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroTitle: {
    marginTop: 8,
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800'
  },
  heroSub: {
    marginTop: 6,
    color: '#EAF4FF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  searchDock: {
    marginTop: 12
  },
  searchBar: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    height: 46
  },
  searchInput: { fontSize: 16, color: COLORS.text, minHeight: 0 },
  errorText: { marginHorizontal: 15, marginTop: 12, color: '#E74C3C', fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: '#FFF', paddingHorizontal: 18, paddingTop: 4 },
  sheetScroll: { flex: 1, minHeight: 0 },
  sheetScrollContent: { paddingBottom: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F6FC'
  },
  sheetHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F4F8FD',
    marginBottom: 12
  },
  sheetAvatar: { backgroundColor: COLORS.primary },
  sheetHeroText: { marginLeft: 10, flex: 1 },
  sheetHeroName: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  sheetHeroChip: { marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#E8EEF8' },
  sheetHeroChipText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  sheetHeroBalanceWrap: {
    alignItems: 'flex-end',
    marginLeft: 8
  },
  sheetHeroBalanceLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  sheetHeroBalanceValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800'
  },
  sheetBody: { gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: '#FAFBFD' },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAF1FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  detailTextWrap: { flex: 1 },
  detailLabel: { fontSize: 10, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFF',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8EEF6'
  },
  sheetActionButton: { flex: 1, borderRadius: 10 }
});
