import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('combined geometry and migrated transforms cross actual startup, save, review and apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-combined.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('forward geometry uses actual save, review and acknowledged selected apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});


test('half-width uses actual save, review and acknowledged selected apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: 'ForwardParryHalfWidth' } });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('forward components preserve independent selection, ordering and removal', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-components.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('bubble radius uses actual Movement save, review and acknowledged selected apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: 'EllipseBubbleRadius' } });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

for (const key of ['EllipseBubbleLength', 'EllipseBubbleMaxHeightDiff']) {
  test(key + ' uses actual save, review and acknowledged selected apply', () => {
    const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: key } });
    expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
  });
}

test('bubble dimensions preserve independent selection, ordering and removal', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'bubble-components.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});
