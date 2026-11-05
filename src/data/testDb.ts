import { DatabaseSync } from 'node:sqlite';

import type { Db } from './db';

// Runs the repositories' real SQL against Node's SQLite through the same calls expo-sqlite offers.
export function openTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    getFirstAsync: async (sql: string, params: never[] = []) =>
      sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, params: never[] = []) => sqlite.prepare(sql).all(...params),
    runAsync: async (sql: string, params: never[] = []) => sqlite.prepare(sql).run(...params),
  } as unknown as Db;
}
