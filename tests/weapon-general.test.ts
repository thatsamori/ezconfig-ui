import { expect, test } from 'bun:test';

test('General and ForcesRearingFromFront selections persist, review and send independently', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-general-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
