import {
  AUTO_END_IDLE_MS,
  durationMs,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatLongDate,
  groupByDay,
  isStale,
  type Workout,
} from './workout';

const workout = (overrides: Partial<Workout> = {}): Workout => ({
  id: 'w1',
  userId: 'alice',
  startedAt: '2026-11-02T08:00:00.000Z',
  endedAt: null,
  lastActivityAt: '2026-11-02T08:00:00.000Z',
  endReason: null,
  title: null,
  focus: null,
  ...overrides,
});

describe('isStale', () => {
  const start = new Date('2026-11-02T08:00:00.000Z').getTime();

  it('is false before the idle limit and true at it', () => {
    expect(isStale(workout(), new Date(start + AUTO_END_IDLE_MS - 1))).toBe(false);
    expect(isStale(workout(), new Date(start + AUTO_END_IDLE_MS))).toBe(true);
  });

  it('is false for a workout that already ended', () => {
    const ended = workout({ endedAt: '2026-11-02T09:00:00.000Z', endReason: 'user' });
    expect(isStale(ended, new Date(start + AUTO_END_IDLE_MS * 2))).toBe(false);
  });
});

describe('durationMs', () => {
  it('uses the end time when there is one', () => {
    const ended = workout({ endedAt: '2026-11-02T09:30:00.000Z', endReason: 'user' });
    expect(durationMs(ended, new Date('2026-11-03T00:00:00.000Z'))).toBe(90 * 60_000);
  });

  it('counts up to now for an active workout', () => {
    expect(durationMs(workout(), new Date('2026-11-02T08:10:00.000Z'))).toBe(10 * 60_000);
  });

  it('never goes negative if the device clock moved back', () => {
    expect(durationMs(workout(), new Date('2026-11-02T07:00:00.000Z'))).toBe(0);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(59 * 60_000)).toBe('59 min');
    expect(formatDuration(60 * 60_000)).toBe('1 h');
    expect(formatDuration(75 * 60_000)).toBe('1 h 15 min');
  });

  it('formats the running clock', () => {
    expect(formatClock(5_000)).toBe('00:05');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('labels today and yesterday by local calendar day', () => {
    const now = new Date(2026, 10, 2, 0, 30);
    expect(formatDayLabel(new Date(2026, 10, 2, 0, 5), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 10, 1, 23, 55), now)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 9, 30, 12, 0), now)).toMatch(/30 Oct/);
    expect(formatDayLabel(new Date(2025, 9, 30, 12, 0), now)).toMatch(/2025/);
  });

  it('formats long dates in English', () => {
    expect(formatLongDate(new Date(2026, 10, 2))).toMatch(/Monday.*2 November 2026/);
  });
});

describe('groupByDay', () => {
  it('groups same-day workouts together and keeps their order', () => {
    const iso = (hour: number, day = 2) => new Date(2026, 10, day, hour).toISOString();
    const days = groupByDay([
      workout({ id: 'evening', startedAt: iso(19) }),
      workout({ id: 'morning', startedAt: iso(7) }),
      workout({ id: 'previous', startedAt: iso(18, 1) }),
    ]);

    expect(days.map((d) => d.workouts.map((w) => w.id))).toEqual([
      ['evening', 'morning'],
      ['previous'],
    ]);
  });
});
