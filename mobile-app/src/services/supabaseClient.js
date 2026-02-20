import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo detecta automaticamente las variables que empiezan con EXPO_PUBLIC_
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase env vars are missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

const isWeb = Platform.OS === 'web';
const isBrowser = typeof window !== 'undefined';

const authConfig = isWeb
  ? {
      autoRefreshToken: true,
      persistSession: isBrowser,
      detectSessionInUrl: false
    }
  : {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: authConfig
});

export const isInvalidRefreshTokenError = (error) => {
  const raw = `${error?.message || ''} ${error?.name || ''} ${error?.code || ''}`.toLowerCase();
  return raw.includes('invalid refresh token') || raw.includes('refresh token not found');
};

export const clearLocalSupabaseSession = async () => {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (_error) {
    // Ignore local sign out cleanup errors.
  }
};
