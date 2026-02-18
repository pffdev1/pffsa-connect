import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../src/constants/theme';
import { useCart } from '../../src/context/CartContext';

function CartTabIcon({ color, count }) {
  return (
    <View style={styles.cartIconWrap}>
      <Ionicons name="cart" size={26} color={color} />
      {count > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { cart } = useCart();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const cartItemCount = cart.reduce((acc, item) => {
    const qty = Number(item?.quantity);
    return acc + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: 'gray',
      headerStyle: { backgroundColor: COLORS.primary },
      headerTintColor: '#FFF',
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: COLORS.background },
      tabBarStyle: {
        backgroundColor: COLORS.background,
        borderTopColor: '#DDE5F0',
        borderTopWidth: 1,
        height: 56 + bottomInset,
        paddingBottom: bottomInset,
        paddingTop: 6
      }
    }}>
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarLabel: 'Clientes',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="catalogo"
        options={{
          title: 'Catálogo',
          tabBarLabel: 'Productos',
          tabBarIcon: ({ color }) => <Ionicons name="list" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pedido"
        options={{
          title: 'Mi Pedido',
          tabBarLabel: 'Carrito',
          tabBarIcon: ({ color }) => <CartTabIcon color={color} count={cartItemCount} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Mi Perfil',
          href: null
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  cartIconWrap: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700'
  }
});
