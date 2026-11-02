import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', busy, disabled }: Props) {
  const theme = useTheme();
  const colors = {
    primary: { background: theme.accent, foreground: theme.onAccent, border: theme.accent },
    secondary: { background: 'transparent', foreground: theme.text, border: theme.border },
    danger: { background: theme.danger, foreground: theme.onDanger, border: theme.danger },
  }[variant];
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.border },
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dimmed: { opacity: 0.7 },
  label: { fontSize: 17, fontWeight: '600' },
});
