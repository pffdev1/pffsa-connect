import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, IconButton, Searchbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import ProductGrid from '../../src/components/ProductGrid';

const MIN_SKELETON_MS = 700;
const PAGE_SIZE = 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Catalogo() {
  const { cardCode, cardName } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart, cart } = useCart();
  const safeCardCode = String(Array.isArray(cardCode) ? cardCode[0] : cardCode || '').trim();

  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');

  const fetchProductos = useCallback(async () => {
    const startedAt = Date.now();

    try {
      if (!safeCardCode) {
        setItems([]);
        return;
      }

      let from = 0;
      let hasMore = true;
      const allRows = [];

      while (hasMore) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('vw_catalogo_cliente')
          .select(`
            ItemCode,
            ItemName,
            Marca,
            Price,
            CardCode,
            Url
          `)
          .eq('CardCode', safeCardCode)
          .order('ItemCode', { ascending: true })
          .range(from, to);

        if (error) throw error;

        const chunk = data || [];
        allRows.push(...chunk);
        hasMore = chunk.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SKELETON_MS) {
        await wait(MIN_SKELETON_MS - elapsed);
      }

      setItems(allRows);
    } catch (error) {
      console.error('Error cargando productos:', error.message);
      setItems([]);
    }
  }, [safeCardCode]);

  useEffect(() => {
    if (safeCardCode) fetchProductos();
  }, [safeCardCode, fetchProductos]);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  if (!safeCardCode) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Catalogo' }} />
        <Ionicons name="people-circle-outline" size={100} color={COLORS.textLight} />
        <Text style={styles.noClientTitle}>Sin Cliente Seleccionado</Text>
        <Text style={styles.noClientSub}>
          Debes elegir un cliente en el directorio para ver sus precios y catálogo.
        </Text>
        <Button
          mode="contained"
          buttonColor={COLORS.primary}
          style={styles.noClientButton}
          onPress={() => router.push('/clientes')}
        >
          IR A CLIENTES
        </Button>
      </View>
    );
  }

  const filteredItems =
    Array.isArray(items)
      ? items.filter((i) => {
          const name = String(i.ItemName || '').toLowerCase();
          const code = String(i.ItemCode || '').toLowerCase();
          const q = search.toLowerCase();
          return name.includes(q) || code.includes(q);
        })
      : null;

  return (
    <SafeAreaView style={styles.container}>
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

      <View style={styles.clientInfoBanner}>
        <Ionicons name="person" size={16} color="#FFF" style={styles.clientIcon} />
        <View style={styles.clientTextWrap}>
          <Text style={styles.clientNameText} numberOfLines={2}>
            {cardName || 'Cliente Seleccionado'}
          </Text>
          <Text style={styles.clientCodeText}>{safeCardCode}</Text>
        </View>
      </View>

      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Ej: Queso manchego curado..."
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={COLORS.textLight}
          placeholderTextColor="#999"
        />
      </View>

      <ProductGrid
        data={filteredItems}
        onAdd={(item) =>
          addToCart({
            ...item,
            CardCode: safeCardCode,
            quantity: 1
          })
        }
        emptyText="No se encontraron productos."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFF'
  },
  noClientTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 20
  },
  noClientSub: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginVertical: 15,
    lineHeight: 20
  },
  noClientButton: { width: '80%', borderRadius: 10 },
  clientInfoBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    alignItems: 'flex-start'
  },
  clientIcon: { marginTop: 2 },
  clientTextWrap: { marginLeft: 8, flex: 1 },
  clientNameText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
    lineHeight: 17
  },
  clientCodeText: {
    color: '#FFF',
    fontSize: 11,
    opacity: 0.9,
    marginTop: 2
  },
  searchSection: {
    padding: 15,
    backgroundColor: COLORS.primary
  },
  searchBar: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    height: 45
  },
  searchInput: {
    fontSize: 15,
    color: COLORS.text,
    minHeight: 0
  },
  cartHeaderWrap: {
    marginRight: 8,
    justifyContent: 'center'
  },
  cartBtnHeader: { margin: 0 },
  badge: {
    position: 'absolute',
    right: 2,
    top: 1,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: COLORS.primary
  }
});
