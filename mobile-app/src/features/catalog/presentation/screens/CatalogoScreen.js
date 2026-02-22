import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Badge, Button, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../../shared/infrastructure/supabaseClient';
import { getCachedJson, setCachedJson } from '../../../../shared/infrastructure/offlineService';
import { APP_LAYOUT, COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import { useCart } from '../../../../shared/state/cart/CartContext';
import ProductGrid from '../../../../components/ProductGrid';

const MIN_SKELETON_MS = 650;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 260;
const QUERY_TIMEOUT_MS = 12000;
const CATALOG_RESET_ON_FOCUS_KEY = 'catalog:reset-client-on-focus:v1';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitizeSearchTerm = (value = '') =>
  value
    .trim()
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ');
const buildTimeoutError = () => {
  const timeoutError = new Error('Catalog query timeout');
  timeoutError.code = 'REQUEST_TIMEOUT';
  timeoutError.status = 408;
  return timeoutError;
};
const withTimeout = (promise, timeoutMs = QUERY_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(buildTimeoutError()), timeoutMs))
  ]);
const isConnectionLikeError = (error) => {
  const raw = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    String(error?.code || '').trim().toUpperCase() === 'REQUEST_TIMEOUT' ||
    raw.includes('timeout') ||
    raw.includes('timed out') ||
    raw.includes('network request failed') ||
    raw.includes('failed to fetch') ||
    raw.includes('offline')
  );
};
// PriceSource priority: card-specific offer > list-level offer > base price.
const PRICE_SOURCE_PRIORITY = {
  CARDCODE_OFFER: 3,
  LISTNUM_OFFER: 2,
  BASE_PRICE: 1
};

const getPriceSourcePriority = (source) => PRICE_SOURCE_PRIORITY[String(source || '').trim()] || 0;
const parsePrice = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeCatalogRows = (rows = []) => {
  const byItemCode = new Map();

  rows.forEach((row) => {
    const itemCode = String(row?.ItemCode || '').trim();
    if (!itemCode) return;

    const candidate = {
      ...row,
      ItemCode: itemCode,
      Price: parsePrice(row?.Price)
    };

    const current = byItemCode.get(itemCode);
    if (!current) {
      byItemCode.set(itemCode, candidate);
      return;
    }

    const currentPriority = getPriceSourcePriority(current.PriceSource);
    const candidatePriority = getPriceSourcePriority(candidate.PriceSource);
    const shouldReplace =
      candidatePriority > currentPriority ||
      (candidatePriority === currentPriority && candidate.Price > 0 && current.Price <= 0);

    if (shouldReplace) {
      byItemCode.set(itemCode, candidate);
    }
  });

  return Array.from(byItemCode.values());
};

