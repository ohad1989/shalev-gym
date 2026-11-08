import { parseSetLog, type SetCommand } from './setLog';

const set = (weight: number | null, unit: 'kg' | 'lb' | null, reps: number | null, toFailure = false) => ({
  weight,
  unit,
  reps,
  toFailure,
});

function sets(text: string, previous = null as ReturnType<typeof set> | null) {
  const result: SetCommand = parseSetLog(text, previous);
  if (result.kind !== 'sets') throw new Error(`Not read: ${text} → ${JSON.stringify(result)}`);
  return result.sets;
}

describe('parseSetLog', () => {
  it('reads weight and reps in common phrasings', () => {
    expect(sets('80 kg 10 reps')).toEqual([set(80, 'kg', 10)]);
    expect(sets('eighty kilos ten')).toEqual([set(80, 'kg', 10)]);
    expect(sets('10 reps at 80 kg')).toEqual([set(80, 'kg', 10)]);
    expect(sets('135 pounds for 8')).toEqual([set(135, 'lb', 8)]);
    expect(sets('22.5kg x 12')).toEqual([set(22.5, 'kg', 12)]);
  });

  it('reads a weight without a unit in the unit used last', () => {
    expect(sets('80 for 10')).toEqual([set(80, 'kg', 10)]);
    expect(sets('80 x 10')).toEqual([set(80, 'kg', 10)]);
    expect(sets('80 10')).toEqual([set(80, 'kg', 10)]);
    expect(sets('185 for 5', set(175, 'lb', 5))).toEqual([set(185, 'lb', 5)]);
  });

  it('keeps the last weight when only reps are said', () => {
    const previous = set(80, 'kg', 10);
    expect(sets('8 reps', previous)).toEqual([set(80, 'kg', 8)]);
    expect(sets('same weight 8', previous)).toEqual([set(80, 'kg', 8)]);
    expect(sets('eight', previous)).toEqual([set(80, 'kg', 8)]);
  });

  it('reads bodyweight and failure', () => {
    expect(sets('bodyweight 12')).toEqual([set(null, null, 12)]);
    expect(sets('bodyweight to failure')).toEqual([set(null, null, null, true)]);
    expect(sets('60 kg 9 to failure')).toEqual([set(60, 'kg', 9, true)]);
  });

  it('reads several sets said at once', () => {
    expect(sets('80 kg 10 10 8')).toEqual([set(80, 'kg', 10), set(80, 'kg', 10), set(80, 'kg', 8)]);
    expect(sets('3 sets of 10 at 60 kg')).toHaveLength(3);
  });

  it('understands commands', () => {
    expect(parseSetLog('same again', set(80, 'kg', 10))).toEqual({ kind: 'repeat' });
    expect(parseSetLog('same', null).kind).toBe('not-understood');
    expect(parseSetLog('undo', null)).toEqual({ kind: 'undo' });
    expect(parseSetLog('delete the last set', null)).toEqual({ kind: 'undo' });
    expect(parseSetLog('next exercise', null)).toEqual({ kind: 'next-exercise' });
    expect(parseSetLog("I'm done with this exercise", null)).toEqual({ kind: 'next-exercise' });
    expect(parseSetLog('end workout', null)).toEqual({ kind: 'end-workout' });
  });

  it('explains what is missing', () => {
    expect(parseSetLog('80 kg', null)).toMatchObject({ kind: 'not-understood', reason: expect.stringContaining('reps') });
    expect(parseSetLog('hello there', null).kind).toBe('not-understood');
  });
});
