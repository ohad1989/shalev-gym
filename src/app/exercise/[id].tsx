import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { deleteExercise, getExercise, updateExercise } from '@/data/exerciseRepo';
import {
  formatWeight,
  type LoggedExercise,
  type Technique,
  type WeightUnit,
} from '@/domain/exerciseLog';
import { Button } from '@/ui/Button';
import { useTheme, type Theme } from '@/ui/theme';

type DraftSet = {
  key: string;
  id?: string;
  weight: string;
  unit: WeightUnit;
  reps: string;
  toFailure: boolean;
};

const TECHNIQUES: { value: Technique | null; label: string }[] = [
  { value: null, label: 'Normal' },
  { value: 'pyramid', label: 'Pyramid' },
  { value: 'drop set', label: 'Drop set' },
];

function toDraft(exercise: LoggedExercise): DraftSet[] {
  const fallbackUnit = exercise.sets.find((s) => s.unit)?.unit ?? 'kg';
  return exercise.sets.map((set) => ({
    key: set.id,
    id: set.id,
    weight: set.weight === null ? '' : String(set.weight),
    unit: set.unit ?? fallbackUnit,
    reps: set.reps === null ? '' : String(set.reps),
    toFailure: set.toFailure,
  }));
}

function readWeight(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
}

function readReps(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 'invalid';
}

