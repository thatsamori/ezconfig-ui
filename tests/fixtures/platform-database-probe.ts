// Child fixture for the platform database test helper. Proves it was handed a
// fresh, fully migrated database before it started, and that connections from
// the storage module enforce foreign keys and run in WAL mode. Prints the path.
import assert from 'node:assert/strict';
import { openPlatformDatabase, readPlatformMigrations } from '../../src/lib/platform/storage';

const path = process.env.DATABASE_PATH;
assert(path, 'DATABASE_PATH is set before the fixture starts');
const database = openPlatformDatabase(path);
try {
  assert.deepEqual(database.query('PRAGMA user_version').get(), { user_version: readPlatformMigrations().length });
  assert.deepEqual(database.query('PRAGMA journal_mode').get(), { journal_mode: 'wal' });
  assert.equal(database.query("SELECT name FROM sqlite_schema WHERE name = 'probe'").get() ?? null, null, 'no earlier fixture left its table');
  database.exec('CREATE TABLE probe_parent (id INTEGER PRIMARY KEY); CREATE TABLE probe (parent INTEGER NOT NULL REFERENCES probe_parent (id));');
  assert.throws(() => database.exec('INSERT INTO probe VALUES (1)'), /FOREIGN KEY constraint failed/);
} finally { database.close(); }
process.stdout.write(path);
