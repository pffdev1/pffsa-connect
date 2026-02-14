import React, { useEffect, useState } from 'react';
import { 
  View, Text, FlatList, StyleSheet, TextInput, 
  TouchableOpacity, ActivityIndicator, SafeAreaView 
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../src/services/supabaseClient';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';
import { Ionicons } from '@expo/vector-icons';

export default function Catalogo() {
  const { cardCode, cardName } = useLocalSearchParams(); // Recibe datos del cliente seleccionado
  const router = useRouter();
  const { addToCart, cart } = useCart();
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Cargar productos al entrar si hay un cliente seleccionado
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
      console.error("Error cargando productos:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // PANTALLA DE BLOQUEO: Si no hay cliente seleccionado
  if (!cardCode) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Catálogo' }} />
        <Ionicons name="people-circle-outline" size={100} color={COLORS.textLight} />
        <Text style={styles.noClientTitle}>Sin Cliente Seleccionado</Text>
        <Text style={styles.noClientSub}>Debes elegir un cliente en el directorio para ver sus precios y catálogo.</Text>
        <TouchableOpacity 
          style={[GLOBAL_STYLES.buttonPrimary, { width: '80%' }]} 
          onPress={() => router.push('/clientes')}
        >
          <Text style={styles.btnText}>IR A CLIENTES</Text>
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
            <Ionicons name="cart" size={26} color="#FFF" />
            {cartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )
      }} />

      {/* Banner Informativo del Cliente Seleccionado */}
      <View style={styles.clientInfoBanner}>
        <Ionicons name="person" size={16} color="#FFF" />
        <Text style={styles.clientNameText} numberOfLines={1}>
          {cardName || 'Cliente Seleccionado'}
        </Text>
        <Text style={styles.clientCodeText}>({cardCode})</Text>
      </View>

      {/* Buscador con Placeholder de Ejemplo */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.textLight} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Ej: Queso manchego curado..."
            placeholderTextColor="#999"
            onChangeText={setSearch}
            value={search}
          />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ textAlign: 'center', marginTop: 10, color: COLORS.textLight }}>Cargando inventario SAP...</Text>
        </View>
      ) : (
        <FlatList 
          data={items.filter(i => 
            i.ItemName.toLowerCase().includes(search.toLowerCase()) ||
            i.ItemCode.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={item => item.ItemCode}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({item}) => (
            <View style={[styles.productCard, GLOBAL_STYLES.shadow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemCode}>{item.ItemCode}</Text>
                <Text style={styles.itemName}>{item.ItemName}</Text>
                <Text style={styles.itemPrice}>${parseFloat(item.Price).toFixed(2)}</Text>
              </View>
              
              <TouchableOpacity 
                style={styles.btnAdd} 
                onPress={() => addToCart({...item, CardCode: cardCode})}
              >
                <Ionicons name="add" size={26} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No se encontraron productos.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  noClientTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginTop: 20 },
  noClientSub: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginVertical: 15, lineHeight: 20 },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  // Banner de Cliente
  clientInfoBanner: { 
    flexDirection: 'row', 
    backgroundColor: COLORS.secondary, 
    paddingVertical: 8, 
    paddingHorizontal: 15, 
    alignItems: 'center',
    justifyContent: 'center'
  },
  clientNameText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 8, marginRight: 5 },
  clientCodeText: { color: '#FFF', fontSize: 11, opacity: 0.9 },

  // Buscador
  searchSection: { padding: 15, backgroundColor: COLORS.primary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 45
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: COLORS.text },

  // Tarjeta de Producto
  productCard: { 
    backgroundColor: '#FFF', 
    marginHorizontal: 15, 
    marginTop: 10, 
    padding: 15, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  itemCode: { fontSize: 10, color: COLORS.textLight, marginBottom: 2 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  itemPrice: { fontSize: 17, fontWeight: 'bold', color: COLORS.text },
  btnAdd: { 
    backgroundColor: COLORS.primary, 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center',
    elevation: 3
  },

  // Carrito Header & Badge
  cartBtnHeader: { marginRight: 15, padding: 5 },
  badge: { 
    position: 'absolute', 
    right: -2, 
    top: -2, 
    backgroundColor: COLORS.secondary, 
    borderRadius: 10, 
    minWidth: 18, 
    height: 18, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: COLORS.primary 
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textLight }
});