import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getDatabasesRoot } from './service';
export interface ApplyRecord {
  at: string;
  username: string;
  commands: number;
}
const recordPath = () => join(getDatabasesRoot(), '.last-apply.json');
export async function readApplyRecord(): Promise<ApplyRecord | null> {
  try {
    return JSON.parse(await readFile(recordPath(), 'utf8'));
  } catch {
    return null;
  }
}
export async function writeApplyRecord(record: ApplyRecord): Promise<void> {
  await writeFile(recordPath(), JSON.stringify(record, null, 2), 'utf8');
}
