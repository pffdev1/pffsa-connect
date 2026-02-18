import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const ORDER_QUEUE_KEY = 'offline:pending-orders:v1';
const MAX_QUEUE_ATTEMPTS = 5;

const parseJson = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
};

export const getCachedJson = async (key, fallback = null) => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  return parseJson(raw, fallback);
};

export const setCachedJson = async (key, value) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

export const enqueuePendingOrder = async ({ rpcPayload, cardCode, customerName }) => {
  if (!rpcPayload) return;
  const current = (await getCachedJson(ORDER_QUEUE_KEY, [])) || [];
  const nextItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    cardCode: String(cardCode || '').trim(),
    customerName: String(customerName || '').trim(),
    rpcPayload
  };
  await setCachedJson(ORDER_QUEUE_KEY, [nextItem, ...current].slice(0, 100));
};

export const getPendingOrders = async () => getCachedJson(ORDER_QUEUE_KEY, []);

export const flushPendingOrders = async () => {
  const pending = (await getPendingOrders()) || [];
  if (pending.length === 0) return { sent: 0, failed: 0, kept: 0 };

  const remaining = [];
  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const { error } = await supabase.rpc('create_sales_order', {
        ...item.rpcPayload
      });
      if (error) throw error;
      sent += 1;
    } catch (_error) {
      const nextAttempts = Number(item.attempts || 0) + 1;
      if (nextAttempts < MAX_QUEUE_ATTEMPTS) {
        remaining.push({ ...item, attempts: nextAttempts });
      } else {
        failed += 1;
      }
    }
  }

  await setCachedJson(ORDER_QUEUE_KEY, remaining);
  return { sent, failed, kept: remaining.length };
};
