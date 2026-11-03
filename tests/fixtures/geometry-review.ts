// One geometry dimension (EZ_GEOMETRY_KEY) through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { categoryEntries, featureReview } from './feature-review-harness';

const key = process.env.EZ_GEOMETRY_KEY || 'ForwardParryLength';
const category = key.startsWith('EllipseBubble') ? 'Movement' : 'Parry';
const prefix = 'string ezconfig Character ' + category + ' ';
const capture: { cases: { value: number; command: string }[]; removal?: string[]; omittedUpsert?: string } = { cases: [] };
await featureReview('geometry', async ({ set, reset, saved, saveUnchecked, storeUnvalidated, apply }) => {
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const definition = CHARACTER_CONFIG_OPTIONS[category].find(entry => entry.configKey === key);
  assert.equal(definition?.defaultValue, ({ ForwardParryLength: 50, ForwardParryHalfWidth: 10, EllipseBubbleRadius: 109.75, EllipseBubbleLength: 20, EllipseBubbleMaxHeightDiff: 150 } as Record<string, number>)[key]);
  set('Character', 'Chftp', 'ChftpStunDuration', 2.3);
  for (const value of (key === 'EllipseBubbleRadius' ? [60, 109.75, 220, 0, -30, -3.40282347e38, 3.40282347e38, 1.075] : key === 'EllipseBubbleLength' ? [20, 60, 200, 0, -200, -3.40282347e38, 3.40282347e38, 1.075] : key === 'EllipseBubbleMaxHeightDiff' ? [150, 15, 16, 17, 0, -1, -3.40282347e38, 3.40282347e38, 1.075] : [25, 50, 100, 0, -25, -3.40282347e38, 3.40282347e38, 1.075])) {
    set('Character', category, key, value);
    assert.equal(await saved('Character', category, key), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', category), { [key]: String(value) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Chftp'), { ChftpStunDuration: '2.30' }, 'the other feature is still sent');
    capture.cases.push({ value, command: batch.find(command => command.startsWith(prefix))! });
  }

  // The editor refuses these before saving: a save the server refused would fail the read, and one it
  // accepted would change the value (NaN and Infinity reach it as null, a reset). The server refuses them too.
  for (const value of [-1e40, Infinity, NaN, 1e40, Number.MIN_VALUE]) set('Character', category, key, value);
  assert.equal(await saved('Character', category, key), 1.075);
  for (const value of [-1e40, '0', 1e40, Number.MIN_VALUE]) {
    assert.equal(await saveUnchecked('Character', category, { [key]: value }), 400);
    assert.equal(await saved('Character', category, key), 1.075);
  }

  const batch = await apply();
  assert.equal(categoryEntries(batch, 'Character', category)?.[key], '1.075');
  assert.deepEqual(categoryEntries(batch, 'Character', 'Chftp'), { ChftpStunDuration: '2.30' });

  // A manually damaged saved value must fail before admitting a full Apply
  // or sending its wipe, rather than relying on a later server rejection.
  await storeUnvalidated('Character', category, { [key]: 1e40 });
  await assert.rejects(apply(), /Apply was refused \(500\)/);

  reset('Character', category, key);
  assert.equal(await saved('Character', category, key), undefined);
  capture.removal = await apply();
  assert.equal(categoryEntries(capture.removal, 'Character', category), undefined, 'removal sends no command for the emptied category');
  assert(!capture.removal.some(command => command.includes(key)));
  capture.omittedUpsert = prefix + '{}';
});
if (process.env.EZ_GEOMETRY_CAPTURE_PATH) await writeFile(process.env.EZ_GEOMETRY_CAPTURE_PATH, JSON.stringify(capture, null, 2));
console.log('PASS: real store/persistence/Apply preserves signed/zero/default values; rejects invalid edits before persistence and invalid saved values before wipe; removal uses replacement.');
