import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

export default function ErrorOrdersModal({
  visible,
  onClose,
  loading,
  rows,
  toMoney,
  formatDateTime,
  styles
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pedidos con error</Text>
            <Button compact onPress={onClose}>
              Cerrar
            </Button>
          </View>
          {loading ? (
            <Text style={styles.modalEmpty}>Cargando...</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.modalEmpty}>No hay pedidos con error.</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item, index) => String(item?.id || index)}
              renderItem={({ item }) => (
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowTitle}>
                    {item?.sap_docnum ? `SAP #${item.sap_docnum}` : `Pedido ${String(item?.id || '').slice(0, 8)}`}
                  </Text>
                  <Text style={styles.modalRowMeta}>
                    Cliente: {item?.customer_name || 'Sin nombre'} ({item?.card_code || 'N/A'})
                  </Text>
                  <Text style={styles.modalRowMeta}>Vendedor: {item?.seller_name || 'Sin vendedor'}</Text>
                  <Text style={styles.modalRowMeta}>Total: {toMoney(item?.order_total || 0)}</Text>
                  <Text style={styles.modalRowMeta}>Estado: {item?.status || 'N/A'}</Text>
                  <Text style={styles.modalRowMeta}>{formatDateTime(item?.created_at)}</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
