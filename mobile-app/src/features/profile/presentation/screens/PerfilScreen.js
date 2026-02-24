import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, FlatList, Modal, Pressable } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ActivityIndicator,
  Button,
  Card,
  HelperText,
  SegmentedButtons,
  Surface,
  TextInput
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { clearLocalSupabaseSession, isInvalidRefreshTokenError, supabase } from '../../../../shared/infrastructure/supabaseClient';
import { flushPendingOrders, getCachedJson } from '../../../../shared/infrastructure/offlineService';
import { APP_LAYOUT, COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import { PROFILE_HERO_TOKENS } from '../../../../shared/config/heroTokens';
import { formatDateTime, formatMoney, normalizeSellerName, resolveOrderStatus } from '../../domain/profileDomain';
import { mapProductNameFromRow, normalizeItemCode, normalizeOrderLine } from '../../application/profileMappers';

const passwordSchema = z
  .object({
    newPassword: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres.'),
    confirmPassword: z.string().min(1, 'Debes confirmar la contrasena.')
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las contrasenas no coinciden.',
        path: ['confirmPassword']
      });
    }
  });

const ORDERS_PAGE_SIZE = 12;
const ORDERS_LOOKBACK_DAYS = 30;
const ADMIN_VISIBLE_SELLERS = 5;
const ORDER_LINES_PREVIEW_LIMIT = 20;
const PASSWORD_UPDATE_TIMEOUT_MS = 12000;

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
};

