import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { supabase } from '../../../../shared/infrastructure/supabaseClient';
import { INTRO_BAR_SPECS, INTRO_MIN_VISIBLE_MS } from '../../domain/introMotion';

function AnimatedBrandBar({ height, delay, color }) {
  const progress = useSharedValue(0.4);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
          withTiming(0.4, { duration: 520, easing: Easing.inOut(Easing.cubic) })
        ),
        -1,
        false
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height * (0.45 + progress.value * 0.55),
    opacity: 0.58 + progress.value * 0.42
  }));

  return <Animated.View style={[styles.bar, { backgroundColor: color }, animatedStyle]} />;
}

export default function PedersenBarsSplash() {
  const router = useRouter();
  const [statusText, setStatusText] = useState('Inicializando entorno...');

  useEffect(() => {
    const statusSteps = ['Inicializando entorno...', 'Validando sesion...', 'Preparando experiencia...'];
    let index = 0;
    const intervalId = setInterval(() => {
      index = (index + 1) % statusSteps.length;
      setStatusText(statusSteps[index]);
    }, 420);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const startedAt = Date.now();
      let hasSession = false;

      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        hasSession = Boolean(session?.user);
        setStatusText(hasSession ? 'Sesion activa detectada...' : 'Redirigiendo al acceso...');
      } catch (_error) {
        hasSession = false;
        setStatusText('Redirigiendo al acceso...');
      }

      const elapsedMs = Date.now() - startedAt;
      const pendingMs = Math.max(INTRO_MIN_VISIBLE_MS - elapsedMs, 0);
      if (pendingMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, pendingMs);
        });
      }

      if (cancelled) return;
      router.replace(hasSession ? '/(tabs)/home' : '/login');
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#052147', '#0C3F79', '#0E5DA1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />

        <Text style={styles.kicker}>Pedersen Connect</Text>

        <View style={styles.barsWrap}>
          {INTRO_BAR_SPECS.map((bar, index) => (
            <AnimatedBrandBar key={`${index}-${bar.height}`} height={bar.height} delay={bar.delay} color={bar.color} />
          ))}
        </View>

        <Text style={styles.title}>Pedersen Fine Foods</Text>
        <Text style={styles.subtitle}>{statusText}</Text>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#052147'
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28
  },
  glowOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: '22%',
    left: -40
  },
  glowTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(221,5,43,0.16)',
    bottom: '16%',
    right: -30
  },
  kicker: {
    color: '#CFE5FF',
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  barsWrap: {
    marginTop: 20,
    marginBottom: 24,
    height: 90,
    width: 200,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  bar: {
    width: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)'
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center'
  },
  subtitle: {
    marginTop: 8,
    color: '#DBEFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  }
});
