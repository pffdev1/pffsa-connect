import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function SellerDashboardSection({
  loading,
  todayOrders,
  totalSales,
  realtimeStatus,
  lastRealtimeEventAt,
  toMoney,
  onOpenOrdersToday,
  onOpenSalesSummary,
  onNewOrder,
  onOpenProfile,
  styles
}) {
  return (
    <>
      <View style={[styles.kpiRow, styles.kpiRowOverlay]}>
        <Pressable style={styles.kpiCard} onPress={onOpenOrdersToday}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="receipt-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ordenes hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : todayOrders}</Text>
          <Text style={styles.kpiHint}>Tocar para ver detalle</Text>
        </Pressable>
        <Pressable style={styles.kpiCard} onPress={onOpenSalesSummary}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ventas totales</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : toMoney(totalSales)}</Text>
          <Text style={styles.kpiHint}>Tocar para ver detalle</Text>
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
