import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Button, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/services/supabaseClient';
import { useCart } from '../../src/context/CartContext';
import { COLORS } from '../../src/constants/theme';
import CustomerGrid from '../../src/components/CustomerGrid';

const PAGE_SIZE = 50;
const MIN_SKELETON_MS = 700;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const [selectedClient, setSelectedClient] = useState(null);
  const [profile, setProfile] = useState(null);
  const isMounted = useRef(true);
  const isLoadingMoreRef = useRef(false);
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

  const fetchClientes = async (reset = false, currentProfile = profile) => {
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

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore || !profile || !Array.isArray(clientes)) return;
    fetchClientes(false);
  };

  const openClientInfo = (item) => {
    setSelectedClient(item);
    detailsSheetRef.current?.present();
  };

  const closeClientInfo = () => {
    detailsSheetRef.current?.dismiss();
  };

  const clientesFiltrados = Array.isArray(clientes)
    ? clientes.filter((c) => {
        const nivel = (c.Nivel || '').trim().toUpperCase();
        if (nivel === 'EMPLEADOS') return false;

        const s = search.toLowerCase();
        const nombreLegal = (c.CardName || '').toLowerCase();
        const nombreComercial = (c.CardFName || '').toLowerCase();
        const codigo = (c.CardCode || '').toLowerCase();
        const ruc = (c.RUC || '').toLowerCase();

        return nombreLegal.includes(s) || nombreComercial.includes(s) || codigo.includes(s) || ruc.includes(s);
      })
    : null;

  const balanceValue = Number(selectedClient?.Balance);
  const hasValidBalance = Number.isFinite(balanceValue);

  return (
    <SafeAreaView style={styles.container}>
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
          <TouchableOpacity style={styles.profileBanner} onPress={() => router.push('/perfil')}>
            <Ionicons name="person-circle-outline" size={20} color="#FFF" />
            <Text style={styles.profileRole}>{profile.role === 'admin' ? 'Admin' : 'Vendedor'}</Text>
            <Text style={styles.profileName}>{profile.fullName || 'Sin nombre'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      <CustomerGrid
        data={clientesFiltrados}
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
            <View style={styles.sheetBody}>
              <DetailRow label="Razon Social" value={selectedClient.CardName} />
              <DetailRow label="Nombre Comercial" value={selectedClient.CardFName} />
              <DetailRow label="RUC / DV" value={`${selectedClient.RUC} - ${selectedClient.DV}`} />
              <DetailRow label="Vendedor" value={selectedClient.Vendedor} />
              <DetailRow label="Ruta / Zona" value={`${selectedClient.Ruta} (${selectedClient.Zona})`} />
              <DetailRow label="Dia de Entrega" value={selectedClient.DiasEntrega} />
              <DetailRow
                label="Balance Actual"
                value={hasValidBalance ? `$${balanceValue.toFixed(2)}` : 'No disponible'}
                color={hasValidBalance ? (balanceValue > 0 ? '#E74C3C' : '#27AE60') : COLORS.textLight}
              />
              <DetailRow label="Direccion de Entrega" value={selectedClient.Direccion} />
              <DetailRow label="Horario de Atencion" value={selectedClient.Horario} />
            </View>
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

const DetailRow = ({ label, value, color = COLORS.text }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, { color }]}>{value || 'No disponible'}</Text>
  </View>
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
  profileBanner: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  profileRole: {
    marginLeft: 6,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700'
  },
  profileName: {
    marginLeft: 8,
    color: '#DDE7F3',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1
  },
  errorText: { marginHorizontal: 15, marginTop: 12, color: '#E74C3C', fontSize: 13 },
  sheetBackground: { backgroundColor: '#FFF' },
  sheetHandle: { backgroundColor: '#CDD6E2' },
  sheetContent: { paddingHorizontal: 18, paddingBottom: 24 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  sheetBody: { gap: 12 },
  detailRow: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 6 },
  detailLabel: { fontSize: 10, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  sheetActions: { marginTop: 20, flexDirection: 'row', gap: 10 },
  sheetActionButton: { flex: 1, borderRadius: 10 }
});
