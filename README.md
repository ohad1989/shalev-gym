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

A workout is logged one exercise at a time:

1. **Choose the exercise.** Tap the microphone and say it ("bench press", "next is lat pulldown", "curls superset with pushdowns"), type it with suggestions as you type, or tap a recent one. The app shows what it understood, with close alternatives, and you tap **Start** to confirm. Names it doesn't know can be added as a new exercise.
2. **Record the sets.** After each set, tap **Record set** and say it: `80 kg 10 reps`, `80 for 10`, `8 reps` (same weight as the last set), `bodyweight 12 to failure`. Every set goes under the confirmed exercise. In a superset, sets alternate between the exercises.
3. **Move on.** Say or tap **Next exercise**, or just say the next exercise's name and confirm it.

You can also say "same again", "undo" and "end workout", or use the matching buttons. A rest timer runs from the last set, and a finished exercise can be reopened with **+**. Each exercise has an **Edit** button for anything that was misheard. Set times come from when you tapped Record. **Delete workout** removes a workout and everything in it, after a confirmation.

This is the free edition: speech becomes text on the device (Android's recognizer, or the browser's on web), and built-in rules read it (`src/domain/setLog.ts`, `src/domain/exerciseChoice.ts`, with the exercise list in `src/domain/exerciseCatalog.ts`). Voice and haptics need a development or EAS build, not Expo Go.

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
