import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  deleteLastSet,
  finishExercises,
  listExercises,
  logSets,
  recentExerciseNames,
  resumeExercise,
  startExercise,
  type NewExercise,
} from '@/data/exerciseRepo';
import { deleteWorkout, endWorkout, getWorkout } from '@/data/workoutRepo';
import { muscleOf, searchExercises } from '@/domain/exerciseCatalog';
import { parseExerciseChoice, type ChosenPart } from '@/domain/exerciseChoice';
import {
  formatSet,
  type LoggedExercise,
  type LoggedSet,
  type ParsedSet,
  type Technique,
} from '@/domain/exerciseLog';
import { parseSetLog } from '@/domain/setLog';
import {
  durationMs,
  formatClock,
  formatDuration,
  formatLongDate,
  formatTime,
  type Workout,
} from '@/domain/workout';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ExerciseCard } from '@/ui/ExerciseCard';
import { ExerciseConfirm } from '@/ui/ExerciseConfirm';
import { haptic } from '@/ui/haptics';
import { MicButton } from '@/ui/MicButton';
import { useTheme, type Theme } from '@/ui/theme';
import { useSpeechToText } from '@/voice/useSpeechToText';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Notice = { tone: 'success' | 'info' | 'error'; text: string };
type Pending = { parts: ChosenPart[]; superset: boolean; spokenText: string; at: Date };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The set logged last among the exercises in progress, for "undo".
function lastLogged(active: LoggedExercise[]): { exercise: LoggedExercise; set: LoggedSet } | null {
  let best: { exercise: LoggedExercise; set: LoggedSet } | null = null;
  for (const exercise of active) {
    const set = exercise.sets.at(-1);
    if (set && (!best || (set.endedAt ?? '') >= (best.set.endedAt ?? ''))) best = { exercise, set };
  }
  return best;
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const theme = useTheme();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const inProgress = workout?.endedAt === null;

  const active = useMemo(
    () => (inProgress ? exercises.filter((e) => e.finishedAt === null) : []),
    [exercises, inProgress],
  );
  const done = exercises.filter((e) => !active.includes(e));
  const target: LoggedExercise | null = active[Math.min(targetIndex, active.length - 1)] ?? null;
  const mode: 'choose' | 'confirm' | 'sets' = pending ? 'confirm' : target ? 'sets' : 'choose';

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [loaded, names] = await Promise.all([
      listExercises(db, userId, id),
      recentExerciseNames(db, userId),
    ]);
    setExercises(loaded);
    setHistory(names);
  }, [db, userId, id]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      Promise.all([getWorkout(db, userId, id), listExercises(db, userId, id), recentExerciseNames(db, userId)])
        .then(([loadedWorkout, loaded, names]) => {
          if (cancelled) return;
          setWorkout(loadedWorkout);
          setExercises(loaded);
          setHistory(names);
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

  const say = useCallback((next: Notice | null) => {
    setNotice(next);
    if (next?.tone === 'success') haptic.success();
    if (next?.tone === 'error') haptic.error();
  }, []);

  // --- Choosing the exercise -------------------------------------------------------------

  const readChoice = useCallback(
    (text: string, at: Date, fromVoice: boolean) => {
      const result = parseExerciseChoice(text, history);
      if (result.kind === 'end-workout') {
        setNotice(null);
        setConfirmingEnd(true);
        return;
      }
      if (result.kind === 'not-understood') {
        say({ tone: 'error', text: result.reason });
        if (fromVoice) setTyped(text);
        return;
      }
      haptic.select();
      setNotice(null);
      setTyped('');
      setPending({ parts: result.parts, superset: result.superset, spokenText: text, at });
    },
    [history, say],
  );

  async function begin(chosen: NewExercise[], from: Pending | null) {
    if (!userId) return;
    setSaving(true);
    try {
      const at = new Date();
      const ids = await startExercise(db, userId, id, chosen, from?.spokenText ?? null, at, randomUUID);
      // A first set said with the name ("bench press 80 kg 10") is logged right away.
      let logged = 0;
      for (const [index, part] of (from?.parts ?? []).entries()) {
        if (part.sets.length === 0 || !ids[index]) continue;
        await logSets(db, userId, ids[index], part.sets, part.technique, from!.at, randomUUID);
        logged += part.sets.length;
      }
      await refresh();
      setPending(null);
      setTyped('');
      setTargetIndex(logged > 0 && ids.length > 1 ? 1 : 0);
      const names = chosen.map((e) => e.name).join(' + ');
      say({
        tone: 'success',
        text: logged > 0 ? `${names} started with ${plural(logged, 'set')}.` : `${names} started. Do a set, then tap Record.`,
      });
    } catch {
      say({ tone: 'error', text: 'The exercise could not be started. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  // --- Logging sets ----------------------------------------------------------------------

  async function addSets(exercise: LoggedExercise, sets: ParsedSet[], technique: Technique | null, at: Date) {
    if (!userId) return;
    setSaving(true);
    try {
      await logSets(db, userId, exercise.id, sets, technique, at, randomUUID);
      await refresh();
      setTyped('');
      const number = exercise.sets.length + sets.length;
      const what = sets.length === 1 ? formatSet(sets[0]) : `${plural(sets.length, 'set')}`;
      const label = sets.length === 1 ? `Set ${number}` : 'Logged';
      say({ tone: 'success', text: `${label}: ${what}${active.length > 1 ? ` · ${exercise.name}` : ''}` });
      if (active.length > 1) setTargetIndex((active.indexOf(exercise) + 1) % active.length);
    } catch {
      say({ tone: 'error', text: 'The set could not be saved. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!userId) return;
    const last = lastLogged(active);
    if (!last) {
      say({ tone: 'info', text: 'There is no set to undo yet.' });
      return;
    }
    setSaving(true);
    try {
      await deleteLastSet(db, userId, last.exercise.id);
      await refresh();
      setTargetIndex(Math.max(0, active.indexOf(last.exercise)));
      haptic.warning();
      setNotice({ tone: 'info', text: `Removed set ${last.exercise.sets.length} of ${last.exercise.name}.` });
    } catch {
      say({ tone: 'error', text: 'The set could not be removed. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function nextExercise() {
    if (!userId) return;
    setSaving(true);
    try {
      const summary = active.map((e) => `${e.name}: ${plural(e.sets.length, 'set')}`).join(', ');
      await finishExercises(db, userId, id, new Date());
      await refresh();
      setTargetIndex(0);
      setTyped('');
      say({ tone: 'success', text: `${summary}. What’s next?` });
    } catch {
      say({ tone: 'error', text: 'The exercise could not be finished. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function resume(exercise: LoggedExercise) {
    if (!userId) return;
    setSaving(true);
    try {
      await resumeExercise(db, userId, exercise.id, new Date());
      await refresh();
      setPending(null);
      setTargetIndex(0);
      say({ tone: 'success', text: `Back to ${exercise.name}. Tap Record after your set.` });
    } catch {
      say({ tone: 'error', text: 'The exercise could not be opened. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const readSet = (text: string, at: Date, fromVoice: boolean) => {
    if (!target) return;
    const previous = target.sets.at(-1) ?? null;
    const command = parseSetLog(text, previous);
    switch (command.kind) {
      case 'sets':
        return addSets(target, command.sets, command.technique, at);
      case 'repeat':
        return previous && addSets(target, [previous], null, at);
      case 'undo':
        return undo();
      case 'next-exercise':
        return nextExercise();
      case 'end-workout':
        setNotice(null);
        setConfirmingEnd(true);
        return;
      case 'not-understood': {
        // Saying another exercise's name moves on to it, after the usual confirmation.
        if (!/\d/.test(text)) {
          const choice = parseExerciseChoice(text, history);
          if (choice.kind === 'choice' && choice.parts.some((p) => p.match.confident)) {
            haptic.select();
            setTyped('');
            setPending({ parts: choice.parts, superset: choice.superset, spokenText: text, at });
            setNotice({ tone: 'info', text: `That sounds like a new exercise. Confirm it to finish ${target.name}.` });
            return;
          }
        }
        say({ tone: 'error', text: command.reason });
        if (fromVoice) setTyped(text);
      }
    }
  };

  // --- Voice and typing ------------------------------------------------------------------

  const route = (text: string, at: Date, fromVoice: boolean) => {
    if (mode === 'sets') readSet(text, at, fromVoice);
    else readChoice(text, at, fromVoice);
  };

  const speech = useSpeechToText((text, tappedAt) => route(text, tappedAt, true), history);

  useFocusEffect(
    useCallback(() => {
      return () => speech.cancel();
    }, [speech.cancel]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    setNotice(null);
    haptic.press();
    speech.start();
  }

  function submitTyped() {
    const text = typed.trim();
    if (!text || saving) return;
    route(text, new Date(), false);
  }

  async function end() {
    if (!userId) return;
    setError(null);
    setEnding(true);
    try {
      if (speech.listening) speech.cancel();
      await endWorkout(db, userId, id, new Date());
      haptic.success();
      goHome();
    } catch {
      setError('The workout could not be ended. Please try again.');
      setEnding(false);
    }
  }

  async function remove() {
    if (!userId) return;
    setError(null);
    setDeleting(true);
    try {
      if (speech.listening) speech.cancel();
      await deleteWorkout(db, userId, id);
      haptic.warning();
      goHome();
    } catch {
      setError('The workout could not be deleted. Please try again.');
      setDeleting(false);
    }
  }

  // --- Screens ---------------------------------------------------------------------------

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

  const shownNotice: Notice | null = notice ?? (speech.error ? { tone: 'error', text: speech.error } : null);
  const lastSetEnd = exercises
    .flatMap((e) => e.sets.map((s) => s.endedAt))
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1);
  const suggestions = mode === 'choose' && typed.trim().length >= 2 ? searchExercises(typed, history) : [];
  const previous = target?.sets.at(-1) ?? null;

  const noticeView = shownNotice && (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        {
          backgroundColor: shownNotice.tone === 'error' ? 'transparent' : theme.accentSoft,
          borderColor: shownNotice.tone === 'error' ? theme.danger : theme.accentSoft,
        },
      ]}>
      <Ionicons
        color={shownNotice.tone === 'error' ? theme.danger : theme.accent}
        name={shownNotice.tone === 'error' ? 'alert-circle' : shownNotice.tone === 'success' ? 'checkmark-circle' : 'information-circle'}
        size={20}
      />
      <Text style={[styles.noticeText, { color: shownNotice.tone === 'error' ? theme.danger : theme.text }]}>
        {shownNotice.text}
      </Text>
    </View>
  );

  const typeRow = (placeholder: string, label: string) => (
    <View style={styles.typeRow}>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!speech.listening}
        id="exercise-text"
        onChangeText={setTyped}
        onSubmitEditing={submitTyped}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        returnKeyType={mode === 'sets' ? 'send' : 'search'}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        submitBehavior="submit"
        value={typed}
      />
      <View style={styles.logButton}>
        <Button
          disabled={!typed.trim() || saving || speech.listening}
          label={mode === 'sets' ? 'Log' : 'Go'}
          onPress={submitTyped}
          variant="secondary"
        />
      </View>
    </View>
  );

  const transcript = speech.listening && (
    <Text accessibilityLiveRegion="polite" style={[styles.heard, { color: speech.partial ? theme.text : theme.textMuted }]}>
      {speech.partial || 'Listening…'}
    </Text>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={[styles.date, { color: theme.textMuted }]}>{formatLongDate(new Date(workout.startedAt))}</Text>
              <Text style={[styles.times, { color: theme.text }]}>
                {workout.endedAt
                  ? `${formatTime(workout.startedAt)} to ${formatTime(workout.endedAt)}`
                  : `Started at ${formatTime(workout.startedAt)}`}
              </Text>
            </View>
            {inProgress && (
              <Text
                accessibilityLabel={`Elapsed time ${formatDuration(durationMs(workout, now))}`}
                style={[styles.clock, { color: theme.text }]}>
                {formatClock(durationMs(workout, now))}
              </Text>
            )}
          </View>
          {!inProgress && (
            <Text style={[styles.summary, { color: theme.textMuted }]}>
              {workout.endReason === 'auto'
                ? 'Ended automatically after a long time without activity.'
                : `Lasted ${formatDuration(durationMs(workout, now))}.`}
            </Text>
          )}

          {inProgress && mode === 'confirm' && pending && (
            <View style={styles.stage}>
              <ExerciseConfirm
                key={pending.spokenText + pending.at.getTime()}
                busy={saving}
                onCancel={() => {
                  setPending(null);
                  setNotice(null);
                }}
                onConfirm={(chosen) => begin(chosen, pending)}
                onRetry={() => {
                  setPending(null);
                  setNotice(null);
                  haptic.press();
                  speech.start();
                }}
                parts={pending.parts}
                superset={pending.superset}
              />
              {noticeView}
            </View>
          )}

          {inProgress && mode === 'choose' && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.eyebrow, { color: theme.textMuted }]}>
                {exercises.length === 0 ? 'FIRST EXERCISE' : 'NEXT EXERCISE'}
              </Text>
              <Text style={[styles.prompt, { color: theme.text }]}>What are you training?</Text>
              <MicButton
                label={speech.listening ? 'Tap when done' : 'Say the exercise'}
                level={speech.level}
                listening={speech.listening}
                onPress={toggleMic}
              />
              {transcript || (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  For example “bench press”, or “curls superset with pushdowns”.
                </Text>
              )}
              {typeRow('Or type the exercise name', 'Type the exercise name')}
              {suggestions.length > 0 && (
                <View style={[styles.suggestions, { borderColor: theme.border }]}>
                  {suggestions.map((option, index) => (
                    <Pressable
                      key={option.name}
                      accessibilityLabel={`Start ${option.name}`}
                      accessibilityRole="button"
                      android_ripple={{ color: theme.ripple }}
                      onPress={() => begin([{ name: option.name, muscle: option.muscle }], null)}
                      style={({ pressed }) => [
                        styles.suggestion,
                        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                        pressed && styles.pressed,
                      ]}>
                      <View style={styles.flex}>
                        <Text style={[styles.suggestionName, { color: theme.text }]}>{option.name}</Text>
                        {option.muscle && (
                          <Text style={[styles.suggestionNote, { color: theme.textMuted }]}>{option.muscle}</Text>
                        )}
                      </View>
                      <Ionicons color={theme.accent} name="arrow-forward-circle" size={24} />
                    </Pressable>
                  ))}
                </View>
              )}
              {suggestions.length === 0 && history.length > 0 && !typed && (
                <View style={styles.recentBlock}>
                  <Text style={[styles.eyebrow, { color: theme.textMuted }]}>RECENT</Text>
                  <View style={styles.chips}>
                    {history.slice(0, 8).map((name) => (
                      <Chip
                        key={name}
                        accessibilityLabel={`Start ${name}`}
                        disabled={saving || speech.listening}
                        label={name}
                        onPress={() => begin([{ name, muscle: muscleOf(name) }], null)}
                      />
                    ))}
                  </View>
                </View>
              )}
              {noticeView}
            </View>
          )}

          {inProgress && mode === 'sets' && target && (
            <View style={[styles.card, styles.current, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
              <View style={styles.currentHeader}>
                <Text style={[styles.eyebrow, { color: theme.accent }]}>
                  {active.length > 1 ? 'SUPERSET IN PROGRESS' : 'NOW TRAINING'}
                </Text>
                {lastSetEnd && (
                  <View
                    accessibilityLabel={`Resting for ${formatDuration(now.getTime() - new Date(lastSetEnd).getTime())}`}
                    style={[styles.rest, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons color={theme.accent} name="timer-outline" size={15} />
                    <Text style={[styles.restText, { color: theme.text }]}>
                      Rest {formatClock(Math.max(0, now.getTime() - new Date(lastSetEnd).getTime()))}
                    </Text>
                  </View>
                )}
              </View>

              {active.map((exercise, index) => (
                <CurrentExercise
                  key={exercise.id}
                  exercise={exercise}
                  isTarget={exercise.id === target.id}
                  onEdit={() => {
                    setNotice(null);
                    router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } });
                  }}
                  onSelect={active.length > 1 ? () => {
                    haptic.select();
                    setTargetIndex(index);
                  } : undefined}
                  theme={theme}
                />
              ))}

              <MicButton
                busy={saving}
                label={speech.listening ? 'Tap when done' : active.length > 1 ? `Record set · ${target.name}` : 'Record set'}
                level={speech.level}
                listening={speech.listening}
                onPress={toggleMic}
              />
              {transcript || (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  {target.sets.length === 0
                    ? 'After your set, tap and say it, like “80 kg 10 reps”.'
                    : 'Say “8 reps”, “same again”, “undo” or “next exercise”.'}
                </Text>
              )}
              {noticeView}

              <View style={styles.chips}>
                {previous && (
                  <Chip
                    accessibilityLabel={`Log the same set again: ${formatSet(previous)}`}
                    disabled={saving || speech.listening}
                    icon="repeat"
                    label={`Same again · ${shortSet(previous)}`}
                    onPress={() => addSets(target, [previous], null, new Date())}
                  />
                )}
                {lastLogged(active) && (
                  <Chip
                    disabled={saving || speech.listening}
                    icon="arrow-undo"
                    label="Undo last set"
                    onPress={undo}
                  />
                )}
              </View>

              {typeRow('Or type the set, e.g. 80 kg 10', 'Type a set')}

              <Button
                disabled={saving || speech.listening}
                icon="play-skip-forward"
                label="Next exercise"
                onPress={nextExercise}
                variant="secondary"
              />
            </View>
          )}

          {done.length > 0 && (
            <View style={styles.list}>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                {inProgress ? `DONE · ${plural(done.length, 'EXERCISE').toUpperCase()}` : plural(done.length, 'exercise').toUpperCase()}
              </Text>
              {done.map((exercise, index) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  inSuperset={
                    exercise.supersetGroup !== null &&
                    (done[index - 1]?.supersetGroup === exercise.supersetGroup ||
                      done[index + 1]?.supersetGroup === exercise.supersetGroup)
                  }
                  onEdit={() => {
                    setNotice(null);
                    router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } });
                  }}
                  onResume={inProgress && !saving ? () => resume(exercise) : undefined}
                />
              ))}
            </View>
          )}
          {!inProgress && exercises.length === 0 && (
            <View style={[styles.placeholder, { borderColor: theme.border }]}>
              <Text style={[styles.placeholderText, { color: theme.textMuted }]}>No exercises logged.</Text>
            </View>
          )}

          {error && (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          )}

          {inProgress &&
            (confirmingEnd ? (
              <View style={[styles.actions, styles.endBox, { borderColor: theme.border }]}>
                <Text style={[styles.confirmText, { color: theme.text }]}>End this workout?</Text>
                <Text style={[styles.confirmNote, { color: theme.textMuted }]}>
                  {plural(exercises.filter((e) => e.sets.length > 0).length, 'exercise')},{' '}
                  {plural(exercises.reduce((n, e) => n + e.sets.length, 0), 'set')} in{' '}
                  {formatDuration(durationMs(workout, now))}.
                </Text>
                <Button busy={ending} icon="flag" label="Yes, end workout" onPress={end} variant="danger" />
                <Button disabled={ending} label="Keep going" onPress={() => setConfirmingEnd(false)} variant="secondary" />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  icon="flag-outline"
                  label="End workout"
                  onPress={() => {
                    haptic.select();
                    setConfirmingDelete(false);
                    setConfirmingEnd(true);
                  }}
                  variant="plain"
                />
              </View>
            ))}

          {confirmingDelete ? (
            <View style={[styles.actions, styles.endBox, { borderColor: theme.danger }]}>
              <Text style={[styles.confirmText, { color: theme.text }]}>Delete this workout?</Text>
              <Text style={[styles.confirmNote, { color: theme.textMuted }]}>
                Its {plural(exercises.length, 'exercise')} and{' '}
                {plural(exercises.reduce((n, e) => n + e.sets.length, 0), 'set')} will be removed. This
                can’t be undone.
              </Text>
              <Button busy={deleting} icon="trash" label="Delete workout" onPress={remove} variant="danger" />
              <Button
                disabled={deleting}
                label="Keep it"
                onPress={() => setConfirmingDelete(false)}
                variant="secondary"
              />
            </View>
          ) : (
            <Button
              disabled={ending || deleting}
              icon="trash-outline"
              label="Delete workout"
              onPress={() => {
                haptic.warning();
                setConfirmingEnd(false);
                setConfirmingDelete(true);
              }}
              variant="dangerPlain"
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// "80 kg × 10" without the converted weight, to fit on a chip.
function shortSet(set: ParsedSet): string {
  const weight = set.weight === null ? 'BW' : `${set.weight} ${set.unit}`;
  return set.reps === null ? weight : `${weight} × ${set.reps}`;
}

function CurrentExercise({
  exercise,
  isTarget,
  onEdit,
  onSelect,
  theme,
}: {
  exercise: LoggedExercise;
  isTarget: boolean;
  onEdit: () => void;
  onSelect?: () => void;
  theme: Theme;
}) {
  const dimmed = onSelect && !isTarget;
  return (
    <View style={[styles.exercise, dimmed && styles.dimmed]}>
      <View style={styles.exerciseHeader}>
        <Pressable
          accessibilityLabel={onSelect ? `Log the next set for ${exercise.name}` : undefined}
          accessibilityRole={onSelect ? 'button' : undefined}
          accessibilityState={onSelect ? { selected: isTarget } : undefined}
          disabled={!onSelect}
          onPress={onSelect}
          style={styles.flex}>
          <View style={styles.nameRow}>
            {onSelect && (
              <Ionicons
                color={isTarget ? theme.accent : theme.textMuted}
                name={isTarget ? 'radio-button-on' : 'radio-button-off'}
                size={20}
              />
            )}
            <Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.name}</Text>
          </View>
          <Text style={[styles.exerciseMeta, { color: theme.textMuted }]}>
            {[exercise.muscle, plural(exercise.sets.length, 'set'), exercise.technique].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Edit ${exercise.name}`}
          accessibilityRole="button"
          android_ripple={{ color: theme.ripple, borderless: true }}
          hitSlop={10}
          onPress={onEdit}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={theme.accent} name="create-outline" size={22} />
        </Pressable>
      </View>
      {exercise.sets.map((set, index) => (
        <View key={set.id} style={[styles.setRow, { borderTopColor: theme.border }]}>
          <View style={[styles.setBadge, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.setBadgeText, { color: theme.accent }]}>{index + 1}</Text>
          </View>
          <Text style={[styles.setText, { color: theme.text }]}>{formatSet(set)}</Text>
          {set.endedAt && <Text style={[styles.setTime, { color: theme.textMuted }]}>{formatTime(set.endedAt)}</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 17, textAlign: 'center' },
  notFoundAction: { marginTop: 18 },
  content: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  date: { fontSize: 15 },
  times: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  clock: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  summary: { fontSize: 17 },
  stage: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  current: { borderWidth: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.9 },
  prompt: { fontSize: 24, fontWeight: '700', marginTop: -8 },
  hint: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  heard: { fontSize: 19, lineHeight: 26, minHeight: 26, textAlign: 'center', fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  logButton: { width: 76 },
  suggestions: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginTop: -4 },
  suggestion: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionName: { fontSize: 16, fontWeight: '600' },
  suggestionNote: { fontSize: 13, marginTop: 1 },
  recentBlock: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, fontSize: 15, lineHeight: 21 },
  currentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  restText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  exercise: { gap: 2 },
  dimmed: { opacity: 0.6 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseName: { fontSize: 24, fontWeight: '800', flexShrink: 1 },
  exerciseMeta: { fontSize: 14, marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  setBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  setText: { flex: 1, fontSize: 16, fontVariant: ['tabular-nums'] },
  setTime: { fontSize: 13, fontVariant: ['tabular-nums'] },
  list: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.9, marginTop: 4 },
  placeholder: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 24 },
  placeholderText: { fontSize: 16, textAlign: 'center' },
  error: { fontSize: 15 },
  actions: { gap: 10 },
  endBox: { borderWidth: 1, borderRadius: 16, padding: 16 },
  confirmText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  confirmNote: { fontSize: 15, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
