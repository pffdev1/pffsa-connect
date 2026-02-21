export const QUERY_TIMEOUT_MS = 12000;

export const buildTimeoutError = () => {
  const timeoutError = new Error('Customers query timeout');
  timeoutError.code = 'REQUEST_TIMEOUT';
  timeoutError.status = 408;
  return timeoutError;
};

export const withTimeout = (promise, timeoutMs = QUERY_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(buildTimeoutError()), timeoutMs))
  ]);

export const isConnectionLikeError = (error) => {
  const raw = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    String(error?.code || '').trim().toUpperCase() === 'REQUEST_TIMEOUT' ||
    raw.includes('timeout') ||
    raw.includes('timed out') ||
    raw.includes('network request failed') ||
    raw.includes('failed to fetch') ||
    raw.includes('offline')
  );
};
