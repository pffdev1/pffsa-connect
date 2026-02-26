import { supabase } from '../../../shared/infrastructure/supabaseClient';

export const fetchAuthUser = async () => supabase.auth.getUser();

export const fetchProfile = async (userId) =>
  supabase.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();

const applyOrderOwnerFilter = (query, { select = '', ownerId = '' } = {}) => {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return query;

  const hasCreatedBy = String(select).includes('created_by');
  const hasSellerId = String(select).includes('seller_id');

  if (hasCreatedBy && hasSellerId) {
    return query.or(`created_by.eq.${safeOwnerId},seller_id.eq.${safeOwnerId}`);
  }
  if (hasCreatedBy) {
    return query.eq('created_by', safeOwnerId);
  }
  if (hasSellerId) {
    return query.eq('seller_id', safeOwnerId);
  }
  return query;
};

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

    query = applyOrderOwnerFilter(query, { select, ownerId: createdBy });
    const result = await query;
    if (!result.error) return result;
  }
  return { data: [], error: { message: 'No se pudo consultar sales_orders con los esquemas esperados.' } };
};

export const fetchOrdersCountInRange = async ({ fromIso, toIso, createdBy = '' } = {}) => {
  const attempts = ['id, created_by, seller_id', 'id, created_by', 'id, seller_id', 'id'];

  for (const select of attempts) {
    let query = supabase
      .from('sales_orders')
      .select(select, { head: true, count: 'exact' })
      .gte('created_at', fromIso)
      .lt('created_at', toIso);

    query = applyOrderOwnerFilter(query, { select, ownerId: createdBy });
    const result = await query;
    if (!result.error) {
      return { count: Number(result.count || 0), error: null };
    }
  }

  return { count: 0, error: { message: 'No se pudo contar sales_orders con los esquemas esperados.' } };
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
    query = applyOrderOwnerFilter(query, { select, ownerId: createdBy });
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
export const fetchQueueHealth = async () => supabase.from('vw_sales_orders_queue_health').select('*').maybeSingle();

export const probeEnvironmentHealth = async () =>
  Promise.allSettled([
    supabase.auth.getSession(),
    supabase.from('profiles').select('*', { head: true, count: 'exact' }).limit(1),
    supabase.from('customers').select('*', { head: true, count: 'exact' }).limit(1),
    supabase.from('sales_orders').select('*', { head: true, count: 'exact' }).limit(1)
  ]);
