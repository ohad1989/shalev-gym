import {
  estimateSetTimes,
  formatSet,
  formatWeight,
  parseExerciseLog,
  type ParsedExercise,
  type ParseResult,
} from './exerciseLog';

function exercises(text: string): ParsedExercise[] {
  const result = parseExerciseLog(text);
  if (result.kind !== 'exercises') throw new Error(`Not parsed: ${text} → ${JSON.stringify(result)}`);
  return result.exercises;
}

function only(text: string): ParsedExercise {
  const list = exercises(text);
  expect(list).toHaveLength(1);
  return list[0];
}

const set = (weight: number | null, unit: 'kg' | 'lb' | null, reps: number | null, toFailure = false) => ({
  weight,
  unit,
  reps,
  toFailure,
});

describe('parseExerciseLog', () => {
  it('reads one weight followed by reps per set', () => {
    expect(only('dumbbell bench press 30 kilo 12 10 8')).toEqual({
      name: 'Dumbbell Bench Press',
      sets: [set(30, 'kg', 12), set(30, 'kg', 10), set(30, 'kg', 8)],
      technique: null,
    });
  });

  it('reads sets of reps in several phrasings', () => {
    const expected = [set(80, 'kg', 10), set(80, 'kg', 10), set(80, 'kg', 10)];
    expect(only('bench press 80 kg 3 sets of 10').sets).toEqual(expected);
    expect(only('bench press 80kg 3x10').sets).toEqual(expected);
    expect(only('bench press 3 sets of 10 reps at 80 kg').sets).toEqual(expected);
    expect(only('bench press 80 kilos 3 by 10').sets).toEqual(expected);
    expect(only('Bench press, 80 kg, 3 sets, 10 reps.').sets).toEqual(expected);
  });

  it('reads pounds and keeps the unit the user said', () => {
    expect(only('cable pushdown 50 pounds 15 reps')).toMatchObject({
      name: 'Cable Pushdown',
      sets: [set(50, 'lb', 15)],
    });
  });

  it('reads numbers spoken as words', () => {
    expect(only('squat one hundred twenty kilos five reps').sets).toEqual([set(120, 'kg', 5)]);
    expect(only('curls twenty two and a half kg twelve ten').sets).toEqual([
      set(22.5, 'kg', 12),
      set(22.5, 'kg', 10),
    ]);
    expect(only('lateral raise 7.5 kg 15').sets).toEqual([set(7.5, 'kg', 15)]);
  });

  it('reads the weight before the name', () => {
    expect(only('30 kg dumbbell rows 12 reps')).toMatchObject({
      name: 'Dumbbell Rows',
      sets: [set(30, 'kg', 12)],
    });
  });

  it('drops filler words around the name', () => {
    expect(only('I just did incline press 60 kg for 8 reps').name).toBe('Incline Press');
    expect(only('lateral raises 10 kg 15 reps each side').name).toBe('Lateral Raises');
  });

  it('keeps joining words inside names', () => {
    expect(only('clean and jerk 60 kg 5').name).toBe('Clean And Jerk');
    expect(only('bench press with dumbbells 30 kg 10').name).toBe('Bench Press With Dumbbells');
    expect(only('pull ups 10 8').name).toBe('Pull-Ups');
    expect(only('one arm row 25 kg 10').name).toBe('One Arm Row');
  });

  it('reads sets to failure (requirement 7b)', () => {
    expect(only('pull ups 12 reps to failure').sets).toEqual([set(null, null, 12, true)]);
    expect(only('pull ups to failure').sets).toEqual([set(null, null, null, true)]);
    expect(only('bench press 80 kg 10 10 8 to failure').sets).toEqual([
      set(80, 'kg', 10),
      set(80, 'kg', 10),
      set(80, 'kg', 8, true),
    ]);
    expect(only('dips bodyweight 3 sets to failure').sets).toEqual([
      set(null, null, null, true),
      set(null, null, null, true),
      set(null, null, null, true),
    ]);
  });

  it('reads pyramids with changing weights (requirement 7c)', () => {
    expect(only('squat 100 kg 5 reps, 110 kg 3 reps, 120 kg 1 rep')).toEqual({
      name: 'Squat',
      sets: [set(100, 'kg', 5), set(110, 'kg', 3), set(120, 'kg', 1)],
      technique: 'pyramid',
    });
    expect(only('pyramid leg press 100 kg 12 10 8').technique).toBe('pyramid');
    expect(only('curls drop set 15 kg 10 10 kg 8').technique).toBe('drop set');
  });

  it('reads supersets (requirement 7a)', () => {
    const result = parseExerciseLog('superset curls 12 kg 10 10 with pushdown 20 kg 12 12');
    expect(result).toEqual({
      kind: 'exercises',
      superset: true,
      exercises: [
        { name: 'Curls', sets: [set(12, 'kg', 10), set(12, 'kg', 10)], technique: null },
        { name: 'Pushdown', sets: [set(20, 'kg', 12), set(20, 'kg', 12)], technique: null },
      ],
    });
  });

  it('reads two exercises in a row without a superset', () => {
    const result = parseExerciseLog('bench press 80 kg 10 then cable fly 15 kg 12');
    expect(result).toMatchObject({ kind: 'exercises', superset: false });
    expect(exercises('bench press 80 kg 10 then cable fly 15 kg 12').map((e) => e.name)).toEqual([
      'Bench Press',
      'Cable Fly',
    ]);
  });

  it('logs a weight with no reps as one set to fill in later', () => {
    expect(only('deadlift 140 kg').sets).toEqual([set(140, 'kg', null)]);
  });

  it('recognises the end of the workout (requirement 8)', () => {
    expect(parseExerciseLog('End workout')).toEqual({ kind: 'end-workout' });
    expect(parseExerciseLog('finish the workout please')).toEqual({ kind: 'end-workout' });
  });

  it('explains what is missing', () => {
    const noNumbers = parseExerciseLog('bench press') as Extract<ParseResult, { kind: 'not-understood' }>;
    expect(noNumbers.kind).toBe('not-understood');
    expect(noNumbers.reason).toContain('Bench Press');
    expect(parseExerciseLog('80 kg 10 reps').kind).toBe('not-understood');
    expect(parseExerciseLog('   ').kind).toBe('not-understood');
  });
});

