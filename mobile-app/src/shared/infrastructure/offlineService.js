import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const ORDER_QUEUE_KEY = 'offline:pending-orders:v1';
const MAX_QUEUE_ITEMS = 100;
const OPTIONAL_RPC_PARAMS = ['p_client_order_id', 'p_comments'];
const RETRYABLE_ERROR_CODES = new Set(['network', 'timeout', 'session_expired', 'server']);
const ORDER_RETRY_COOLDOWN_MS = 15000;

let flushInFlightPromise = null;

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

const normalizeText = (value) => String(value || '').trim();
const nowIso = () => new Date().toISOString();
const buildQueueFingerprint = (rpcPayload) => JSON.stringify(rpcPayload || {});
const buildErrorText = (error) => `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
const isMissingRpcParamError = (error, paramName) => {
  const rawRpcError = buildErrorText(error);
  return (
    rawRpcError.includes(String(paramName || '').toLowerCase()) &&
    (rawRpcError.includes('does not exist') || rawRpcError.includes('no function matches'))
  );
};

export const classifyOrderError = (error) => {
  const rawErrorText = buildErrorText(error);
  const errorStatus = Number(error?.status);
  const errorCode = String(error?.code || '').trim().toUpperCase();

  const isNetworkError =
    rawErrorText.includes('network request failed') ||
    rawErrorText.includes('failed to fetch') ||
    rawErrorText.includes('offline') ||
    rawErrorText.includes('network');
  if (isNetworkError) return 'network';

  const isTimeoutError =
    rawErrorText.includes('timeout') || rawErrorText.includes('timed out') || rawErrorText.includes('aborted');
  if (isTimeoutError) return 'timeout';

  const isSessionExpired =
    rawErrorText.includes('auth session missing') ||
    rawErrorText.includes('usuario no autenticado') ||
    rawErrorText.includes('jwt') ||
    rawErrorText.includes('not authenticated') ||
    errorStatus === 401 ||
    errorStatus === 403 ||
    errorCode === 'PGRST301';
  if (isSessionExpired) return 'session_expired';

  const isValidationError =
    rawErrorText.includes('es requerido') ||
    rawErrorText.includes('lineas invalidas') ||
    rawErrorText.includes('hay lineas invalidas') ||
    rawErrorText.includes('invalid input syntax') ||
    rawErrorText.includes('violates') ||
    errorStatus === 400 ||
    errorStatus === 422 ||
    errorCode === '22P02' ||
    errorCode === '23502' ||
    errorCode === '23503';
  if (isValidationError) return 'validation';

  const isServerError = errorStatus >= 500 && errorStatus <= 599;
  if (isServerError) return 'server';

  return 'unknown';
};

export const shouldKeepOrderInQueue = (errorCode) =>
  RETRYABLE_ERROR_CODES.has(String(errorCode || '').trim());

const shouldRetryQueueItemNow = (item) => {
  const status = String(item?.status || 'queued').trim().toLowerCase();
  if (status === 'blocked') return false;
  const nextRetryAtMs = Date.parse(String(item?.nextRetryAt || ''));
  if (Number.isFinite(nextRetryAtMs) && nextRetryAtMs > Date.now()) return false;
  return true;
};

export const getOrderErrorMessage = (error) => {
  const code = classifyOrderError(error);
  if (code === 'network' || code === 'timeout') {
    return 'No pudimos enviar tu pedido por conexion. Se guardo localmente y se enviara automaticamente.';
  }
  if (code === 'session_expired') {
    return 'Tu sesion expiro. Inicia sesion nuevamente para enviar el pedido.';
  }
  if (code === 'validation') {
    return 'El pedido tiene datos invalidos. Revisa cliente, fecha, almacen y lineas.';
  }
  if (code === 'server') {
    return 'El servidor no respondio correctamente. Tu pedido quedo pendiente para reintento.';
  }
  return 'No se pudo guardar el pedido en este momento. Intenta nuevamente.';
};

const runCreateSalesOrderRpc = async (rpcPayload) => {
  let payload = { ...rpcPayload };

  for (let index = 0; index <= OPTIONAL_RPC_PARAMS.length; index += 1) {
    const { data: orderId, error } = await supabase.rpc('create_sales_order', {
      ...payload
    });
    if (!error) {
      return orderId;
    }

    let removedOptionalParam = false;
    for (const paramName of OPTIONAL_RPC_PARAMS) {
      if (!Object.prototype.hasOwnProperty.call(payload, paramName)) continue;
      if (!isMissingRpcParamError(error, paramName)) continue;

      const { [paramName]: _ignoredOptionalParam, ...legacyPayload } = payload;
      payload = legacyPayload;
      removedOptionalParam = true;
      break;
    }

    if (!removedOptionalParam) {
      throw error;
    }
  }

  throw new Error('No se pudo ejecutar create_sales_order.');
};

export const submitSalesOrderRpc = async (rpcPayload) => runCreateSalesOrderRpc(rpcPayload);

export const enqueuePendingOrder = async ({ rpcPayload, cardCode, customerName }) => {
  if (!rpcPayload) return null;
  const current = (await getCachedJson(ORDER_QUEUE_KEY, [])) || [];
  const fingerprint = buildQueueFingerprint(rpcPayload);
  const existing = current.find((item) => item?.fingerprint === fingerprint);
  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const nextItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    status: 'queued',
    nextRetryAt: null,
    cardCode: normalizeText(cardCode),
    customerName: normalizeText(customerName),
    lastErrorCode: null,
    lastErrorMessage: null,
    fingerprint,
    rpcPayload
  };
  await setCachedJson(ORDER_QUEUE_KEY, [nextItem, ...current].slice(0, MAX_QUEUE_ITEMS));
  return nextItem;
};

export const getPendingOrders = async () => getCachedJson(ORDER_QUEUE_KEY, []);

export const removePendingOrder = async (localOrderId) => {
  const pending = (await getPendingOrders()) || [];
  const remaining = pending.filter((item) => item?.id !== localOrderId);
  if (remaining.length === pending.length) return false;
  await setCachedJson(ORDER_QUEUE_KEY, remaining);
  return true;
};

export const markPendingOrderError = async (localOrderId, error) => {
  const pending = (await getPendingOrders()) || [];
  const errorCode = classifyOrderError(error);
  const errorMessage = getOrderErrorMessage(error);
  const retryable = shouldKeepOrderInQueue(errorCode);
  const next = pending.map((item) => {
    if (item?.id !== localOrderId) return item;

    const currentAttempts = Number(item?.attempts || 0);
    const nextAttempts = currentAttempts + 1;
    return {
      ...item,
      attempts: nextAttempts,
      status: retryable ? 'error' : 'blocked',
      nextRetryAt: retryable ? new Date(Date.now() + ORDER_RETRY_COOLDOWN_MS).toISOString() : null,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      updatedAt: nowIso()
    };
  });
  await setCachedJson(ORDER_QUEUE_KEY, next);
};

const flushPendingOrdersInternal = async () => {
  const pending = (await getPendingOrders()) || [];
  if (pending.length === 0) return { sent: 0, failed: 0, kept: 0 };

  const remaining = [];
  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    if (!shouldRetryQueueItemNow(item)) {
      remaining.push(item);
      continue;
    }

    try {
      await runCreateSalesOrderRpc(item.rpcPayload);
      sent += 1;
    } catch (error) {
      const errorCode = classifyOrderError(error);
      const retryable = shouldKeepOrderInQueue(errorCode);
      const nextAttempts = Number(item?.attempts || 0) + 1;

      if (retryable) {
        remaining.push({
          ...item,
          attempts: nextAttempts,
          status: 'error',
          nextRetryAt: new Date(Date.now() + ORDER_RETRY_COOLDOWN_MS).toISOString(),
          lastErrorCode: errorCode,
          lastErrorMessage: getOrderErrorMessage(error),
          updatedAt: nowIso()
        });
      } else {
        remaining.push({
          ...item,
          attempts: nextAttempts,
          status: 'blocked',
          nextRetryAt: null,
          lastErrorCode: errorCode,
          lastErrorMessage: getOrderErrorMessage(error),
          updatedAt: nowIso()
        });
        failed += 1;
      }
    }
  }

  await setCachedJson(ORDER_QUEUE_KEY, remaining);
  return { sent, failed, kept: remaining.length };
};

export const flushPendingOrders = async () => {
  if (flushInFlightPromise) {
    return flushInFlightPromise;
  }

  flushInFlightPromise = flushPendingOrdersInternal().finally(() => {
    flushInFlightPromise = null;
  });
  return flushInFlightPromise;
};
