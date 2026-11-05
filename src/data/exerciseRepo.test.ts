import { parseExerciseLog } from '../domain/exerciseLog';
import { migrate, type Db } from './db';
import {
  deleteExercise,
  getExercise,
  listExercises,
  logExercises,
  updateExercise,
} from './exerciseRepo';
import { openTestDb } from './testDb';
import { endWorkout, getWorkout, startWorkout } from './workoutRepo';

const T0 = new Date('2026-11-05T10:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('exerciseRepo', () => {
  let db: Db;
  let counter: number;
  const newId = () => `id${++counter}`;

  async function say(text: string, at: Date, workoutId = 'w1', userId = 'alice') {
    const parsed = parseExerciseLog(text);
    if (parsed.kind !== 'exercises') throw new Error(`Not parsed: ${text}`);
    return logExercises(
      db,
      userId,
      workoutId,
      { exercises: parsed.exercises, superset: parsed.superset, spokenText: text, spokenAt: at },
      newId,
    );
  }

  beforeEach(async () => {
    counter = 0;
    db = openTestDb();
    await migrate(db);
    await startWorkout(db, 'alice', 'w1', T0);
  });

  it('logs an exercise with its sets and estimated times', async () => {
    await say('bench press 80 kg 10 10 8', minutes(9));

    const [exercise] = await listExercises(db, 'alice', 'w1');
    expect(exercise).toMatchObject({ name: 'Bench Press', spokenText: 'bench press 80 kg 10 10 8' });
    expect(exercise.sets.map((s) => [s.weight, s.unit, s.reps])).toEqual([
      [80, 'kg', 10],
      [80, 'kg', 10],
      [80, 'kg', 8],
    ]);
    expect(exercise.sets.map((s) => s.endedAt)).toEqual([
      minutes(3).toISOString(),
      minutes(6).toISOString(),
      minutes(9).toISOString(),
    ]);
  });

  it('adds sets to the same exercise when it is said again (requirement 6a)', async () => {
    await say('bench press 80 kg 10', minutes(3));
    await say('Bench press 85 kg 8', minutes(6));
    await say('incline press 60 kg 10', minutes(9));

    const exercises = await listExercises(db, 'alice', 'w1');
    expect(exercises.map((e) => [e.name, e.sets.length])).toEqual([
      ['Bench Press', 2],
      ['Incline Press', 1],
    ]);
    // The second set's window starts where the first one ended.
    expect(exercises[0].sets[1].endedAt).toBe(minutes(6).toISOString());
    expect(exercises[0].sets[1].startedAt).toBe(new Date(minutes(6).getTime() - 32_000).toISOString());
  });

  it('groups a superset and keeps the exercises apart', async () => {
    await say('superset curls 12 kg 10 10 with pushdown 20 kg 12 12', minutes(8));

    const exercises = await listExercises(db, 'alice', 'w1');
    expect(exercises).toHaveLength(2);
    expect(exercises[0].supersetGroup).not.toBeNull();
    expect(exercises[0].supersetGroup).toBe(exercises[1].supersetGroup);

    // A later superset of the same exercises is a new pair, not more sets on the old one.
    await say('curls 12 kg 8', minutes(10));
    expect(await listExercises(db, 'alice', 'w1')).toHaveLength(3);
  });

  it('records activity on the workout', async () => {
    await say('squat 100 kg 5', minutes(20));
    expect((await getWorkout(db, 'alice', 'w1'))?.lastActivityAt).toBe(minutes(20).toISOString());
  });

  it('refuses to log into an ended workout or someone else’s', async () => {
    await expect(say('squat 100 kg 5', minutes(1), 'w1', 'bob')).rejects.toThrow('could not be found');
    await endWorkout(db, 'alice', 'w1', minutes(30));
    await expect(say('squat 100 kg 5', minutes(31))).rejects.toThrow('already ended');
    expect(await listExercises(db, 'alice', 'w1')).toEqual([]);
  });

  it('edits an exercise, keeping the times of sets that stayed', async () => {
    const [id] = await say('bench pres 80 kg 10 10', minutes(6));
    const before = (await getExercise(db, 'alice', id))!;

    await updateExercise(
      db,
      'alice',
      id,
      {
        name: ' Bench Press ',
        technique: null,
        sets: [
          { ...before.sets[1], reps: 9, toFailure: true },
          { weight: 70, unit: 'kg', reps: 12, toFailure: false },
        ],
      },
      newId,
    );

    const after = (await getExercise(db, 'alice', id))!;
    expect(after.name).toBe('Bench Press');
    expect(after.sets).toEqual([
      { ...before.sets[1], reps: 9, toFailure: true },
      expect.objectContaining({ weight: 70, reps: 12, startedAt: null, endedAt: null }),
    ]);
  });

  it('stores a bodyweight set without a unit', async () => {
    const [id] = await say('pull ups 12 reps to failure', minutes(3));
    const exercise = (await getExercise(db, 'alice', id))!;
    expect(exercise.sets[0]).toMatchObject({ weight: null, unit: null, reps: 12, toFailure: true });
  });

  it('deletes an exercise and its sets, only for its owner', async () => {
    const [id] = await say('squat 100 kg 5', minutes(5));
    await deleteExercise(db, 'bob', id);
    expect(await getExercise(db, 'alice', id)).not.toBeNull();

    await deleteExercise(db, 'alice', id);
    expect(await getExercise(db, 'alice', id)).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM exercise_sets')).toEqual([]);
  });

  it('leaves nothing behind when a save fails half way', async () => {
    const failingId = () => {
      counter++;
      if (counter === 3) throw new Error('boom');
      return `id${counter}`;
    };
    const parsed = parseExerciseLog('squat 100 kg 5 5');
    if (parsed.kind !== 'exercises') throw new Error('not parsed');
    await expect(
      logExercises(
        db,
        'alice',
        'w1',
        { exercises: parsed.exercises, superset: false, spokenText: 'x', spokenAt: minutes(5) },
        failingId,
      ),
    ).rejects.toThrow('boom');
    expect(await listExercises(db, 'alice', 'w1')).toEqual([]);
  });
});
