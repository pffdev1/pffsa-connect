import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Badge, IconButton } from 'react-native-paper';

export default function NotificationBellButton({ unreadUnlockCount, openNotifications, styles }) {
  const bellRotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Number(unreadUnlockCount || 0) <= 0) {
      bellRotateAnim.stopAnimation(() => bellRotateAnim.setValue(0));
      return undefined;
    }

    const wiggleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bellRotateAnim, {
          toValue: 1,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(bellRotateAnim, {
          toValue: -1,
          duration: 170,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(bellRotateAnim, {
          toValue: 0,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.delay(1100)
      ])
    );
    wiggleLoop.start();

    return () => {
      wiggleLoop.stop();
      bellRotateAnim.stopAnimation(() => bellRotateAnim.setValue(0));
    };
  }, [unreadUnlockCount, bellRotateAnim]);

  const rotate = bellRotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-8deg', '0deg', '8deg']
  });

  return (
    <View style={styles.bellWrap}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <IconButton
          icon="bell-outline"
          mode="contained-tonal"
          size={20}
          iconColor="#FFF"
          containerColor="rgba(255,255,255,0.2)"
          onPress={openNotifications}
        />
      </Animated.View>
      {unreadUnlockCount > 0 && (
        <Badge style={styles.bellBadge} size={18}>
          {unreadUnlockCount > 99 ? '99+' : unreadUnlockCount}
        </Badge>
      )}
    </View>
  );
}
