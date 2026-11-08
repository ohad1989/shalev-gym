import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'plain' | 'dangerPlain';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
};

export function Button({ label, onPress, variant = 'primary', icon, busy, disabled, accessibilityHint }: Props) {
  const theme = useTheme();
  const colors = {
    primary: { background: theme.accent, foreground: theme.onAccent, border: theme.accent },
    secondary: { background: 'transparent', foreground: theme.text, border: theme.border },
    danger: { background: theme.danger, foreground: theme.onDanger, border: theme.danger },
    plain: { background: 'transparent', foreground: theme.accent, border: 'transparent' },
    dangerPlain: { background: 'transparent', foreground: theme.danger, border: 'transparent' },
  }[variant];
  const inactive = busy || disabled;

  return (
    <View style={styles.clip}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inactive, busy: !!busy }}
        android_ripple={{ color: theme.ripple }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.background, borderColor: colors.border },
          inactive && styles.inactive,
          pressed && styles.pressed,
        ]}>
        {busy ? (
          <ActivityIndicator color={colors.foreground} />
        ) : (
          <View style={styles.content}>
            {icon && <Ionicons color={colors.foreground} name={icon} size={20} />}
            <Text numberOfLines={1} style={[styles.label, { color: colors.foreground }]}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: 12, overflow: 'hidden' },
  button: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
});