export default function EditExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const theme = useTheme();
  const [exercise, setExercise] = useState<LoggedExercise | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [technique, setTechnique] = useState<Technique | null>(null);
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getExercise(db, userId, id)
      .then((loaded) => {
        if (cancelled) return;
        setExercise(loaded);
        if (loaded) {
          setName(loaded.name);
          setTechnique(loaded.technique);
          setSets(toDraft(loaded));
        }
      })
      .catch(() => {
        if (!cancelled) setError('This exercise could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [db, userId, id]);

  function changeSet(key: string, change: Partial<DraftSet>) {
    setSets((current) => current.map((set) => (set.key === key ? { ...set, ...change } : set)));
  }

  function addSet() {
    setSets((current) => {
      const last = current[current.length - 1];
      return [
        ...current,
        {
          key: randomUUID(),
          weight: last?.weight ?? '',
          unit: last?.unit ?? 'kg',
          reps: last?.reps ?? '',
          toFailure: false,
        },
      ];
    });
  }

  async function save() {
    if (!userId) return;
    setError(null);
    if (!name.trim()) {
      setError('Give the exercise a name.');
      return;
    }
    if (sets.length === 0) {
      setError('Add at least one set, or delete the exercise.');
      return;
    }
    const parsed = [];
    for (const [index, set] of sets.entries()) {
      const weight = readWeight(set.weight);
      const reps = readReps(set.reps);
      if (weight === 'invalid') {
        setError(`Set ${index + 1}: the weight must be a number, or empty for bodyweight.`);
        return;
      }
      if (reps === 'invalid') {
        setError(`Set ${index + 1}: reps must be a whole number.`);
        return;
      }
      parsed.push({
        id: set.id,
        weight,
        unit: weight === null ? null : set.unit,
        reps,
        toFailure: set.toFailure,
      });
    }

    setSaving(true);
    try {
      await updateExercise(db, userId, id, { name, technique, sets: parsed }, randomUUID);
      router.back();
    } catch {
      setError('The changes could not be saved. Please try again.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!userId) return;
    setSaving(true);
    try {
      await deleteExercise(db, userId, id);
      router.back();
    } catch {
      setError('The exercise could not be deleted. Please try again.');
      setSaving(false);
    }
  }

  if (exercise === undefined) {
    return (
      <View style={styles.centered}>
        {error ? (
          <Text style={[styles.message, { color: theme.danger }]}>{error}</Text>
        ) : (
          <ActivityIndicator color={theme.accent} />
        )}
      </View>
    );
  }

  if (exercise === null) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.message, { color: theme.text }]}>This exercise could not be found.</Text>
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Exercise</Text>
          <TextInput
            accessibilityLabel="Exercise name"
            id="exercise-name"
            onChangeText={setName}
            style={inputStyle}
            value={name}
          />

          {exercise.spokenText && (
            <Text style={[styles.heard, { color: theme.textMuted }]}>
              You said: “{exercise.spokenText}”
            </Text>
          )}

          <Text style={[styles.label, styles.section, { color: theme.textMuted }]}>Type</Text>
          <View style={styles.chips}>
            {TECHNIQUES.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                onPress={() => setTechnique(option.value)}
                selected={technique === option.value}
                theme={theme}
              />
            ))}
          </View>

          <Text style={[styles.label, styles.section, { color: theme.textMuted }]}>Sets</Text>
          <View style={styles.sets}>
            {sets.map((set, index) => {
              const weight = readWeight(set.weight);
              return (
                <View
                  key={set.key}
                  style={[styles.setCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <View style={styles.setHeader}>
                    <Text style={[styles.setTitle, { color: theme.text }]}>Set {index + 1}</Text>
                    <Pressable
                      accessibilityLabel={`Remove set ${index + 1}`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setSets((current) => current.filter((s) => s.key !== set.key))}>
                      <Text style={[styles.remove, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>

                  <View style={styles.fields}>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Weight</Text>
                      <TextInput
                        accessibilityLabel={`Set ${index + 1} weight`}
                        id={`set-${set.key}-weight`}
                        inputMode="decimal"
                        keyboardType="decimal-pad"
                        onChangeText={(text) => changeSet(set.key, { weight: text })}
                        placeholder="Bodyweight"
                        placeholderTextColor={theme.textMuted}
                        style={inputStyle}
                        value={set.weight}
                      />
                    </View>
                    <View style={styles.unitToggle}>
                      {(['kg', 'lb'] as const).map((unit) => (
                        <Chip
                          key={unit}
                          label={unit}
                          onPress={() => changeSet(set.key, { unit })}
                          selected={set.unit === unit}
                          theme={theme}
                        />
                      ))}
                    </View>
                    <View style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Reps</Text>
                      <TextInput
                        accessibilityLabel={`Set ${index + 1} reps`}
                        id={`set-${set.key}-reps`}
                        inputMode="numeric"
                        keyboardType="number-pad"
                        onChangeText={(text) => changeSet(set.key, { reps: text })}
                        style={inputStyle}
                        value={set.reps}
                      />
                    </View>
                  </View>

                  <View style={styles.setFooter}>
                    <Chip
                      label="To failure"
                      onPress={() => changeSet(set.key, { toFailure: !set.toFailure })}
                      selected={set.toFailure}
                      theme={theme}
                    />
                    {typeof weight === 'number' && (
                      <Text style={[styles.converted, { color: theme.textMuted }]}>
                        {formatWeight(weight, set.unit)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.addSet}>
            <Button label="Add set" onPress={addSet} variant="secondary" />
          </View>

          {error && (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          )}

          <View style={styles.actions}>
            <Button busy={saving && !confirmingDelete} label="Save changes" onPress={save} />
            {confirmingDelete ? (
              <>
                <Text style={[styles.confirmText, { color: theme.text }]}>
                  Delete {exercise.name} and its sets?
                </Text>
                <Button busy={saving} label="Yes, delete exercise" onPress={remove} variant="danger" />
                <Button
                  disabled={saving}
                  label="Keep it"
                  onPress={() => setConfirmingDelete(false)}
                  variant="secondary"
                />
              </>
            ) : (
              <Button
                disabled={saving}
                label="Delete exercise"
                onPress={() => setConfirmingDelete(true)}
                variant="secondary"
              />
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.accent : theme.border,
          backgroundColor: selected ? theme.accent : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipLabel, { color: selected ? theme.onAccent : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 17, textAlign: 'center' },
  content: { padding: 20, flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  section: { marginTop: 22 },
  heard: { fontSize: 14, lineHeight: 20, marginTop: 8, fontStyle: 'italic' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipLabel: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  sets: { gap: 12 },
  setCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setTitle: { fontSize: 16, fontWeight: '700' },
  remove: { fontSize: 15, fontWeight: '600' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  field: { flexGrow: 1, flexBasis: 100, minWidth: 0, gap: 4 },
  fieldLabel: { fontSize: 13 },
  unitToggle: { flexDirection: 'row', gap: 6, paddingBottom: 6 },
  setFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  converted: { fontSize: 14, fontVariant: ['tabular-nums'] },
  addSet: { marginTop: 12 },
  error: { fontSize: 15, marginTop: 16 },
  actions: { marginTop: 24, gap: 10 },
  confirmText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
