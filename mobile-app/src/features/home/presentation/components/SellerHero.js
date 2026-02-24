import React from 'react';
import { View, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { COLORS, GLOBAL_STYLES } from '../../../../constants/theme';
import NotificationBellButton from './NotificationBellButton';

export default function SellerHero({ fullName, handleLogout, unreadUnlockCount, openNotifications, styles }) {
  return (
    <View>
      <View style={styles.topBrandBar}>
        <Image source={require('../../../../../assets/mainlogo.png')} style={styles.brandLogo} contentFit="contain" />
      </View>
      <LinearGradient colors={['#0E3D75', '#1664A0', '#1A77BC']} style={[styles.hero, styles.heroWithKpiDock, GLOBAL_STYLES.shadow]}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>Panel vendedor</Text>
          <View style={styles.heroActions}>
            <NotificationBellButton unreadUnlockCount={unreadUnlockCount} openNotifications={openNotifications} styles={styles} />
            <Button mode="contained" compact icon="logout" onPress={handleLogout} buttonColor="#FFFFFF" textColor={COLORS.primary}>
              Salir
            </Button>
          </View>
        </View>
        <Text style={styles.heroTitle}>Hola, {fullName || 'Vendedor'}</Text>
        <Text style={styles.heroSub}>Control diario de pedidos, ventas y seguimiento comercial</Text>
      </LinearGradient>
    </View>
  );
}
