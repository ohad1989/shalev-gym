-- Initial schema. Row ids are generated on the device so workouts can be created offline.
-- Child tables repeat user_id and use composite foreign keys, so a row can only point at
-- a parent owned by the same user (foreign key checks bypass row-level security).

create table public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  last_activity_at timestamptz not null,
  end_reason text check (end_reason in ('user', 'auto')),
  title text,
  focus text,
  unique (id, user_id),
  check (ended_at is null or ended_at >= started_at),
  check ((ended_at is null) = (end_reason is null))
);

create unique index workouts_one_active_per_user on public.workouts (user_id) where ended_at is null;
create index workouts_user_started on public.workouts (user_id, started_at desc);

-- user_id null marks a shared catalog entry; otherwise the exercise is private to that user.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  muscle_groups text[] not null default '{}'
);

create unique index exercises_unique_name on public.exercises (
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

create table public.workout_exercises (
  id uuid primary key,
  user_id uuid not null,
  workout_id uuid not null,
  exercise_id uuid not null references public.exercises (id),
  position integer not null check (position >= 0),
  superset_group integer,
  unique (id, user_id),
  unique (workout_id, position),
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade
);

create table public.sets (
  id uuid primary key,
  user_id uuid not null,
  workout_exercise_id uuid not null,
  set_number integer not null check (set_number >= 1),
  -- The weight as entered, plus a kg value for comparisons. Null means bodyweight.
  weight_value numeric check (weight_value >= 0),
  weight_unit text check (weight_unit in ('kg', 'lb')),
  weight_kg numeric check (weight_kg >= 0),
  reps integer not null check (reps >= 0),
  started_at timestamptz,
  started_at_estimated boolean not null default false,
  finished_at timestamptz not null,
  to_failure boolean not null default false,
  unique (workout_exercise_id, set_number),
  check (started_at is null or finished_at >= started_at),
  check ((weight_value is null) = (weight_unit is null)),
  check ((weight_value is null) = (weight_kg is null)),
  foreign key (workout_exercise_id, user_id)
    references public.workout_exercises (id, user_id) on delete cascade
);

-- The user's original text, kept for reprocessing and debugging.
create table public.raw_inputs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid,
  text text not null,
  source text not null check (source in ('text', 'voice')),
  created_at timestamptz not null,
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade
);

create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.raw_inputs enable row level security;
alter table public.monthly_summaries enable row level security;

create policy "own workouts" on public.workouts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "read shared exercises" on public.exercises for select to authenticated
  using (user_id is null);

create policy "own exercises" on public.exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own workout exercises" on public.workout_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    -- This subquery runs under the exercises policies, so another user's private exercise is hidden.
    and exists (select 1 from public.exercises e where e.id = exercise_id)
  );

create policy "own sets" on public.sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own raw inputs" on public.raw_inputs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Summaries are written by the scheduled job using the service role, so users only read them.
create policy "read own summaries" on public.monthly_summaries for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.workouts,
  public.exercises,
  public.workout_exercises,
  public.sets,
  public.raw_inputs
to authenticated;

grant select on public.monthly_summaries to authenticated;
