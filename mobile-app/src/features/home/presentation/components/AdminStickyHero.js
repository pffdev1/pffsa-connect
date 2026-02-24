import React from 'react';
import { View, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import NotificationBellButton from './NotificationBellButton';

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
              <NotificationBellButton unreadUnlockCount={unreadUnlockCount} openNotifications={openNotifications} styles={styles} />
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
