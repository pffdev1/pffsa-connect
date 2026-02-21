export const toMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
};

const TODAY_QUERY_BUFFER_HOURS = 14;

export const buildTodayQueryRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const from = new Date(start);
  from.setHours(from.getHours() - TODAY_QUERY_BUFFER_HOURS);
  const to = new Date(end);
  to.setHours(to.getHours() + TODAY_QUERY_BUFFER_HOURS);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
};

export const isCreatedTodayLocal = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return parsed >= start && parsed < end;
};

export const getTodayLocalIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isOrderOfToday = (row) => {
  const createdToday = isCreatedTodayLocal(row?.created_at);
  const dueDate = String(row?.doc_due_date || '').trim();
  return createdToday || (dueDate && dueDate === getTodayLocalIsoDate());
};

export const keepTodayOrders = (rows = []) => rows.filter((row) => isOrderOfToday(row));

export const resolveOrderTotal = (rows = []) =>
  rows.reduce((acc, row) => {
    const qty = Number(row?.quantity ?? row?.Quantity ?? 0);
    const unitPrice = Number(row?.unit_price ?? row?.UnitPrice ?? row?.price ?? row?.Price ?? 0);
    const lineTotal = Number(row?.line_total ?? row?.LineTotal ?? row?.total ?? row?.Total ?? NaN);
    const safeQty = Number.isFinite(qty) ? qty : 0;
    const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
    const safeLineTotal = Number.isFinite(lineTotal) ? lineTotal : safeQty * safeUnitPrice;
    return acc + (Number.isFinite(safeLineTotal) ? safeLineTotal : 0);
  }, 0);

export const resolveLineOrderId = (row) => String(row?.order_id || row?.sales_order_id || '').trim();

export const resolveOrderSellerId = (row) =>
  String(
    row?.seller_id ||
      row?.sellerId ||
      row?.created_by ||
      row?.createdBy ||
      row?.seller ||
      row?.vendedor ||
      ''
  ).trim();

export const normalizeOrderStatus = (value) => String(value || '').trim().toLowerCase();

export const resolveLineTotal = (row) => {
  const qty = Number(row?.quantity ?? row?.Quantity ?? 0);
  const unitPrice = Number(row?.unit_price ?? row?.UnitPrice ?? row?.price ?? row?.Price ?? 0);
  const lineTotal = Number(row?.line_total ?? row?.LineTotal ?? row?.total ?? row?.Total ?? NaN);
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
  const safeLineTotal = Number.isFinite(lineTotal) ? lineTotal : safeQty * safeUnitPrice;
  return Number.isFinite(safeLineTotal) ? safeLineTotal : 0;
};

export const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleString('es-PA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const normalizeSellerName = (value = '') =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const formatNotificationTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfParsed = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - startOfParsed.getTime()) / (24 * 60 * 60 * 1000));
  const hourLabel = parsed.toLocaleTimeString('es-PA', {
    hour: '2-digit',
    minute: '2-digit'
  });

  if (diffDays === 0) return `Hoy ${hourLabel}`;
  if (diffDays === 1) return `Ayer ${hourLabel}`;
  if (diffDays > 1 && diffDays < 7) {
    const weekday = parsed.toLocaleDateString('es-PA', { weekday: 'long' });
    const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${weekdayLabel} ${hourLabel}`;
  }

  return parsed.toLocaleString('es-PA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const normalizeAdminSellerRow = (row) => ({
  id: String(row?.seller_id || row?.id || '').trim(),
  fullName: String(row?.full_name || '').trim() || 'Sin nombre',
  email: String(row?.email || '').trim().toLowerCase(),
  ordersCount: Number(row?.orders_count) || 0,
  sentCount: Number(row?.sent_count) || 0,
  pendingCount: Number(row?.pending_count) || 0,
  errorCount: Number(row?.error_count) || 0,
  lastSeen: row?.last_seen || row?.last_order_at || ''
});

export const getHealthLabel = (status) => {
  if (status === 'ok') return 'OK';
  if (status === 'error') return 'Con error';
  return 'Verificando';
};
