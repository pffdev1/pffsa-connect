import {
  buildTodayQueryRange,
  keepTodayOrders,
  normalizeOrderStatus,
  normalizeAdminSellerRow,
  resolveOrderSellerId,
  resolveLineOrderId,
  resolveLineTotal,
  resolveOrderTotal
} from '../domain/homeDomain';
import {
  fetchAdminSellerStats,
  fetchAllOrders,
  fetchAuthUser,
  fetchCustomerNamesByCardCodes,
  fetchOrdersCountInRange,
  fetchLinesByOrderIds,
  fetchOrdersInRange,
  fetchProfile,
  fetchQueueHealth,
  fetchSellerNamesByIds,
  probeEnvironmentHealth
} from '../infrastructure/homeRepository';

export const loadUserContext = async () => {
  const {
    data: { user },
    error: userError
  } = await fetchAuthUser();
  if (userError || !user?.id) throw userError || new Error('Sin sesion');

  const { data: profile, error: profileError } = await fetchProfile(user.id);
  if (profileError && profileError.code !== 'PGRST116') throw profileError;

  return {
    userId: user.id,
    fullName: String(profile?.full_name || '').trim() || 'Vendedor',
    role: String(profile?.role || 'vendedor').trim().toLowerCase() || 'vendedor'
  };
};

export const loadVendorKpis = async (userId) => {
  const { fromIso, toIso } = buildTodayQueryRange();
  const { data: todayRows, error: todayError } = await fetchOrdersInRange({ fromIso, toIso, createdBy: userId, limit: 1200 });
  if (todayError) throw todayError;
  const todayOrders = keepTodayOrders(todayRows || []);
  const { count: todayCount, error: todayCountError } = await fetchOrdersCountInRange({ fromIso, toIso, createdBy: userId });
  if (todayCountError) throw todayCountError;

  const todayOrderIds = Array.from(new Set(todayOrders.map((row) => String(row?.id || '').trim()).filter(Boolean)));
  let totalSales = 0;
  if (todayOrderIds.length > 0) {
    const { data: linesRows, error: linesError } = await fetchLinesByOrderIds(todayOrderIds);
    if (linesError) throw linesError;
    totalSales = resolveOrderTotal(linesRows || []);
  }

  return {
    todayOrders: todayCount,
    totalSales
  };
};

