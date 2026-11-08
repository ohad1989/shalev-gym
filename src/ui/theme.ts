import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F6F4',
  surface: '#FFFFFF',
  border: '#DADDD8',
  text: '#171A17',
  textMuted: '#5C635C',
  accent: '#1F6F4A',
  accentSoft: '#E1F0E7',
  onAccent: '#FFFFFF',
  ripple: 'rgba(23, 26, 23, 0.12)',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
};

const dark: typeof light = {
  background: '#111311',
  surface: '#1C1F1C',
  border: '#343934',
  text: '#F0F2EF',
  textMuted: '#A3ABA3',
  accent: '#5CC895',
  accentSoft: '#183A29',
  onAccent: '#0B1F15',
  ripple: 'rgba(240, 242, 239, 0.16)',
  danger: '#F2B8B5',
  onDanger: '#3D0B08',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
