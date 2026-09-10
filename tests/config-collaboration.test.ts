import { expect, test } from 'bun:test';

test('config revisions and concurrent API edits work against isolated storage', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/config-collaboration.ts'], { stdout: 'pipe', stderr: 'pipe' });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
