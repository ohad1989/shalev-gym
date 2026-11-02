import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F6F4',
  surface: '#FFFFFF',
  border: '#DADDD8',
  text: '#171A17',
  textMuted: '#5C635C',
  accent: '#1F6F4A',
  onAccent: '#FFFFFF',
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
  onAccent: '#0B1F15',
  danger: '#F2B8B5',
  onDanger: '#3D0B08',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
