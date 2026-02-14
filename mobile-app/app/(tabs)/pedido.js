import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useCart } from '../../src/context/CartContext';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';

export default function Pedido() {
  const router = useRouter();
  const { cart, addToCart, removeFromCart, clearCart, getTotal } = useCart();

  const handleConfirmarPedido = () => {
    if (cart.length === 0) {
      Alert.alert('Carrito Vacío', 'Debes agregar al menos un producto.');
      return;
    }

    // Aquí es donde en el futuro enviaremos a Supabase/SAP
    Alert.alert(
      'Confirmar Pedido',
      `¿Deseas enviar este pedido por un total de $${getTotal().toFixed(2)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: () => {
            Alert.alert('Éxito', 'Pedido enviado correctamente (Simulación)');
            clearCart();
            router.replace('/clientes'); // Regresamos al inicio
        }}
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={[styles.cartItem, GLOBAL_STYLES.shadow]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.ItemName}</Text>
        <Text style={styles.itemPrice}>Unitario: ${parseFloat(item.Price).toFixed(2)}</Text>
        <Text style={styles.itemSubtotal}>Subtotal: ${(item.Price * item.quantity).toFixed(2)}</Text>
      </View>

      <View style={styles.quantityControls}>
        <TouchableOpacity style={styles.btnQty} onPress={() => removeFromCart(item.ItemCode)}>
          <Text style={styles.btnQtyText}>-</Text>
        </TouchableOpacity>
        
        <Text style={styles.quantityText}>{item.quantity}</Text>
        
        <TouchableOpacity style={styles.btnQty} onPress={() => addToCart(item)}>
          <Text style={styles.btnQtyText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Resumen de Pedido' }} />

      {cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>El carrito está vacío</Text>
          <TouchableOpacity 
            style={[GLOBAL_STYLES.buttonPrimary, { marginTop: 20 }]}
            onPress={() => router.push('/catalogo')} // Forzamos ir a catálogo
>
            <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Ir al Catálogo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={cart}
            keyExtractor={(item) => item.ItemCode}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 15 }}
          />

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL PEDIDO:</Text>
              <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.btnCancel} 
                onPress={() => {
                  Alert.alert('Vaciar', '¿Borrar todo el carrito?', [
                    { text: 'No' },
                    { text: 'Sí', onPress: clearCart }
                  ]);
                }}
              >
                <Text style={styles.btnCancelText}>VACIAR</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[GLOBAL_STYLES.buttonPrimary, styles.btnConfirm]} 
                onPress={handleConfirmarPedido}
              >
                <Text style={styles.btnConfirmText}>CONFIRMAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  cartItem: { 
    backgroundColor: '#FFF', 
    padding: 15, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10 
  },
  itemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  itemPrice: { fontSize: 12, color: COLORS.textLight },
  itemSubtotal: { fontSize: 13, fontWeight: 'bold', color: COLORS.secondary, marginTop: 4 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 20, padding: 5 },
  btnQty: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  btnQtyText: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  quantityText: { marginHorizontal: 15, fontWeight: 'bold', fontSize: 16 },
  footer: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  totalValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  btnCancel: { flex: 1, padding: 15, alignItems: 'center', marginRight: 10 },
  btnCancelText: { color: COLORS.secondary, fontWeight: 'bold' },
  btnConfirm: { flex: 2 },
  btnConfirmText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: COLORS.textLight }
});