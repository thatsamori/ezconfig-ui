import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('combined stun configuration survives the editor, Apply and acknowledged processing', () => {
  const result = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures', 'stun-combined-review.ts')], {
    cwd: join(import.meta.dir, '..'),
    env: { ...process.env, RCON_AUTO_SYNC_ENABLED: 'false', EZ_STUN_COMBINED_CAPTURE_PATH: '' },
  });
  expect(result.exitCode, new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout)).toBe(0);
});
