import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function AdminDashboardSection({
  loading,
  adminKpis,
  adminTopSellers,
  adminHealth,
  toMoney,
  formatDateTime,
  getHealthLabel,
  handleOpenOrdersToday,
  handleOpenSalesSummary,
  onOpenAdminPanel,
  styles
}) {
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
        <View style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="people-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Vendedores activos</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : adminKpis.activeSellers}</Text>
        </View>
        <View style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}>
            <Ionicons name="time-outline" size={22} color="#003a78" />
          </View>
          <Text style={styles.kpiLabel}>Pendientes</Text>
          <Text style={styles.kpiValue}>{loading ? '...' : adminKpis.pendingOrders}</Text>
        </View>
      </View>

      <Surface style={styles.block} elevation={0}>
        <View style={styles.blockHeaderRow}>
          <Text style={styles.blockTitle}>Control de vendedores</Text>
          <Button compact mode="text" onPress={onOpenAdminPanel}>
            Ir a panel admin
          </Button>
        </View>
        {adminTopSellers.length === 0 ? (
          <Text style={styles.blockHint}>Sin actividad de vendedores.</Text>
        ) : (
          adminTopSellers.map((seller) => (
            <View key={seller.id} style={styles.adminSellerRow}>
              <View style={styles.adminSellerMain}>
                <Text style={styles.adminSellerName}>{seller.fullName}</Text>
                <Text style={styles.adminSellerMeta}>{seller.email || 'Sin correo'}</Text>
              </View>
              <Text style={styles.adminSellerMetric}>{seller.ordersCount} pedidos</Text>
            </View>
          ))
        )}
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
