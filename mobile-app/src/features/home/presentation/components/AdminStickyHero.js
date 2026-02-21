import React from 'react';
import { View, Text } from 'react-native';
import { Badge, Button, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { COLORS, GLOBAL_STYLES } from '../../../../constants/theme';

export default function AdminStickyHero({
  fullName,
  unreadUnlockCount,
  openNotifications,
  handleLogout,
  styles
}) {
  return (
    <View style={styles.adminStickyHeader}>
      <View style={GLOBAL_STYLES.contentMax}>
        <View style={styles.topBrandBar}>
          <Image source={require('../../../../../assets/mainlogo.png')} style={styles.brandLogo} contentFit="contain" />
        </View>
        <LinearGradient colors={['#0E3D75', '#1664A0', '#1A77BC']} style={[styles.hero, styles.heroWithKpiDock, GLOBAL_STYLES.shadow]}>
          <View style={styles.heroTopRow}>
            <View />
            <View style={styles.heroActions}>
              <View style={styles.bellWrap}>
                <IconButton
                  icon="bell-outline"
                  mode="contained-tonal"
                  size={20}
                  iconColor="#FFF"
                  containerColor="rgba(255,255,255,0.2)"
                  onPress={openNotifications}
                />
                {unreadUnlockCount > 0 && (
                  <Badge style={styles.bellBadge} size={18}>
                    {unreadUnlockCount > 99 ? '99+' : unreadUnlockCount}
                  </Badge>
                )}
              </View>
              <Button mode="contained" compact icon="logout" onPress={handleLogout} buttonColor="#FFFFFF" textColor={COLORS.primary}>
                Salir
              </Button>
            </View>
          </View>
          <Text style={styles.heroTitle}>Hola, {fullName || 'Admin'}</Text>
          <Text style={styles.heroSub}>Monitoreo comercial, vendedores y salud operativa</Text>
        </LinearGradient>
      </View>
    </View>
  );
}
