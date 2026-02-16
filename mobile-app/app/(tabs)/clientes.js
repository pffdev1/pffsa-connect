import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Avatar, Button, Chip, Searchbar, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { supabase } from '../../src/services/supabaseClient';
import { useCart } from '../../src/context/CartContext';
import { COLORS } from '../../src/constants/theme';
import CustomerGrid from '../../src/components/CustomerGrid';

const PAGE_SIZE = 50;
const MIN_SKELETON_MS = 700;
const SEARCH_DEBOUNCE_MS = 280;
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

export default function Clientes() {
  const [clientes, setClientes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [profile, setProfile] = useState(null);
  const isMounted = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const hasInitializedSearchRef = useRef(false);
  const detailsSheetRef = useRef(null);
  const snapPoints = useMemo(() => ['83%'], []);
  const router = useRouter();
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
          .single();

        if (profileError) throw profileError;

        const nextProfile = {
          fullName: (p?.full_name || '').trim(),
          role: (p?.role || 'vendedor').trim().toLowerCase()
        };

        if (nextProfile.role !== 'admin' && !nextProfile.fullName) {
          throw new Error('Perfil sin nombre de vendedor');
        }

        if (!isMounted.current) return;
        setProfile(nextProfile);
        setClientes(null);
        setHasMore(true);

        let query = supabase
          .from('customers')
          .select('*')
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
      } catch (_error) {
        if (!isMounted.current) return;
        setErrorMsg('No se pudo cargar tu perfil. Contacta a IT.');
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
      const normalizedSearch = sanitizeSearchTerm(searchTerm);

      let query = supabase
        .from('customers')
        .select('*')
        .not('Nivel', 'ilike', 'EMPLEADOS')
        .order('CardName', { ascending: true })
        .order('CardCode', { ascending: true })
        .order('Nivel', { ascending: true })
        .range(from, to);

      if (currentProfile.role !== 'admin') {
        query = query.eq('Vendedor', normalizeSellerName(currentProfile.fullName));
      }
      if (normalizedSearch) {
        const likeTerm = `%${normalizedSearch}%`;
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

      const nuevos = data || [];
      setClientes((prev) => (reset ? nuevos : [...(prev || []), ...nuevos]));
      setHasMore(nuevos.length === PAGE_SIZE);
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

  const openClientInfo = (item) => {
    setSelectedClient(item);
    detailsSheetRef.current?.present();
  };

  const closeClientInfo = () => {
    detailsSheetRef.current?.dismiss();
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
          <Surface style={styles.profileSurface} elevation={2}>
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
            </View>
            <Button mode="text" compact textColor="#EAF4FF" onPress={() => router.push('/perfil')}>
              Perfil
            </Button>
          </Surface>
        )}
      </View>

      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <CustomerGrid
        data={clientes}
        onPressCustomer={(item) =>
          router.push({
            pathname: '/catalogo',
            params: {
              cardCode: item.CardCode,
              cardName: item.CardFName || item.CardName
            }
          })
        }
        onPressInfo={openClientInfo}
        onEndReached={handleLoadMore}
        loadingMore={loadingMore}
        hasMore={hasMore}
        emptyText={search ? `No se encontraron clientes para "${search}"` : 'No hay clientes disponibles'}
      />

      <BottomSheetModal
        ref={detailsSheetRef}
        index={0}
        snapPoints={snapPoints}
        onDismiss={() => setSelectedClient(null)}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Ficha del Cliente</Text>
            <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
          </View>

          {selectedClient && (
            <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280 }}>
              <Surface style={styles.sheetHero} elevation={1}>
                <Avatar.Icon size={42} icon="domain" color="#FFF" style={styles.sheetAvatar} />
                <View style={styles.sheetHeroText}>
                  <Text style={styles.sheetHeroName}>{selectedClient.CardFName || selectedClient.CardName || 'Cliente'}</Text>
                  <Chip compact style={styles.sheetHeroChip} textStyle={styles.sheetHeroChipText}>
                    {selectedClient.CardCode || 'Sin codigo'}
                  </Chip>
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
                <DetailRow
                  icon="wallet-outline"
                  label="Balance Actual"
                  value={hasValidBalance ? `$${balanceValue.toFixed(2)}` : 'No disponible'}
                  color={hasValidBalance ? (balanceValue > 0 ? '#E74C3C' : '#27AE60') : COLORS.textLight}
                />
              </View>
            </MotiView>
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
                router.push({
                  pathname: '/catalogo',
                  params: { cardCode: c.CardCode, cardName: c.CardFName || c.CardName }
                });
              }}
            >
              LEVANTAR PEDIDO
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
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
  profileSurface: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)'
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
  errorText: { marginHorizontal: 15, marginTop: 12, color: '#E74C3C', fontSize: 13 },
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
