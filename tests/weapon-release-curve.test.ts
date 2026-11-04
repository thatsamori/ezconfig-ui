import { expect, test } from 'bun:test';
test('a release curve survives the editor, the Draft, Apply and reset, and a refused one stops at each', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/weapon-release-curve-review.ts'], {
    cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
  });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
});
