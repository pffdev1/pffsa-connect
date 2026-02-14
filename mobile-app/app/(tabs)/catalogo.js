import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext'; // IMPORTANTE

export default function Catalogo() {
  const { cardCode, listNum } = useLocalSearchParams();
  const router = useRouter();
  const { addToCart, cart } = useCart(); // Usamos el carrito
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchProductos(); }, []);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('productos').select('*');
      if (error) throw error;
      setItems(data || []);
      setFilteredItems(data || []);
    } catch (error) { console.error(error.message); }
    finally { setLoading(false); }
  };

  const handleSearch = (text) => {
    setSearch(text);
    const filtered = items.filter(i => 
      i.ItemName.toLowerCase().includes(text.toLowerCase()) || i.ItemCode.toLowerCase().includes(text.toLowerCase())
    );
    setFilteredItems(filtered);
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Catálogo',
        headerRight: () => (
          <TouchableOpacity 
            style={styles.cartHeaderBtn} 
            onPress={() => router.push('/pedido')}
          >
            <Text style={styles.cartBadgeText}>🛒 {cartCount}</Text>
          </TouchableOpacity>
        )
      }} />

      <View style={styles.clientSubHeader}>
        <Text style={styles.clientText}>Cliente: {cardCode} | Lista: {listNum}</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput style={GLOBAL_STYLES.input} placeholder="Buscar producto..." onChangeText={handleSearch} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList 
          data={filteredItems}
          keyExtractor={item => item.ItemCode}
          renderItem={({item}) => (
            <View style={[styles.productCard, GLOBAL_STYLES.shadow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemCode}>{item.ItemCode}</Text>
                <Text style={styles.itemName}>{item.ItemName}</Text>
                <Text style={styles.itemPrice}>${parseFloat(item.Price).toFixed(2)}</Text>
              </View>
              <TouchableOpacity 
                style={styles.btnAdd} 
                onPress={() => addToCart(item)}
              >
                <Text style={styles.btnAddText}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  clientSubHeader: { backgroundColor: '#e1e8f0', padding: 8, alignItems: 'center' },
  clientText: { fontSize: 12, color: COLORS.primary, fontWeight: 'bold' },
  searchContainer: { padding: 15, backgroundColor: COLORS.primary },
  productCard: { backgroundColor: COLORS.white, marginHorizontal: 12, marginTop: 10, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  itemCode: { fontSize: 10, color: COLORS.secondary, fontWeight: 'bold' },
  itemName: { fontSize: 15, color: COLORS.primary, fontWeight: 'bold' },
  itemPrice: { fontSize: 16, fontWeight: '600' },
  btnAdd: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  btnAddText: { color: COLORS.white, fontSize: 24, fontWeight: 'bold' },
  cartHeaderBtn: { marginRight: 15, backgroundColor: COLORS.secondary, padding: 8, borderRadius: 20 },
  cartBadgeText: { color: COLORS.white, fontWeight: 'bold' }
});