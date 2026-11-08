import { parseSetLog } from '../domain/setLog';
import { migrate, type Db } from './db';
import {
  deleteExercise,
  deleteLastSet,
  finishExercises,
  getExercise,
  listExercises,
  logSets,
  recentExerciseNames,
  resumeExercise,
  startExercise,
  updateExercise,
} from './exerciseRepo';
import { openTestDb } from './testDb';
import { deleteWorkout, endWorkout, getWorkout, startWorkout } from './workoutRepo';

const T0 = new Date('2026-11-05T10:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('exerciseRepo', () => {
  let db: Db;
  let counter: number;
  const newId = () => `id${++counter}`;

  async function say(exerciseId: string, text: string, at: Date, userId = 'alice') {
    const previous = (await getExercise(db, userId, exerciseId))?.sets.at(-1) ?? null;
    const parsed = parseSetLog(text, previous);
    if (parsed.kind !== 'sets') throw new Error(`Not parsed: ${text}`);
    return logSets(db, userId, exerciseId, parsed.sets, parsed.technique, at, newId);
  }

  beforeEach(async () => {
    counter = 0;
    db = openTestDb();
    await migrate(db);
    await startWorkout(db, 'alice', 'w1', T0);
  });

  it('starts an exercise and logs its sets one by one with estimated times', async () => {
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Bench Press', muscle: 'Chest' }], 'bench press', minutes(1), newId);
    await say(id, '80 kg 10', minutes(4));
    await say(id, '8 reps', minutes(7));

    const [exercise] = await listExercises(db, 'alice', 'w1');
    expect(exercise).toMatchObject({ name: 'Bench Press', muscle: 'Chest', finishedAt: null });
    expect(exercise.sets.map((s) => [s.weight, s.unit, s.reps])).toEqual([
      [80, 'kg', 10],
      [80, 'kg', 8],
    ]);
    // A set ends when Record was tapped and lasts about 4 seconds per rep.
    expect(exercise.sets[1].endedAt).toBe(minutes(7).toISOString());
    expect(exercise.sets[1].startedAt).toBe(new Date(minutes(7).getTime() - 32_000).toISOString());
    expect((await getWorkout(db, 'alice', 'w1'))?.lastActivityAt).toBe(minutes(7).toISOString());
  });

  it('finishes the exercise in progress when the next one starts', async () => {
    const [bench] = await startExercise(db, 'alice', 'w1', [{ name: 'Bench Press', muscle: 'Chest' }], null, minutes(1), newId);
    await say(bench, '80 kg 10', minutes(3));
    // Chosen but never done: dropped when the next exercise starts.
    await startExercise(db, 'alice', 'w1', [{ name: 'Dips', muscle: 'Chest' }], null, minutes(5), newId);
    await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: 'Quads' }], null, minutes(6), newId);

    const exercises = await listExercises(db, 'alice', 'w1');
    expect(exercises.map((e) => [e.name, e.finishedAt])).toEqual([
      ['Bench Press', minutes(5).toISOString()],
      ['Squat', null],
    ]);
  });

  it('starts a superset as a group whose sets alternate', async () => {
    const [curl, pushdown] = await startExercise(
      db,
      'alice',
      'w1',
      [
        { name: 'Barbell Curl', muscle: 'Biceps' },
        { name: 'Cable Pushdown', muscle: 'Triceps' },
      ],
      null,
      minutes(1),
      newId,
    );
    await say(curl, '30 kg 10', minutes(2));
    await say(pushdown, '25 kg 12', minutes(3));

    const exercises = await listExercises(db, 'alice', 'w1');
    expect(exercises[0].supersetGroup).not.toBeNull();
    expect(exercises[0].supersetGroup).toBe(exercises[1].supersetGroup);
    expect(exercises.map((e) => e.sets.length)).toEqual([1, 1]);
  });

  it('undoes the last set and resumes an earlier exercise', async () => {
    const [bench] = await startExercise(db, 'alice', 'w1', [{ name: 'Bench Press', muscle: 'Chest' }], null, minutes(1), newId);
    await say(bench, '80 kg 10', minutes(3));
    await say(bench, '80 kg 9', minutes(5));
    expect(await deleteLastSet(db, 'alice', bench)).toMatchObject({ reps: 9 });
    expect(await deleteLastSet(db, 'bob', bench)).toBeNull();

    await finishExercises(db, 'alice', 'w1', minutes(6));
    expect((await getExercise(db, 'alice', bench))?.finishedAt).toBe(minutes(6).toISOString());
    await resumeExercise(db, 'alice', bench, minutes(8));
    expect((await getExercise(db, 'alice', bench))?.finishedAt).toBeNull();
    expect((await getExercise(db, 'alice', bench))?.sets).toHaveLength(1);
  });

  it('lists the names used before, newest first, once each', async () => {
    await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId);
    await startExercise(db, 'alice', 'w1', [{ name: 'Zercher Squat', muscle: null }], null, minutes(2), newId);
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'squat', muscle: null }], null, minutes(3), newId);
    await say(id, '100 kg 5', minutes(4));
    expect(await recentExerciseNames(db, 'alice')).toEqual(['squat']);
    expect(await recentExerciseNames(db, 'bob')).toEqual([]);
  });

  it('refuses to log into an ended workout or someone else’s', async () => {
    await expect(
      startExercise(db, 'bob', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId),
    ).rejects.toThrow('could not be found');
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId);
    await say(id, '100 kg 5', minutes(2));
    await endWorkout(db, 'alice', 'w1', minutes(30));
    await expect(say(id, '100 kg 5', minutes(31))).rejects.toThrow('already ended');
    expect((await getExercise(db, 'alice', id))?.finishedAt).toBe(minutes(30).toISOString());
  });

  it('edits an exercise, keeping the times of sets that stayed', async () => {
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Bench Pres', muscle: null }], null, minutes(1), newId);
    await say(id, '80 kg 10 10', minutes(6));
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
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Pull-Up', muscle: 'Back' }], null, minutes(1), newId);
    await say(id, 'bodyweight 12 to failure', minutes(3));
    const exercise = (await getExercise(db, 'alice', id))!;
    expect(exercise.sets[0]).toMatchObject({ weight: null, unit: null, reps: 12, toFailure: true });
  });

  it('deletes an exercise and its sets, only for its owner', async () => {
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId);
    await say(id, '100 kg 5', minutes(5));
    await deleteExercise(db, 'bob', id);
    expect(await getExercise(db, 'alice', id)).not.toBeNull();

    await deleteExercise(db, 'alice', id);
    expect(await getExercise(db, 'alice', id)).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM exercise_sets')).toEqual([]);
  });

  it('leaves nothing behind when a save fails half way', async () => {
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId);
    const failing = () => {
      counter++;
      if (counter === 3) throw new Error('boom');
      return `id${counter}`;
    };
    const parsed = parseSetLog('100 kg 5 5', null);
    if (parsed.kind !== 'sets') throw new Error('not parsed');
    await expect(logSets(db, 'alice', id, parsed.sets, null, minutes(5), failing)).rejects.toThrow('boom');
    expect((await getExercise(db, 'alice', id))?.sets).toEqual([]);
  });

  it('deletes a workout with its exercises and sets, only for its owner', async () => {
    const [id] = await startExercise(db, 'alice', 'w1', [{ name: 'Squat', muscle: null }], null, minutes(1), newId);
    await say(id, '100 kg 5', minutes(2));
    await deleteWorkout(db, 'bob', 'w1');
    expect(await getWorkout(db, 'alice', 'w1')).not.toBeNull();

    await deleteWorkout(db, 'alice', 'w1');
    expect(await getWorkout(db, 'alice', 'w1')).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM exercises')).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM exercise_sets')).toEqual([]);
  });
});
