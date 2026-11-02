import { DatabaseSync } from 'node:sqlite';

import { AUTO_END_IDLE_MS } from '../domain/workout';
import { migrate, type Db } from './db';
import {
  closeStaleWorkout,
  endWorkout,
  getActiveWorkout,
  getWorkout,
  listWorkouts,
  startWorkout,
} from './workoutRepo';

// Runs the repository's real SQL against Node's SQLite through the same calls expo-sqlite offers.
function openTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    getFirstAsync: async (sql: string, params: never[] = []) =>
      sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, params: never[] = []) => sqlite.prepare(sql).all(...params),
    runAsync: async (sql: string, params: never[] = []) => sqlite.prepare(sql).run(...params),
  } as unknown as Db;
}

const T0 = new Date('2026-11-02T08:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60 * 1000;

describe('workoutRepo', () => {
  let db: Db;

  beforeEach(async () => {
    db = openTestDb();
    await migrate(db);
  });

  it('migrates repeatedly without error', async () => {
    await migrate(db);
    expect(await listWorkouts(db, 'alice')).toEqual([]);
  });

  it('opens a workout record with the current date and time', async () => {
    const workout = await startWorkout(db, 'alice', 'w1', T0);

    expect(workout).toMatchObject({
      id: 'w1',
      userId: 'alice',
      startedAt: T0.toISOString(),
      endedAt: null,
      endReason: null,
    });
  });

  it('returns the workout in progress instead of opening a second one', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    const again = await startWorkout(db, 'alice', 'w2', later(1000));

    expect(again.id).toBe('w1');
    expect(await listWorkouts(db, 'alice')).toHaveLength(1);
  });

  it('allows multiple workouts on the same day, newest first', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    await endWorkout(db, 'alice', 'w1', later(HOUR));
    await startWorkout(db, 'alice', 'w2', later(2 * HOUR));

    const workouts = await listWorkouts(db, 'alice');
    expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1']);
  });

  it('records when and why a workout ended', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    await endWorkout(db, 'alice', 'w1', later(HOUR));

    expect(await getActiveWorkout(db, 'alice')).toBeNull();
    expect(await getWorkout(db, 'alice', 'w1')).toMatchObject({
      endedAt: later(HOUR).toISOString(),
      endReason: 'user',
    });
  });

  it('does not overwrite the end time of a finished workout', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    await endWorkout(db, 'alice', 'w1', later(HOUR));
    await endWorkout(db, 'alice', 'w1', later(2 * HOUR));

    const workout = await getWorkout(db, 'alice', 'w1');
    expect(workout?.endedAt).toBe(later(HOUR).toISOString());
  });

  it('closes an abandoned workout at its last activity', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    await closeStaleWorkout(db, 'alice', later(AUTO_END_IDLE_MS));

    expect(await getWorkout(db, 'alice', 'w1')).toMatchObject({
      endedAt: T0.toISOString(),
      endReason: 'auto',
    });
  });

  it('keeps a workout open until the idle limit is reached', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    await closeStaleWorkout(db, 'alice', later(AUTO_END_IDLE_MS - 1));

    expect((await getActiveWorkout(db, 'alice'))?.id).toBe('w1');
  });

  it('starts a new workout when the previous one was abandoned', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    const next = await startWorkout(db, 'alice', 'w2', later(AUTO_END_IDLE_MS));

    expect(next.id).toBe('w2');
    expect((await getWorkout(db, 'alice', 'w1'))?.endReason).toBe('auto');
  });

  it('keeps each user’s workouts separate on a shared device', async () => {
    await startWorkout(db, 'alice', 'w1', T0);
    const bobs = await startWorkout(db, 'bob', 'w2', T0);

    expect(bobs.id).toBe('w2');
    expect(await getWorkout(db, 'bob', 'w1')).toBeNull();
    expect((await listWorkouts(db, 'alice')).map((w) => w.id)).toEqual(['w1']);

    await endWorkout(db, 'bob', 'w1', later(HOUR));
    expect((await getActiveWorkout(db, 'alice'))?.id).toBe('w1');
  });
});
