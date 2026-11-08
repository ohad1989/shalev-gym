import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from './theme';

type Props = {
  listening: boolean;
  // Microphone volume from 0 to 1.
  level: Animated.Value;
  onPress: () => void;
  label: string;
  busy?: boolean;
  disabled?: boolean;
  size?: number;
};

const nativeDriver = Platform.OS !== 'web';

// The big round record button. While listening it shows a stop square, and a ring breathes
// around it and swells with the trainer's voice, so it is clear the phone is hearing them.
export function MicButton({ listening, level, onPress, label, busy, disabled, size = 104 }: Props) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: nativeDriver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const ringScale = Animated.add(
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }),
    level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
  );
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const voiceScale = level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const background = listening ? theme.danger : theme.accent;
  const foreground = listening ? theme.onDanger : theme.onAccent;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
        {listening && (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
                { opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { width: size, height: size, borderRadius: size / 2, backgroundColor: background, opacity: 0.22 },
                { transform: [{ scale: voiceScale }] },
              ]}
            />
          </>
        )}
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
          <Pressable
            accessibilityHint={listening ? 'Stops listening and saves what you said' : undefined}
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
            android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
            disabled={disabled || busy}
            onPress={onPress}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.88 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color={foreground} size="large" />
            ) : (
              <Ionicons color={foreground} name={listening ? 'stop' : 'mic'} size={size * 0.42} />
            )}
          </Pressable>
        </View>
      </View>
      <Text style={[styles.label, { color: listening ? theme.danger : theme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  ring: { position: 'absolute' },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 17, fontWeight: '700', marginTop: -4 },
});
