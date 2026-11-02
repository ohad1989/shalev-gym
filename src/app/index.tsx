import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { closeStaleWorkout, listWorkouts, startWorkout } from '@/data/workoutRepo';
import {
  durationMs,
  formatDayLabel,
  formatDuration,
  formatTime,
  groupByDay,
  type Workout,
} from '@/domain/workout';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme';

export default function Home() {
  const db = useSQLiteContext();
  const { user, accountsEnabled, signOut } = useAuth();
  const theme = useTheme();
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      (async () => {
        try {
          await closeStaleWorkout(db, userId, new Date());
          const loaded = await listWorkouts(db, userId);
          if (!cancelled) setWorkouts(loaded);
        } catch {
          if (!cancelled) setError('Your workouts could not be loaded.');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db, userId]),
  );

  const now = new Date();
  const active = workouts?.find((w) => w.endedAt === null) ?? null;
  const finished = useMemo(() => (workouts ?? []).filter((w) => w.endedAt !== null), [workouts]);
  const days = useMemo(() => groupByDay(finished), [finished]);

  async function start() {
    if (!userId) return;
    setError(null);
    setStarting(true);
    try {
      const workout = await startWorkout(db, userId, randomUUID(), new Date());
      router.push({ pathname: '/workout/[id]', params: { id: workout.id } });
    } catch {
      setError('The workout could not be started. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    try {
      await signOut();
    } catch {
      setError('You could not be signed out. Please try again.');
    }
  }

  const cardStyle = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.column}>
        {active ? (
          <View style={cardStyle}>
            <Text style={[styles.cardEyebrow, { color: theme.accent }]}>In progress</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              Started at {formatTime(active.startedAt)}
            </Text>
            <View style={styles.cardAction}>
              <Button
                label="Continue workout"
                onPress={() =>
                  router.push({ pathname: '/workout/[id]', params: { id: active.id } })
                }
              />
            </View>
          </View>
        ) : (
          <Button busy={starting} disabled={workouts === null} label="Start workout" onPress={start} />
        )}

        {error && (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.danger }]}>
            {error}
          </Text>
        )}

        {workouts !== null && finished.length === 0 && !active && (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            Your finished workouts will appear here.
          </Text>
        )}

        {days.map((day) => (
          <View key={day.key} style={styles.day}>
            <Text accessibilityRole="header" style={[styles.dayLabel, { color: theme.textMuted }]}>
              {formatDayLabel(day.date, now)}
            </Text>
            {day.workouts.map((workout) => (
              <Pressable
                accessibilityRole="button"
                key={workout.id}
                onPress={() =>
                  router.push({ pathname: '/workout/[id]', params: { id: workout.id } })
                }
                style={({ pressed }) => [cardStyle, styles.row, pressed && styles.pressed]}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>
                  {workout.title ?? `Workout at ${formatTime(workout.startedAt)}`}
                </Text>
                <Text style={[styles.rowDetail, { color: theme.textMuted }]}>
                  {workout.endReason === 'auto'
                    ? 'Ended automatically'
                    : formatDuration(durationMs(workout, now))}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}

        {accountsEnabled && (
          <View style={styles.account}>
            <Text style={[styles.accountEmail, { color: theme.textMuted }]}>{user?.email}</Text>
            <Button label="Sign out" onPress={handleSignOut} variant="secondary" />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardEyebrow: { fontSize: 14, fontWeight: '700' },
  cardTitle: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  cardAction: { marginTop: 16 },
  error: { fontSize: 15, marginTop: 14 },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 40 },
  day: { marginTop: 28, gap: 10 },
  dayLabel: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  rowDetail: { fontSize: 15 },
  pressed: { opacity: 0.7 },
  account: { marginTop: 40, gap: 10 },
  accountEmail: { fontSize: 14, textAlign: 'center' },
});
