import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from 'moti/skeleton';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';

const FALLBACK_PRODUCT =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80';

export default function ProductCard({ item, onAdd, loading = false }) {
  if (loading) {
    return (
      <View style={[styles.card, GLOBAL_STYLES.shadow]}>
        <View style={styles.skeletonImage}>
          <Skeleton colorMode="light" width="100%" height="100%" radius="square" />
        </View>
        <View style={styles.content}>
          <Skeleton colorMode="light" width="35%" height={10} radius={7} />
          <View style={styles.skeletonSpacerMd} />
          <Skeleton colorMode="light" width="78%" height={14} radius={8} />
          <View style={styles.skeletonSpacerSm} />
          <Skeleton colorMode="light" width="58%" height={14} radius={8} />
          <View style={styles.footer}>
            <Skeleton colorMode="light" width="32%" height={16} radius={8} />
            <Skeleton colorMode="light" width={42} height={42} radius="round" />
          </View>
        </View>
      </View>
    );
  }

  const imageUrl = item?.image_url || FALLBACK_PRODUCT;

  return (
    <View style={[styles.card, GLOBAL_STYLES.shadow]}>
      <Image source={{ uri: imageUrl }} contentFit="cover" transition={120} style={styles.image} />
      <View style={styles.content}>
        <Text style={styles.code}>{item.ItemCode}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {item.ItemName}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.price}>${parseFloat(item.Price || 0).toFixed(2)}</Text>
          <TouchableOpacity style={styles.btnAdd} onPress={() => onAdd?.(item)}>
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#EEF1F4' },
  content: { padding: 12 },
  code: { fontSize: 10, color: COLORS.textLight, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.primary, minHeight: 40 },
  footer: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  btnAdd: {
    backgroundColor: COLORS.primary,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center'
  },
  skeletonImage: { width: '100%', aspectRatio: 16 / 9 },
  skeletonSpacerMd: { height: 10 },
  skeletonSpacerSm: { height: 8 }
});
