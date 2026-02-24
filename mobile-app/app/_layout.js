import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PaperProvider } from 'react-native-paper';
import { CartProvider } from '../src/shared/state/cart/CartContext';
import { COLORS, PAPER_THEME } from '../src/constants/theme';
import { supabase } from '../src/shared/infrastructure/supabaseClient';
import {
  bindNotificationListeners,
  configureNotificationsAsync,
  registerPushTokenForCurrentUserAsync
} from '../src/shared/infrastructure/notificationsService';
import { flushPendingOrders } from '../src/shared/infrastructure/offlineService';

export default function RootLayout() {
  useEffect(() => {
    let active = true;

    configureNotificationsAsync().catch(() => {});

    const removeNotificationListeners = bindNotificationListeners();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      // Keep auth callbacks non-blocking to avoid lock contention with auth mutations.
      Promise.resolve()
        .then(() => registerPushTokenForCurrentUserAsync())
        .then(() => flushPendingOrders())
        .catch(() => {});
    });

    // Cold start: sync only when there is an existing session.
    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data?.session?.user) return;
      registerPushTokenForCurrentUserAsync().catch(() => {});
      flushPendingOrders().catch(() => {});
    }).catch(() => {});

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
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </CartProvider>
        </BottomSheetModalProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
