import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NewExercise } from '@/data/exerciseRepo';
import type { ChosenPart } from '@/domain/exerciseChoice';
import { formatSet } from '@/domain/exerciseLog';

import { Button } from './Button';
import { haptic } from './haptics';
import { useTheme } from './theme';

type Option = NewExercise & { key: string; note: string };

function optionsFor(part: ChosenPart): Option[] {
  const known = [part.match.best, ...part.match.alternatives]
    .filter((o) => o !== null)
    .map((o) => ({
      key: o.name.toLowerCase(),
      name: o.name,
      muscle: o.muscle,
      note: o.muscle ?? 'Used before',
    }));
  const spokenKey = part.spokenName.toLowerCase();
  // When the match is clear, what was said is just a mishearing of it, not a new exercise.
  if (!part.match.confident && !known.some((o) => o.key === spokenKey)) {
    known.push({ key: spokenKey, name: part.spokenName, muscle: null, note: 'New exercise, as you said it' });
  }
  return known;
}

type Props = {
  parts: ChosenPart[];
  superset: boolean;
  busy: boolean;
  onConfirm: (exercises: NewExercise[]) => void;
  onRetry: () => void;
  onCancel: () => void;
};

// Shows the exercise the app understood and waits for one tap to confirm it, so every set
// that follows lands under the right exercise.
export function ExerciseConfirm({ parts, superset, busy, onConfirm, onRetry, onCancel }: Props) {
  const theme = useTheme();
  const [picked, setPicked] = useState<string[]>(() => parts.map((part) => optionsFor(part)[0].key));
  const options = parts.map(optionsFor);
  const chosen = options.map((list, index) => list.find((o) => o.key === picked[index]) ?? list[0]);
  const sure = parts.every((part, index) => part.match.confident && picked[index] === optionsFor(part)[0].key);
  const firstSets = parts.flatMap((part) => part.sets);
  const unknown = parts.every((part) => part.match.best === null);

  return (
    <View
      accessibilityLabel="Confirm the exercise"
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
      <View style={styles.titleRow}>
        <Ionicons color={sure ? theme.accent : theme.textMuted} name={sure ? 'checkmark-circle' : unknown ? 'add-circle' : 'help-circle'} size={24} />
        <Text style={[styles.title, { color: theme.text }]}>
          {sure
            ? superset
              ? 'Superset, got it'
              : 'Got it'
            : unknown
              ? 'Add a new exercise?'
              : 'Did you mean…'}
        </Text>
      </View>

      {parts.map((part, partIndex) => (
        <View key={partIndex} style={styles.part}>
          {superset && (
            <Text style={[styles.partLabel, { color: theme.textMuted }]}>
              {partIndex === 0 ? 'FIRST' : partIndex === 1 ? 'SECOND' : `EXERCISE ${partIndex + 1}`}
            </Text>
          )}
          <View
            accessibilityRole="radiogroup"
            style={[styles.list, { borderColor: theme.border }]}>
            {options[partIndex].map((option, optionIndex) => {
              const selected = option.key === chosen[partIndex].key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityLabel={`${option.name}, ${option.note}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  android_ripple={{ color: theme.ripple }}
                  onPress={() => {
                    haptic.select();
                    setPicked((current) => current.map((key, k) => (k === partIndex ? option.key : key)));
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    optionIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    selected && { backgroundColor: theme.accentSoft },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.optionText}>
                    <Text style={[optionIndex === 0 ? styles.bestName : styles.optionName, { color: theme.text }]}>
                      {option.name}
                    </Text>
                    <Text style={[styles.note, { color: theme.textMuted }]}>{option.note}</Text>
                  </View>
                  <Ionicons
                    color={selected ? theme.accent : theme.border}
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={24}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Text style={[styles.heard, { color: theme.textMuted }]}>
        You said “{parts.map((p) => p.match.heard || p.spokenName.toLowerCase()).join(' + ')}”
        {firstSets.length > 0 ? `, and the first set: ${firstSets.map(formatSet).join(', ')}` : ''}
      </Text>

      <Button
        busy={busy}
        icon="checkmark"
        label={superset ? 'Start superset' : `Start ${chosen[0].name}`}
        onPress={() => onConfirm(chosen.map(({ name, muscle }) => ({ name, muscle })))}
      />
      <View style={styles.secondaryRow}>
        <View style={styles.flex}>
          <Button disabled={busy} icon="mic-outline" label="Say again" onPress={onRetry} variant="secondary" />
        </View>
        <View style={styles.flex}>
          <Button disabled={busy} label="Cancel" onPress={onCancel} variant="secondary" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 18, padding: 16, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  part: { gap: 6 },
  partLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionText: { flex: 1, minWidth: 0 },
  bestName: { fontSize: 19, fontWeight: '700' },
  optionName: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 13, marginTop: 2 },
  heard: { fontSize: 14, lineHeight: 20 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
});
