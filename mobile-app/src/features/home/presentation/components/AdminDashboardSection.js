import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function AdminDashboardSection({
  loading,
  adminKpis,
  adminHealth,
  adminQueueHealth,
  toMoney,
  formatDateTime,
  getHealthLabel,
  handleOpenOrdersToday,
  handleOpenSalesSummary,
  handleOpenErrorOrders,
  onOpenAdminPanel,
  styles
}) {
  const errorRate = Number(adminKpis?.errorRate || 0);
  const errorRateTone = errorRate >= 10 ? 'danger' : errorRate >= 3 ? 'warn' : 'success';
  const errorRateToneText = errorRateTone === 'danger' ? 'Alta' : errorRateTone === 'warn' ? 'Media' : 'Baja';
  const formatCompactMoney = (value) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '$0.00';
    const sign = amount < 0 ? '-' : '';
    const absolute = Math.abs(amount);
    if (absolute < 1000) return `${sign}$${absolute.toFixed(2)}`;
    return `${sign}$${(absolute / 1000).toFixed(1)}K`;
  };
  const getDeltaTrend = (value) => {
    const safe = Number(value || 0);
    if (!Number.isFinite(safe) || safe === 0) return { icon: 'remove', text: 'Igual que ayer', tone: 'neutral' };
    if (safe > 0) return { icon: 'arrow-up', text: `+${safe} vs ayer`, tone: 'up' };
    return { icon: 'arrow-down', text: `${safe} vs ayer`, tone: 'down' };
  };
  const getSalesDeltaTrend = (value) => {
    const safe = Number(value || 0);
    if (!Number.isFinite(safe) || safe === 0) return { icon: 'remove', text: 'Hoy vs ayer: sin cambio', tone: 'neutral' };
    if (safe > 0) return { icon: 'arrow-up', text: `Hoy vs ayer: +${formatCompactMoney(safe)}`, tone: 'up' };
    return { icon: 'arrow-down', text: `Hoy vs ayer: ${formatCompactMoney(safe)}`, tone: 'down' };
  };
  const ordersTrend = getDeltaTrend(adminKpis.ordersTodayDelta);
  const salesTrend = getSalesDeltaTrend(adminKpis.salesTodayVsYesterdayDelta);
  const getTrendColor = (tone) => {
    if (tone === 'up') return '#27AE60';
    if (tone === 'down') return '#E74C3C';
    return '#6B7280';
  };

  return (
    <>
      <View style={[styles.kpiRow, styles.kpiRowOverlay]}>
        <Pressable style={[styles.kpiCard]} onPress={handleOpenOrdersToday}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="receipt-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Pedidos hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : adminKpis.ordersToday}</Text>
          <View style={styles.kpiTrendRow}>
            <Ionicons
              name={loading ? 'remove' : ordersTrend.icon}
              size={12}
              color={loading ? '#6B7280' : getTrendColor(ordersTrend.tone)}
            />
            <Text style={[styles.kpiHint, styles.kpiHintTrend, { color: loading ? '#6B7280' : getTrendColor(ordersTrend.tone) }]}>
              {loading ? '...' : ordersTrend.text}
            </Text>
          </View>
        </Pressable>
        <Pressable style={[styles.kpiCard]} onPress={handleOpenSalesSummary}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ventas totales</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : formatCompactMoney(adminKpis.salesGlobalTotal || 0)}</Text>
          <View style={styles.kpiTrendRow}>
            <Ionicons
              name={loading ? 'remove' : salesTrend.icon}
              size={12}
              color={loading ? '#6B7280' : getTrendColor(salesTrend.tone)}
            />
            <Text style={[styles.kpiHint, styles.kpiHintTrend, { color: loading ? '#6B7280' : getTrendColor(salesTrend.tone) }]}>
              {loading ? '...' : salesTrend.text}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.kpiRow}>
        <Pressable style={styles.kpiCard} onPress={handleOpenErrorOrders}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="alert-circle-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Pedidos con error</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : adminKpis.errorOrders}</Text>
          <Text style={styles.kpiHint}>Ver detalle</Text>
        </Pressable>
        <View style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="analytics-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Tasa de error</Text>
          <Text
            style={[
              styles.kpiValue,
              errorRateTone === 'danger'
                ? styles.kpiValueDanger
                : errorRateTone === 'warn'
                  ? styles.kpiValueWarn
                  : styles.kpiValueSuccess
            ]}
          >
            {loading ? '...' : `${errorRate.toFixed(1)}%`}
          </Text>
          <Text
            style={[
              styles.kpiHint,
              errorRateTone === 'danger'
                ? styles.kpiValueDanger
                : errorRateTone === 'warn'
                  ? styles.kpiValueWarn
                  : styles.kpiValueSuccess
            ]}
          >
            {loading ? '...' : `${errorRateToneText} prioridad`}
          </Text>
        </View>
      </View>
      <Surface style={styles.block} elevation={0}>
        <View style={styles.blockHeaderRow}>
          <Text style={styles.blockTitle}>Watchdog de cola</Text>
          <Text
            style={[
              styles.kpiValue,
              { marginTop: 0, fontSize: 22 },
              Number(adminQueueHealth?.queued15m || 0) > 0 ? styles.kpiValueDanger : styles.kpiValueSuccess
            ]}
          >
            {loading ? '...' : Number(adminQueueHealth?.queued15m || 0)}
          </Text>
        </View>
        <Text style={styles.blockHint}>Pedidos en cola por mas de 15 minutos</Text>
        <View style={styles.healthGrid}>
          <View style={styles.healthCard}>
            <Text style={styles.healthLabel}>Cola total</Text>
            <Text style={styles.healthValue}>{loading ? '...' : Number(adminQueueHealth?.queuedTotal || 0)}</Text>
          </View>
          <View style={styles.healthCard}>
            <Text style={styles.healthLabel}>Cola 30m</Text>
            <Text style={styles.healthValue}>{loading ? '...' : Number(adminQueueHealth?.queued30m || 0)}</Text>
          </View>
          <View style={styles.healthCard}>
            <Text style={styles.healthLabel}>Procesando</Text>
            <Text style={styles.healthValue}>{loading ? '...' : Number(adminQueueHealth?.processingTotal || 0)}</Text>
          </View>
        </View>
      </Surface>

      <Surface style={styles.block} elevation={0}>
        <View style={styles.blockHeaderRow}>
          <Text style={styles.blockTitle}>Panel administrativo</Text>
        </View>
        <Button mode="contained" onPress={onOpenAdminPanel}>
          Ir a panel admin
        </Button>
      </Surface>

      <LinearGradient colors={['#FFFFFF', '#F3F8FF']} style={styles.realtimeBlock}>
        <View style={styles.realtimeHeader}>
          <Ionicons name="server-outline" size={18} color="#003a78" />
          <Text style={styles.realtimeTitle}>Salud de entorno / Supabase</Text>
        </View>
        <View style={styles.healthGrid}>
          {[
            { label: 'Supabase', status: adminHealth.supabase },
            { label: 'Profiles', status: adminHealth.profiles },
            { label: 'Customers', status: adminHealth.customers },
            { label: 'Sales orders', status: adminHealth.orders }
          ].map((item) => (
            <View key={item.label} style={styles.healthCard}>
              <Text style={styles.healthLabel}>{item.label}</Text>
              <Text
                style={[
                  styles.healthValue,
                  item.status === 'ok' ? styles.healthOkText : item.status === 'error' ? styles.healthErrText : styles.healthPendingText
                ]}
              >
                {getHealthLabel(item.status)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.healthCheckedAt}>
          Ultima verificacion: {adminHealth.checkedAt ? formatDateTime(adminHealth.checkedAt) : 'N/A'}
        </Text>
      </LinearGradient>
    </>
  );
}
