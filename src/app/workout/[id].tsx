import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { listExercises, logExercises } from '@/data/exerciseRepo';
import { endWorkout, getWorkout } from '@/data/workoutRepo';
import { parseExerciseLog, type LoggedExercise } from '@/domain/exerciseLog';
import {
  durationMs,
  formatClock,
  formatDuration,
  formatLongDate,
  formatTime,
  type Workout,
} from '@/domain/workout';
import { Button } from '@/ui/Button';
import { ExerciseCard } from '@/ui/ExerciseCard';
import { useTheme } from '@/ui/theme';
import { useSpeechToText } from '@/voice/useSpeechToText';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Notice = { tone: 'info' | 'error'; text: string };

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const theme = useTheme();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const inProgress = workout?.endedAt === null;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      Promise.all([getWorkout(db, userId, id), listExercises(db, userId, id)])
        .then(([loadedWorkout, loadedExercises]) => {
          if (cancelled) return;
          setWorkout(loadedWorkout);
          setExercises(loadedExercises);
        })
        .catch(() => {
          if (!cancelled) setError('This workout could not be loaded.');
        });
      return () => {
        cancelled = true;
      };
    }, [db, userId, id]),
  );

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

  const logText = useCallback(
    async (text: string, spokenAt: Date, fromVoice: boolean) => {
      if (!userId) return;
      const result = parseExerciseLog(text);
      if (result.kind === 'end-workout') {
        setNotice(null);
        setConfirming(true);
        return;
      }
      if (result.kind === 'not-understood') {
        setNotice({ tone: 'error', text: result.reason });
        // Put what was heard in the text field so it can be corrected instead of said again.
        if (fromVoice) setTyped(text);
        return;
      }

      setSaving(true);
      try {
        await logExercises(
          db,
          userId,
          id,
          { exercises: result.exercises, superset: result.superset, spokenText: text, spokenAt },
          randomUUID,
        );
        setExercises(await listExercises(db, userId, id));
        setTyped('');
        const summary = result.exercises
          .map((e) => `${e.name}, ${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'}`)
          .join(' + ');
        setNotice({ tone: 'info', text: `Logged ${summary}.` });
      } catch {
        setNotice({ tone: 'error', text: 'The exercise could not be saved. Please try again.' });
        if (fromVoice) setTyped(text);
      } finally {
        setSaving(false);
      }
    },
    [db, userId, id],
  );

  const onHeard = useCallback(
    (text: string, tappedAt: Date) => logText(text, tappedAt, true),
    [logText],
  );
  const speech = useSpeechToText(onHeard);

  async function end() {
    if (!userId) return;
    setError(null);
    setEnding(true);
    try {
      await endWorkout(db, userId, id, new Date());
      goHome();
    } catch {
      setError('The workout could not be ended. Please try again.');
      setEnding(false);
    }
  }

  function submitTyped() {
    const text = typed.trim();
    if (!text || saving) return;
    logText(text, new Date(), false);
  }

  if (error && workout === undefined) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.message, { color: theme.danger }]}>{error}</Text>
      </View>
    );
  }

  if (workout === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (workout === null) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.message, { color: theme.text }]}>This workout could not be found.</Text>
        <View style={styles.notFoundAction}>
          <Button label="Back to workouts" onPress={goHome} variant="secondary" />
        </View>
      </View>
    );
  }

  // Tapping Record clears the last message, so whichever came last is shown.
  const shownNotice: Notice | null =
    notice ?? (speech.error ? { tone: 'error', text: speech.error } : null);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={[styles.date, { color: theme.textMuted }]}>
            {formatLongDate(new Date(workout.startedAt))}
          </Text>
          <Text style={[styles.times, { color: theme.text }]}>
            {workout.endedAt
              ? `${formatTime(workout.startedAt)} to ${formatTime(workout.endedAt)}`
              : `Started at ${formatTime(workout.startedAt)}`}
          </Text>

          {inProgress ? (
            <Text
              accessibilityLabel={`Elapsed time ${formatDuration(durationMs(workout, now))}`}
              style={[styles.clock, { color: theme.text, fontVariant: ['tabular-nums'] }]}>
              {formatClock(durationMs(workout, now))}
            </Text>
          ) : (
            <Text style={[styles.summary, { color: theme.textMuted }]}>
              {workout.endReason === 'auto'
                ? 'Ended automatically after a long time without activity.'
                : `Lasted ${formatDuration(durationMs(workout, now))}.`}
            </Text>
          )}

          {inProgress && (
            <View style={[styles.recorder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {speech.listening ? (
                <>
                  <Button label="Stop listening" onPress={speech.stop} variant="danger" />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.heard, { color: speech.partial ? theme.text : theme.textMuted }]}>
                    {speech.partial || 'Listening… say the exercise, weight and reps.'}
                  </Text>
                </>
              ) : (
                <>
                  <Button
                    busy={saving}
                    label="Record exercise"
                    onPress={() => {
                      setNotice(null);
                      speech.start();
                    }}
                  />
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    After a set, tap and say it, for example “bench press 80 kg 10, 10, 8”.
                  </Text>
                </>
              )}

              <View style={styles.typeRow}>
                <TextInput
                  accessibilityLabel="Type an exercise"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!speech.listening}
                  id="exercise-text"
                  onChangeText={setTyped}
                  onSubmitEditing={submitTyped}
                  placeholder="Or type it here"
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="send"
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
                  ]}
                  value={typed}
                />
                <View style={styles.logButton}>
                  <Button
                    disabled={!typed.trim() || saving || speech.listening}
                    label="Log"
                    onPress={submitTyped}
                    variant="secondary"
                  />
                </View>
              </View>

              {shownNotice && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.notice,
                    { color: shownNotice.tone === 'error' ? theme.danger : theme.accent },
                  ]}>
                  {shownNotice.text}
                </Text>
              )}
            </View>
          )}

          <View style={styles.list}>
            {exercises.length === 0 ? (
              <View style={[styles.placeholder, { borderColor: theme.border }]}>
                <Text style={[styles.placeholderText, { color: theme.textMuted }]}>
                  {inProgress
                    ? 'Your exercises will appear here as you log them.'
                    : 'No exercises logged.'}
                </Text>
              </View>
            ) : (
              exercises.map((exercise, index) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  inSuperset={
                    exercise.supersetGroup !== null &&
                    (exercises[index - 1]?.supersetGroup === exercise.supersetGroup ||
                      exercises[index + 1]?.supersetGroup === exercise.supersetGroup)
                  }
                  onEdit={() => {
                    setNotice(null);
                    router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } });
                  }}
                />
              ))
            )}
          </View>

          {error && (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          )}

          {inProgress &&
            (confirming ? (
              <View style={styles.actions}>
                <Text style={[styles.confirmText, { color: theme.text }]}>End this workout?</Text>
                <Button busy={ending} label="Yes, end workout" onPress={end} variant="danger" />
                <Button
                  disabled={ending}
                  label="Keep going"
                  onPress={() => setConfirming(false)}
                  variant="secondary"
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button label="End workout" onPress={() => setConfirming(true)} variant="secondary" />
              </View>
            ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 17, textAlign: 'center' },
  notFoundAction: { marginTop: 18 },
  content: { padding: 20, flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  date: { fontSize: 16 },
  times: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  clock: { fontSize: 56, fontWeight: '700', marginTop: 12 },
  summary: { fontSize: 17, marginTop: 14 },
  recorder: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16, gap: 12 },
  heard: { fontSize: 18, lineHeight: 25, minHeight: 50 },
  hint: { fontSize: 14, lineHeight: 20 },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  logButton: { width: 84 },
  notice: { fontSize: 15, lineHeight: 21 },
  list: { marginTop: 20, gap: 12 },
  placeholder: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 24 },
  placeholderText: { fontSize: 16, textAlign: 'center' },
  error: { fontSize: 15, marginTop: 14 },
  actions: { marginTop: 24, gap: 10 },
  confirmText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
