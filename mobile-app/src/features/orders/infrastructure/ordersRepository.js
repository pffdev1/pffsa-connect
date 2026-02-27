import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const fetchCustomersForValidation = async (cardCodes = []) =>
  supabase.from('customers').select('CardCode, CardName, CardFName, Bloqueado').in('CardCode', cardCodes);

export const fetchCustomerRouteMeta = async (cardCode) =>
  supabase.from('customers').select('Zona, IDRuta, Ruta').eq('CardCode', cardCode).single();

export const fetchCurrentAuthUser = async () => supabase.auth.getUser();

export const fetchSalesOrderStatus = async (orderId) =>
  supabase.from('sales_orders').select('sap_docnum, status').eq('id', orderId).maybeSingle();

const SAVED_CARTS_TABLE = 'saved_order_carts';
const SAVED_CART_LIMIT = 3;

export const fetchSavedOrderCarts = async () =>
  supabase
    .from(SAVED_CARTS_TABLE)
    .select('id, customer_code, customer_name, cart_payload, item_count, total_amount, created_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(SAVED_CART_LIMIT);

export const removeExpiredSavedOrderCarts = async () =>
  supabase.from(SAVED_CARTS_TABLE).delete().lte('expires_at', new Date().toISOString());

export const createSavedOrderCart = async ({ customerCode, customerName, cartPayload, itemCount, totalAmount }) =>
  supabase.from(SAVED_CARTS_TABLE).insert({
    customer_code: customerCode || null,
    customer_name: customerName || null,
    cart_payload: Array.isArray(cartPayload) ? cartPayload : [],
    item_count: Number(itemCount) || 0,
    total_amount: Number(totalAmount) || 0
  });

export const deleteSavedOrderCart = async (savedCartId) =>
  supabase.from(SAVED_CARTS_TABLE).delete().eq('id', String(savedCartId || '').trim());
