import { Stack } from 'expo-router';
import { CartProvider } from '../src/context/CartContext';
import { COLORS } from '../src/constants/theme';

export default function Layout() {
  return (
    <CartProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
    </CartProvider>
  );
}