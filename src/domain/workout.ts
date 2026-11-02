export type EndReason = 'user' | 'auto';

export type Workout = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  endReason: EndReason | null;
  title: string | null;
  focus: string | null;
};

export type WorkoutDay = {
  key: string;
  date: Date;
  workouts: Workout[];
};

// A workout with no activity for this long is closed automatically (see requirement 8:
// users may never say "end workout").
export const AUTO_END_IDLE_MS = 6 * 60 * 60 * 1000;

// The interface is English-only for now, so dates match it rather than the device language.
const DATE_LOCALE = 'en-GB';

export function isStale(workout: Workout, now: Date): boolean {
  return (
    workout.endedAt === null &&
    now.getTime() - new Date(workout.lastActivityAt).getTime() >= AUTO_END_IDLE_MS
  );
}

export function durationMs(workout: Workout, now: Date): number {
  const end = workout.endedAt ? new Date(workout.endedAt) : now;
  return Math.max(0, end.getTime() - new Date(workout.startedAt).getTime());
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Groups by the device's local calendar day, keeping the order of the input.
export function groupByDay(workouts: Workout[]): WorkoutDay[] {
  const days = new Map<string, WorkoutDay>();
  for (const workout of workouts) {
    const date = new Date(workout.startedAt);
    const key = dayKey(date);
    const day = days.get(key);
    if (day) day.workouts.push(workout);
    else days.set(key, { key, date, workouts: [workout] });
  }
  return [...days.values()];
}

export function formatDayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(DATE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(DATE_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
