import { Stack } from 'expo-router';
import { CartProvider } from '../src/context/CartContext';
import { COLORS } from '../src/constants/theme';

export default function RootLayout() {
  return (
    <CartProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: 'bold' }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </CartProvider>
  );
}

