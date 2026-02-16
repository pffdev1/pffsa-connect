import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { CartProvider } from '../src/context/CartContext';
import { COLORS } from '../src/constants/theme';

export default function RootLayout() {
  const paperTheme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: COLORS.primary,
      secondary: COLORS.secondary,
      background: COLORS.white,
      surface: COLORS.white,
      onSurface: COLORS.text,
      onSurfaceVariant: COLORS.textLight,
      outline: COLORS.border
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paperTheme}>
        <BottomSheetModalProvider>
          <CartProvider>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: COLORS.primary },
                headerTintColor: '#FFF',
                headerTitleStyle: { fontWeight: 'bold' }
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </CartProvider>
        </BottomSheetModalProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