export const loadAdminDashboardData = async () => {
  const { fromIso, toIso } = buildTodayQueryRange();
  const { data: todayOrdersRows, error: todayOrdersError } = await fetchOrdersInRange({ fromIso, toIso, limit: 3000 });
  if (todayOrdersError) throw todayOrdersError;
  const { count: todayOrdersCount, error: todayCountError } = await fetchOrdersCountInRange({ fromIso, toIso });
  if (todayCountError) throw todayCountError;
  const filteredTodayOrders = keepTodayOrders(todayOrdersRows || []);
  const todayOrderIds = filteredTodayOrders.map((row) => String(row?.id || '').trim()).filter(Boolean);
  const { data: todayLinesRows } = await fetchLinesByOrderIds(todayOrderIds);
  let salesGlobalTotal = 0;
  try {
    const { data: allOrdersRows, error: allOrdersError } = await fetchAllOrders();
    if (allOrdersError) throw allOrdersError;
    const allOrderIds = (allOrdersRows || []).map((row) => String(row?.id || '').trim()).filter(Boolean);
    if (allOrderIds.length > 0) {
      const { data: allLinesRows, error: allLinesError } = await fetchLinesByOrderIds(allOrderIds);
      if (allLinesError) throw allLinesError;
      salesGlobalTotal = resolveOrderTotal(allLinesRows || []);
    }
  } catch (_error) {
    salesGlobalTotal = 0;
  }

  let sellerRows = [];
  try {
    const { data: statsRows, error: statsError } = await fetchAdminSellerStats();
    if (statsError) throw statsError;
    sellerRows = (statsRows || []).map((row) => normalizeAdminSellerRow(row)).filter((row) => row.id);
  } catch (_error) {
    const { data: allOrdersRows } = await fetchAllOrders();
    const statsBySeller = new Map();
    (allOrdersRows || []).forEach((row) => {
      const sellerId = resolveOrderSellerId(row);
      if (!sellerId) return;
      const status = normalizeOrderStatus(row?.status);
      const current = statsBySeller.get(sellerId) || {
        id: sellerId,
        fullName: '',
        email: '',
        ordersCount: 0,
        sentCount: 0,
        pendingCount: 0,
        errorCount: 0,
        lastSeen: row?.created_at || ''
      };
      current.ordersCount += 1;
      if (status === 'sent') current.sentCount += 1;
      if (status === 'pending' || status === 'processing' || status === 'queued') current.pendingCount += 1;
      if (status === 'error' || status === 'blocked') current.errorCount += 1;
      if (!current.lastSeen && row?.created_at) current.lastSeen = row.created_at;
      statsBySeller.set(sellerId, current);
    });

    const sellerIds = Array.from(statsBySeller.keys());
    const profileRows = await fetchSellerNamesByIds(sellerIds);
    const profileById = new Map(
      (profileRows || []).map((row) => [String(row?.id || '').trim(), { fullName: row?.full_name || '', email: row?.email || '' }])
    );

    sellerRows = sellerIds.map((id) => {
      const current = statsBySeller.get(id);
      const profile = profileById.get(id) || {};
      return {
        ...current,
        fullName: String(profile?.fullName || current?.fullName || '').trim() || 'Sin nombre',
        email: String(profile?.email || current?.email || '').trim().toLowerCase()
      };
    });
  }

  const sortedSellers = [...sellerRows].sort((a, b) => b.ordersCount - a.ordersCount);
  const topSellers = sortedSellers.slice(0, 5);
  const summary = sellerRows.reduce(
    (acc, row) => ({
      totalOrders: acc.totalOrders + row.ordersCount,
      activeSellers: acc.activeSellers + (row.ordersCount > 0 ? 1 : 0),
      pendingOrders: acc.pendingOrders + row.pendingCount,
      errorOrders: acc.errorOrders + row.errorCount
    }),
    { totalOrders: 0, activeSellers: 0, pendingOrders: 0, errorOrders: 0 }
  );
  const errorRate = summary.totalOrders > 0 ? (summary.errorOrders / summary.totalOrders) * 100 : 0;

  const probes = await probeEnvironmentHealth();
  const [sessionProbe, profilesProbe, customersProbe, ordersProbe] = probes;
  const health = {
    supabase: sessionProbe.status === 'fulfilled' && !sessionProbe.value?.error ? 'ok' : 'error',
    profiles: profilesProbe.status === 'fulfilled' && !profilesProbe.value?.error ? 'ok' : 'error',
    customers: customersProbe.status === 'fulfilled' && !customersProbe.value?.error ? 'ok' : 'error',
    orders: ordersProbe.status === 'fulfilled' && !ordersProbe.value?.error ? 'ok' : 'error',
    checkedAt: new Date().toISOString()
  };
  let queueHealth = {
    queuedTotal: 0,
    queued15m: 0,
    queued30m: 0,
    processingTotal: 0
  };
  try {
    const { data: queueRow } = await fetchQueueHealth();
    queueHealth = {
      queuedTotal: Number(queueRow?.queued_total) || 0,
      queued15m: Number(queueRow?.queued_15m) || 0,
      queued30m: Number(queueRow?.queued_30m) || 0,
      processingTotal: Number(queueRow?.processing_total) || 0
    };
  } catch (_error) {
    // Keep zero fallback when watchdog view is not available.
  }

  return {
    adminKpis: {
      ordersToday: todayOrdersCount,
      salesToday: resolveOrderTotal(todayLinesRows || []),
      salesGlobalTotal,
      activeSellers: summary.activeSellers,
      pendingOrders: summary.pendingOrders,
      errorOrders: summary.errorOrders,
      errorRate
    },
    adminTopSellers: topSellers,
    adminHealth: health,
    adminQueueHealth: queueHealth
  };
};

export const loadOrdersTodayDetailsData = async ({ authUserId, role }) => {
  const { fromIso, toIso } = buildTodayQueryRange();
  const { data: ordersRows, error: ordersError } = await fetchOrdersInRange({
    fromIso,
    toIso,
    createdBy: role === 'admin' ? '' : authUserId,
    limit: 120
  });
  if (ordersError) throw ordersError;

  const todayRows = keepTodayOrders(ordersRows || []);
  if (todayRows.length === 0) return [];

  const orderIds = Array.from(new Set(todayRows.map((row) => String(row?.id || '').trim()).filter(Boolean)));
  const cardCodes = Array.from(new Set(todayRows.map((row) => String(row?.card_code || '').trim()).filter(Boolean)));
  const sellerIds = Array.from(new Set(todayRows.map((row) => resolveOrderSellerId(row)).filter(Boolean)));

  const [customerRows, lineResult, sellerRows] = await Promise.all([
    fetchCustomerNamesByCardCodes(cardCodes),
    fetchLinesByOrderIds(orderIds),
    fetchSellerNamesByIds(sellerIds)
  ]);

  const namesByCode = new Map();
  const sellerByCode = new Map();
  (customerRows || []).forEach((row) => {
    const code = String(row?.CardCode || row?.card_code || '').trim();
    if (!code) return;
    const name = String(row?.CardFName || row?.CardName || row?.card_f_name || row?.card_name || '').trim();
    if (name) {
      namesByCode.set(code, name);
    }
    const seller = String(row?.Vendedor || row?.vendedor || '').trim();
    if (seller) {
      sellerByCode.set(code, seller);
    }
  });

  const sellersById = new Map();
  (sellerRows || []).forEach((row) => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    const name = String(row?.full_name || row?.email || '').trim();
    if (!name) return;
    sellersById.set(id, name);
  });

  const totalsByOrderId = new Map();
  (lineResult?.data || []).forEach((row) => {
    const orderId = resolveLineOrderId(row);
    if (!orderId) return;
    const running = Number(totalsByOrderId.get(orderId) || 0);
    totalsByOrderId.set(orderId, running + resolveLineTotal(row));
  });

  return todayRows.map((row) => {
    const orderId = String(row?.id || '').trim();
    const cardCode = String(row?.card_code || '').trim();
    const createdBy = resolveOrderSellerId(row);
    return {
      ...row,
      customer_name: namesByCode.get(cardCode) || '',
      seller_name:
        sellersById.get(createdBy) ||
        String(row?.seller_name || row?.seller || row?.vendedor || '').trim() ||
        sellerByCode.get(cardCode) ||
        'Sin vendedor',
      order_total: Number(totalsByOrderId.get(orderId) || 0)
    };
  });
};

