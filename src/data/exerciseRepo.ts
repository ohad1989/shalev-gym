import {
  estimateSetTimes,
  sameExerciseName,
  type LoggedExercise,
  type LoggedSet,
  type ParsedExercise,
  type ParsedSet,
  type Technique,
  type WeightUnit,
} from '../domain/exerciseLog';
import type { Db } from './db';

type ExerciseRow = {
  id: string;
  workout_id: string;
  position: number;
  name: string;
  technique: Technique | null;
  superset_group: string | null;
  spoken_text: string | null;
};

type SetRow = {
  id: string;
  exercise_id: string;
  weight: number | null;
  unit: WeightUnit | null;
  reps: number | null;
  to_failure: number;
  started_at: string | null;
  ended_at: string | null;
};

const toSet = (row: SetRow): LoggedSet => ({
  id: row.id,
  weight: row.weight,
  unit: row.unit,
  reps: row.reps,
  toFailure: row.to_failure === 1,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

function assemble(exercises: ExerciseRow[], sets: SetRow[]): LoggedExercise[] {
  const byExercise = new Map<string, LoggedSet[]>();
  for (const row of sets) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(toSet(row));
    byExercise.set(row.exercise_id, list);
  }
  return exercises.map((row) => ({
    id: row.id,
    workoutId: row.workout_id,
    name: row.name,
    technique: row.technique,
    supersetGroup: row.superset_group,
    spokenText: row.spoken_text,
    sets: byExercise.get(row.id) ?? [],
  }));
}

export async function listExercises(
  db: Db,
  userId: string,
  workoutId: string,
): Promise<LoggedExercise[]> {
  const exercises = await db.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE user_id = ? AND workout_id = ? ORDER BY position',
    [userId, workoutId],
  );
  const sets = await db.getAllAsync<SetRow>(
    `SELECT s.* FROM exercise_sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE e.user_id = ? AND e.workout_id = ? ORDER BY s.position`,
    [userId, workoutId],
  );
  return assemble(exercises, sets);
}

export async function getExercise(
  db: Db,
  userId: string,
  exerciseId: string,
): Promise<LoggedExercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE user_id = ? AND id = ?',
    [userId, exerciseId],
  );
  if (!row) return null;
  const sets = await db.getAllAsync<SetRow>(
    'SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY position',
    [exerciseId],
  );
  return assemble([row], sets)[0];
}

