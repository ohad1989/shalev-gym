import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from './Button';
import { useTheme } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Chip({ label, onPress, icon, selected, disabled, accessibilityLabel }: Props) {
  const theme = useTheme();
  const foreground = selected ? theme.accent : theme.text;
  return (
    <View style={styles.clip}>
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        android_ripple={{ color: theme.ripple }}
        disabled={disabled}
        hitSlop={4}
        onPress={onPress}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: selected ? theme.accentSoft : theme.surface,
            borderColor: selected ? theme.accent : theme.border,
          },
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}>
        {icon && <Ionicons color={foreground} name={icon} size={17} />}
        <Text numberOfLines={1} style={[styles.label, { color: foreground }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: 999, overflow: 'hidden' },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
