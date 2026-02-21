import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from 'moti/skeleton';
import { COLORS, GLOBAL_STYLES } from '../../../../constants/theme';

const resolveName = (item) => item?.full_name || item?.CardFName || item?.CardName || 'Cliente sin nombre';
const resolveSubCategoria = (item) => item?.SubCategoria || 'No definida';
const resolveNivel = (item) => item?.Nivel || 'No definido';
const resolveTipoCadena = (item) => item?.TipoCadena || 'No definida';
const resolveRuta = (item) => item?.Ruta || 'Sin ruta';
const isBlocked = (item) => String(item?.Bloqueado || '').trim().toUpperCase() === 'Y';
const normalizeSellerName = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

function CustomerCard({ item, onPress, onInfoPress, loading = false, viewerRole = 'vendedor', viewerSellerName = '' }) {
  if (loading) {
    return (
      <View style={[styles.cardWrap, styles.skeletonCard]}>
        <Skeleton colorMode="light" width="72%" height={14} radius={8} />
        <View style={styles.skeletonSpacerSm} />
        <Skeleton colorMode="light" width="52%" height={12} radius={8} />
        <View style={styles.skeletonSpacerSm} />
        <Skeleton colorMode="light" width="52%" height={12} radius={8} />
        <View style={styles.skeletonFooterRow}>
          <Skeleton colorMode="light" width="38%" height={11} radius={8} />
          <Skeleton colorMode="light" width={48} height={20} radius="round" />
        </View>
        <View style={styles.skeletonFooterRow}>
          <Skeleton colorMode="light" width="48%" height={11} radius={8} />
          <Skeleton colorMode="light" width={74} height={20} radius="round" />
        </View>
      </View>
    );
  }

  const name = resolveName(item);
  const ruta = resolveRuta(item);
  const subCategoria = resolveSubCategoria(item);
  const nivel = resolveNivel(item);
  const tipoCadena = resolveTipoCadena(item);
  const blocked = isBlocked(item);
  const isAdminViewer = String(viewerRole || '').trim().toLowerCase() === 'admin';
  const assignedSeller = normalizeSellerName(item?.Vendedor || '');
  const viewerSeller = normalizeSellerName(viewerSellerName);
  const isAssignedToViewer = !isAdminViewer && viewerSeller && assignedSeller && assignedSeller === viewerSeller;

  return (
    <View style={[styles.cardWrap, GLOBAL_STYLES.shadow]}>
      <TouchableOpacity style={styles.cardTouch} onPress={() => onPress?.(item)} activeOpacity={0.92}>
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.code}>{item?.CardCode || ''}</Text>
          {!isAdminViewer && (
            <View style={[styles.assignmentBadge, isAssignedToViewer ? styles.assignmentMine : styles.assignmentOther]}>
              <Text style={styles.assignmentText}>{isAssignedToViewer ? 'Asignado a mi' : 'De otro vendedor'}</Text>
            </View>
          )}

          <View style={styles.row}>
            <Ionicons name="navigate-outline" size={14} color={COLORS.textLight} />
            <Text style={styles.meta} numberOfLines={1}>
              Ruta: {ruta}
            </Text>
          </View>

          <View style={styles.footerRow}>
            <View style={styles.row}>
              <Ionicons name="storefront-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.metaSmall} numberOfLines={1}>{subCategoria}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{String(nivel).toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.metaSmall} numberOfLines={1}>Cadena: {tipoCadena}</Text>
            <View style={[styles.statusBadge, blocked ? styles.blocked : styles.active]}>
              <Text style={styles.statusText}>{blocked ? 'BLOQUEADO' : 'ACTIVO'}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.infoButton} onPress={() => onInfoPress?.(item)}>
        <Ionicons name="information-circle-outline" size={24} color={COLORS.secondary} />
      </TouchableOpacity>
    </View>
  );
}

const areEqual = (prevProps, nextProps) => {
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.loading && nextProps.loading) return true;

  const prev = prevProps.item || {};
  const next = nextProps.item || {};

  return (
    prev.CardCode === next.CardCode &&
    prev.CardName === next.CardName &&
    prev.CardFName === next.CardFName &&
    prev.Ruta === next.Ruta &&
    prev.SubCategoria === next.SubCategoria &&
    prev.Nivel === next.Nivel &&
    prev.TipoCadena === next.TipoCadena &&
    prev.Bloqueado === next.Bloqueado &&
    prev.Vendedor === next.Vendedor &&
    prevProps.viewerRole === nextProps.viewerRole &&
    prevProps.viewerSellerName === nextProps.viewerSellerName
  );
};

const styles = StyleSheet.create({
  cardWrap: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'visible',
    marginBottom: 12
  },
  cardTouch: { flex: 1 },
  content: { padding: 12, paddingRight: 44 },
  name: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  code: { marginTop: 4, color: COLORS.textLight, fontSize: 11, fontWeight: '600' },
  assignmentBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  assignmentMine: { backgroundColor: '#E7F7ED' },
  assignmentOther: { backgroundColor: '#EEF1F4' },
  assignmentText: { color: '#3F4A5A', fontSize: 10, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  meta: { color: COLORS.textLight, marginLeft: 6, fontSize: 12, flex: 1 },
  metaSmall: { color: COLORS.textLight, marginLeft: 6, fontSize: 11 },
  footerRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1F4',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeText: { marginLeft: 4, color: '#3F4A5A', fontSize: 10, fontWeight: '700' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  active: { backgroundColor: '#E7F7ED' },
  blocked: { backgroundColor: '#FCEAEA' },
  statusText: { fontSize: 10, fontWeight: '700', color: '#3F4A5A' },
  infoButton: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFFFFFCC', borderRadius: 16, padding: 2 },
  skeletonCard: { padding: 12 },
  skeletonSpacerSm: { height: 8 },
  skeletonFooterRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }
});

export default React.memo(CustomerCard, areEqual);
