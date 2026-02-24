import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Button, Divider, Portal, Surface } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_LAYOUT, COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import { clearLocalSupabaseSession, isInvalidRefreshTokenError, supabase } from '../../../../shared/infrastructure/supabaseClient';
import { HOME_HERO_TOKENS } from '../../../../shared/config/heroTokens';
import AdminStickyHero from '../components/AdminStickyHero';
import {
  formatDateTime,
  formatNotificationTime,
  getHealthLabel,
  normalizeSellerName,
  toMoney
} from '../../domain/homeDomain';
import {
  loadAdminDashboardData,
  loadErrorOrdersDetailsData,
  loadOrdersTodayDetailsData,
  loadSalesSummaryData,
  loadUserContext,
  loadVendorKpis
} from '../../application/homeDashboardService';
import SellerHero from '../components/SellerHero';
import AdminDashboardSection from '../components/AdminDashboardSection';
import SellerDashboardSection from '../components/SellerDashboardSection';
import OrdersTodayModal from '../components/OrdersTodayModal';
import SalesSummaryModal from '../components/SalesSummaryModal';
import ErrorOrdersModal from '../components/ErrorOrdersModal';
const MAX_UNLOCK_NOTIFICATIONS = 30;
const NOTIFICATION_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 5000;

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [authUserId, setAuthUserId] = useState('');
  const [profileRole, setProfileRole] = useState('vendedor');
  const [todayOrders, setTodayOrders] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState('');
  const [ordersTodayModalVisible, setOrdersTodayModalVisible] = useState(false);
  const [ordersTodayRows, setOrdersTodayRows] = useState([]);
  const [loadingOrdersToday, setLoadingOrdersToday] = useState(false);
  const [errorOrdersModalVisible, setErrorOrdersModalVisible] = useState(false);
  const [errorOrdersRows, setErrorOrdersRows] = useState([]);
  const [loadingErrorOrders, setLoadingErrorOrders] = useState(false);
  const [salesSummaryModalVisible, setSalesSummaryModalVisible] = useState(false);
  const [allOrdersCount, setAllOrdersCount] = useState(0);
  const [allSalesTotal, setAllSalesTotal] = useState(0);
  const [loadingSalesSummary, setLoadingSalesSummary] = useState(false);
  const [adminKpis, setAdminKpis] = useState({
    ordersToday: 0,
    salesToday: 0,
    salesGlobalTotal: 0,
    activeSellers: 0,
    pendingOrders: 0,
    errorOrders: 0,
    errorRate: 0
  });
  const [adminTopSellers, setAdminTopSellers] = useState([]);
  const [adminHealth, setAdminHealth] = useState({
    supabase: 'checking',
    profiles: 'checking',
    customers: 'checking',
    orders: 'checking',
    checkedAt: ''
  });
  const [adminQueueHealth, setAdminQueueHealth] = useState({
    queuedTotal: 0,
    queued15m: 0,
    queued30m: 0,
    processingTotal: 0
  });
  const [unlockNotifications, setUnlockNotifications] = useState([]);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const unlockNotificationIndexRef = useRef(new Map());
  const hasHydratedNotificationsRef = useRef(false);
  const unreadUnlockCount = useMemo(() => unlockNotifications.filter((item) => !item.read).length, [unlockNotifications]);
  const notificationsStorageKey = useMemo(() => {
    if (!authUserId) return null;
    return `home:unlock-notifications:${authUserId}`;
  }, [authUserId]);
  const isAdmin = profileRole === 'admin';

  const loadAdminDashboard = useCallback(async () => {
    try {
      const {
        adminKpis: nextKpis,
        adminTopSellers: nextTopSellers,
        adminHealth: nextHealth,
        adminQueueHealth: nextQueueHealth
      } = await loadAdminDashboardData();
      setAdminKpis(nextKpis);
      setAdminTopSellers(nextTopSellers);
      setAdminHealth(nextHealth);
      setAdminQueueHealth(nextQueueHealth || { queuedTotal: 0, queued15m: 0, queued30m: 0, processingTotal: 0 });
    } catch (_error) {
      setAdminKpis({
        ordersToday: 0,
        salesToday: 0,
        salesGlobalTotal: 0,
        activeSellers: 0,
        pendingOrders: 0,
        errorOrders: 0,
        errorRate: 0
      });
      setAdminTopSellers([]);
      setAdminHealth({
        supabase: 'error',
        profiles: 'error',
        customers: 'error',
        orders: 'error',
        checkedAt: new Date().toISOString()
      });
      setAdminQueueHealth({
        queuedTotal: 0,
        queued15m: 0,
        queued30m: 0,
        processingTotal: 0
      });
    }
  }, []);

  const loadHome = useCallback(async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setLoading(true);
      const context = await loadUserContext();
      setAuthUserId(context.userId);
      setFullName(context.fullName);
      const resolvedRole = context.role;
      setProfileRole(resolvedRole);

      if (resolvedRole === 'admin') {
        await loadAdminDashboard();
        return;
      }
      const { todayOrders: nextTodayOrders, totalSales: nextTotalSales } = await loadVendorKpis(context.userId);
      setTodayOrders(nextTodayOrders);
      setTotalSales(nextTotalSales);
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearLocalSupabaseSession();
        router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
        return;
      }
      // Preserve previous KPI values for transient errors.
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [loadAdminDashboard, router]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!notificationsStorageKey) return undefined;

    let cancelled = false;
    hasHydratedNotificationsRef.current = false;

    const hydrateNotifications = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(notificationsStorageKey);
        if (cancelled) return;

        if (!rawValue) {
          unlockNotificationIndexRef.current = new Map();
          setUnlockNotifications([]);
          return;
        }

        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
          unlockNotificationIndexRef.current = new Map();
          setUnlockNotifications([]);
          return;
        }

        const normalized = parsed
          .filter((item) => item && item.cardCode)
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, MAX_UNLOCK_NOTIFICATIONS);
        unlockNotificationIndexRef.current = new Map(
          normalized.map((item) => [String(item.cardCode || '').trim(), new Date(item.createdAt || 0).getTime() || 0])
        );
        setUnlockNotifications(normalized);
      } catch (_error) {
        if (!cancelled) {
          unlockNotificationIndexRef.current = new Map();
          setUnlockNotifications([]);
        }
      } finally {
        if (!cancelled) {
          hasHydratedNotificationsRef.current = true;
        }
      }
    };

    hydrateNotifications();

    return () => {
      cancelled = true;
      hasHydratedNotificationsRef.current = false;
    };
  }, [notificationsStorageKey]);

  useEffect(() => {
    if (!notificationsStorageKey || !hasHydratedNotificationsRef.current) return;

    AsyncStorage.setItem(notificationsStorageKey, JSON.stringify(unlockNotifications.slice(0, MAX_UNLOCK_NOTIFICATIONS))).catch(
      () => {}
    );
  }, [unlockNotifications, notificationsStorageKey]);

  const pushUnlockNotification = useCallback((input = {}) => {
    const cardCode = String(input.cardCode || '').trim();
    if (!cardCode) return;

    const now = Date.now();
    const prevAt = Number(unlockNotificationIndexRef.current.get(cardCode) || 0);
    if (now - prevAt < NOTIFICATION_DEDUPE_WINDOW_MS) return;

    unlockNotificationIndexRef.current.set(cardCode, now);
    const notificationItem = {
      id: `${cardCode}-${now}`,
      customerName: String(input.customerName || 'Cliente sin nombre'),
      cardCode,
      createdAt: new Date(now).toISOString(),
      read: false
    };
    setUnlockNotifications((prev) => [notificationItem, ...prev].slice(0, MAX_UNLOCK_NOTIFICATIONS));
  }, []);

  useEffect(() => {
    if (!authUserId) return undefined;

    const channel = supabase
      .channel(`home-customers-unlock-${authUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'customers' },
        (payload) => {
          const oldBlocked = normalizeSellerName(String(payload?.old?.Bloqueado || ''));
          const newBlocked = normalizeSellerName(String(payload?.new?.Bloqueado || ''));
          if (oldBlocked === 'Y' && newBlocked === 'N') {
            pushUnlockNotification({
              cardCode: payload?.new?.CardCode || '',
              customerName: payload?.new?.CardFName || payload?.new?.CardName || payload?.new?.CardCode
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUserId, profileRole, pushUnlockNotification]);

  const openNotifications = useCallback(() => {
    setUnlockNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setNotificationsVisible(true);
  }, []);
  const closeNotifications = useCallback(() => setNotificationsVisible(false), []);
  const clearNotifications = useCallback(() => {
    unlockNotificationIndexRef.current = new Map();
    setUnlockNotifications([]);
  }, []);

  useEffect(() => {
    let channel;
    let active = true;
    const setupRealtime = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!active || !user?.id) return;
        const isAdminRole = profileRole === 'admin';
        const channelName = isAdminRole ? `home-orders-admin-${user.id}` : `home-orders-${user.id}`;
        const realtimeFilter = isAdminRole ? { event: '*', schema: 'public', table: 'sales_orders' } : {
          event: '*',
          schema: 'public',
          table: 'sales_orders',
          filter: `created_by=eq.${user.id}`
        };
        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            realtimeFilter,
            () => {
              setLastRealtimeEventAt(new Date().toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' }));
              loadHome({ showLoader: false });
            }
          )
          .subscribe((status) => setRealtimeStatus(status));
      } catch (error) {
        if (!active) return;
        if (isInvalidRefreshTokenError(error)) {
          await clearLocalSupabaseSession();
          router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
          return;
        }
        setRealtimeStatus('CHANNEL_ERROR');
      }
    };
    setupRealtime();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadHome, profileRole, router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHome({ showLoader: false });
    setRefreshing(false);
  }, [loadHome]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('LOGOUT_TIMEOUT')), LOGOUT_TIMEOUT_MS);
        })
      ]);
    } catch (_error) {
      // Continue with local cleanup even if remote sign out fails or times out.
    } finally {
      await clearLocalSupabaseSession();
      router.replace({ pathname: '/login', params: { refresh: String(Date.now()) } });
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  const loadOrdersTodayDetails = useCallback(async () => {
    if (!authUserId) return;
    try {
      setLoadingOrdersToday(true);
      const rows = await loadOrdersTodayDetailsData({ authUserId, role: profileRole });
      setOrdersTodayRows(rows);
    } catch (_error) {
      setOrdersTodayRows([]);
    } finally {
      setLoadingOrdersToday(false);
    }
  }, [authUserId, profileRole]);

  const loadSalesSummary = useCallback(async () => {
    if (!authUserId) return;
    try {
      setLoadingSalesSummary(true);
      const { allOrdersCount: nextCount, allSalesTotal: nextTotal } = await loadSalesSummaryData({
        authUserId,
        role: profileRole
      });
      setAllOrdersCount(nextCount);
      setAllSalesTotal(nextTotal);
    } catch (_error) {
      setAllOrdersCount(0);
      setAllSalesTotal(0);
    } finally {
      setLoadingSalesSummary(false);
    }
  }, [authUserId, profileRole]);

  const handleOpenOrdersToday = useCallback(async () => {
    setOrdersTodayModalVisible(true);
    await loadOrdersTodayDetails();
  }, [loadOrdersTodayDetails]);

  const handleOpenSalesSummary = useCallback(async () => {
    setSalesSummaryModalVisible(true);
    await loadSalesSummary();
  }, [loadSalesSummary]);

  const loadErrorOrdersDetails = useCallback(async () => {
    if (!authUserId) return;
    try {
      setLoadingErrorOrders(true);
      const rows = await loadErrorOrdersDetailsData({ authUserId, role: profileRole });
      setErrorOrdersRows(rows);
    } catch (_error) {
      setErrorOrdersRows([]);
    } finally {
      setLoadingErrorOrders(false);
    }
  }, [authUserId, profileRole]);

  const handleOpenErrorOrders = useCallback(async () => {
    setErrorOrdersModalVisible(true);
    await loadErrorOrdersDetails();
  }, [loadErrorOrdersDetails]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      headerTitle: '',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: COLORS.background, height: APP_LAYOUT.HEADER_HEIGHT }
    }),
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={screenOptions} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={isAdmin ? [0] : undefined}
      >
        {isAdmin && (
          <AdminStickyHero
            fullName={fullName}
            unreadUnlockCount={unreadUnlockCount}
            openNotifications={openNotifications}
            handleLogout={handleLogout}
            loggingOut={loggingOut}
            styles={styles}
          />
        )}
        <View style={GLOBAL_STYLES.contentMax}>
          {!isAdmin && (
            <Animated.View entering={FadeInDown.duration(320).springify().damping(18)}>
              <SellerHero
                fullName={fullName}
                handleLogout={handleLogout}
                unreadUnlockCount={unreadUnlockCount}
                openNotifications={openNotifications}
                loggingOut={loggingOut}
                styles={styles}
              />
            </Animated.View>
          )}

          {isAdmin ? (
            <Animated.View entering={FadeInDown.delay(80).duration(320).springify().damping(19)}>
              <AdminDashboardSection
                loading={loading}
                adminKpis={adminKpis}
                adminTopSellers={adminTopSellers}
                adminHealth={adminHealth}
                adminQueueHealth={adminQueueHealth}
                toMoney={toMoney}
                formatDateTime={formatDateTime}
                getHealthLabel={getHealthLabel}
                handleOpenOrdersToday={handleOpenOrdersToday}
                handleOpenSalesSummary={handleOpenSalesSummary}
                handleOpenErrorOrders={handleOpenErrorOrders}
                onOpenAdminPanel={() => router.push('/(tabs)/perfil')}
                styles={styles}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(80).duration(320).springify().damping(19)}>
              <SellerDashboardSection
                loading={loading}
                todayOrders={todayOrders}
                totalSales={totalSales}
                realtimeStatus={realtimeStatus}
                lastRealtimeEventAt={lastRealtimeEventAt}
                toMoney={toMoney}
                onOpenOrdersToday={handleOpenOrdersToday}
                onOpenSalesSummary={handleOpenSalesSummary}
                onNewOrder={() => router.push('/clientes')}
                onOpenProfile={() => router.push('/(tabs)/perfil')}
                styles={styles}
              />
            </Animated.View>
          )}
        </View>
      </ScrollView>
      <OrdersTodayModal
        visible={ordersTodayModalVisible}
        onClose={() => setOrdersTodayModalVisible(false)}
        loading={loadingOrdersToday}
        rows={ordersTodayRows}
        toMoney={toMoney}
        formatDateTime={formatDateTime}
        styles={styles}
      />
      <SalesSummaryModal
        visible={salesSummaryModalVisible}
        onClose={() => setSalesSummaryModalVisible(false)}
        loading={loadingSalesSummary}
        allOrdersCount={allOrdersCount}
        allSalesTotal={allSalesTotal}
        toMoney={toMoney}
        styles={styles}
      />
      <ErrorOrdersModal
        visible={errorOrdersModalVisible}
        onClose={() => setErrorOrdersModalVisible(false)}
        loading={loadingErrorOrders}
        rows={errorOrdersRows}
        toMoney={toMoney}
        formatDateTime={formatDateTime}
        styles={styles}
      />

      <Portal>
        <Modal transparent visible={notificationsVisible} animationType="fade" onRequestClose={closeNotifications}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeNotifications} />
            <Surface style={styles.notificationsPanel} elevation={4}>
              <View style={styles.notificationsPanelContent}>
                <View style={styles.notificationsHeader}>
                  <Text style={styles.notificationsTitle}>Notificaciones</Text>
                  <View style={styles.notificationsHeaderActions}>
                    <Button compact onPress={clearNotifications} disabled={unlockNotifications.length === 0}>
                      Limpiar
                    </Button>
                    <Button compact onPress={closeNotifications}>
                      Cerrar
                    </Button>
                  </View>
                </View>
                <Divider />
                <View style={styles.notificationsBody}>
                  {unlockNotifications.length === 0 ? (
                    <Text style={styles.notificationsEmpty}>Sin notificaciones</Text>
                  ) : (
                    unlockNotifications.map((item) => (
                      <View key={item.id} style={styles.notificationItem}>
                        <View style={styles.notificationDot} />
                        <View style={styles.notificationTextWrap}>
                          <Text style={styles.notificationTitle}>{item.customerName}</Text>
                          <Text style={styles.notificationSubtitle}>
                            Cliente desbloqueado{item.cardCode ? ` (${item.cardCode})` : ''}
                          </Text>
                          <Text style={styles.notificationTime}>{formatNotificationTime(item.createdAt)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </Surface>
          </View>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: APP_LAYOUT.SCREEN_PADDING, paddingBottom: 26, gap: APP_LAYOUT.SECTION_GAP },
  adminStickyHeader: {
    backgroundColor: COLORS.background,
    paddingTop: APP_LAYOUT.SCREEN_PADDING
  },
  topBrandBar: {
    marginBottom: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 4
  },
  hero: {
    borderRadius: HOME_HERO_TOKENS.BORDER_RADIUS,
    paddingHorizontal: HOME_HERO_TOKENS.PADDING_HORIZONTAL,
    paddingVertical: HOME_HERO_TOKENS.PADDING_VERTICAL
  },
  heroWithKpiDock: { paddingBottom: HOME_HERO_TOKENS.DOCK_PADDING_BOTTOM, marginBottom: 4 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { color: '#D9EBFF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  heroTitle: { marginTop: 6, color: '#FFF', fontSize: 22, fontWeight: '800' },
  heroSub: { marginTop: 6, color: '#E7F2FF', fontSize: 13, fontWeight: '600' },
  brandLogo: {
    width: 86,
    height: 34
  },
  bellWrap: { position: 'relative' },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#E74C3C',
    color: '#FFF'
  },
  kpiRow: { flexDirection: 'row', gap: 14 },
  kpiRowOverlay: { marginTop: -28, marginBottom: 8, zIndex: 4 },
  kpiCard: {
    flex: 1,
    minHeight: 170,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5ECF5'
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
    marginBottom: 10
  },
  kpiLabel: { color: COLORS.textLight, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  kpiValue: { marginTop: 6, color: COLORS.primary, fontSize: 24, fontWeight: '800' },
  kpiValueSuccess: { color: '#27AE60' },
  kpiValueWarn: { color: '#F39C12' },
  kpiValueDanger: { color: '#E74C3C' },
  kpiHint: { marginTop: 'auto', color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  block: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5ECF5'
  },
  blockTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  vendorActionRow: {
    gap: 8
  },
  blockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  blockHint: { color: COLORS.textLight, fontSize: 12, marginTop: 2 },
  adminSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8
  },
  adminSellerMain: { flex: 1, marginRight: 10 },
  adminSellerName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  adminSellerMeta: { color: COLORS.textLight, fontSize: 11, marginTop: 2 },
  adminSellerMetric: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  realtimeBlock: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D8E6F8',
    padding: 12
  },
  realtimeHeader: { flexDirection: 'row', alignItems: 'center' },
  realtimeTitle: { marginLeft: 6, color: COLORS.primary, fontSize: 14, fontWeight: '800' },
  realtimeStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  realtimeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  realtimeOk: { backgroundColor: '#2ECC71' },
  realtimeErr: { backgroundColor: '#E74C3C' },
  realtimePending: { backgroundColor: '#F1C40F' },
  realtimeText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  healthCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5ECF5',
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  healthLabel: { color: COLORS.textLight, fontSize: 11, fontWeight: '700' },
  healthValue: { marginTop: 4, fontSize: 12, fontWeight: '800' },
  healthOkText: { color: '#27AE60' },
  healthErrText: { color: '#E74C3C' },
  healthPendingText: { color: '#F39C12' },
  healthCheckedAt: { marginTop: 10, color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalPanel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  modalEmpty: { color: COLORS.textLight, marginTop: 12, fontSize: 13 },
  modalRow: { borderWidth: 1, borderColor: '#EEF1F4', borderRadius: 10, padding: 10, marginTop: 8 },
  modalRowTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  modalRowMeta: { marginTop: 2, color: COLORS.textLight, fontSize: 12 },
  salesSummaryWrap: { marginTop: 12, alignItems: 'center' },
  salesSummaryLabel: { color: COLORS.textLight, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  salesSummaryOrders: { marginTop: 4, marginBottom: 14, color: COLORS.primary, fontSize: 28, fontWeight: '800' },
  salesSummaryValue: { marginTop: 4, color: COLORS.primary, fontSize: 30, fontWeight: '800' },
  notificationsPanel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '70%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingTop: 4
  },
  notificationsPanelContent: {
    borderRadius: 14,
    overflow: 'hidden'
  },
  notificationsHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  notificationsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  notificationsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary
  },
  notificationsBody: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  notificationsEmpty: {
    color: COLORS.textLight,
    fontSize: 13
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7'
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 8,
    backgroundColor: COLORS.primary
  },
  notificationTextWrap: {
    flex: 1
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  notificationSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textLight
  },
  notificationTime: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textLight
  }
});
