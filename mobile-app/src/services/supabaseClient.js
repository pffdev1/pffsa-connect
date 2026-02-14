import { createClient } from '@supabase/supabase-js';

// Expo detecta automáticamente las variables que empiezan con EXPO_PUBLIC_
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Error: Las variables de entorno de Supabase no están cargadas.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);