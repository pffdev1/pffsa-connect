import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function SellerDashboardSection({
  loading,
  todayOrders,
  totalSales,
  todayOrdersDelta,
  salesTodayVsYesterdayDelta,
  realtimeStatus,
  lastRealtimeEventAt,
  toMoney,
  onOpenOrdersToday,
  onOpenSalesSummary,
  onNewOrder,
  onOpenProfile,
  styles
}) {
  const getDeltaTrend = (value) => {
    const safe = Number(value || 0);
    if (!Number.isFinite(safe) || safe === 0) return { icon: 'remove', text: 'Igual que ayer', tone: 'neutral' };
    if (safe > 0) return { icon: 'arrow-up', text: `+${safe} vs ayer`, tone: 'up' };
    return { icon: 'arrow-down', text: `${safe} vs ayer`, tone: 'down' };
  };
  const getMoneyTrend = (value) => {
    const safe = Number(value || 0);
    if (!Number.isFinite(safe) || safe === 0) return { icon: 'remove', text: 'Hoy vs ayer: sin cambio', tone: 'neutral' };
    if (safe > 0) return { icon: 'arrow-up', text: `Hoy vs ayer: +${toMoney(safe)}`, tone: 'up' };
    return { icon: 'arrow-down', text: `Hoy vs ayer: ${toMoney(safe)}`, tone: 'down' };
  };
  const getTrendColor = (tone) => {
    if (tone === 'up') return '#27AE60';
    if (tone === 'down') return '#E74C3C';
    return '#6B7280';
  };
  const ordersTrend = getDeltaTrend(todayOrdersDelta);
  const salesTrend = getMoneyTrend(salesTodayVsYesterdayDelta);

  return (
    <>
      <View style={[styles.kpiRow, styles.kpiRowOverlay]}>
        <Pressable style={styles.kpiCard} onPress={onOpenOrdersToday}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="receipt-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ordenes hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : todayOrders}</Text>
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
        <Pressable style={styles.kpiCard} onPress={onOpenSalesSummary}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ventas de hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : toMoney(totalSales)}</Text>
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

      <Surface style={styles.block} elevation={0}>
        <Text style={styles.blockTitle}>Centro vendedor</Text>
        <View style={styles.vendorActionRow}>
          <Button mode="contained" buttonColor="#003a78" icon="cart-plus" onPress={onNewOrder}>
            Nuevo pedido
          </Button>
          <Button mode="outlined" textColor="#003a78" icon="account-circle-outline" onPress={onOpenProfile}>
            Mi perfil
          </Button>
        </View>
      </Surface>

      <LinearGradient colors={['#FFFFFF', '#F3F8FF']} style={styles.realtimeBlock}>
        <View style={styles.realtimeHeader}>
          <Ionicons name="pulse-outline" size={18} color="#003a78" />
          <Text style={styles.realtimeTitle}>Realtime status</Text>
        </View>
        <View style={styles.realtimeStatusRow}>
          <View
            style={[
              styles.realtimeDot,
              realtimeStatus === 'SUBSCRIBED'
                ? styles.realtimeOk
                : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT'
                  ? styles.realtimeErr
                  : styles.realtimePending
            ]}
          />
          <Text style={styles.realtimeText}>
            {realtimeStatus === 'SUBSCRIBED'
              ? `Conectado${lastRealtimeEventAt ? ` | Ultimo evento: ${lastRealtimeEventAt}` : ''}`
              : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT'
                ? 'Con error'
                : 'Conectando...'}
          </Text>
        </View>
      </LinearGradient>
    </>
  );
}