export const loadSalesSummaryData = async ({ authUserId, role }) => {
  if (role !== 'admin') {
    const { fromIso, toIso } = buildTodayQueryRange();
    const { data: todayRows, error: todayError } = await fetchOrdersInRange({
      fromIso,
      toIso,
      createdBy: authUserId,
      limit: 600
    });
    if (todayError) throw todayError;
    const todayOrders = keepTodayOrders(todayRows || []);
    const todayOrderIds = Array.from(new Set(todayOrders.map((row) => String(row?.id || '').trim()).filter(Boolean)));
    if (todayOrderIds.length === 0) {
      return { allOrdersCount: 0, allSalesTotal: 0 };
    }
    const { data: linesRows, error: linesError } = await fetchLinesByOrderIds(todayOrderIds);
    if (linesError) throw linesError;
    return {
      allOrdersCount: todayOrderIds.length,
      allSalesTotal: resolveOrderTotal(linesRows || [])
    };
  }

  const { data: allOrders, error: ordersError } = await fetchAllOrders();
  if (ordersError) throw ordersError;
  const allOrderIds = (allOrders || []).map((row) => String(row?.id || '').trim()).filter(Boolean);
  if (allOrderIds.length === 0) {
    return { allOrdersCount: 0, allSalesTotal: 0 };
  }
  const { data: linesRows, error: linesError } = await fetchLinesByOrderIds(allOrderIds);
  if (linesError) throw linesError;
  return {
    allOrdersCount: allOrderIds.length,
    allSalesTotal: resolveOrderTotal(linesRows || [])
  };
};

export const loadErrorOrdersDetailsData = async ({ authUserId, role }) => {
  const { data: allOrders, error: ordersError } = await fetchAllOrders({
    createdBy: role === 'admin' ? '' : authUserId
  });
  if (ordersError) throw ordersError;

  const scopedOrders =
    role === 'admin' ? allOrders || [] : (allOrders || []).filter((row) => String(resolveOrderSellerId(row) || '').trim() === authUserId);
  const errorRows = scopedOrders.filter((row) => {
    const status = normalizeOrderStatus(row?.status);
    return status === 'error' || status === 'blocked';
  });

  if (errorRows.length === 0) return [];

  const orderIds = Array.from(new Set(errorRows.map((row) => String(row?.id || '').trim()).filter(Boolean)));
  const cardCodes = Array.from(new Set(errorRows.map((row) => String(row?.card_code || '').trim()).filter(Boolean)));
  const sellerIds = Array.from(new Set(errorRows.map((row) => resolveOrderSellerId(row)).filter(Boolean)));

  const [customerRows, lineResult, sellerRows] = await Promise.all([
    fetchCustomerNamesByCardCodes(cardCodes),
    fetchLinesByOrderIds(orderIds),
    fetchSellerNamesByIds(sellerIds)
  ]);

  const namesByCode = new Map();
  const sellerByCode = new Map();
  (customerRows || []).forEach((row) => {
    const code = String(row?.CardCode || row?.card_code || '').trim();
    if (!code) return;
    const name = String(row?.CardFName || row?.CardName || row?.card_f_name || row?.card_name || '').trim();
    if (name) namesByCode.set(code, name);
    const seller = String(row?.Vendedor || row?.vendedor || '').trim();
    if (seller) sellerByCode.set(code, seller);
  });

  const sellersById = new Map();
  (sellerRows || []).forEach((row) => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    const name = String(row?.full_name || row?.email || '').trim();
    if (!name) return;
    sellersById.set(id, name);
  });

  const totalsByOrderId = new Map();
  (lineResult?.data || []).forEach((row) => {
    const orderId = resolveLineOrderId(row);
    if (!orderId) return;
    const running = Number(totalsByOrderId.get(orderId) || 0);
    totalsByOrderId.set(orderId, running + resolveLineTotal(row));
  });

  return errorRows.slice(0, 120).map((row) => {
    const orderId = String(row?.id || '').trim();
    const cardCode = String(row?.card_code || '').trim();
    const createdBy = resolveOrderSellerId(row);
    return {
      ...row,
      customer_name: namesByCode.get(cardCode) || '',
      seller_name:
        sellersById.get(createdBy) ||
        String(row?.seller_name || row?.seller || row?.vendedor || '').trim() ||
        sellerByCode.get(cardCode) ||
        'Sin vendedor',
      order_total: Number(totalsByOrderId.get(orderId) || 0)
    };
  });
};
