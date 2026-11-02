// Runs the real migration in an in-process Postgres, with stand-ins for Supabase's auth schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../migrations/20261102000000_initial_schema.sql', import.meta.url),
  'utf8',
);

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

let db;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    insert into auth.users values ('${ALICE}'), ('${BOB}');
  `);
  await db.exec(migration);
});

async function as(userId, fn) {
  await db.exec(`set test.uid = '${userId}'; set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role; reset test.uid;');
  }
}

const addWorkout = (id, userId, { ended = false } = {}) =>
  db.query(
    `insert into public.workouts (id, user_id, started_at, last_activity_at, ended_at, end_reason)
     values ($1, $2, now(), now(), case when $3::boolean then now() end, $4)`,
    [id, userId, ended, ended ? 'user' : null],
  );

test('users only see their own workouts', async () => {
  await as(ALICE, () => addWorkout(uuid(1), ALICE));
  await as(BOB, () => addWorkout(uuid(2), BOB));

  const { rows } = await as(ALICE, () => db.query('select id from public.workouts'));
  assert.deepEqual(rows, [{ id: uuid(1) }]);
});

test('users cannot create a workout for someone else', async () => {
  await assert.rejects(as(ALICE, () => addWorkout(uuid(1), BOB)), /row-level security/);
});

test('users cannot change or delete another user’s workout', async () => {
  await as(BOB, () => addWorkout(uuid(2), BOB));

  const updated = await as(ALICE, () =>
    db.query(`update public.workouts set title = 'hacked' where id = $1`, [uuid(2)]),
  );
  const deleted = await as(ALICE, () =>
    db.query('delete from public.workouts where id = $1', [uuid(2)]),
  );

  assert.equal(updated.affectedRows, 0);
  assert.equal(deleted.affectedRows, 0);
});

test('a user can have several workouts a day but only one active', async () => {
  await as(ALICE, async () => {
    await addWorkout(uuid(1), ALICE, { ended: true });
    await addWorkout(uuid(2), ALICE, { ended: true });
    await addWorkout(uuid(3), ALICE);
    await assert.rejects(addWorkout(uuid(4), ALICE), /workouts_one_active_per_user/);
  });

  // Another user's active workout is unaffected.
  await as(BOB, () => addWorkout(uuid(5), BOB));
});

test('child rows cannot attach to another user’s workout', async () => {
  await db.query(`insert into public.exercises (id, name) values ($1, 'Bench press')`, [uuid(9)]);
  await as(BOB, () => addWorkout(uuid(2), BOB));

  await assert.rejects(
    as(ALICE, () =>
      db.query(
        `insert into public.workout_exercises (id, user_id, workout_id, exercise_id, position)
         values ($1, $2, $3, $4, 0)`,
        [uuid(10), ALICE, uuid(2), uuid(9)],
      ),
    ),
    /foreign key/,
  );
});

test('private exercises are hidden from other users and cannot be referenced', async () => {
  await as(BOB, () =>
    db.query(`insert into public.exercises (id, user_id, name) values ($1, $2, 'Secret lift')`, [
      uuid(8),
      BOB,
    ]),
  );
  await db.query(`insert into public.exercises (id, name) values ($1, 'Bench press')`, [uuid(9)]);
  await as(ALICE, () => addWorkout(uuid(1), ALICE));

  const { rows } = await as(ALICE, () => db.query('select name from public.exercises'));
  assert.deepEqual(rows, [{ name: 'Bench press' }]);

  await assert.rejects(
    as(ALICE, () =>
      db.query(
        `insert into public.workout_exercises (id, user_id, workout_id, exercise_id, position)
         values ($1, $2, $3, $4, 0)`,
        [uuid(10), ALICE, uuid(1), uuid(8)],
      ),
    ),
    /row-level security/,
  );
});

test('users can read but not write monthly summaries', async () => {
  await db.query(
    `insert into public.monthly_summaries (user_id, month, content) values ($1, '2026-10-01', '{}')`,
    [ALICE],
  );

  const mine = await as(ALICE, () => db.query('select month from public.monthly_summaries'));
  const theirs = await as(BOB, () => db.query('select month from public.monthly_summaries'));
  assert.equal(mine.rows.length, 1);
  assert.equal(theirs.rows.length, 0);

  await assert.rejects(
    as(ALICE, () =>
      db.query(
        `insert into public.monthly_summaries (user_id, month, content) values ($1, '2026-11-01', '{}')`,
        [ALICE],
      ),
    ),
    /permission denied/,
  );
});

test('workouts cannot end before they start', async () => {
  await assert.rejects(
    db.query(
      `insert into public.workouts (id, user_id, started_at, last_activity_at, ended_at, end_reason)
       values ($1, $2, now(), now(), now() - interval '1 hour', 'user')`,
      [uuid(1), ALICE],
    ),
    /check constraint/,
  );
});
