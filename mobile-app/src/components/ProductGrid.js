import React from 'react';
import { FlatList, Text, useWindowDimensions, View, StyleSheet } from 'react-native';
import ProductCard from './ProductCard';
import { COLORS } from '../constants/theme';

const getNumColumns = (width) => {
  if (width >= 1280) return 4;
  if (width >= 640) return 2;
  return 1;
};

export default function ProductGrid({ data, onAdd, emptyText = 'No se encontraron productos.' }) {
  const { width } = useWindowDimensions();
  const numColumns = getNumColumns(width);

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
      keyExtractor={(item, index) => item.ItemCode || `producto-${index}`}
      columnWrapperStyle={numColumns > 1 ? { gap: 12, paddingHorizontal: 15 } : undefined}
      contentContainerStyle={[styles.listContent, numColumns === 1 ? { paddingHorizontal: 15 } : undefined]}
      renderItem={({ item }) => (
        <View style={[styles.colWrap, numColumns > 1 ? { flex: 1 } : undefined]}>
          <ProductCard item={item} onAdd={onAdd} />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 20, paddingTop: 10 },
  colWrap: { marginBottom: 0 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textLight },
  gridWrap: { padding: 15 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' }
});
