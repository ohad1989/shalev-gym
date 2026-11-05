# Shalev Gym

Cross-platform workout tracker built with Expo (iOS, Android, web). See [REQUIREMENTS.md](REQUIREMENTS.md).

## Run it

```bash
npm install
npm start
```

Then press `w` for web, or scan the QR code with Expo Go on a phone.

With no Supabase settings the app runs in local-only mode: there is no sign-in and data stays on the device.

## Logging exercises

During a workout, tap **Record exercise** after a set and say it, or type it in the field below. For example:

- `bench press 80 kg 10, 10, 8`
- `squat 3 sets of 5 at 100 kg`
- `pull ups 12 reps to failure`
- `squat 100 kg 5, 110 kg 3, 120 kg 1` (logged as a pyramid)
- `superset curls 12 kg 10 with pushdown 50 pounds 12`
- `end workout`

Saying the same exercise again adds sets to it. Each exercise is saved straight away and has an **Edit** button for anything that was misheard. Set times are estimated from when you tapped Record.

This is the free edition: speech becomes text on the device (Android's recognizer, or the browser's on web), and built-in rules read the text (`src/domain/exerciseLog.ts`). Voice needs a development or EAS build, not Expo Go.

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/20261102000000_initial_schema.sql` in the project, using the SQL editor or the Supabase CLI.
3. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
4. Restart `npm start`.

Workouts are stored on the device only for now. Syncing them to Supabase comes with offline support in Phase 2.

## Checks

```bash
npm run typecheck
npm test
npm run test:db
```

`test:db` runs the migration and its access rules in an in-process Postgres, so it needs neither Docker nor a Supabase project.

## Layout

- `src/app/`: screens (Expo Router)
- `src/domain/`: workout rules and formatting, with no framework code
- `src/data/`: on-device SQLite database and queries
- `src/auth/`, `src/lib/`: sign-in and the Supabase client
- `supabase/`: server schema and its tests

## Web hosting

`expo-sqlite` on web needs these response headers on every page:

- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Opener-Policy: same-origin`
