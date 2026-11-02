import { isStale, type EndReason, type Workout } from '../domain/workout';
import type { Db } from './db';

type WorkoutRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  end_reason: EndReason | null;
  title: string | null;
  focus: string | null;
};

const toWorkout = (row: WorkoutRow): Workout => ({
  id: row.id,
  userId: row.user_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  lastActivityAt: row.last_activity_at,
  endReason: row.end_reason,
  title: row.title,
  focus: row.focus,
});

export async function getActiveWorkout(db: Db, userId: string): Promise<Workout | null> {
  const row = await db.getFirstAsync<WorkoutRow>(
    'SELECT * FROM workouts WHERE user_id = ? AND ended_at IS NULL',
    [userId],
  );
  return row ? toWorkout(row) : null;
}

export async function getWorkout(db: Db, userId: string, id: string): Promise<Workout | null> {
  const row = await db.getFirstAsync<WorkoutRow>(
    'SELECT * FROM workouts WHERE user_id = ? AND id = ?',
    [userId, id],
  );
  return row ? toWorkout(row) : null;
}

export async function listWorkouts(db: Db, userId: string): Promise<Workout[]> {
  const rows = await db.getAllAsync<WorkoutRow>(
    'SELECT * FROM workouts WHERE user_id = ? ORDER BY started_at DESC',
    [userId],
  );
  return rows.map(toWorkout);
}

// Closes an abandoned workout at its last activity, so idle hours don't count as training time.
export async function closeStaleWorkout(db: Db, userId: string, now: Date): Promise<void> {
  const active = await getActiveWorkout(db, userId);
  if (!active || !isStale(active, now)) return;
  await db.runAsync(
    `UPDATE workouts SET ended_at = last_activity_at, end_reason = 'auto'
     WHERE id = ? AND ended_at IS NULL`,
    [active.id],
  );
}

// Returns the workout already in progress, if any, rather than opening a second one.
export async function startWorkout(
  db: Db,
  userId: string,
  newId: string,
  now: Date,
): Promise<Workout> {
  await closeStaleWorkout(db, userId, now);
  const timestamp = now.toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO workouts (id, user_id, started_at, last_activity_at)
     VALUES (?, ?, ?, ?)`,
    [newId, userId, timestamp, timestamp],
  );
  const active = await getActiveWorkout(db, userId);
  if (!active) throw new Error('The workout could not be saved.');
  return active;
}

export async function endWorkout(db: Db, userId: string, id: string, now: Date): Promise<void> {
  await db.runAsync(
    `UPDATE workouts SET ended_at = ?, end_reason = 'user'
     WHERE user_id = ? AND id = ? AND ended_at IS NULL`,
    [now.toISOString(), userId, id],
  );
}
