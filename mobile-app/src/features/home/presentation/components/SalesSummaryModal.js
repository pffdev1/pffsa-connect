import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

export default function SalesSummaryModal({
  visible,
  onClose,
  loading,
  allOrdersCount,
  allSalesTotal,
  title = 'Ventas totales',
  toMoney,
  styles
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Button compact onPress={onClose}>
              Cerrar
            </Button>
          </View>
          {loading ? (
            <Text style={styles.modalEmpty}>Calculando...</Text>
          ) : (
            <View style={styles.salesSummaryWrap}>
              <Text style={styles.salesSummaryLabel}>Cantidad de pedidos</Text>
              <Text style={styles.salesSummaryOrders}>{allOrdersCount}</Text>
              <Text style={styles.salesSummaryLabel}>Total de ventas</Text>
              <Text style={styles.salesSummaryValue}>{toMoney(allSalesTotal)}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
