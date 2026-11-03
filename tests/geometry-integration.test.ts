import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('combined geometry and migrated transforms cross actual startup, the editor and Apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-combined.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('forward geometry uses the actual editor and acknowledged Apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});


test('half-width uses the actual editor and acknowledged Apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: 'ForwardParryHalfWidth' } });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('forward components preserve independent presence, ordering and removal', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-components.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

test('bubble radius uses the actual Movement editor and acknowledged Apply', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: 'EllipseBubbleRadius' } });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});

for (const key of ['EllipseBubbleLength', 'EllipseBubbleMaxHeightDiff']) {
  test(key + ' uses the actual editor and acknowledged Apply', () => {
    const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'geometry-review.ts')], { cwd: join(import.meta.dir, '..'), env: { ...process.env, EZ_GEOMETRY_KEY: key } });
    expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
  });
}

test('bubble dimensions preserve independent presence, ordering and removal', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'bubble-components.ts')], { cwd: join(import.meta.dir, '..'), env: process.env });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});
