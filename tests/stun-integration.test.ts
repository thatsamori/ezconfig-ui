import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('stun duration uses real persistence, review and selected apply with isolated transport', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'stun-duration-review.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});
