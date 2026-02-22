import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const fetchAuthUser = async () => supabase.auth.getUser();

export const fetchProfile = async (userId) =>
  supabase.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();

export const fetchOrdersInRange = async ({ fromIso, toIso, createdBy = '', limit = 80 } = {}) => {
  const attempts = [
    'id, card_code, created_by, seller_id, status, sap_docnum, created_at, doc_due_date',
    'id, card_code, created_by, status, sap_docnum, created_at, doc_due_date',
    'id, card_code, seller_id, status, sap_docnum, created_at, doc_due_date'
  ];

  for (const select of attempts) {
    let query = supabase
      .from('sales_orders')
      .select(select)
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (createdBy) {
      query = query.eq('created_by', createdBy);
    }
    const result = await query;
    if (!result.error) return result;
  }
  return { data: [], error: { message: 'No se pudo consultar sales_orders con los esquemas esperados.' } };
};

export const fetchAllOrders = async ({ createdBy = '' } = {}) => {
  const attempts = [
    'id, card_code, sap_docnum, created_by, seller_id, status, created_at, doc_due_date',
    'id, card_code, sap_docnum, created_by, status, created_at, doc_due_date',
    'id, card_code, sap_docnum, seller_id, status, created_at, doc_due_date',
    'id, created_by, seller_id, status, created_at',
    'id, created_by, status, created_at',
    'id, seller_id, status, created_at'
  ];
  for (const select of attempts) {
    let query = supabase.from('sales_orders').select(select).order('created_at', { ascending: false });
    if (createdBy) {
      query = query.eq('created_by', createdBy);
    }
    const result = await query;
    if (!result.error) return result;
  }
  return { data: [], error: { message: 'No se pudo consultar listado de sales_orders con los esquemas esperados.' } };
};

export const fetchLinesByOrderIds = async (orderIds = []) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return { data: [], error: null };
  const byOrderId = await supabase.from('sales_order_lines').select('*').in('order_id', orderIds);
  if (!byOrderId.error) return byOrderId;

  return supabase.from('sales_order_lines').select('*').in('sales_order_id', orderIds);
};

export const fetchCustomerNamesByCardCodes = async (cardCodes = []) => {
  if (!Array.isArray(cardCodes) || cardCodes.length === 0) return [];
  const attempts = [
    { select: 'CardCode, CardFName, CardName, Vendedor', inCol: 'CardCode' },
    { select: 'card_code, card_f_name, card_name, vendedor', inCol: 'card_code' }
  ];

  for (const attempt of attempts) {
    const result = await supabase.from('customers').select(attempt.select).in(attempt.inCol, cardCodes);
    if (!result.error) return result.data || [];
  }
  return [];
};

export const fetchSellerNamesByIds = async (sellerIds = []) => {
  if (!Array.isArray(sellerIds) || sellerIds.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', sellerIds);
  if (error) return [];
  return data || [];
};

export const fetchAdminSellerStats = async () => supabase.rpc('get_admin_seller_stats');

export const probeEnvironmentHealth = async () =>
  Promise.allSettled([
    supabase.auth.getSession(),
    supabase.from('profiles').select('*', { head: true, count: 'exact' }).limit(1),
    supabase.from('customers').select('*', { head: true, count: 'exact' }).limit(1),
    supabase.from('sales_orders').select('*', { head: true, count: 'exact' }).limit(1)
  ]);