export default function Perfil() {
  const router = useRouter();
  const routerRef = useRef(router);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('vendedor');
  const [clientesCount, setClientesCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState([]);
  const [authUserId, setAuthUserId] = useState('');
  const [ordersNextFrom, setOrdersNextFrom] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [activeTab, setActiveTab] = useState('pedidos');
  const [orderDetailVisible, setOrderDetailVisible] = useState(false);
  const [orderStatusDetailVisible, setOrderStatusDetailVisible] = useState(false);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderCustomerName, setSelectedOrderCustomerName] = useState('');
  const [retryingOrderId, setRetryingOrderId] = useState('');
  const [orderLines, setOrderLines] = useState([]);
  const [loadingOrderLines, setLoadingOrderLines] = useState(false);
  const [orderLinesError, setOrderLinesError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [adminTab, setAdminTab] = useState('pedidos');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [sellerRows, setSellerRows] = useState([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [showAllSellers, setShowAllSellers] = useState(false);
  const [adminKpis, setAdminKpis] = useState({
    orders: 0,
    sent: 0,
    pending: 0,
    error: 0,
    activeSellers: 0
  });
  const [adminQueueHealth, setAdminQueueHealth] = useState({
    queuedTotal: 0,
    queued15m: 0,
    queued30m: 0,
    processingTotal: 0
  });
  const [sellerOrdersVisible, setSellerOrdersVisible] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [selectedSellerOrders, setSelectedSellerOrders] = useState([]);
  const [loadingSellerOrders, setLoadingSellerOrders] = useState(false);
  const [sellerOrdersError, setSellerOrdersError] = useState('');
  const orderLinesTotal = useMemo(
    () => (Array.isArray(orderLines) ? orderLines.reduce((acc, line) => acc + Number(line?.lineTotal || 0), 0) : 0),
    [orderLines]
  );
  const visibleOrderLines = useMemo(() => {
    if (!Array.isArray(orderLines)) return [];
    if (orderLines.length <= ORDER_LINES_PREVIEW_LIMIT) return orderLines;
    return orderLines.slice(-ORDER_LINES_PREVIEW_LIMIT);
  }, [orderLines]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' }
  });
  const perfilScreenOptions = useMemo(() => ({ headerShown: false }), []);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const normalizeSellerRow = useCallback((row) => {
    const sellerId = String(row?.seller_id || row?.id || '').trim();
    return {
      id: sellerId,
      fullName: String(row?.full_name || '').trim() || 'Sin nombre',
      email: String(row?.email || '').trim().toLowerCase(),
      ordersCount: Number(row?.orders_count) || 0,
      sentCount: Number(row?.sent_count) || 0,
      pendingCount: Number(row?.pending_count) || 0,
      errorCount: Number(row?.error_count) || 0,
      lastSeen: row?.last_seen || row?.last_order_at || '',
      raw: row
    };
  }, []);

  const attachCustomerNamesToOrders = useCallback(async (orders) => {
    const rows = Array.isArray(orders) ? orders : [];
    if (rows.length === 0) return [];

    const normalizeCardCode = (value) => String(value || '').trim().toUpperCase();
    const cardCodes = Array.from(new Set(rows.map((row) => normalizeCardCode(row?.card_code)).filter(Boolean)));
    if (cardCodes.length === 0) return rows;

    const namesByCode = new Map();

    try {
      const queryAttempts = [
        { select: 'CardCode, CardFName, CardName', inCol: 'CardCode' },
        { select: 'card_code, card_f_name, card_name', inCol: 'card_code' }
      ];

      for (const attempt of queryAttempts) {
        const result = await supabase.from('customers').select(attempt.select).in(attempt.inCol, cardCodes);
        if (result.error) continue;

        (result.data || []).forEach((row) => {
          const code = normalizeCardCode(row?.CardCode || row?.card_code);
          if (!code) return;
          const name = String(row?.CardFName || row?.CardName || row?.card_f_name || row?.card_name || '').trim();
          if (!name) return;
          namesByCode.set(code, name);
        });
        break;
      }
    } catch (_error) {
      // Fallback to local cache below.
    }

    const missingCodes = cardCodes.filter((code) => !namesByCode.has(code));
    if (missingCodes.length > 0 && authUserId) {
      try {
        const cacheKey = `offline:clientes:first_page:${authUserId}:${role || 'vendedor'}`;
        const cachedCustomers = await getCachedJson(cacheKey, []);
        (Array.isArray(cachedCustomers) ? cachedCustomers : []).forEach((row) => {
          const code = normalizeCardCode(row?.CardCode || row?.card_code);
          if (!code || !missingCodes.includes(code)) return;
          const name = String(row?.CardFName || row?.CardName || row?.card_f_name || row?.card_name || '').trim();
          if (!name) return;
          namesByCode.set(code, name);
        });
      } catch (_error) {
        // Keep going with resolved names.
      }
    }

    return rows.map((order) => {
      const code = normalizeCardCode(order?.card_code);
      return {
        ...order,
        customer_name: namesByCode.get(code) || String(order?.customer_name || '').trim()
      };
    });
  }, [authUserId, role]);

  const loadAdminDashboard = useCallback(async () => {
    try {
      setAdminLoading(true);
      setAdminError('');
      const { data: statsRows, error: statsError } = await supabase.rpc('get_admin_seller_stats');
      if (statsError) throw statsError;

      const normalizedRows = (statsRows || [])
        .map((row) => normalizeSellerRow(row))
        .filter((row) => row.id)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));

      const aggregate = normalizedRows.reduce(
        (acc, row) => ({
          orders: acc.orders + row.ordersCount,
          sent: acc.sent + row.sentCount,
          pending: acc.pending + row.pendingCount,
          error: acc.error + row.errorCount,
          activeSellers: acc.activeSellers + (row.ordersCount > 0 ? 1 : 0)
        }),
        { orders: 0, sent: 0, pending: 0, error: 0, activeSellers: 0 }
      );

      setSellerRows(normalizedRows);
      setAdminKpis(aggregate);
      try {
        const { data: queueRow } = await supabase.from('vw_sales_orders_queue_health').select('*').maybeSingle();
        setAdminQueueHealth({
          queuedTotal: Number(queueRow?.queued_total) || 0,
          queued15m: Number(queueRow?.queued_15m) || 0,
          queued30m: Number(queueRow?.queued_30m) || 0,
          processingTotal: Number(queueRow?.processing_total) || 0
        });
      } catch (_queueError) {
        setAdminQueueHealth({
          queuedTotal: 0,
          queued15m: 0,
          queued30m: 0,
          processingTotal: 0
        });
      }
      setAdminError('');
      setShowAllSellers(false);
    } catch (error) {
      console.error('admin dashboard load failed:', error);
      setSellerRows([]);
      setAdminKpis({ orders: 0, sent: 0, pending: 0, error: 0, activeSellers: 0 });
      setAdminQueueHealth({
        queuedTotal: 0,
        queued15m: 0,
        queued30m: 0,
        processingTotal: 0
      });
      setAdminError('No se pudo cargar el panel de vendedores.');
    } finally {
      setAdminLoading(false);
    }
  }, [normalizeSellerRow]);

  const refreshOrdersFirstPage = useCallback(async (userId) => {
    if (!userId) return;

    try {
      setOrdersLoading(true);
      const lookbackStart = new Date();
      lookbackStart.setDate(lookbackStart.getDate() - ORDERS_LOOKBACK_DAYS);
      const lookbackStartIso = lookbackStart.toISOString();

      const { data: orders, error: ordersError } = await supabase
        .from('sales_orders')
        .select('id, card_code, status, sap_docnum, created_at, doc_due_date, last_error')
        .eq('created_by', userId)
        .gte('created_at', lookbackStartIso)
        .order('created_at', { ascending: false })
        .range(0, ORDERS_PAGE_SIZE - 1);

      if (ordersError) throw ordersError;

      const rows = await attachCustomerNamesToOrders(orders || []);
      setRecentOrders(rows);
      setHasMoreOrders(rows.length === ORDERS_PAGE_SIZE);
      setOrdersNextFrom(rows.length);
    } catch (_error) {
      setRecentOrders([]);
      setHasMoreOrders(false);
      setOrdersNextFrom(0);
    } finally {
      setOrdersLoading(false);
    }
  }, [attachCustomerNamesToOrders]);

  const loadOrders = useCallback(
    async (userId, { reset: shouldReset = false } = {}) => {
      if (!userId) return;
      if (shouldReset) {
        await refreshOrdersFirstPage(userId);
        return;
      }
      if (loadingMoreOrders || !hasMoreOrders) return;

      try {
        setLoadingMoreOrders(true);
        const from = ordersNextFrom;
        const to = from + ORDERS_PAGE_SIZE - 1;
        const lookbackStart = new Date();
        lookbackStart.setDate(lookbackStart.getDate() - ORDERS_LOOKBACK_DAYS);
        const lookbackStartIso = lookbackStart.toISOString();

        const { data: orders, error: ordersError } = await supabase
          .from('sales_orders')
          .select('id, card_code, status, sap_docnum, created_at, doc_due_date, last_error')
          .eq('created_by', userId)
          .gte('created_at', lookbackStartIso)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (ordersError) throw ordersError;

        const rows = await attachCustomerNamesToOrders(orders || []);
        setRecentOrders((prev) => [...prev, ...rows]);
        setHasMoreOrders(rows.length === ORDERS_PAGE_SIZE);
        setOrdersNextFrom(from + rows.length);
      } catch (_error) {
        // Keep previous state if pagination fails.
      } finally {
        setLoadingMoreOrders(false);
      }
    },
    [hasMoreOrders, loadingMoreOrders, ordersNextFrom, refreshOrdersFirstPage, attachCustomerNamesToOrders]
  );

  const loadPerfil = useCallback(
    async ({ showLoader = true } = {}) => {
      try {
        if (showLoader) setLoading(true);
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user?.id) throw new Error('Sin sesion');
        setAuthUserId(user.id);
        try {
          await flushPendingOrders();
        } catch (_error) {
          // Keep loading profile even if background order sync fails.
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;

        const profileName = (profile?.full_name || '').trim();
        const profileRole = (profile?.role || 'vendedor').trim().toLowerCase();
        setFullName(profileName);
        setRole(profileRole);

        let countQuery = supabase.from('customers').select('*', { count: 'exact', head: true }).not('Nivel', 'ilike', 'EMPLEADOS');

        if (profileRole !== 'admin') {
          countQuery = countQuery.eq('Vendedor', normalizeSellerName(profileName));
        }

        const { count, error: countError } = await countQuery;
        if (countError) throw countError;
        setClientesCount(count || 0);

        await refreshOrdersFirstPage(user.id);
        if (profileRole === 'admin') {
          await loadAdminDashboard();
        }
      } catch (_error) {
        if (isInvalidRefreshTokenError(_error)) {
          await clearLocalSupabaseSession();
          routerRef.current?.replace?.({ pathname: '/login', params: { refresh: String(Date.now()) } });
          return;
        }
        setFullName('No disponible');
        setRole('vendedor');
        setClientesCount(0);
        setRecentOrders([]);
        setHasMoreOrders(false);
        setOrdersNextFrom(0);
        setSellerRows([]);
        setAdminError('No se pudo cargar el panel de administracion.');
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    // Keep bootstrap deps stable to avoid repeated load loops.
    [loadAdminDashboard, refreshOrdersFirstPage]
  );

  useEffect(() => {
    loadPerfil();
  }, [loadPerfil]);

  useFocusEffect(
    useCallback(() => {
      if (!authUserId) return undefined;
      let active = true;

      const syncAndRefresh = async () => {
        try {
          await flushPendingOrders();
        } catch (_error) {
          // Ignore transient sync errors on focus refresh.
        }
        if (!active) return;
        await refreshOrdersFirstPage(authUserId);
        if (role === 'admin') {
          await loadAdminDashboard();
        }
      };

      syncAndRefresh();
      return () => {
        active = false;
      };
    }, [authUserId, role, loadAdminDashboard, refreshOrdersFirstPage])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPerfil({ showLoader: false });
    setRefreshing(false);
  };

  const handleLoadMoreOrders = async () => {
    if (!authUserId) return;
    await loadOrders(authUserId, { reset: false });
  };

  const closeOrderStatusDetail = useCallback(() => {
    setOrderStatusDetailVisible(false);
    setSelectedOrderStatus(null);
  }, []);

  const handleShowOrderStatus = useCallback((order) => {
    const safeStatus = String(order?.status || '').trim().toLowerCase();
    const safeError = String(order?.last_error || '').trim();
    const statusInfo = resolveOrderStatus(safeStatus);

    let message = '';
    if (safeError) {
      message = safeError;
    } else if (safeStatus === 'sent') {
      message = 'El pedido fue enviado correctamente a SAP.';
    } else if (safeStatus === 'pending') {
      message = 'El pedido esta pendiente de envio al integrador SAP.';
    } else if (safeStatus === 'processing') {
      message = 'El pedido esta en proceso de envio a SAP.';
    } else if (safeStatus === 'draft') {
      message = 'El pedido esta guardado como borrador.';
    } else if (safeStatus === 'blocked') {
      message = 'El pedido esta bloqueado y requiere correccion manual.';
    } else if (safeStatus === 'queued') {
      message = 'El pedido esta en cola para envio automatico.';
    } else if (safeStatus === 'error') {
      message = 'Ocurrio un error al enviar el pedido.';
    } else {
      message = 'Sin detalle adicional para este estado.';
    }

    setSelectedOrderStatus({
      label: statusInfo.label,
      color: statusInfo.color,
      message,
      status: safeStatus || 'sin_estado'
    });
    setOrderStatusDetailVisible(true);
  }, []);

  const loadOrderLines = useCallback(
    async (orderId) => {
      if (!orderId) return;
      try {
        setLoadingOrderLines(true);
        setOrderLinesError('');
        setOrderLines([]);

        let { data, error } = await supabase
          .from('sales_order_lines')
          .select('*')
          .eq('sales_order_id', orderId)
          .order('id', { ascending: true });

        if (error) {
          const fallback = await supabase
            .from('sales_order_lines')
            .select('*')
            .eq('order_id', orderId)
            .order('id', { ascending: true });
          data = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;

        let normalized = (data || []).map((row, idx) => normalizeOrderLine(row, idx));
        const rawItemCodes = Array.from(
          new Set((data || []).map((row) => String(row?.item_code || row?.ItemCode || '')).filter(Boolean))
        );
        const itemCodes = Array.from(new Set([...rawItemCodes, ...normalized.map((line) => line.itemCode).filter(Boolean)]));

        if (itemCodes.length > 0) {
          let productsData = null;
          let productsError = null;
          const queryAttempts = [
            { select: 'ItemCode, ItemName', inCol: 'ItemCode' },
            { select: 'item_code, item_name', inCol: 'item_code' },
            { select: 'itemcode, itemname', inCol: 'itemcode' }
          ];

          for (const attempt of queryAttempts) {
            // Try common schema variants until one works.
            const result = await supabase.from('products').select(attempt.select).in(attempt.inCol, itemCodes);
            if (!result.error) {
              productsData = result.data;
              productsError = null;
              break;
            }
            productsError = result.error;
          }

          if (!productsError && Array.isArray(productsData)) {
            const namesByCode = new Map();
            productsData.forEach((row) => {
              const { code, name } = mapProductNameFromRow(row);
              if (!code || !name) return;
              namesByCode.set(code, name);
              namesByCode.set(normalizeItemCode(code), name);
            });
            normalized = normalized.map((line) => ({
              ...line,
              itemName: namesByCode.get(line.itemCode) || namesByCode.get(normalizeItemCode(line.itemCode)) || line.itemName
            }));
          } else if (productsError) {
            console.error('products lookup failed for order lines:', {
              message: productsError.message,
              code: productsError.code,
              details: productsError.details
            });
          }
        }

        setOrderLines(normalized);
      } catch (error) {
        console.error('load order lines failed:', error);
        setOrderLines([]);
        setOrderLinesError('No se pudieron cargar las lineas de este pedido.');
      } finally {
        setLoadingOrderLines(false);
      }
    },
    []
  );

  const loadOrderCustomerName = useCallback(async (cardCode) => {
    const safeCardCode = String(cardCode || '').trim();
    if (!safeCardCode) {
      setSelectedOrderCustomerName('');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('CardName, CardFName')
        .eq('CardCode', safeCardCode)
        .maybeSingle();
      if (error) throw error;

      const resolved = String(data?.CardFName || data?.CardName || '').trim();
      setSelectedOrderCustomerName(resolved);
    } catch (_error) {
      setSelectedOrderCustomerName('');
    }
  }, []);

  const handleOpenOrderDetail = async (order) => {
    setSelectedOrder(order);
    setOrderDetailVisible(true);
    await Promise.all([loadOrderLines(order?.id), loadOrderCustomerName(order?.card_code)]);
  };

  const handleCloseOrderDetail = () => {
    setOrderDetailVisible(false);
    setSelectedOrder(null);
    setRetryingOrderId('');
    setSelectedOrderCustomerName('');
    setOrderLines([]);
    setOrderLinesError('');
  };

  const handleRetryOrder = useCallback(async () => {
    const orderId = String(selectedOrder?.id || '').trim();
    const currentStatus = String(selectedOrder?.status || '').trim().toLowerCase();
    if (!orderId || !authUserId || role === 'admin' || currentStatus !== 'error') {
      return;
    }

    try {
      setRetryingOrderId(orderId);
      const updateAttempts = [
        { status: 'queued', last_error: null, updated_at: new Date().toISOString() },
        { status: 'queued', last_error: null },
        { status: 'queued' }
      ];

      let updateError = null;
      for (const payload of updateAttempts) {
        const result = await supabase
          .from('sales_orders')
          .update(payload)
          .eq('id', orderId)
          .eq('created_by', authUserId)
          .select('id, status, last_error')
          .maybeSingle();
        if (!result.error) {
          updateError = null;
          break;
        }
        updateError = result.error;
      }

      if (updateError) throw updateError;

      setSelectedOrder((prev) => (prev ? { ...prev, status: 'queued', last_error: '' } : prev));
      setRecentOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((row) =>
          String(row?.id || '').trim() === orderId ? { ...row, status: 'queued', last_error: '' } : row
        )
      );
      await refreshOrdersFirstPage(authUserId);
      alert('Pedido encolado nuevamente para reintento automatico.');
    } catch (error) {
      alert(error?.message || 'No se pudo reintentar el pedido.');
    } finally {
      setRetryingOrderId('');
    }
  }, [selectedOrder, authUserId, role, refreshOrdersFirstPage]);

  const handleChangePassword = handleSubmit(async ({ newPassword }) => {
    try {
      setSavingPassword(true);
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password: newPassword.trim() }),
        PASSWORD_UPDATE_TIMEOUT_MS,
        'La actualizacion de contrasena esta tardando demasiado. Intenta nuevamente.'
      );
      if (error) throw error;

      reset({ newPassword: '', confirmPassword: '' });
      alert('Contrasena actualizada correctamente.');
    } catch (error) {
      alert(error.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setSavingPassword(false);
    }
  });

  const loadSellerOrders = useCallback(async (sellerId) => {
    if (!sellerId) return;

    try {
      setLoadingSellerOrders(true);
      setSellerOrdersError('');
      setSelectedSellerOrders([]);

      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, card_code, status, sap_docnum, created_at, last_error')
        .eq('created_by', sellerId)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw error;
      const rows = await attachCustomerNamesToOrders(data || []);
      setSelectedSellerOrders(rows);
    } catch (_error) {
      setSelectedSellerOrders([]);
      setSellerOrdersError('No se pudieron cargar los pedidos del vendedor.');
    } finally {
      setLoadingSellerOrders(false);
    }
  }, [attachCustomerNamesToOrders]);

  const handleOpenSellerOrders = async (seller) => {
    setSelectedSeller(seller);
    setSellerOrdersVisible(true);
    await loadSellerOrders(seller?.id);
  };

  const handleCloseSellerOrders = () => {
    setSellerOrdersVisible(false);
    setSelectedSeller(null);
    setSelectedSellerOrders([]);
    setSellerOrdersError('');
  };

  const renderSecurityForm = () => (
    <>
      <Text style={styles.sectionTitle}>Seguridad</Text>
      <Controller
        control={control}
        name="newPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            mode="outlined"
            label="Nueva contrasena"
            placeholder="Minimo 6 caracteres"
            secureTextEntry={!showPassword}
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(errors.newPassword)}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            textColor={COLORS.text}
            style={styles.paperInput}
            right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword((prev) => !prev)} />}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.newPassword)} style={styles.helperText}>
        {errors.newPassword?.message}
      </HelperText>

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            mode="outlined"
            label="Confirmar contrasena"
            placeholder="Repite la contrasena"
            secureTextEntry={!showConfirmPassword}
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(errors.confirmPassword)}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            textColor={COLORS.text}
            style={styles.paperInput}
            right={
              <TextInput.Icon
                icon={showConfirmPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
              />
            }
          />
        )}
      />
      <HelperText type="error" visible={Boolean(errors.confirmPassword)} style={styles.helperText}>
        {errors.confirmPassword?.message}
      </HelperText>

      <Button
        mode="contained"
        buttonColor={COLORS.primary}
        style={styles.submitButton}
        loading={savingPassword}
        disabled={savingPassword}
        onPress={handleChangePassword}
      >
        ACTUALIZAR CONTRASENA
      </Button>
    </>
  );

  const renderOrdersSection = (title = 'Mis ultimos pedidos') => (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionHint}>Mostrando pedidos de los ultimos {ORDERS_LOOKBACK_DAYS} dias.</Text>
      {ordersLoading ? (
        <View style={styles.ordersList}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <View key={`order-skeleton-${idx}`} style={styles.orderSkeletonRow}>
              <View style={styles.orderSkeletonLineLg} />
              <View style={styles.orderSkeletonLineMd} />
              <View style={styles.orderSkeletonLineSm} />
            </View>
          ))}
        </View>
      ) : recentOrders.length === 0 ? (
        <Text style={styles.ordersEmpty}>Aun no hay pedidos en los ultimos {ORDERS_LOOKBACK_DAYS} dias.</Text>
      ) : (
        <View style={styles.ordersList}>
          {recentOrders.map((order) => {
            const statusInfo = resolveOrderStatus(order?.status);
            return (
              <Pressable key={order.id} style={styles.orderRow} onPress={() => handleOpenOrderDetail(order)}>
                <View style={styles.orderMain}>
                  <Text style={styles.orderTitle}>
                    {order?.sap_docnum ? `Pedido SAP #${order.sap_docnum}` : `Pedido ${order?.id?.slice(0, 8) || ''}`}
                  </Text>
                  <Text style={styles.orderMeta}>
                    Cliente:{' '}
                    {order?.customer_name
                      ? `${order.customer_name} (${order?.card_code || 'N/A'})`
                      : order?.card_code || 'N/A'}{' '}
                    | Entrega: {order?.doc_due_date || 'N/A'}
                  </Text>
                  <Text style={styles.orderDate}>{formatDateTime(order?.created_at)}</Text>
                </View>
                <View style={styles.orderRightWrap}>
                  <Pressable
                    style={[styles.statusPill, { backgroundColor: `${statusInfo.color}22` }]}
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      handleShowOrderStatus(order);
                    }}
                  >
                    <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  </Pressable>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {hasMoreOrders && (
        <Button
          mode="outlined"
          style={styles.loadMoreButton}
          loading={loadingMoreOrders}
          disabled={loadingMoreOrders}
          onPress={handleLoadMoreOrders}
        >
          CARGAR MAS
        </Button>
      )}
    </>
  );

  const renderVendedorView = () => (
    <>
      <View style={styles.row}>
        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>{role === 'admin' ? 'Admin' : 'Vendedor'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Clientes Asignados</Text>
        <Text style={styles.value}>{clientesCount}</Text>
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={setActiveTab}
        style={styles.tabs}
        buttons={[
          { value: 'pedidos', label: 'Pedidos', icon: 'receipt-text-outline' },
          { value: 'seguridad', label: 'Seguridad', icon: 'shield-lock-outline' }
        ]}
      />

      {activeTab === 'pedidos' ? (
        renderOrdersSection(`Mis pedidos (${ORDERS_LOOKBACK_DAYS} dias)`)
      ) : (
        renderSecurityForm()
      )}
    </>
  );

  const renderAdminSkeleton = () => (
    <View style={styles.adminListWrap}>
      {Array.from({ length: 4 }).map((_, idx) => (
        <View key={`seller-skeleton-${idx}`} style={styles.adminSkeletonCard}>
          <View style={styles.adminSkeletonLg} />
          <View style={styles.adminSkeletonSm} />
          <View style={styles.adminSkeletonStatsRow}>
            <View style={styles.adminSkeletonStat} />
            <View style={styles.adminSkeletonStat} />
            <View style={styles.adminSkeletonStat} />
          </View>
        </View>
      ))}
    </View>
  );

  const normalizedSellerSearch = sellerSearch.trim().toLowerCase();
  const filteredSellerRows = sellerRows.filter((seller) => {
    if (!normalizedSellerSearch) return true;
    return (
      String(seller.fullName || '')
        .toLowerCase()
        .includes(normalizedSellerSearch) ||
      String(seller.email || '')
        .toLowerCase()
        .includes(normalizedSellerSearch)
    );
  });
  const visibleSellerRows = showAllSellers ? filteredSellerRows : filteredSellerRows.slice(0, ADMIN_VISIBLE_SELLERS);
  const hasHiddenSellers = filteredSellerRows.length > ADMIN_VISIBLE_SELLERS;

  const renderAdminView = () => (
    <>
      <View style={styles.row}>
        <Text style={styles.label}>Rol</Text>
        <Text style={styles.value}>Admin</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Clientes Totales</Text>
        <Text style={styles.value}>{clientesCount}</Text>
      </View>

      <View style={styles.adminKpiGrid}>
        <Surface style={styles.adminKpiCard} elevation={0}>
          <Text style={styles.adminKpiLabel}>Pedidos</Text>
          <Text style={styles.adminKpiValue}>{adminKpis.orders}</Text>
        </Surface>
        <Surface style={styles.adminKpiCard} elevation={0}>
          <Text style={styles.adminKpiLabel}>Enviados</Text>
          <Text style={styles.adminKpiValue}>{adminKpis.sent}</Text>
        </Surface>
        <Surface style={styles.adminKpiCard} elevation={0}>
          <Text style={styles.adminKpiLabel}>Pendientes</Text>
          <Text style={styles.adminKpiValue}>{adminKpis.pending}</Text>
        </Surface>
        <Surface style={styles.adminKpiCard} elevation={0}>
          <Text style={styles.adminKpiLabel}>Errores</Text>
          <Text style={styles.adminKpiValue}>{adminKpis.error}</Text>
        </Surface>
      </View>
      <Text style={styles.adminKpiFooter}>Vendedores activos con pedidos: {adminKpis.activeSellers}</Text>
      <Surface style={styles.adminWatchdogCard} elevation={0}>
        <View style={styles.adminWatchdogHeader}>
          <Text style={styles.adminWatchdogTitle}>Watchdog de cola</Text>
          <Text style={[styles.adminWatchdogValue, adminQueueHealth.queued15m > 0 ? styles.adminWatchdogAlert : null]}>
            {adminQueueHealth.queued15m}
          </Text>
        </View>
        <Text style={styles.adminWatchdogSubtitle}>
          Pedidos en cola por mas de 15 minutos
        </Text>
        <View style={styles.adminWatchdogMetaRow}>
          <Text style={styles.adminWatchdogMeta}>Cola total: {adminQueueHealth.queuedTotal}</Text>
          <Text style={styles.adminWatchdogMeta}>Cola 30m: {adminQueueHealth.queued30m}</Text>
          <Text style={styles.adminWatchdogMeta}>Procesando: {adminQueueHealth.processingTotal}</Text>
        </View>
      </Surface>

      <SegmentedButtons
        value={adminTab}
        onValueChange={setAdminTab}
        style={styles.tabs}
        buttons={[
          { value: 'pedidos', label: 'Pedidos', icon: 'receipt-text-outline' },
          { value: 'equipo', label: 'Vendedores', icon: 'account-group-outline' },
          { value: 'seguridad', label: 'Mi Seguridad', icon: 'shield-lock-outline' }
        ]}
      />

      {adminTab === 'pedidos' ? (
        renderOrdersSection('Mis pedidos')
      ) : adminTab === 'equipo' ? (
        <>
          <Text style={styles.sectionTitle}>Gestion de vendedores</Text>
          <TextInput
            mode="outlined"
            placeholder="Buscar vendedor por nombre o correo"
            value={sellerSearch}
            onChangeText={setSellerSearch}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            textColor={COLORS.text}
            style={styles.adminSearchInput}
            left={<TextInput.Icon icon="magnify" />}
          />
          {adminLoading ? (
            renderAdminSkeleton()
          ) : adminError ? (
            <Text style={styles.ordersEmpty}>{adminError}</Text>
          ) : filteredSellerRows.length === 0 ? (
            <Text style={styles.ordersEmpty}>No hay vendedores para mostrar.</Text>
          ) : (
            <View style={styles.adminListWrap}>
              {visibleSellerRows.map((seller) => {
                return (
                  <Pressable key={seller.id} onPress={() => handleOpenSellerOrders(seller)}>
                    <Surface style={styles.sellerCard} elevation={1}>
                      <View style={styles.sellerHeader}>
                        <View style={styles.sellerTitleWrap}>
                          <Text style={styles.sellerName}>{seller.fullName}</Text>
                          <Text style={styles.sellerEmail}>{seller.email || seller.id}</Text>
                          <Text style={styles.sellerHint}>Toca para ver pedidos</Text>
                        </View>
                      </View>

                      <View style={styles.sellerMetricsRow}>
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>Pedidos</Text>
                          <Text style={styles.metricValue}>{seller.ordersCount}</Text>
                        </View>
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>Enviados</Text>
                          <Text style={styles.metricValue}>{seller.sentCount}</Text>
                        </View>
                      </View>

                      <Text style={styles.sellerLastSeen}>Ultimo pedido: {formatDateTime(seller.lastSeen)}</Text>
                    </Surface>
                  </Pressable>
                );
              })}
              {hasHiddenSellers && (
                <Button mode="text" compact onPress={() => setShowAllSellers((prev) => !prev)}>
                  {showAllSellers ? 'Ver menos' : `Ver mas (${filteredSellerRows.length - ADMIN_VISIBLE_SELLERS})`}
                </Button>
              )}
            </View>
          )}
        </>
      ) : (
        renderSecurityForm()
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={perfilScreenOptions} />
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          <View style={styles.stickyHeroWrap}>
            <LinearGradient
              colors={role === 'admin' ? ['#0E3D75', '#1664A0'] : ['#1D4E89', '#2274A5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, GLOBAL_STYLES.shadow]}
            >
              <View style={styles.heroIconWrap}>
                <Ionicons
                  name={role === 'admin' ? 'shield-checkmark' : 'person-circle'}
                  size={PROFILE_HERO_TOKENS.ICON_SIZE}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitle}>{role === 'admin' ? 'Panel admin' : 'Mi perfil'}</Text>
                <Text style={styles.heroSubtitle}>{fullName || 'Sin nombre'}</Text>
              </View>
            </LinearGradient>
          </View>

          <Card style={[styles.card, GLOBAL_STYLES.shadow]} mode="contained">
            <Card.Content style={styles.cardContent}>
              {role === 'admin' ? renderAdminView() : renderVendedorView()}
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <Modal visible={orderDetailVisible} transparent animationType="fade" onRequestClose={handleCloseOrderDetail}>
        <View style={styles.detailBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseOrderDetail} />
          <View style={styles.detailPanel}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>
                {selectedOrder?.sap_docnum ? `Pedido SAP #${selectedOrder.sap_docnum}` : `Pedido ${selectedOrder?.id?.slice(0, 8) || ''}`}
              </Text>
              <Button compact onPress={handleCloseOrderDetail}>
                Cerrar
              </Button>
            </View>

            <Text style={styles.detailMeta}>
              Cliente: {selectedOrderCustomerName || 'Sin nombre'} ({selectedOrder?.card_code || 'N/A'})
            </Text>
            <Text style={styles.detailMeta}>Entrega: {selectedOrder?.doc_due_date || 'N/A'}</Text>
            <Text style={styles.detailMeta}>Creado: {formatDateTime(selectedOrder?.created_at)}</Text>
            {!!String(selectedOrder?.last_error || '').trim() && (
              <Text style={styles.detailMetaError}>Ultimo error: {String(selectedOrder?.last_error || '').trim()}</Text>
            )}
            <Text style={styles.detailMetaTotal}>Total pedido: {formatMoney(orderLinesTotal)}</Text>
            {role !== 'admin' && String(selectedOrder?.status || '').trim().toLowerCase() === 'error' && (
              <Button
                mode="contained"
                buttonColor={COLORS.secondary}
                style={styles.retryOrderButton}
                loading={retryingOrderId === String(selectedOrder?.id || '').trim()}
                disabled={retryingOrderId === String(selectedOrder?.id || '').trim()}
                onPress={handleRetryOrder}
              >
                Intentar nuevamente
              </Button>
            )}
            {orderLines.length > ORDER_LINES_PREVIEW_LIMIT && (
              <Text style={styles.detailMetaHighlight}>
                Mostrando las ultimas {ORDER_LINES_PREVIEW_LIMIT} lineas de {orderLines.length}.
              </Text>
            )}

            <View style={styles.detailLinesWrap}>
              {loadingOrderLines ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : orderLinesError ? (
                <Text style={styles.ordersEmpty}>{orderLinesError}</Text>
              ) : orderLines.length === 0 ? (
                <Text style={styles.ordersEmpty}>Este pedido no tiene lineas registradas.</Text>
              ) : (
                <FlatList
                  data={visibleOrderLines}
                  keyExtractor={(item, idx) => `${item.id}-${item.itemCode || idx}`}
                  style={styles.linesList}
                  contentContainerStyle={styles.linesListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  renderItem={({ item }) => (
                    <View style={styles.lineRow}>
                      <View style={styles.lineMain}>
                        <Text style={styles.lineTitle}>{item.itemName || item.itemCode || 'Articulo sin nombre'}</Text>
                        <Text style={styles.lineMeta}>
                          Codigo: {item.itemCode || 'N/A'}
                          {item.uom ? ` | UOM: ${item.uom}` : ''}
                          {item.warehouseCode ? ` | Almacen: ${item.warehouseCode}` : ''}
                        </Text>
                      </View>
                      <View style={styles.lineTotals}>
                        <Text style={styles.lineQty}>x{item.quantity}</Text>
                        <Text style={styles.linePrice}>{formatMoney(item.unitPrice)}</Text>
                        <Text style={styles.lineSubtotal}>{formatMoney(item.lineTotal)}</Text>
                      </View>
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sellerOrdersVisible} transparent animationType="fade" onRequestClose={handleCloseSellerOrders}>
        <View style={styles.detailBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseSellerOrders} />
          <View style={styles.detailPanel}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Pedidos de {selectedSeller?.fullName || 'vendedor'}</Text>
              <Button compact onPress={handleCloseSellerOrders}>
                Cerrar
              </Button>
            </View>

            <Text style={styles.detailMeta}>{selectedSeller?.email || selectedSeller?.id || ''}</Text>

            <View style={styles.detailLinesWrap}>
              {loadingSellerOrders ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : sellerOrdersError ? (
                <Text style={styles.ordersEmpty}>{sellerOrdersError}</Text>
              ) : selectedSellerOrders.length === 0 ? (
                <Text style={styles.ordersEmpty}>Este vendedor no tiene pedidos recientes.</Text>
              ) : (
                <FlatList
                  data={selectedSellerOrders}
                  keyExtractor={(item) => item.id}
                  style={styles.linesList}
                  contentContainerStyle={styles.linesListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  renderItem={({ item }) => {
                    const statusInfo = resolveOrderStatus(item?.status);
                    return (
                      <View style={styles.sellerOrderRow}>
                        <View style={styles.sellerOrderMain}>
                          <Text style={styles.sellerOrderTitle}>
                            {item?.sap_docnum ? `SAP #${item.sap_docnum}` : `Pedido ${item?.id?.slice(0, 8) || ''}`}
                          </Text>
                          <Text style={styles.sellerOrderMeta}>
                            Cliente:{' '}
                            {item?.customer_name
                              ? `${item.customer_name} (${item?.card_code || 'N/A'})`
                              : item?.card_code || 'N/A'}
                          </Text>
                          <Text style={styles.sellerOrderMeta}>{formatDateTime(item?.created_at)}</Text>
                        </View>
                        <Pressable
                          style={[styles.statusPill, { backgroundColor: `${statusInfo.color}22` }]}
                          onPress={() => handleShowOrderStatus(item)}
                        >
                          <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                        </Pressable>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={orderStatusDetailVisible} transparent animationType="fade" onRequestClose={closeOrderStatusDetail}>
        <View style={styles.detailBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeOrderStatusDetail} />
          <View style={styles.statusModalPanel}>
            <View style={styles.statusModalHeader}>
              <Text style={styles.statusModalTitle}>Detalle de estado</Text>
              <Pressable
                style={[styles.statusModalBadge, { backgroundColor: `${selectedOrderStatus?.color || COLORS.textLight}22` }]}
              >
                <Text style={[styles.statusModalBadgeText, { color: selectedOrderStatus?.color || COLORS.textLight }]}>
                  {selectedOrderStatus?.label || 'Sin estado'}
                </Text>
              </Pressable>
            </View>
            <ScrollView style={styles.statusModalBody} contentContainerStyle={styles.statusModalBodyContent}>
              <Text style={styles.statusModalMessage}>{selectedOrderStatus?.message || 'Sin detalle disponible.'}</Text>
            </ScrollView>
            <View style={styles.statusModalFooter}>
              <Button mode="contained" buttonColor={COLORS.primary} onPress={closeOrderStatusDetail}>
                CERRAR
              </Button>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: APP_LAYOUT.SCREEN_PADDING,
    paddingTop: 0
  },
  scrollContent: { paddingBottom: 24 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stickyHeroWrap: {
    backgroundColor: COLORS.background,
    paddingTop: APP_LAYOUT.SCREEN_PADDING,
    paddingBottom: 10
  },
  card: {
    marginTop: 0,
    backgroundColor: '#FFF',
    borderRadius: 14
  },
  cardContent: {
    paddingTop: 0
  },
  hero: {
    borderRadius: PROFILE_HERO_TOKENS.BORDER_RADIUS,
    height: PROFILE_HERO_TOKENS.HEIGHT,
    paddingHorizontal: PROFILE_HERO_TOKENS.PADDING_HORIZONTAL,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroIconWrap: {
    width: PROFILE_HERO_TOKENS.ICON_WRAP,
    height: PROFILE_HERO_TOKENS.ICON_WRAP,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  heroTextWrap: { marginLeft: 10, flex: 1 },
  heroTitle: {
    color: '#EAF4FF',
    fontSize: PROFILE_HERO_TOKENS.TITLE_FONT_SIZE,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  heroSubtitle: { color: '#FFFFFF', fontSize: PROFILE_HERO_TOKENS.SUBTITLE_FONT_SIZE, fontWeight: '800', marginTop: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F4',
    paddingVertical: 12
  },
  label: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
  value: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  tabs: { marginTop: 12, marginBottom: 6 },
  sectionTitle: { marginTop: 12, marginBottom: 8, color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  sectionHint: { marginBottom: 8, color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  ordersEmpty: { color: COLORS.textLight, fontSize: 13, marginBottom: 8 },
  ordersList: { marginBottom: 6 },
  orderSkeletonRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  orderSkeletonLineLg: {
    width: '68%',
    height: 12,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderSkeletonLineMd: {
    marginTop: 8,
    width: '84%',
    height: 10,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderSkeletonLineSm: {
    marginTop: 8,
    width: '42%',
    height: 9,
    borderRadius: 8,
    backgroundColor: '#EEF1F4'
  },
  orderRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  orderMain: { flex: 1, marginRight: 8 },
  orderRightWrap: { alignItems: 'flex-end', gap: 4 },
  orderTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  orderMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  orderDate: { color: COLORS.textLight, fontSize: 11, marginTop: 3 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  loadMoreButton: { marginTop: 4, borderRadius: 8 },
  paperInput: { backgroundColor: COLORS.white },
  helperText: { marginTop: 2, marginBottom: 0, paddingHorizontal: 0 },
  submitButton: { marginTop: 12, borderRadius: 10 },

  adminSearchInput: { marginTop: 8, backgroundColor: '#FFF' },
  adminKpiGrid: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  adminKpiCard: {
    width: '48%',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#E7EEF8'
  },
  adminKpiLabel: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  adminKpiValue: { marginTop: 2, color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  adminKpiFooter: { marginTop: 8, color: COLORS.textLight, fontSize: 12, fontWeight: '600' },
  adminWatchdogCard: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#E7EEF8'
  },
  adminWatchdogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  adminWatchdogTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  adminWatchdogValue: { color: '#16A085', fontSize: 20, fontWeight: '800' },
  adminWatchdogAlert: { color: '#E74C3C' },
  adminWatchdogSubtitle: { marginTop: 3, color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  adminWatchdogMetaRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  adminWatchdogMeta: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },

  adminListWrap: { gap: 10, marginTop: 8 },
  sellerCard: {
    borderRadius: 14,
    backgroundColor: '#FFF',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9EEF6'
  },
  sellerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sellerTitleWrap: { flex: 1, marginRight: 10 },
  sellerName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sellerEmail: { marginTop: 2, color: COLORS.textLight, fontSize: 12 },
  sellerHint: { marginTop: 4, color: COLORS.primary, fontSize: 11, fontWeight: '600' },

  sellerMetricsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  metricBox: {
    width: '48%',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#E7EEF8'
  },
  metricLabel: { color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  metricValue: { color: COLORS.primary, fontSize: 13, fontWeight: '800', marginTop: 2 },
  sellerLastSeen: { marginTop: 10, color: COLORS.textLight, fontSize: 11 },
  adminSkeletonCard: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 12,
    padding: 12
  },
  adminSkeletonLg: { width: '52%', height: 12, borderRadius: 8, backgroundColor: '#EEF1F4' },
  adminSkeletonSm: { marginTop: 8, width: '38%', height: 10, borderRadius: 8, backgroundColor: '#EEF1F4' },
  adminSkeletonStatsRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  adminSkeletonStat: { flex: 1, height: 34, borderRadius: 10, backgroundColor: '#EEF1F4' },

  detailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  detailPanel: {
    width: '100%',
    maxWidth: 580,
    height: '80%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    overflow: 'hidden'
  },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailTitle: { color: COLORS.primary, fontWeight: '800', fontSize: 16, marginRight: 8, flex: 1 },
  detailMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 4 },
  detailMetaError: { color: '#B00020', fontSize: 12, marginTop: 4, fontWeight: '600' },
  detailMetaTotal: { color: COLORS.primary, fontSize: 13, marginTop: 6, fontWeight: '800' },
  retryOrderButton: { marginTop: 10, borderRadius: 8, alignSelf: 'flex-start' },
  detailMetaHighlight: { color: COLORS.primary, fontSize: 12, marginTop: 6, fontWeight: '700' },
  detailLinesWrap: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F4', paddingTop: 8, minHeight: 120, flex: 1 },
  linesList: { flex: 1 },
  linesListContent: { paddingBottom: 8 },
  lineRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  lineMain: { flex: 1, marginRight: 8 },
  lineTitle: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  lineMeta: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  lineTotals: { alignItems: 'flex-end' },
  lineQty: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  linePrice: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  lineSubtotal: { color: COLORS.primary, fontSize: 12, marginTop: 2, fontWeight: '700' },
  sellerOrderRow: {
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  sellerOrderMain: { flex: 1, marginRight: 8 },
  sellerOrderTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  sellerOrderMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  statusModalPanel: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '72%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14
  },
  statusModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  statusModalTitle: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '800',
    flex: 1
  },
  statusModalBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusModalBadgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  statusModalBody: {
    marginTop: 12,
    maxHeight: 260
  },
  statusModalBodyContent: {
    paddingBottom: 6
  },
  statusModalMessage: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20
  },
  statusModalFooter: {
    marginTop: 14,
    alignItems: 'flex-end'
  }
});
