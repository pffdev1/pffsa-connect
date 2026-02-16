import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../src/constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: 'gray',
      headerStyle: { backgroundColor: COLORS.primary },
      headerTintColor: '#FFF',
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
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
          tabBarIcon: ({ color }) => <Ionicons name="cart" size={26} color={color} />,
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
