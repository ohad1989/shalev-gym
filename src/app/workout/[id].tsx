import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { endWorkout, getWorkout } from '@/data/workoutRepo';
import {
  durationMs,
  formatClock,
  formatDuration,
  formatLongDate,
  formatTime,
  type Workout,
} from '@/domain/workout';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const theme = useTheme();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const inProgress = workout?.endedAt === null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getWorkout(db, userId, id)
      .then((loaded) => {
        if (!cancelled) setWorkout(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('This workout could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [db, userId, id]);

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
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

        <View style={[styles.placeholder, { borderColor: theme.border }]}>
          <Text style={[styles.placeholderText, { color: theme.textMuted }]}>
            {inProgress ? 'Exercise logging is coming soon.' : 'No exercises logged.'}
          </Text>
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
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 17, textAlign: 'center' },
  notFoundAction: { marginTop: 18 },
  content: { padding: 20, flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  date: { fontSize: 16 },
  times: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  clock: { fontSize: 56, fontWeight: '700', marginTop: 20 },
  summary: { fontSize: 17, marginTop: 14 },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 24,
    marginTop: 24,
  },
  placeholderText: { fontSize: 16, textAlign: 'center' },
  error: { fontSize: 15, marginTop: 14 },
  actions: { marginTop: 24, gap: 10 },
  confirmText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
});