export default function Catalogo() {
  const { cardCode, cardName, zona, idRuta } = useLocalSearchParams();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { addToCart, cart } = useCart();
  const safeCardCode = String(Array.isArray(cardCode) ? cardCode[0] : cardCode || '').trim();
  const safeCardName = String(Array.isArray(cardName) ? cardName[0] : cardName || '').trim();
  const safeZona = String(Array.isArray(zona) ? zona[0] : zona || '').trim();
  const safeIdRuta = String(Array.isArray(idRuta) ? idRuta[0] : idRuta || '').trim();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [nextFrom, setNextFrom] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gridEpoch, setGridEpoch] = useState(0);
  const pendingClientSwitchRef = useRef('');

  useEffect(() => {
    setIsSearchLoading(true);
    const timeout = setTimeout(() => {
      setDebouncedSearch(sanitizeSearchTerm(search));
      setIsSearchLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (isFocused || (!search && !debouncedSearch)) return;
    setSearch('');
    setDebouncedSearch('');
    setIsSearchLoading(false);
  }, [isFocused, search, debouncedSearch]);

  useEffect(() => {
    if (!isFocused) return;
    setItems((prev) => (Array.isArray(prev) ? [...prev] : prev));
    setGridEpoch((prev) => prev + 1);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    const applyPendingCatalogReset = async () => {
      try {
        const shouldReset = await AsyncStorage.getItem(CATALOG_RESET_ON_FOCUS_KEY);
        if (cancelled || shouldReset !== '1') return;
        await AsyncStorage.removeItem(CATALOG_RESET_ON_FOCUS_KEY);
        if (cancelled) return;

        router.setParams({
          cardCode: '',
          cardName: '',
          zona: '',
          idRuta: ''
        });
        setSearch('');
        setDebouncedSearch('');
        setItems(null);
        setNextFrom(0);
        setHasMore(true);
      } catch (_error) {
        // Ignore storage errors; fallback is keeping current route params.
      }
    };

    applyPendingCatalogReset();
    return () => {
      cancelled = true;
    };
  }, [isFocused, router]);

  const fetchProductos = useCallback(
    async ({ reset = false, searchTerm = debouncedSearch, showConnectionAlert = false } = {}) => {
      if (!safeCardCode || (!reset && (!hasMore || loadingMore))) return;

      const startedAt = Date.now();
      const from = reset ? 0 : nextFrom;
      const to = from + PAGE_SIZE - 1;
      const normalizedSearch = sanitizeSearchTerm(searchTerm);

      if (reset) {
        setItems(null);
      } else {
        setLoadingMore(true);
      }

      try {
        let query = supabase
          .from('vw_catalogo_cliente')
          .select(
            `
              ItemCode,
              ItemName,
              Marca,
              UOM,
              Price,
              PriceSource,
              CardCode,
              Url
            `
          )
          .eq('CardCode', safeCardCode);

        if (normalizedSearch) {
          const likeTerm = `%${normalizedSearch}%`;
          query = query.or(`ItemName.ilike.${likeTerm},ItemCode.ilike.${likeTerm},Marca.ilike.${likeTerm}`);
        }

        query = query.order('ItemCode', { ascending: true }).range(from, to);

        let { data, error } = await withTimeout(query);
        if (error && String(error.message || '').toLowerCase().includes('pricesource')) {
          query = supabase
            .from('vw_catalogo_cliente')
            .select(
              `
                ItemCode,
                ItemName,
                Marca,
                UOM,
                Price,
                CardCode,
                Url
              `
            )
            .eq('CardCode', safeCardCode);
          if (normalizedSearch) {
            const likeTerm = `%${normalizedSearch}%`;
            query = query.or(`ItemName.ilike.${likeTerm},ItemCode.ilike.${likeTerm},Marca.ilike.${likeTerm}`);
          }
          query = query.order('ItemCode', { ascending: true }).range(from, to);
          ({ data, error } = await withTimeout(query));
        }

        if (error) throw error;

        const rawChunk = data || [];
        const chunk = normalizeCatalogRows(rawChunk);
        const elapsed = Date.now() - startedAt;
        if (reset && elapsed < MIN_SKELETON_MS) {
          await wait(MIN_SKELETON_MS - elapsed);
        }

        setItems((prev) => normalizeCatalogRows(reset ? chunk : [...(prev || []), ...chunk]));
        setHasMore(rawChunk.length === PAGE_SIZE);
        setNextFrom(from + rawChunk.length);
        if (reset && !normalizedSearch) {
          await setCachedJson(`offline:catalogo:first_page:${safeCardCode}`, chunk);
        }
      } catch (error) {
        console.error('Error cargando productos:', error.message);
        if (reset) {
          const cached = await getCachedJson(`offline:catalogo:first_page:${safeCardCode}`, []);
          if (Array.isArray(cached) && cached.length > 0) {
            setItems(cached);
            setHasMore(false);
            if (showConnectionAlert && isConnectionLikeError(error)) {
              Alert.alert(
                'Problemas de conexion',
                'No pudimos actualizar el catalogo. Se mostrara la ultima informacion cargada. Intenta nuevamente mas tarde.'
              );
            }
          } else {
            setItems([]);
            if (showConnectionAlert && isConnectionLikeError(error)) {
              Alert.alert(
                'Problemas de conexion',
                'No pudimos actualizar el catalogo y no hay datos en cache. Intenta nuevamente mas tarde.'
              );
            }
          }
        }
      } finally {
        setLoadingMore(false);
      }
    },
    [safeCardCode, nextFrom, hasMore, loadingMore, debouncedSearch]
  );

  useEffect(() => {
    if (!safeCardCode) return;
    setNextFrom(0);
    setHasMore(true);
    fetchProductos({ reset: true, searchTerm: debouncedSearch });
    // `fetchProductos` depends on pagination state; this reset must only run on client/search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCardCode, debouncedSearch]);

  const cartCount = cart.length;
  useEffect(() => {
    const uniqueCartCardCodes = Array.from(
      new Set(cart.map((item) => String(item?.CardCode || '').trim()).filter(Boolean))
    );
    if (uniqueCartCardCodes.length <= 1) {
      pendingClientSwitchRef.current = uniqueCartCardCodes[0] || '';
    }
  }, [cart]);

  const cartItemCodesForClient = useMemo(() => {
    const set = new Set();
    cart.forEach((item) => {
      if (String(item?.CardCode || '').trim() !== safeCardCode) return;
      const code = String(item?.ItemCode || '').trim();
      if (code) set.add(code);
    });
    return set;
  }, [cart, safeCardCode]);
  const handleAddToCart = useCallback(
    (item, quantityToAdd = 1) => {
      const nextCardCode = String(safeCardCode || '').trim();
      const hasDifferentClientItems = cart.some((cartItem) => String(cartItem?.CardCode || '').trim() !== nextCardCode);
      const switchAlreadyConfirmed = pendingClientSwitchRef.current === nextCardCode;
      const addItem = () =>
        addToCart({
          ...item,
          CardCode: nextCardCode,
          CustomerName: safeCardName,
          Zona: safeZona,
          IdRuta: safeIdRuta,
          quantity: quantityToAdd
        });

      if (hasDifferentClientItems && nextCardCode && !switchAlreadyConfirmed) {
        Alert.alert(
          'Cambiar cliente',
          'Tu carrito tiene productos de otro cliente. Si continuas, se vaciara el carrito actual.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Continuar',
              style: 'destructive',
              onPress: () => {
                pendingClientSwitchRef.current = nextCardCode;
                addItem();
              }
            }
          ]
        );
        return;
      }

      addToCart({
        ...item,
        CardCode: nextCardCode,
        CustomerName: safeCardName,
        Zona: safeZona,
        IdRuta: safeIdRuta,
        quantity: quantityToAdd
      });
    },
    [addToCart, cart, safeCardCode, safeCardName, safeZona, safeIdRuta]
  );
  const handleLoadMore = useCallback(() => {
    fetchProductos({ reset: false, searchTerm: debouncedSearch });
  }, [fetchProductos, debouncedSearch]);
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setNextFrom(0);
      setHasMore(true);
      await fetchProductos({ reset: true, searchTerm: debouncedSearch, showConnectionAlert: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchProductos, debouncedSearch]);
  const handleOpenPedido = useCallback(() => {
    router.push('/pedido');
  }, [router]);
  const catalogScreenOptions = useMemo(
    () => ({
      headerShown: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: COLORS.background, height: APP_LAYOUT.HEADER_HEIGHT }
    }),
    []
  );
  const emptyCatalogScreenOptions = useMemo(
    () => ({
      headerShown: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: COLORS.background, height: APP_LAYOUT.HEADER_HEIGHT }
    }),
    []
  );
  if (!safeCardCode) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <Stack.Screen options={emptyCatalogScreenOptions} />
        <LinearGradient colors={['#0A2952', '#0E3D75', '#1664A0']} style={styles.emptyWrap}>
          <View style={styles.emptyPanel}>
            <View style={styles.emptyIcon}>
              <Ionicons name="storefront-outline" size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Selecciona un cliente para empezar</Text>
            <Text style={styles.emptySub}>El catalogo se personaliza por cliente para mostrar precios y productos disponibles.</Text>
            <Button mode="contained" onPress={() => router.push('/clientes')} style={styles.emptyBtn} buttonColor={COLORS.primary}>
              VER CLIENTES
            </Button>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Stack.Screen options={catalogScreenOptions} />

      <LinearGradient colors={['#0F3C73', '#165A97']} style={[styles.topPanel, GLOBAL_STYLES.shadow]}>
        <View style={styles.clientInfoRow}>
          <View style={styles.clientInfoBanner}>
          <View style={styles.clientAvatar}>
            <Ionicons name="business-outline" size={16} color="#FFF" />
          </View>
          <View style={styles.clientTextWrap}>
            <Text style={styles.clientNameText} numberOfLines={2}>
              {safeCardName || 'Cliente Seleccionado'}
            </Text>
          <Text style={styles.clientCodeText}>{safeCardCode}</Text>
          </View>
          </View>
          <Pressable onPress={handleOpenPedido} style={styles.cartFloatingBtn}>
            <Ionicons name="cart-outline" size={20} color="#FFF" />
            {cartCount > 0 && <Badge style={styles.badge}>{cartCount}</Badge>}
          </Pressable>
        </View>

        <Searchbar
          placeholder="Buscar por codigo, nombre o marca..."
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={COLORS.textLight}
          placeholderTextColor="#999"
        />
      </LinearGradient>

      <ProductGrid
        key={`catalog-grid-${safeCardCode}-${gridEpoch}`}
        data={isSearchLoading ? null : items}
        onAdd={handleAddToCart}
        selectedItemCodes={cartItemCodesForClient}
        onEndReached={handleLoadMore}
        loadingMore={loadingMore}
        hasMore={hasMore}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        emptyText="No se encontraron productos."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topPanel: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16
  },
  clientInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  clientInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10
  },
  clientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  clientTextWrap: { marginLeft: 10, flex: 1 },
  clientNameText: { color: '#FFF', fontWeight: '700', fontSize: 13, lineHeight: 17 },
  clientCodeText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  searchBar: { backgroundColor: '#FFF', borderRadius: 12, height: 46 },
  searchInput: { fontSize: 14, color: COLORS.text, minHeight: 0 },
  cartFloatingBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)'
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -4,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.2,
    borderColor: '#0F3C73'
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  emptyPanel: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center'
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#EAF1FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center'
  },
  emptySub: {
    marginTop: 10,
    color: COLORS.textLight,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22
  },
  emptyBtn: {
    marginTop: 18,
    borderRadius: 12,
    width: '100%'
  }
});
