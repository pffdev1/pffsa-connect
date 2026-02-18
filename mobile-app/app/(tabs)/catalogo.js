import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Badge, Button, Card, IconButton, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import ProductGrid from '../../src/components/ProductGrid';

const MIN_SKELETON_MS = 650;
const PAGE_SIZE = 80;
const SEARCH_DEBOUNCE_MS = 260;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitizeSearchTerm = (value = '') =>
  value
    .trim()
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ');
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
  const { addToCart, clearCart, cart } = useCart();
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

  const fetchProductos = useCallback(
    async ({ reset = false, searchTerm = debouncedSearch } = {}) => {
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

        let { data, error } = await query;
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
          ({ data, error } = await query);
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
      } catch (error) {
        console.error('Error cargando productos:', error.message);
        if (reset) setItems([]);
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

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const currentCartCardCode = String(cart?.[0]?.CardCode || '').trim();
  const handleAddToCart = useCallback(
    (item, quantityToAdd = 1) => {
      const nextCardCode = String(safeCardCode || '').trim();
      const addItem = () =>
        addToCart({
          ...item,
          CardCode: nextCardCode,
          CustomerName: safeCardName,
          Zona: safeZona,
          IdRuta: safeIdRuta,
          quantity: quantityToAdd
        });

      if (currentCartCardCode && nextCardCode && currentCartCardCode !== nextCardCode) {
        Alert.alert(
          'Cambiar cliente',
          'Tu carrito tiene productos de otro cliente. Si continuas, se vaciara el carrito actual.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Continuar',
              style: 'destructive',
              onPress: () => {
                clearCart();
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
    [addToCart, clearCart, currentCartCardCode, safeCardCode, safeCardName, safeZona, safeIdRuta]
  );
  const handleLoadMore = useCallback(() => {
    fetchProductos({ reset: false, searchTerm: debouncedSearch });
  }, [fetchProductos, debouncedSearch]);
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setNextFrom(0);
      setHasMore(true);
      await fetchProductos({ reset: true, searchTerm: debouncedSearch });
    } finally {
      setRefreshing(false);
    }
  }, [fetchProductos, debouncedSearch]);
  if (!safeCardCode) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Catalogo' }} />
        <LinearGradient colors={['#0A2952', '#0E3D75', '#1664A0']} style={styles.emptyWrap}>
          <Animated.View entering={FadeInDown.duration(400).springify().damping(18)}>
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyCardContent}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="storefront-outline" size={34} color={COLORS.primary} />
                </View>
                <Text style={styles.emptyTitle}>Selecciona un cliente para empezar</Text>
                <Text style={styles.emptySub}>
                  El catalogo se personaliza por cliente para mostrar precios y productos disponibles.
                </Text>
                <Button mode="contained" onPress={() => router.push('/clientes')} style={styles.emptyBtn} buttonColor={COLORS.primary}>
                  VER CLIENTES
                </Button>
              </Card.Content>
            </Card>
          </Animated.View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Catalogo',
          headerRight: () => (
            <View style={styles.cartHeaderWrap}>
              <IconButton
                icon="cart-outline"
                iconColor="#FFF"
                size={24}
                onPress={() => router.push('/pedido')}
                style={styles.cartBtnHeader}
              />
              {cartCount > 0 && <Badge style={styles.badge}>{cartCount}</Badge>}
            </View>
          )
        }}
      />

      <LinearGradient colors={['#0F3C73', '#165A97']} style={styles.topPanel}>
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
        data={isSearchLoading ? null : items}
        onAdd={handleAddToCart}
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
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20
  },
  clientInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
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
  cartHeaderWrap: { marginRight: 8, justifyContent: 'center' },
  cartBtnHeader: { margin: 0 },
  badge: {
    position: 'absolute',
    right: 2,
    top: 1,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: COLORS.primary
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  emptyCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.98)'
  },
  emptyCardContent: { alignItems: 'center', paddingVertical: 22 },
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
