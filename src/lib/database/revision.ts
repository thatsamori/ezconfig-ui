import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';

export interface ConfigRevision {
  revision: string;
  savedAt: string | null;
}

// Share the queue across Next route bundles and hot reloads. This file-backed
// app runs in one server process; all config mutations and snapshots use it.
const shared = globalThis as typeof globalThis & { configTransaction?: Promise<unknown> };
export function withConfigLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = (shared.configTransaction ?? Promise.resolve()).then(operation);
  shared.configTransaction = result.catch(() => {});
  return result;
}

export async function readConfigRevision(): Promise<ConfigRevision> {
  try {
    return JSON.parse(await readFile(join(env.databasesPath, '.revision.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: 'initial', savedAt: null };
    throw error;
  }
}

export async function recordConfigSave(): Promise<void> {
  const previous = await readConfigRevision();
  const metadata: ConfigRevision = {
    revision: randomUUID(),
    savedAt: new Date(Math.max(Date.now(), previous.savedAt ? Date.parse(previous.savedAt) + 1 : 0)).toISOString(),
  };
  await mkdir(env.databasesPath, { recursive: true });
  const target = join(env.databasesPath, '.revision.json');
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(metadata), 'utf8');
  await rename(temporary, target);
}
