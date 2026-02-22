import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function AdminDashboardSection({
  loading,
  adminKpis,
  adminHealth,
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

  return (
    <>
      <View style={[styles.kpiRow, styles.kpiRowOverlay]}>
        <Pressable style={[styles.kpiCard]} onPress={handleOpenOrdersToday}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="receipt-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Pedidos hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : adminKpis.ordersToday}</Text>
          <Text style={styles.kpiHint}>Global hoy</Text>
        </Pressable>
        <Pressable style={[styles.kpiCard]} onPress={handleOpenSalesSummary}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Ventas hoy</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : toMoney(adminKpis.salesToday)}</Text>
          <Text style={styles.kpiHint}>Global hoy</Text>
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
