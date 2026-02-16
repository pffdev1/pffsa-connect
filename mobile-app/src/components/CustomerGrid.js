import React from 'react';
import { FlatList, Text, useWindowDimensions, View, StyleSheet } from 'react-native';
import CustomerCard from './CustomerCard';
import { COLORS } from '../constants/theme';

const getNumColumns = (width) => {
  if (width >= 1280) return 4;
  if (width >= 640) return 2;
  return 1;
};

export default function CustomerGrid({
  data,
  onPressCustomer,
  onPressInfo,
  onEndReached,
  loadingMore,
  hasMore,
  emptyText
}) {
  const { width } = useWindowDimensions();
  const numColumns = getNumColumns(width);
  const skeletonCount = numColumns === 1 ? 2 : numColumns;

  if (data === null) {
    return (
      <View style={[styles.gridWrap, styles.rowWrap]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`skeleton-${i}`} style={[styles.colWrap, { width: `${100 / numColumns}%` }]}>
            <CustomerCard loading />
          </View>
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      key={numColumns}
      numColumns={numColumns}
      keyExtractor={(item, index) => String(item.CardCode || item.RUC || item.full_name || `cliente-${index}`)}
      columnWrapperStyle={numColumns > 1 ? { gap: 12, paddingHorizontal: 15 } : undefined}
      contentContainerStyle={[styles.listContent, numColumns === 1 ? { paddingHorizontal: 15 } : undefined]}
      renderItem={({ item }) => (
        <View style={[styles.colWrap, numColumns > 1 ? { flex: 1 } : undefined]}>
          <CustomerCard item={item} onPress={onPressCustomer} onInfoPress={onPressInfo} />
        </View>
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <View style={[styles.gridWrap, styles.rowWrap, styles.footerSkeletonWrap]}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <View key={`customer-more-skeleton-${i}`} style={[styles.colWrap, { width: `${100 / numColumns}%` }]}>
                <CustomerCard loading />
              </View>
            ))}
          </View>
        ) : !hasMore && data.length > 0 ? (
          <Text style={styles.footerText}>Has llegado al final</Text>
        ) : null
      }
      ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 100, paddingTop: 10 },
  colWrap: { marginBottom: 0 },
  footerSkeletonWrap: { paddingTop: 4, paddingBottom: 8 },
  footerText: { color: COLORS.textLight, marginTop: 6, textAlign: 'center' },
  emptyText: { textAlign: 'center', marginTop: 30, color: COLORS.textLight, fontSize: 15 },
  gridWrap: { padding: 15 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' }
});
