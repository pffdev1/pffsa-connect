import React from 'react';
import { FlatList, Text, useWindowDimensions, View, StyleSheet } from 'react-native';
import ProductCard from './ProductCard';
import { COLORS } from '../constants/theme';

const getNumColumns = (width) => {
  if (width >= 1280) return 4;
  if (width >= 640) return 2;
  return 1;
};

export default function ProductGrid({
  data,
  onAdd,
  emptyText = 'No se encontraron productos.',
  onEndReached,
  loadingMore = false,
  hasMore = false
}) {
  const { width } = useWindowDimensions();
  const numColumns = getNumColumns(width);
  const skeletonCount = numColumns === 1 ? 2 : numColumns;

  if (data === null) {
    return (
      <View style={[styles.gridWrap, styles.rowWrap]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`product-skeleton-${i}`} style={[styles.colWrap, { width: `${100 / numColumns}%` }]}>
            <ProductCard loading />
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
      keyExtractor={(item, index) => `${item.ItemCode || 'producto'}-${item.CardCode || 'na'}-${index}`}
      columnWrapperStyle={numColumns > 1 ? { gap: 12, paddingHorizontal: 15 } : undefined}
      contentContainerStyle={[styles.listContent, numColumns === 1 ? { paddingHorizontal: 15 } : undefined]}
      renderItem={({ item }) => (
        <View style={[styles.colWrap, numColumns > 1 ? { flex: 1 } : undefined]}>
          <ProductCard item={item} onAdd={onAdd} />
        </View>
      )}
      onEndReachedThreshold={0.35}
      onEndReached={onEndReached}
      ListFooterComponent={
        loadingMore ? (
          <View style={[styles.gridWrap, styles.rowWrap, styles.footerSkeletonWrap]}>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <View key={`product-more-skeleton-${i}`} style={[styles.colWrap, { width: `${100 / numColumns}%` }]}>
                <ProductCard loading />
              </View>
            ))}
          </View>
        ) : !hasMore && Array.isArray(data) && data.length > 0 ? (
          <Text style={styles.footerText}>Llegaste al final del catalogo.</Text>
        ) : null
      }
      ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 20, paddingTop: 10 },
  colWrap: { marginBottom: 0 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textLight },
  footerSkeletonWrap: { paddingTop: 4, paddingBottom: 8 },
  footerText: { textAlign: 'center', color: COLORS.textLight, fontSize: 12, paddingVertical: 10 },
  gridWrap: { padding: 15 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' }
});