async function inTransaction<T>(db: Db, work: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN');
  try {
    const result = await work();
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

async function insertSet(
  db: Db,
  id: string,
  exerciseId: string,
  userId: string,
  position: number,
  set: ParsedSet,
  times: { startedAt: string | null; endedAt: string | null },
) {
  await db.runAsync(
    `INSERT INTO exercise_sets
       (id, exercise_id, user_id, position, weight, unit, reps, to_failure, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      exerciseId,
      userId,
      position,
      set.weight,
      set.weight === null ? null : set.unit,
      set.reps,
      set.toFailure ? 1 : 0,
      times.startedAt,
      times.endedAt,
    ],
  );
}

export type LogInput = {
  exercises: ParsedExercise[];
  superset: boolean;
  spokenText: string;
  spokenAt: Date;
};

// Saves what the user said after a set into the workout in progress. Saying the same exercise
// again adds sets to it, so "bench press 80 kg 10" after each set builds one exercise
// (requirement 6a). Returns the ids of the exercises that changed.
export async function logExercises(
  db: Db,
  userId: string,
  workoutId: string,
  input: LogInput,
  newId: () => string,
): Promise<string[]> {
  return inTransaction(db, async () => {
    const workout = await db.getFirstAsync<{ started_at: string; ended_at: string | null }>(
      'SELECT started_at, ended_at FROM workouts WHERE user_id = ? AND id = ?',
      [userId, workoutId],
    );
    if (!workout) throw new Error('The workout could not be found.');
    if (workout.ended_at !== null) throw new Error('This workout has already ended.');

    const lastSet = await db.getFirstAsync<{ ended_at: string | null }>(
      `SELECT MAX(s.ended_at) AS ended_at FROM exercise_sets s
       JOIN exercises e ON e.id = s.exercise_id WHERE e.workout_id = ?`,
      [workoutId],
    );
    const windowStart = new Date(lastSet?.ended_at ?? workout.started_at);
    const times = estimateSetTimes(input.exercises, input.superset, windowStart, input.spokenAt);

    const last = await db.getFirstAsync<ExerciseRow & { set_count: number }>(
      `SELECT e.*, (SELECT COUNT(*) FROM exercise_sets s WHERE s.exercise_id = e.id) AS set_count
       FROM exercises e WHERE e.workout_id = ? ORDER BY e.position DESC LIMIT 1`,
      [workoutId],
    );
    let position = (last?.position ?? -1) + 1;
    const supersetGroup = input.superset ? newId() : null;
    const changed: string[] = [];

    for (const [exerciseIndex, exercise] of input.exercises.entries()) {
      const continues =
        last !== null &&
        !input.superset &&
        input.exercises.length === 1 &&
        last.superset_group === null &&
        sameExerciseName(last.name, exercise.name);

      let exerciseId: string;
      let firstSetPosition = 0;
      if (continues) {
        exerciseId = last.id;
        firstSetPosition = last.set_count;
        if (exercise.technique && !last.technique) {
          await db.runAsync('UPDATE exercises SET technique = ? WHERE id = ?', [
            exercise.technique,
            exerciseId,
          ]);
        }
      } else {
        exerciseId = newId();
        await db.runAsync(
          `INSERT INTO exercises
             (id, workout_id, user_id, position, name, technique, superset_group, spoken_text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exerciseId,
            workoutId,
            userId,
            position++,
            exercise.name,
            exercise.technique,
            supersetGroup,
            input.spokenText,
            input.spokenAt.toISOString(),
          ],
        );
      }

      for (const [setIndex, set] of exercise.sets.entries()) {
        const time = times.find((t) => t.exerciseIndex === exerciseIndex && t.setIndex === setIndex);
        await insertSet(db, newId(), exerciseId, userId, firstSetPosition + setIndex, set, {
          startedAt: time?.startedAt ?? null,
          endedAt: time?.endedAt ?? null,
        });
      }
      changed.push(exerciseId);
    }

    await db.runAsync('UPDATE workouts SET last_activity_at = ? WHERE id = ?', [
      input.spokenAt.toISOString(),
      workoutId,
    ]);
    return changed;
  });
}

export type ExerciseEdit = {
  name: string;
  technique: Technique | null;
  sets: (ParsedSet & { id?: string })[];
};

// Replaces an exercise's name and sets with the edited version. Sets that were kept keep their
// times; sets added by hand have none, since the app cannot know when they were done.
export async function updateExercise(
  db: Db,
  userId: string,
  exerciseId: string,
  edit: ExerciseEdit,
  newId: () => string,
): Promise<void> {
  const name = edit.name.trim();
  if (!name) throw new Error('The exercise needs a name.');
  await inTransaction(db, async () => {
    const existing = await getExercise(db, userId, exerciseId);
    if (!existing) throw new Error('The exercise could not be found.');

    await db.runAsync('UPDATE exercises SET name = ?, technique = ? WHERE id = ?', [
      name,
      edit.technique,
      exerciseId,
    ]);

    const kept = new Map(existing.sets.map((set) => [set.id, set]));
    await db.runAsync('DELETE FROM exercise_sets WHERE exercise_id = ?', [exerciseId]);
    for (const [position, set] of edit.sets.entries()) {
      const previous = set.id ? kept.get(set.id) : undefined;
      await insertSet(db, previous?.id ?? newId(), exerciseId, userId, position, set, {
        startedAt: previous?.startedAt ?? null,
        endedAt: previous?.endedAt ?? null,
      });
    }
  });
}

export async function deleteExercise(db: Db, userId: string, exerciseId: string): Promise<void> {
  await inTransaction(db, async () => {
    const owned = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM exercises WHERE user_id = ? AND id = ?',
      [userId, exerciseId],
    );
    if (!owned) return;
    await db.runAsync('DELETE FROM exercise_sets WHERE exercise_id = ?', [exerciseId]);
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [exerciseId]);
  });
}
