import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../../../shared/infrastructure/supabaseClient';

const LOCAL_APP_VERSION = String(Constants?.expoConfig?.version || '0.0.0');

const isMissingTableError = (error) => {
  const raw = `${error?.message || ''}`.toLowerCase();
  return String(error?.code || '').trim() === '42P01' || raw.includes('does not exist');
};

export const logLoginEvent = async ({ type, email, userId, message }) => {
  const payload = {
    event_type: String(type || 'unknown'),
    email: String(email || '').trim().toLowerCase(),
    user_id: userId || null,
    app_version: LOCAL_APP_VERSION,
    platform: Platform.OS,
    details: String(message || ''),
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('auth_login_events').insert(payload);
    if (error && !isMissingTableError(error)) {
      // Silent: audit should not block login flow.
    }
  } catch (_error) {
    // Silent: audit should not block login flow.
  }
};
