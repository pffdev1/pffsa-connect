import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import { Ionicons } from '@expo/vector-icons';

export default function Catalogo() {
  const { cardCode, cardName } = useLocalSearchParams(); // Recibimos datos del cliente
  const router = useRouter();
  const { addToCart, cart } = useCart();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (cardCode) fetchProductos();
  }, [cardCode]);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('productos').select('*');
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // ESTADO VACÍO: Si no hay cliente seleccionado
  if (!cardCode) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-add-outline" size={80} color={COLORS.textLight} />
        <Text style={styles.noClientText}>Primero debes seleccionar un cliente</Text>
        <TouchableOpacity 
          style={GLOBAL_STYLES.buttonPrimary} 
          onPress={() => router.push('/clientes')}
        >
          <Text style={{color: '#FFF', fontWeight: 'bold'}}>Ir a Clientes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ 
        title: 'Catálogo',
        headerRight: () => (
          <TouchableOpacity 
            style={styles.cartBtnHeader} 
            onPress={() => router.push('/pedido')}
          >
            <Ionicons name="cart" size={24} color="#FFF" />
            {cartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )
      }} />

      <View style={styles.clientBanner}>
        <Text style={styles.clientNameHeader}>🛒 Vendiendo a: {cardName}</Text>
        <Text style={styles.cardCodeHeader}>{cardCode}</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput 
          style={GLOBAL_STYLES.input} 
          placeholder="Buscar producto..." 
          onChangeText={setSearch} 
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList 
          data={items.filter(i => i.ItemName.toLowerCase().includes(search.toLowerCase()))}
          keyExtractor={item => item.ItemCode}
          renderItem={({item}) => (
            <View style={[styles.productCard, GLOBAL_STYLES.shadow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemCode}>{item.ItemCode}</Text>
                <Text style={styles.itemName}>{item.ItemName}</Text>
                <Text style={styles.itemPrice}>${parseFloat(item.Price).toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.btnAdd} onPress={() => addToCart({...item, CardCode: cardCode})}>
                <Ionicons name="add" size={24} color="#FFF" />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  noClientText: { fontSize: 16, color: COLORS.textLight, marginVertical: 20, textAlign: 'center' },
  clientBanner: { backgroundColor: COLORS.secondary, padding: 10, alignItems: 'center' },
  clientNameHeader: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  cardCodeHeader: { color: '#FFF', fontSize: 11, opacity: 0.8 },
  searchBox: { padding: 15, backgroundColor: COLORS.primary },
  productCard: { backgroundColor: '#FFF', marginHorizontal: 15, marginTop: 10, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  itemPrice: { fontSize: 16, fontWeight: 'bold', marginTop: 5 },
  itemCode: { fontSize: 10, color: COLORS.textLight },
  btnAdd: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cartBtnHeader: { marginRight: 15, padding: 5 },
  badge: { position: 'absolute', right: -5, top: -5, backgroundColor: COLORS.secondary, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' }
});