describe('formatting', () => {
  it('shows weights in both units (requirement 5b)', () => {
    expect(formatWeight(80, 'kg')).toBe('80 kg (176.4 lb)');
    expect(formatWeight(50, 'lb')).toBe('50 lb (22.7 kg)');
    expect(formatWeight(null, null)).toBe('Bodyweight');
  });

  it('describes a set', () => {
    expect(formatSet(set(80, 'kg', 10))).toBe('80 kg (176.4 lb) × 10 reps');
    expect(formatSet(set(null, null, 12, true))).toBe('12 reps to failure');
    expect(formatSet(set(null, null, null, true))).toBe('To failure');
  });
});

describe('estimateSetTimes', () => {
  const start = new Date('2026-11-05T10:00:00.000Z');
  const spoken = new Date('2026-11-05T10:06:00.000Z');

  it('ends a single set when the user started speaking', () => {
    const times = estimateSetTimes([only('bench press 80 kg 10')], false, start, spoken);
    expect(times).toEqual([
      {
        exerciseIndex: 0,
        setIndex: 0,
        startedAt: '2026-11-05T10:05:20.000Z',
        endedAt: '2026-11-05T10:06:00.000Z',
      },
    ]);
  });

  it('spreads several sets across the time since the last one', () => {
    const times = estimateSetTimes([only('bench press 80 kg 10 10 10')], false, start, spoken);
    expect(times.map((t) => t.endedAt)).toEqual([
      '2026-11-05T10:02:00.000Z',
      '2026-11-05T10:04:00.000Z',
      '2026-11-05T10:06:00.000Z',
    ]);
    expect(times[0].startedAt).toBe('2026-11-05T10:01:20.000Z');
  });

  it('alternates exercises in a superset', () => {
    const result = parseExerciseLog('superset curls 12 kg 10 10 with pushdown 20 kg 12 12');
    if (result.kind !== 'exercises') throw new Error('not parsed');
    const order = estimateSetTimes(result.exercises, true, start, spoken).map(
      (t) => `${t.exerciseIndex}.${t.setIndex}`,
    );
    expect(order).toEqual(['0.0', '1.0', '0.1', '1.1']);
  });

  it('never starts a set before the window', () => {
    const quick = new Date(start.getTime() + 10_000);
    const [only1] = estimateSetTimes([only('squat 100 kg 10')], false, start, quick);
    expect(only1.startedAt).toBe(start.toISOString());
  });
});
