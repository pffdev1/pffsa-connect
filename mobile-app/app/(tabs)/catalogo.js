import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, IconButton, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import ProductGrid from '../../src/components/ProductGrid';

const MIN_SKELETON_MS = 650;
const PAGE_SIZE = 80;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Catalogo() {
  const { cardCode, cardName } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart, cart } = useCart();
  const safeCardCode = String(Array.isArray(cardCode) ? cardCode[0] : cardCode || '').trim();
  const safeCardName = String(Array.isArray(cardName) ? cardName[0] : cardName || '').trim();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [nextFrom, setNextFrom] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchProductos = useCallback(
    async ({ reset = false } = {}) => {
      if (!safeCardCode || (!reset && (!hasMore || loadingMore))) return;

      const startedAt = Date.now();
      const from = reset ? 0 : nextFrom;
      const to = from + PAGE_SIZE - 1;

      if (reset) {
        setItems(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const { data, error } = await supabase
          .from('vw_catalogo_cliente')
          .select(
            `
              ItemCode,
              ItemName,
              Marca,
              Price,
              CardCode,
              Url
            `
          )
          .eq('CardCode', safeCardCode)
          .order('ItemCode', { ascending: true })
          .range(from, to);

        if (error) throw error;

        const chunk = data || [];
        const elapsed = Date.now() - startedAt;
        if (reset && elapsed < MIN_SKELETON_MS) {
          await wait(MIN_SKELETON_MS - elapsed);
        }

        setItems((prev) => (reset ? chunk : [...(prev || []), ...chunk]));
        setHasMore(chunk.length === PAGE_SIZE);
        setNextFrom(from + chunk.length);
      } catch (error) {
        console.error('Error cargando productos:', error.message);
        if (reset) setItems([]);
      } finally {
        setLoadingMore(false);
      }
    },
    [safeCardCode, nextFrom, hasMore, loadingMore]
  );

  useEffect(() => {
    if (!safeCardCode) return;
    setNextFrom(0);
    setHasMore(true);
    fetchProductos({ reset: true });
    // `fetchProductos` depends on pagination state, this reset should only run when client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCardCode]);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((i) => {
      const name = String(i.ItemName || '').toLowerCase();
      const code = String(i.ItemCode || '').toLowerCase();
      const brand = String(i.Marca || '').toLowerCase();
      return name.includes(q) || code.includes(q) || brand.includes(q);
    });
  }, [items, search]);

  if (!safeCardCode) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Catalogo' }} />
        <LinearGradient colors={['#0A2952', '#0E3D75', '#1664A0']} style={styles.emptyWrap}>
          <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
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
          </MotiView>
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
        data={filteredItems}
        onAdd={(item) => addToCart({ ...item, CardCode: safeCardCode, quantity: 1 })}
        onEndReached={() => fetchProductos({ reset: false })}
        loadingMore={loadingMore}
        hasMore={hasMore}
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
