import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { withConfigLock } from '../database/revision';

// Deliberately independent of the current schema: retain this one-off script
// after the temporary startup hook is removed.
export const PARRY_TRANSFORM_KEYS = [
  'LowBlockColliderRelativeOffsetLocation', 'LowBlockColliderRelativeOffsetRotation',
  'LowBlockColliderRelativeOffsetScale', 'HighBlockColliderRelativeOffsetLocation',
  'HighBlockColliderRelativeOffsetRotation', 'HighBlockColliderRelativeOffsetScale',
] as const;
export const PARRY_MIGRATION_BACKUP = '.parry-geometry-migration.backup.json';
export const PARRY_MIGRATION_RECEIPT = '.parry-geometry-migration.complete.json';

type Original = { preset: string | null; combat: string | null; parry: string | null };
type Backup = { version: 1; databasesRoot: string; presetsRoot: string; originals: Original[] };
export type MigrationChange = { location: string; moved: string[]; conflicts: string[] };
export type ParryMigrationResult = { status: 'migrated' | 'unchanged' | 'already-complete'; backupPath: string; receiptPath: string; changes: MigrationChange[] };
export type ParryMigrationOptions = {
  databasesRoot: string;
  presetsRoot: string;
  notice?: (message: string) => void;
};

async function optionalRead(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

function object(text: string | null, location: string): Record<string, unknown> {
  if (text === null) return {};
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Parry migration: invalid JSON in ${location}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Parry migration: expected object in ${location}`);
  const finite = (item: unknown): boolean => typeof item === 'number' ? Number.isFinite(item)
    : item !== null && typeof item === 'object' ? Object.values(item).every(finite) : true;
  if (!finite(value)) throw new Error(`Parry migration: nonfinite value in ${location}`);
  return value as Record<string, unknown>;
}

function paths(options: ParryMigrationOptions, preset: string | null) {
  const directory = preset === null ? join(options.databasesRoot, 'Character') : join(options.presetsRoot, 'User', preset, 'Character');
  return { directory, combat: join(directory, 'Combat.json'), parry: join(directory, 'Parry.json') };
}

function plan(original: Original) {
  const location = original.preset === null ? 'Databases/Character' : `Presets/User/${original.preset}/Character`;
  const combat = object(original.combat, `${location}/Combat.json`);
  const parry = object(original.parry, `${location}/Parry.json`);
  // These published keys remain Vectors. An invalid canonical value must fail
  // the upgrade, never silently fall back to a valid legacy value.
  for (const [category, entries] of [['Combat', combat], ['Parry', parry]] as const) {
    for (const key of PARRY_TRANSFORM_KEYS) {
      if (!Object.hasOwn(entries, key)) continue;
      const value = entries[key];
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !['x', 'y', 'z'].every(axis => Object.hasOwn(value, axis) && typeof (value as Record<string, unknown>)[axis] === 'number')) {
        throw new Error(`Parry migration: expected Vector for ${location}/${category}/${key}`);
      }
    }
  }
  const moved: string[] = [], conflicts: string[] = [];
  for (const key of PARRY_TRANSFORM_KEYS) {
    if (!Object.hasOwn(combat, key)) continue;
    if (Object.hasOwn(parry, key)) conflicts.push(key);
    else { parry[key] = combat[key]; moved.push(key); }
    delete combat[key];
  }
  return { combat: JSON.stringify(combat, null, 2), parry: JSON.stringify(parry, null, 2), change: { location, moved, conflicts } };
}

async function scan(options: ParryMigrationOptions): Promise<Original[]> {
  const presets: (string | null)[] = [null];
  try {
    for (const entry of await readdir(join(options.presetsRoot, 'User'), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Parry migration: linked user preset requires manual inspection');
      if (entry.isDirectory()) presets.push(entry.name);
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const affected: Original[] = [];
  for (const preset of presets.sort()) {
    const files = paths(options, preset);
    const original = { preset, combat: await optionalRead(files.combat), parry: await optionalRead(files.parry) };
    const { change } = plan(original); // Validate even a present file with no legacy keys.
    if (change.moved.length || change.conflicts.length) affected.push(original);
  }
  return affected;
}

/** Write a complete same-directory replacement, flush it, then verify it. */
async function atomicWrite(path: string, text: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
    if (await readFile(path, 'utf8') !== text) throw new Error(`Parry migration: write verification failed for ${path}`);
  } finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
}

function readBackup(text: string, options: ParryMigrationOptions): Backup {
  const value = object(text, 'migration backup');
  if (value.version !== 1 || value.databasesRoot !== options.databasesRoot || value.presetsRoot !== options.presetsRoot || !Array.isArray(value.originals)) {
    throw new Error('Parry migration: backup does not match these storage roots');
  }
  const seen = new Set<string | null>();
  for (const original of value.originals) {
    if (!original || typeof original !== 'object' ||
      !(original.preset === null || (typeof original.preset === 'string' && original.preset.length > 0 && !/[\\/:]/.test(original.preset) && original.preset !== '.' && original.preset !== '..')) ||
      !(original.combat === null || typeof original.combat === 'string') || !(original.parry === null || typeof original.parry === 'string') || seen.has(original.preset)) {
      throw new Error('Parry migration: invalid backup entry');
    }
    seen.add(original.preset);
    const { change } = plan(original);
    if (!change.moved.length && !change.conflicts.length) throw new Error('Parry migration: unexpected empty backup entry');
  }
  return value as unknown as Backup;
}

/** One installation, one server process; shares the existing config transaction queue. */
export function migrateParryGeometry(input: ParryMigrationOptions): Promise<ParryMigrationResult> {
  return withConfigLock(async () => {
    const options = { ...input, databasesRoot: resolve(input.databasesRoot), presetsRoot: resolve(input.presetsRoot) };
    const backupPath = join(options.databasesRoot, PARRY_MIGRATION_BACKUP);
    const receiptPath = join(options.databasesRoot, PARRY_MIGRATION_RECEIPT);
    let backupText = await optionalRead(backupPath);
    const receiptText = await optionalRead(receiptPath);
    if (receiptText !== null && backupText === null) throw new Error('Parry migration: completion receipt is missing its immutable backup');
    let backup: Backup;
    if (backupText !== null) backup = readBackup(backupText, options);
    else {
      backup = { version: 1, databasesRoot: options.databasesRoot, presetsRoot: options.presetsRoot, originals: await scan(options) };
      backupText = JSON.stringify(backup, null, 2);
      await mkdir(options.databasesRoot, { recursive: true });
      await atomicWrite(backupPath, backupText);
    }
    const backupSha256 = createHash('sha256').update(backupText).digest('hex');
    if (receiptText !== null) {
      const receipt = object(receiptText, 'migration receipt');
      if (receipt.version !== 1 || receipt.backupSha256 !== backupSha256 || typeof receipt.completedAt !== 'string') throw new Error('Parry migration: completion receipt does not match backup');
      // No ongoing converter: completed installations do not convert later imports.
      await scan(options);
      return { status: 'already-complete', backupPath, receiptPath, changes: [] };
    }

    const planned = backup.originals.map(original => ({ original, ...plan(original), files: paths(options, original.preset) }));
    // Inspect every pair before resuming any write. External edits during a failed
    // startup need inspection, not automatic replacement from an old journal.
    for (const entry of planned) {
      for (const category of ['combat', 'parry'] as const) {
        const current = await optionalRead(entry.files[category]);
        if (current !== entry.original[category] && current !== entry[category]) throw new Error(`Parry migration: changed since backup: ${entry.files[category]}`);
      }
    }
    const changes = planned.map(entry => entry.change);
    const notice = options.notice ?? console.info;
    for (const change of changes) notice(`[EZConfig migration] ${change.location}: moving ${change.moved.length} transform(s); Parry wins ${change.conflicts.length} conflict(s)${change.conflicts.length ? ` (${change.conflicts.join(', ')})` : ''}. Originals: ${backupPath}`);
    for (const entry of planned) {
      // Destination must be durable and verified before removing source entries.
      if (await optionalRead(entry.files.parry) !== entry.parry) await atomicWrite(entry.files.parry, entry.parry);
      if (await optionalRead(entry.files.combat) !== entry.combat) await atomicWrite(entry.files.combat, entry.combat);
    }
    for (const entry of planned) {
      if (await optionalRead(entry.files.parry) !== entry.parry || await optionalRead(entry.files.combat) !== entry.combat) throw new Error('Parry migration: final verification failed');
    }
    await atomicWrite(receiptPath, JSON.stringify({ version: 1, backupSha256, completedAt: new Date().toISOString(), changes }, null, 2));
    return { status: changes.length ? 'migrated' : 'unchanged', backupPath, receiptPath, changes };
  });
}
