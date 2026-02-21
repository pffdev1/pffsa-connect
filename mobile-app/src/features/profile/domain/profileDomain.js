import { COLORS } from '../../../constants/theme';

export const normalizeSellerName = (value = '') =>
  value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const resolveOrderStatus = (status = '') => {
  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'sent') return { label: 'Enviado', color: '#27AE60' };
  if (normalized === 'pending') return { label: 'Pendiente', color: '#F39C12' };
  if (normalized === 'processing') return { label: 'Procesando', color: '#2F80ED' };
  if (normalized === 'draft') return { label: 'Borrador', color: '#8E9AAF' };
  if (normalized === 'blocked') return { label: 'Bloqueado', color: '#D35400' };
  if (normalized === 'queued') return { label: 'En cola', color: '#16A085' };
  if (normalized === 'error') return { label: 'Con error', color: '#E74C3C' };
  return { label: status || 'Sin estado', color: COLORS.textLight };
};

export const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleString('es-PA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
};
