import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/services/supabaseClient';

const LOGO = require('../assets/logo.png');

export default function IntroScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslate = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true
        })
      ]),
      Animated.parallel([
        Animated.timing(panelOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(panelTranslate, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ])
    ]).start();

    const timer = setTimeout(async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        router.replace(session?.user ? '/(tabs)/clientes' : '/login');
      } catch (_error) {
        router.replace('/login');
      }
    }, 2400);

    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale, panelOpacity, panelTranslate, router]);

  return (
    <View style={styles.container}>
      <View style={styles.bgCirclePrimary} />
      <View style={styles.bgCircleSecondary} />

      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] }
        ]}
      >
        <Image source={LOGO} style={styles.logo} contentFit="contain" />
      </Animated.View>

      <Animated.View
        style={[
          styles.futurePanel,
          {
            opacity: panelOpacity,
            transform: [{ translateY: panelTranslate }]
          }
        ]}
      >
        <View style={styles.futureHeader}>
          <Ionicons name="sparkles-outline" size={16} color={COLORS.primary} />
          <Text style={styles.futureTitle}>Proxima validacion</Text>
        </View>
        <Text style={styles.futureText}>
          Espacio reservado para validaciones de precios y reglas comerciales.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6FAFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24
  },
  bgCirclePrimary: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#DCEBFF',
    top: -70,
    right: -70
  },
  bgCircleSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#EAF3FF',
    bottom: -60,
    left: -60
  },
  logoWrap: {
    width: 220,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logo: {
    width: 220,
    height: 120
  },
  futurePanel: {
    marginTop: 30,
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E8EEF5'
  },
  futureHeader: { flexDirection: 'row', alignItems: 'center' },
  futureTitle: {
    marginLeft: 6,
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  futureText: {
    marginTop: 6,
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 17
  }
});

