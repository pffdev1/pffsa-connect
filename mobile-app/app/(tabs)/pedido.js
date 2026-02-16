import React from 'react';
import { Alert, FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, IconButton } from 'react-native-paper';
import { useCart } from '../../src/context/CartContext';
import { COLORS, GLOBAL_STYLES } from '../../src/constants/theme';

export default function Pedido() {
  const router = useRouter();
  const { cart, addToCart, removeFromCart, clearCart, getTotal } = useCart();

  const handleConfirmarPedido = () => {
    if (cart.length === 0) {
      Alert.alert('Carrito Vacio', 'Debes agregar al menos un producto.');
      return;
    }

    Alert.alert('Confirmar Pedido', `Deseas enviar este pedido por un total de $${getTotal().toFixed(2)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: () => {
          Alert.alert('Exito', 'Pedido enviado correctamente (Simulacion)');
          clearCart();
          router.replace('/clientes');
        }
      }
    ]);
  };

  const renderItem = ({ item }) => (
    <Card style={[styles.cartItem, GLOBAL_STYLES.shadow]} mode="contained">
      <Card.Content style={styles.itemContent}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.ItemName}</Text>
          <Text style={styles.itemPrice}>Unitario: ${parseFloat(item.Price).toFixed(2)}</Text>
          <Text style={styles.itemSubtotal}>Subtotal: ${(item.Price * item.quantity).toFixed(2)}</Text>
        </View>

        <View style={styles.quantityControls}>
          <IconButton icon="minus" size={18} style={styles.iconBtn} onPress={() => removeFromCart(item.ItemCode)} />
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <IconButton icon="plus" size={18} style={styles.iconBtn} onPress={() => addToCart(item)} />
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Resumen de Pedido' }} />

      {cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>El carrito esta vacio</Text>
          <Button mode="contained" buttonColor={COLORS.primary} style={styles.emptyButton} onPress={() => router.push('/catalogo')}>
            Ir al Catalogo
          </Button>
        </View>
      ) : (
        <>
          <FlatList data={cart} keyExtractor={(item) => item.ItemCode} renderItem={renderItem} contentContainerStyle={styles.listContent} />

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL PEDIDO:</Text>
              <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
            </View>

            <View style={styles.actionButtons}>
              <Button
                mode="text"
                textColor={COLORS.secondary}
                style={styles.btnCancel}
                onPress={() => {
                  Alert.alert('Vaciar', 'Borrar todo el carrito?', [
                    { text: 'No' },
                    { text: 'Si', onPress: clearCart }
                  ]);
                }}
              >
                VACIAR
              </Button>
              <Button mode="contained" buttonColor={COLORS.primary} style={styles.btnConfirm} onPress={handleConfirmarPedido}>
                CONFIRMAR
              </Button>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { padding: 15 },
  cartItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 10
  },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary },
  itemPrice: { fontSize: 12, color: COLORS.textLight },
  itemSubtotal: { fontSize: 13, fontWeight: 'bold', color: COLORS.secondary, marginTop: 4 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', borderRadius: 20, paddingHorizontal: 2 },
  iconBtn: { margin: 0 },
  quantityText: { marginHorizontal: 10, fontWeight: 'bold', fontSize: 16 },
  footer: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  totalValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btnCancel: { flex: 1 },
  btnConfirm: { flex: 2, borderRadius: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 18, color: COLORS.textLight },
  emptyButton: { marginTop: 20, borderRadius: 8 }
});
