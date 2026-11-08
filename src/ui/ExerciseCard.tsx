import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatSet, type LoggedExercise } from '@/domain/exerciseLog';
import { formatTime } from '@/domain/workout';

import { useTheme } from './theme';

type Props = {
  exercise: LoggedExercise;
  inSuperset: boolean;
  onEdit: () => void;
  // Shown while the workout is in progress, to add more sets to a finished exercise.
  onResume?: () => void;
};

export function ExerciseCard({ exercise, inSuperset, onEdit, onResume }: Props) {
  const theme = useTheme();
  const count = exercise.sets.length;
  const tags = [
    exercise.muscle,
    inSuperset && 'Superset',
    exercise.technique && capitalize(exercise.technique),
  ].filter(Boolean) as string[];

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.name, { color: theme.text }]}>{exercise.name}</Text>
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {[`${count} ${count === 1 ? 'set' : 'sets'}`, ...tags].join(' · ')}
          </Text>
        </View>
        <View style={styles.actions}>
          {onResume && (
            <Pressable
              accessibilityLabel={`Add more sets to ${exercise.name}`}
              accessibilityRole="button"
              android_ripple={{ color: theme.ripple }}
              hitSlop={8}
              onPress={onResume}
              style={({ pressed }) => [styles.edit, { borderColor: theme.border }, pressed && styles.pressed]}>
              <Ionicons color={theme.accent} name="add" size={18} />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel={`Edit ${exercise.name}`}
            accessibilityRole="button"
            android_ripple={{ color: theme.ripple }}
            hitSlop={8}
            onPress={onEdit}
            style={({ pressed }) => [styles.edit, { borderColor: theme.border }, pressed && styles.pressed]}>
            <Text style={[styles.editLabel, { color: theme.accent }]}>Edit</Text>
          </Pressable>
        </View>
      </View>

      {exercise.sets.map((set, index) => (
        <View key={set.id} style={[styles.setRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.setNumber, { color: theme.textMuted }]}>{index + 1}</Text>
          <Text style={[styles.setText, { color: theme.text }]}>{formatSet(set)}</Text>
          {set.endedAt && (
            <Text
              accessibilityLabel={`About ${formatTime(set.endedAt)}`}
              style={[styles.setTime, { color: theme.textMuted }]}>
              ~{formatTime(set.endedAt)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 6 },
  titleBlock: { flex: 1, minWidth: 0 },
  name: { fontSize: 18, fontWeight: '700' },
  meta: { fontSize: 14, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  edit: {
    minHeight: 38,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  editLabel: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  setNumber: { width: 18, fontSize: 14, fontVariant: ['tabular-nums'] },
  setText: { flex: 1, fontSize: 16, fontVariant: ['tabular-nums'] },
  setTime: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
