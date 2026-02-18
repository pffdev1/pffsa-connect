import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Avatar, Badge, Button, Chip, Divider, IconButton, Modal, Portal, Searchbar, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/services/supabaseClient';
import { useCart } from '../../src/context/CartContext';
import { COLORS } from '../../src/constants/theme';
import CustomerGrid from '../../src/components/CustomerGrid';

const PAGE_SIZE = 50;
const MAX_UNLOCK_NOTIFICATIONS = 30;
const MIN_SKELETON_MS = 700;
const SEARCH_DEBOUNCE_MS = 280;
const CUSTOMER_SELECT_FIELDS =
  'CardCode, CardName, CardFName, RUC, DV, Vendedor, Nivel, SubCategoria, TipoCadena, Ruta, Zona, IDRuta, Direccion, DiasEntrega, Horario, Balance, Bloqueado';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitizeSearchTerm = (value = '') =>
  value
    .trim()
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ');
const normalizeSellerName = (value = '') =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
const deriveProfileName = (profileRow, authUser) => {
  const profileFullName = String(profileRow?.full_name || '').trim();
  if (profileFullName) return profileFullName;

  const metadataFullName = String(authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || '').trim();
  if (metadataFullName) return metadataFullName;

  return '';
};
const buildRealtimeEqFilter = (column, value = '') => {
  const safeValue = String(value || '').trim();
  if (!safeValue) return undefined;
  // Supabase Realtime expects PostgREST-style filters without quoted string literals.
  // Encode spaces/special chars to avoid CHANNEL_ERROR parsing failures.
  return `${column}=eq.${encodeURIComponent(safeValue)}`;
};
const buildChannelSellerToken = (value = '') => {
  const token = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || 'all';
};
const matchesSearchTerm = (item, normalizedTerm) => {
  if (!normalizedTerm) return true;
  return [item?.CardName, item?.CardCode, item?.CardFName, item?.RUC].some((value) =>
    normalizeSellerName(String(value || '')).includes(normalizedTerm)
  );
};
const isClientBlocked = (item) => normalizeSellerName(String(item?.Bloqueado || '')) === 'Y';

