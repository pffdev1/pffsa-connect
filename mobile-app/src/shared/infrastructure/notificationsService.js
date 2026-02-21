import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabaseClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

const getEasProjectId = () =>
  Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || undefined;

const getDeviceLabel = () => {
  const model = String(Constants?.deviceName || '').trim();
  return model || `${Platform.OS}-device`;
};

export const configureNotificationsAsync = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#003a78'
    });
  }
};

export const registerPushTokenForCurrentUserAsync = async () => {
  if (Platform.OS === 'web') return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;
  if (finalStatus !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    finalStatus = request.status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getEasProjectId();
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const pushToken = String(tokenResponse?.data || '').trim();
  if (!pushToken) return null;

  // Primary storage for push tokens.
  const upsertPayload = {
    user_id: user.id,
    push_token: pushToken,
    platform: Platform.OS,
    device_label: getDeviceLabel()
  };
  const { error: upsertError } = await supabase.from('user_push_tokens').upsert(upsertPayload, { onConflict: 'push_token' });

  // Optional fallback when `user_push_tokens` does not exist yet.
  if (upsertError) {
    await supabase.from('profiles').update({ expo_push_token: pushToken }).eq('id', user.id);
  }

  return pushToken;
};

export const bindNotificationListeners = ({ onReceive, onResponse } = {}) => {
  const received = Notifications.addNotificationReceivedListener((event) => {
    onReceive?.(event);
  });
  const responded = Notifications.addNotificationResponseReceivedListener((event) => {
    onResponse?.(event);
  });

  return () => {
    received.remove();
    responded.remove();
  };
};
