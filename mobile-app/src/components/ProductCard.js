import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';

const FALLBACK_PRODUCT =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80';

export default function ProductCard({ item, onAdd, loading = false }) {
  const rawImageUrl = item?.Url ?? item?.url ?? item?.image_url;
  const normalizedImageUrl =
    typeof rawImageUrl === 'string' && rawImageUrl.trim().length > 0
      ? rawImageUrl.trim()
      : '';
  const [hasImageError, setHasImageError] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [normalizedImageUrl]);

  if (loading) {
    return (
      <MotiView from={{ opacity: 0.45 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 260 }}>
        <View style={[styles.card, GLOBAL_STYLES.shadow]}>
        <View style={styles.skeletonImage}>
          <View style={styles.skeletonBlock} />
        </View>
        <View style={styles.content}>
          <View style={[styles.skeletonBlock, styles.skeletonLineSm]} />
          <View style={styles.skeletonSpacerMd} />
          <View style={[styles.skeletonBlock, styles.skeletonLineLg]} />
          <View style={styles.skeletonSpacerSm} />
          <View style={[styles.skeletonBlock, styles.skeletonLineMd]} />
          <View style={styles.footer}>
            <View style={[styles.skeletonBlock, styles.skeletonPrice]} />
            <View style={[styles.skeletonBlock, styles.skeletonRound]} />
          </View>
        </View>
        </View>
      </MotiView>
    );
  }

  const imageUrl = !hasImageError && normalizedImageUrl ? normalizedImageUrl : FALLBACK_PRODUCT;

  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 260 }}>
      <View style={[styles.card, GLOBAL_STYLES.shadow]}>
        <TouchableOpacity activeOpacity={0.92} onPress={() => setPreviewVisible(true)}>
          <Image
            source={{ uri: imageUrl }}
            contentFit="contain"
            transition={120}
            style={styles.image}
            onError={() => setHasImageError(true)}
          />
          <View style={styles.zoomPill}>
            <Ionicons name="expand-outline" size={13} color="#FFF" />
            <Text style={styles.zoomText}>Ver grande</Text>
          </View>
        </TouchableOpacity>

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

      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewVisible(false)}>
          <View style={styles.previewCard}>
            <Image source={{ uri: imageUrl }} contentFit="contain" transition={120} style={styles.previewImage} />
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
              <Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#FFF' },
  zoomPill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 22, 46, 0.72)'
  },
  zoomText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
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
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18
  },
  previewCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0D1118'
  },
  previewImage: { width: '100%', height: 420, backgroundColor: '#0D1118' },
  previewClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  skeletonImage: { width: '100%', aspectRatio: 16 / 9 },
  skeletonBlock: { backgroundColor: '#EEF1F4', borderRadius: 8 },
  skeletonLineSm: { width: '35%', height: 10 },
  skeletonLineMd: { width: '58%', height: 14 },
  skeletonLineLg: { width: '78%', height: 14 },
  skeletonPrice: { width: '32%', height: 16 },
  skeletonRound: { width: 42, height: 42, borderRadius: 21 },
  skeletonSpacerMd: { height: 10 },
  skeletonSpacerSm: { height: 8 }
});
