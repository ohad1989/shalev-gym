import type { SQLiteDatabase } from 'expo-sqlite';

export type Db = Pick<SQLiteDatabase, 'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

export const DATABASE_NAME = 'shalev-gym.db';

// Each entry upgrades the database by one version. Never edit an entry that has shipped.
const MIGRATIONS = [
  `
  CREATE TABLE workouts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_activity_at TEXT NOT NULL,
    end_reason TEXT CHECK (end_reason IN ('user', 'auto')),
    title TEXT,
    focus TEXT
  );
  CREATE UNIQUE INDEX workouts_one_active_per_user ON workouts (user_id) WHERE ended_at IS NULL;
  CREATE INDEX workouts_user_started ON workouts (user_id, started_at DESC);
  `,
];

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.execAsync(
      `BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`,
    );
  }
}
