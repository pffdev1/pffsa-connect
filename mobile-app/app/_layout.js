import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PaperProvider } from 'react-native-paper';
import { CartProvider } from '../src/context/CartContext';
import { COLORS, PAPER_THEME } from '../src/constants/theme';
import { supabase } from '../src/services/supabaseClient';
import {
  bindNotificationListeners,
  configureNotificationsAsync,
  registerPushTokenForCurrentUserAsync
} from '../src/services/notificationsService';
import { flushPendingOrders } from '../src/services/offlineService';

export default function RootLayout() {
  useEffect(() => {
    let active = true;

    const setup = async () => {
      try {
        await configureNotificationsAsync();
        if (!active) return;
        await registerPushTokenForCurrentUserAsync();
        await flushPendingOrders();
      } catch (_error) {
        // Silent setup failure; app must continue without blocking navigation.
      }
    };

    setup();

    const removeNotificationListeners = bindNotificationListeners();
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) return;
      try {
        await registerPushTokenForCurrentUserAsync();
        await flushPendingOrders();
      } catch (_error) {
        // Ignore token sync failures.
      }
    });

    return () => {
      active = false;
      removeNotificationListeners();
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={PAPER_THEME}>
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
              <Stack.Screen name="reset-password" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </CartProvider>
        </BottomSheetModalProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
