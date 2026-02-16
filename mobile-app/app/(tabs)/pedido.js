import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
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
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Resumen de Pedido' }} />

      {cart.length === 0 ? (
        <LinearGradient colors={['#0A2952', '#0E3D75', '#1664A0']} style={styles.emptyWrap}>
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360 }}>
            <Card style={styles.emptyCard}>
              <Card.Content style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="cart-outline" size={30} color={COLORS.primary} />
                </View>
                <Text style={styles.emptyTitle}>Tu carrito esta vacio</Text>
                <Text style={styles.emptyText}>Agrega productos del catalogo para crear un pedido y calcular el total automaticamente.</Text>
                <Button mode="contained" buttonColor={COLORS.primary} style={styles.emptyButton} onPress={() => router.push('/catalogo')}>
                  IR AL CATALOGO
                </Button>
              </Card.Content>
            </Card>
          </MotiView>
        </LinearGradient>
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
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyCard: { width: '100%', maxWidth: 520, borderRadius: 24, backgroundColor: '#FFF' },
  emptyContainer: { alignItems: 'center', paddingVertical: 20 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EAF1FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  emptyTitle: { fontSize: 22, color: COLORS.primary, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 14, color: COLORS.textLight, marginTop: 10, textAlign: 'center', lineHeight: 21 },
  emptyButton: { marginTop: 20, borderRadius: 10, width: '100%' }
});
