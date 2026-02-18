import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { COLORS, GLOBAL_STYLES } from '../constants/theme';

const FALLBACK_PRODUCT =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80';

function ProductCard({ item, onAdd, loading = false, isInCart = false }) {
  const rawImageUrl = item?.Url ?? item?.url ?? item?.image_url;
  const normalizedImageUrl =
    typeof rawImageUrl === 'string' && rawImageUrl.trim().length > 0
      ? rawImageUrl.trim()
      : '';
  const [hasImageError, setHasImageError] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [qtyInput, setQtyInput] = useState('1');

  useEffect(() => {
    setHasImageError(false);
  }, [normalizedImageUrl]);

  useEffect(() => {
    setQtyInput('1');
  }, [item?.ItemCode]);

  if (loading) {
    return (
      <Animated.View entering={FadeIn.duration(260)}>
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
      </Animated.View>
    );
  }

  const imageUrl = !hasImageError && normalizedImageUrl ? normalizedImageUrl : FALLBACK_PRODUCT;
  const uom = String(item?.UOM ?? item?.uom ?? '').trim().toUpperCase();
  const priceText = `$${parseFloat(item.Price || 0).toFixed(2)}${uom ? ` / ${uom}` : ''}`;
  const handleQtyChange = (value) => {
    const rawValue = String(value || '').replace(',', '.');
    const cleaned = rawValue.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const normalizedValue =
      firstDot === -1
        ? cleaned
        : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;

    if (!normalizedValue) {
      setQtyInput('');
      return;
    }

    // Limit to max 3 decimals for quantities like KG/LB.
    const [intPart, decPart] = normalizedValue.split('.');
    const safeIntPart = intPart ? String(Math.min(999, Number(intPart))) : '0';
    const safeValue = decPart !== undefined ? `${safeIntPart}.${decPart.slice(0, 3)}` : safeIntPart;
    setQtyInput(safeValue);
  };
  const handleAddPress = () => {
    const parsedQty = Number(String(qtyInput || '').replace(',', '.'));
    const normalizedQty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    onAdd?.(item, normalizedQty);
    setQtyInput('1');
  };

  return (
    <Animated.View entering={FadeInDown.duration(260).springify().damping(18)}>
      <View style={[styles.card, GLOBAL_STYLES.shadow, isInCart && styles.cardInCart]}>
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
            <Text style={styles.price}>{priceText}</Text>
            <View style={styles.addControls}>
              <TextInput
                value={qtyInput}
                onChangeText={handleQtyChange}
                placeholder="1"
                keyboardType="decimal-pad"
                maxLength={8}
                style={styles.qtyInput}
              />
              <TouchableOpacity style={styles.btnAdd} onPress={handleAddPress}>
                <View style={[styles.btnAddInner, isInCart && styles.btnAddInnerSelected]}>
                  <Ionicons name={isInCart ? 'checkmark' : 'add'} size={18} color="#FFF" />
                </View>
              </TouchableOpacity>
            </View>
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
    </Animated.View>
  );
}

const areEqual = (prevProps, nextProps) => {
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.isInCart !== nextProps.isInCart) return false;
  if (prevProps.loading && nextProps.loading) return true;

  const prev = prevProps.item || {};
  const next = nextProps.item || {};

  return (
    prev.ItemCode === next.ItemCode &&
    prev.ItemName === next.ItemName &&
    prev.Price === next.Price &&
    prev.UOM === next.UOM &&
    prev.Url === next.Url &&
    prev.url === next.url &&
    prev.image_url === next.image_url
  );
};

export default React.memo(ProductCard, areEqual);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  cardInCart: {
    backgroundColor: '#EEF9F2',
    borderWidth: 1,
    borderColor: '#BFE7CC'
  },
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
  addControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: {
    width: 68,
    height: 38,
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: '#FFF'
  },
  btnAdd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnAddInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary
  },
  btnAddInnerSelected: {
    backgroundColor: '#2EAF61'
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
