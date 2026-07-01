/**
 * Drizzle client backed by tauri-plugin-sql (SQLite) via the sqlite-proxy driver.
 *
 * The plugin returns row OBJECTS but sqlite-proxy needs arrays of column VALUES
 * in SELECT order — `Object.values(row)` bridges this. Writes without RETURNING
 * go through `execute()` (method 'run'); everything else through `select()`
 * (which also handles INSERT/UPDATE/DELETE ... RETURNING, since those produce
 * a result set in SQLite).
 *
 * NOTE: only works inside the Tauri runtime (not plain `vite dev` in a browser).
 */
import Database from '@tauri-apps/plugin-sql';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import { DB } from '@/config/app.config';

let sqlitePromise: Promise<Database> | null = null;

/** Lazily open (and cache) the single SQLite connection. */
export function getConnection(): Promise<Database> {
  if (!sqlitePromise) sqlitePromise = Database.load(DB.url);
  return sqlitePromise;
}

export const db = drizzle<typeof schema>(
  // Single-query executor.
  async (sqlText, params, method) => {
    const conn = await getConnection();
    if (method === 'run') {
      await conn.execute(sqlText, params);
      return { rows: [] };
    }
    const rowsObj = await conn.select<Record<string, unknown>[]>(sqlText, params);
    const rows = rowsObj.map((r) => Object.values(r));
    return { rows: method === 'get' ? (rows[0] ? [rows[0]] : []) : rows };
  },
  // Batch executor (used by the proxy for composed statements).
  async (queries) => {
    const conn = await getConnection();
    const out: { rows: unknown[][] }[] = [];
    for (const q of queries) {
      const rowsObj = await conn.select<Record<string, unknown>[]>(q.sql, q.params);
      out.push({ rows: rowsObj.map((r) => Object.values(r)) });
    }
    return out;
  },
  { schema },
);

export type DbClient = typeof db;