export default function Clientes() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const sheetBottomInset = Math.max(insets.bottom, 12);
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
  const [unlockNotifications, setUnlockNotifications] = useState([]);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const isMounted = useRef(true);
  const clientesRef = useRef([]);
  const blockedStateRef = useRef(new Map());
  const realtimeErrorRef = useRef('');
  const hasHydratedNotificationsRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const hasInitializedSearchRef = useRef(false);
  const detailsSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['83%'], []);
  const unreadUnlockCount = useMemo(() => unlockNotifications.filter((item) => !item.read).length, [unlockNotifications]);
  const notificationsStorageKey = useMemo(() => {
    if (!authUserId) return null;
    return `clientes:unlock-notifications:${authUserId}`;
  }, [authUserId]);
  const router = useRouter();
  const { orderCompleted } = useLocalSearchParams();
  const { clearCart } = useCart();

  const handleLogout = async () => {
    Alert.alert('Cerrar sesion', 'Estas seguro de que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert('Error', 'No se pudo cerrar la sesion. Intenta nuevamente.');
            return;
          }
          clearCart();
          router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
        }
      }
    ]);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(sanitizeSearchTerm(search));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!orderCompleted) return;
    clearCart();
  }, [orderCompleted, clearCart]);

  useEffect(() => {
    isMounted.current = true;
    (async () => {
      const startedAt = Date.now();
      try {
        setLoading(true);
        setErrorMsg('');
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user?.id) throw new Error('No hay sesion activa');

        const { data: p, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') throw profileError;

        const nextProfile = {
          fullName: deriveProfileName(p, user),
          role: (p?.role || 'vendedor').trim().toLowerCase()
        };

        if (nextProfile.role !== 'admin' && !nextProfile.fullName) {
          throw new Error('Perfil vendedor sin full_name en profiles');
        }

        if (!isMounted.current) return;
        setAuthUserId(user.id);
        setProfile(nextProfile);
        setClientes(null);
        setHasMore(true);

        let query = supabase
          .from('customers')
          .select(CUSTOMER_SELECT_FIELDS)
          .not('Nivel', 'ilike', 'EMPLEADOS')
          .order('CardName', { ascending: true })
          .order('CardCode', { ascending: true })
          .order('Nivel', { ascending: true })
          .range(0, PAGE_SIZE - 1);

        if (nextProfile.role !== 'admin') {
          query = query.eq('Vendedor', normalizeSellerName(nextProfile.fullName));
        }

        const { data, error } = await query;
        if (error) throw error;

        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SKELETON_MS) {
          await wait(MIN_SKELETON_MS - elapsed);
        }
        if (!isMounted.current) return;

        const nuevos = data || [];
        setClientes(nuevos);
        setHasMore(nuevos.length === PAGE_SIZE);
      } catch (error) {
        if (!isMounted.current) return;
        const rawMessage = String(error?.message || '').toLowerCase();
        if (rawMessage.includes('full_name')) {
          setErrorMsg('Tu usuario vendedor no tiene nombre configurado en profiles.full_name. Contacta a IT.');
        } else if (rawMessage.includes('sesion') || rawMessage.includes('jwt') || rawMessage.includes('auth')) {
          setErrorMsg('Tu sesion no es valida. Vuelve a iniciar sesion.');
        } else {
          setErrorMsg('No se pudo cargar tu perfil. Contacta a IT.');
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
  }, []);

  useEffect(() => {
    if (!notificationsStorageKey) return undefined;

    let cancelled = false;
    hasHydratedNotificationsRef.current = false;

    const hydrateNotifications = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(notificationsStorageKey);
        if (cancelled) return;

        if (!rawValue) {
          setUnlockNotifications([]);
          return;
        }

        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
          setUnlockNotifications([]);
          return;
        }

        setUnlockNotifications(parsed.slice(0, MAX_UNLOCK_NOTIFICATIONS));
      } catch (_error) {
        if (!cancelled) {
          setUnlockNotifications([]);
        }
      } finally {
        if (!cancelled) {
          hasHydratedNotificationsRef.current = true;
        }
      }
    };

    hydrateNotifications();

    return () => {
      cancelled = true;
      hasHydratedNotificationsRef.current = false;
    };
  }, [notificationsStorageKey]);

  useEffect(() => {
    if (!notificationsStorageKey || !hasHydratedNotificationsRef.current) return;

    AsyncStorage.setItem(notificationsStorageKey, JSON.stringify(unlockNotifications.slice(0, MAX_UNLOCK_NOTIFICATIONS))).catch(
      () => {}
    );
  }, [unlockNotifications, notificationsStorageKey]);

  useEffect(() => {
    if (!profile) return undefined;

    const normalizedSeller = normalizeSellerName(profile.fullName);
    const realtimeFilter =
      profile.role === 'admin' || !normalizedSeller ? undefined : buildRealtimeEqFilter('Vendedor', normalizedSeller);
    const channelSellerToken = buildChannelSellerToken(normalizedSeller);

    setRealtimeStatus('CONNECTING');
    const channel = supabase
      .channel(`customers-unlock-${profile.role}-${channelSellerToken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customers',
          ...(realtimeFilter ? { filter: realtimeFilter } : {})
        },
        (payload) => {
          const cardCode = payload?.new?.CardCode;
          const previousLocalItem = cardCode ? clientesRef.current.find((item) => item?.CardCode === cardCode) : null;
          const knownBlocked = cardCode ? blockedStateRef.current.get(cardCode) : '';
          const sellerFromPayload = normalizeSellerName(
            String(payload?.new?.Vendedor || payload?.old?.Vendedor || previousLocalItem?.Vendedor || '')
          );
          if (profile.role !== 'admin' && sellerFromPayload !== normalizedSeller) return;

          const oldBlocked = normalizeSellerName(
            String(payload?.old?.Bloqueado || knownBlocked || previousLocalItem?.Bloqueado || '')
          );
          const newBlocked = normalizeSellerName(String(payload?.new?.Bloqueado || ''));
          if (cardCode) {
            blockedStateRef.current.set(cardCode, newBlocked);
          }

          if (oldBlocked === 'Y' && newBlocked === 'N') {
            const customerName =
              payload?.new?.CardFName || payload?.new?.CardName || payload?.new?.CardCode || 'Cliente sin nombre';
            const notificationItem = {
              id: `${payload?.new?.CardCode || 'cliente'}-${Date.now()}`,
              customerName,
              cardCode: payload?.new?.CardCode || '',
              createdAt: new Date().toISOString(),
              read: false
            };
            setUnlockNotifications((prev) => [notificationItem, ...prev].slice(0, MAX_UNLOCK_NOTIFICATIONS));
          }

          if (!payload?.new?.CardCode) return;
          setClientes((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((item) => (item.CardCode === payload.new.CardCode ? { ...item, ...payload.new } : item));
          });
        }
      )
      .subscribe((status, err) => {
        setRealtimeStatus(status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const errorText = String(err?.message || err?.error || 'unknown_error');
          if (realtimeErrorRef.current !== errorText) {
            realtimeErrorRef.current = errorText;
            console.error('Realtime customers channel error:', {
              status,
              filter: realtimeFilter || '(none)',
              reason: errorText
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || realtimeStatus === 'SUBSCRIBED' || !isFocused) return undefined;

    const normalizedSeller = normalizeSellerName(profile.fullName);
    const pollForUnlockChanges = async () => {
      try {
        let query = supabase
          .from('customers')
          .select('CardCode, CardName, CardFName, Vendedor, Bloqueado')
          .not('Nivel', 'ilike', 'EMPLEADOS');

        if (profile.role !== 'admin') {
          query = query.eq('Vendedor', normalizedSeller);
        } else {
          const loadedCardCodes = Array.from(new Set((clientesRef.current || []).map((item) => item?.CardCode).filter(Boolean)));
          if (loadedCardCodes.length === 0) return;
          query = query.in('CardCode', loadedCardCodes);
        }

        const { data, error } = await query;
        if (error) throw error;

        (data || []).forEach((row) => {
          const cardCode = String(row?.CardCode || '').trim();
          if (!cardCode) return;
          const prevBlocked = normalizeSellerName(String(blockedStateRef.current.get(cardCode) || ''));
          const nextBlocked = normalizeSellerName(String(row?.Bloqueado || ''));

          if (prevBlocked === 'Y' && nextBlocked === 'N') {
            const customerName = row?.CardFName || row?.CardName || cardCode;
            const notificationItem = {
              id: `${cardCode}-${Date.now()}`,
              customerName,
              cardCode,
              createdAt: new Date().toISOString(),
              read: false
            };
            setUnlockNotifications((prev) => [notificationItem, ...prev].slice(0, MAX_UNLOCK_NOTIFICATIONS));
          }

          blockedStateRef.current.set(cardCode, nextBlocked);
        });
      } catch (_error) {
        // Silent fallback polling failure to avoid UI noise.
      }
    };

    pollForUnlockChanges();
    const intervalId = setInterval(pollForUnlockChanges, 30000);

    return () => clearInterval(intervalId);
  }, [profile, realtimeStatus, isFocused]);

  const fetchClientes = async (reset = false, currentProfile = profile, searchTerm = debouncedSearch) => {
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

      let query = supabase
        .from('customers')
        .select(CUSTOMER_SELECT_FIELDS)
        .not('Nivel', 'ilike', 'EMPLEADOS')
        .order('CardName', { ascending: true })
        .order('CardCode', { ascending: true })
        .order('Nivel', { ascending: true })
        .range(from, to);

      if (currentProfile.role !== 'admin') {
        query = query.eq('Vendedor', normalizeSellerName(currentProfile.fullName));
      }
      if (normalizedSearch) {
        const likeTerm = `%${querySearch}%`;
        query = query.or(
          `CardName.ilike.${likeTerm},CardFName.ilike.${likeTerm},CardCode.ilike.${likeTerm},RUC.ilike.${likeTerm}`
        );
      }

      const { data, error } = await query;
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
      setErrorMsg(
        reset ? 'No se pudo cargar la lista de clientes. Intenta nuevamente.' : 'No se pudieron cargar mas clientes.'
      );
    } finally {
      if (!isMounted.current) return;
      if (reset) {
        setLoading(false);
      } else {
        isLoadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    clientesRef.current = Array.isArray(clientes) ? clientes : [];
    if (Array.isArray(clientes)) {
      clientes.forEach((item) => {
        const code = String(item?.CardCode || '').trim();
        if (!code) return;
        blockedStateRef.current.set(code, normalizeSellerName(String(item?.Bloqueado || '')));
      });
    }
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

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore || !profile || !Array.isArray(clientes)) return;
    fetchClientes(false, profile, debouncedSearch);
  };
  const handleRefresh = async () => {
    if (!profile) return;
    try {
      setRefreshing(true);
      setHasMore(true);
      await fetchClientes(true, profile, debouncedSearch);
    } finally {
      setRefreshing(false);
    }
  };

  const openNotifications = () => {
    setUnlockNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setNotificationsVisible(true);
  };

  const closeNotifications = () => {
    setNotificationsVisible(false);
  };

  const openClientInfo = (item) => {
    setSelectedClient(item);
    detailsSheetRef.current?.present();
  };

  const closeClientInfo = () => {
    detailsSheetRef.current?.dismiss();
  };
  const handleOpenCatalog = (item) => {
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
  };

  const balanceValue = Number(selectedClient?.Balance);
  const hasValidBalance = Number.isFinite(balanceValue);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Directorio de Clientes',
          headerRight: () => (
            <Button icon="logout" mode="text" textColor="#FFF" onPress={handleLogout} compact>
              Salir
            </Button>
          )
        }}
      />

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Buscar por nombre, RUC o codigo..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={COLORS.textLight}
          placeholderTextColor="#999"
        />
        {!!profile && (
          <View style={styles.profileCard}>
            <Avatar.Icon
              size={34}
              icon={profile.role === 'admin' ? 'shield-account' : 'account-tie'}
              color="#FFF"
              style={styles.avatarIcon}
            />
            <View style={styles.profileTextWrap}>
              <Text style={styles.profileName}>{profile.fullName || 'Sin nombre'}</Text>
              <Chip compact style={styles.roleChip} textStyle={styles.roleChipText}>
                {profile.role === 'admin' ? 'Admin' : 'Vendedor'}
              </Chip>
              <View style={styles.realtimeRow}>
                <View
                  style={[
                    styles.realtimeDot,
                    realtimeStatus === 'SUBSCRIBED'
                      ? styles.realtimeOk
                      : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT'
                        ? styles.realtimeErr
                        : styles.realtimePending
                  ]}
                />
                <Text style={styles.realtimeText}>
                  {realtimeStatus === 'SUBSCRIBED'
                    ? 'Realtime conectado'
                    : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT'
                      ? 'Realtime con error'
                      : 'Conectando realtime...'}
                </Text>
              </View>
            </View>
            <View style={styles.bellWrap}>
              <IconButton
                icon="bell-outline"
                mode="contained-tonal"
                size={20}
                iconColor="#FFF"
                containerColor="rgba(255,255,255,0.18)"
                onPress={openNotifications}
              />
              {unreadUnlockCount > 0 && (
                <Badge style={styles.bellBadge} size={18}>
                  {unreadUnlockCount > 99 ? '99+' : unreadUnlockCount}
                </Badge>
              )}
            </View>
            <Button mode="text" compact textColor="#EAF4FF" onPress={() => router.push('/perfil')}>
              Perfil
            </Button>
          </View>
        )}
      </View>

      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <CustomerGrid
        data={clientes}
        onPressCustomer={handleOpenCatalog}
        onPressInfo={openClientInfo}
        onEndReached={handleLoadMore}
        loadingMore={loadingMore}
        hasMore={hasMore}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        emptyText={search ? `No se encontraron clientes para "${search}"` : 'No hay clientes disponibles'}
      />

      <BottomSheetModal
        ref={detailsSheetRef}
        index={0}
        snapPoints={snapPoints}
        bottomInset={sheetBottomInset}
        onDismiss={() => setSelectedClient(null)}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={[styles.sheetContent, { paddingBottom: sheetBottomInset + 12 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ficha del Cliente</Text>
            <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
          </View>

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
                <DetailRow icon="person-outline" label="Vendedor" value={selectedClient.Vendedor} />
                <DetailRow icon="navigate-outline" label="Ruta / Zona" value={`${selectedClient.Ruta || 'N/A'} (${selectedClient.Zona || 'N/A'})`} />
                <DetailRow icon="location-outline" label="Direccion de Entrega" value={selectedClient.Direccion} />
                <DetailRow icon="calendar-outline" label="Dia de Entrega" value={selectedClient.DiasEntrega} />
                <DetailRow icon="time-outline" label="Horario de Atencion" value={selectedClient.Horario} />
              </View>
            </Animated.View>
          )}

          <View style={styles.sheetActions}>
            <Button mode="outlined" style={styles.sheetActionButton} onPress={closeClientInfo}>
              CERRAR
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              style={styles.sheetActionButton}
              onPress={() => {
                const c = selectedClient;
                closeClientInfo();
                if (!c) return;
                handleOpenCatalog(c);
              }}
            >
              LEVANTAR PEDIDO
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <Portal>
        <Modal visible={notificationsVisible} onDismiss={closeNotifications} contentContainerStyle={styles.notificationsModalWrap}>
          <Surface style={styles.notificationsPanel} elevation={4}>
            <View style={styles.notificationsPanelContent}>
              <View style={styles.notificationsHeader}>
                <Text style={styles.notificationsTitle}>Notificaciones</Text>
                <Button compact onPress={closeNotifications}>
                  Cerrar
                </Button>
              </View>
              <Divider />
              <View style={styles.notificationsBody}>
                {unlockNotifications.length === 0 ? (
                  <Text style={styles.notificationsEmpty}>Sin notificaciones</Text>
                ) : (
                  unlockNotifications.map((item) => (
                    <View key={item.id} style={styles.notificationItem}>
                      <View style={styles.notificationDot} />
                      <View style={styles.notificationTextWrap}>
                        <Text style={styles.notificationTitle}>{item.customerName}</Text>
                        <Text style={styles.notificationSubtitle}>
                          Cliente desbloqueado{item.cardCode ? ` (${item.cardCode})` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </Surface>
        </Modal>
      </Portal>
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
  searchContainer: { padding: 15, backgroundColor: COLORS.primary },
  searchBar: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    height: 45
  },
  searchInput: { fontSize: 16, color: COLORS.text, minHeight: 0 },
  profileCard: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0A4D90',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  avatarIcon: {
    backgroundColor: 'rgba(255,255,255,0.26)'
  },
  profileTextWrap: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6
  },
  profileName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700'
  },
  roleChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.22)'
  },
  roleChipText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '700'
  },
  realtimeRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  realtimeOk: {
    backgroundColor: '#2ECC71'
  },
  realtimeErr: {
    backgroundColor: '#E74C3C'
  },
  realtimePending: {
    backgroundColor: '#F1C40F'
  },
  realtimeText: {
    fontSize: 10,
    color: '#EAF4FF'
  },
  bellWrap: {
    position: 'relative',
    marginRight: 2
  },
  bellBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#E74C3C',
    color: '#FFF'
  },
  errorText: { marginHorizontal: 15, marginTop: 12, color: '#E74C3C', fontSize: 13 },
  notificationsModalWrap: {
    marginHorizontal: 15,
    marginTop: 65
  },
  notificationsPanel: {
    maxHeight: 360,
    borderRadius: 14,
    backgroundColor: '#FFF'
  },
  notificationsPanelContent: {
    borderRadius: 14,
    overflow: 'hidden'
  },
  notificationsHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  notificationsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary
  },
  notificationsBody: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  notificationsEmpty: {
    color: COLORS.textLight,
    fontSize: 13
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7'
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 8,
    backgroundColor: COLORS.primary
  },
  notificationTextWrap: {
    flex: 1
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  notificationSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textLight
  },
  sheetBackground: { backgroundColor: '#FFF' },
  sheetHandle: { backgroundColor: '#CDD6E2' },
  sheetContent: { paddingHorizontal: 18, paddingBottom: 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
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
  sheetActions: { marginTop: 20, flexDirection: 'row', gap: 10 },
  sheetActionButton: { flex: 1, borderRadius: 10 }
});
