import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings, type SettingRow, type SettingType } from '@/db/schema';
import { nowMs } from '@/db/time';

async function getRaw(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function getNumber(key: string, fallback: number): Promise<number> {
  const v = await getRaw(key);
  if (v === null) return fallback;
  const n = Number(JSON.parse(v));
  return Number.isFinite(n) ? n : fallback;
}

async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getRaw(key);
  return v === null ? fallback : Boolean(JSON.parse(v));
}

async function getString(key: string, fallback: string): Promise<string> {
  const v = await getRaw(key);
  return v === null ? fallback : String(JSON.parse(v));
}

async function set(key: string, value: unknown, type: SettingType): Promise<void> {
  const now = nowMs();
  await db
    .insert(settings)
    .values({ key, value: JSON.stringify(value), type, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), type, updatedAt: now } });
}

const all = (): Promise<SettingRow[]> => db.select().from(settings);

export const settingsRepo = { getRaw, getNumber, getBool, getString, set, all };
