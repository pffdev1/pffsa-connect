import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: 'gray',
      headerStyle: { backgroundColor: COLORS.primary },
      headerTintColor: '#FFF',
      tabBarStyle: { height: 65, paddingBottom: 10, paddingTop: 5 }
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
    </Tabs>
  );
}