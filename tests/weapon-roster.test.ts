import { expect, test } from 'bun:test';

test('MeatCleaver and Polehammer persist, review and send independent weapon configuration', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-roster-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
