/**
 * Combined stun, Chftp and disarm keys through the editor and Apply, on the
 * feature review harness. Each delivered batch is kept for the mod's replay
 * evidence.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { categoryCommands, categoryEntries, featureReview, WIPE } from './feature-review-harness';

// Total derived from the published string schema, so adding a key does not require editing this fixture.
const publishedCharacterKeyCount = (await readFile(join(import.meta.dir, '..', '..', 'string-schemas', 'characterConfigSchema.txt'), 'utf8')).trim().split(/\s+/).length;
const required = ['FreeStun', 'FreeStunDuration', 'OutOfStaminaStunDuration'];
const captures: { mode: string; commands: readonly string[] }[] = [];

await featureReview('stun-combined', async ({ set, reset, saved, apply }) => {
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const keys = Object.values(CHARACTER_CONFIG_OPTIONS).flat().map((entry) => entry.configKey);
  assert(required.every((key) => keys.includes(key)), 'Ticket03 must register all three new keys before this integration fixture runs');
  assert.equal(keys.length, publishedCharacterKeyCount);
  const setAll = async (category: string, values: Record<string, number | boolean>) => {
    for (const [key, value] of Object.entries(values)) set('Character', category, key, value);
    for (const [key, value] of Object.entries(values)) assert.equal(await saved('Character', category, key), value);
  };
  // Apply everything: the wipe, then the values sent, counted across categories.
  const applied = async (mode: string, values: number) => {
    const batch = await apply(mode);
    captures.push({ mode, commands: batch });
    assert.equal(batch[0], WIPE);
    assert.equal(batch.slice(1).reduce((count, command) => count + Object.keys(JSON.parse(command.slice(command.indexOf('{')))).length, 0), values);
    return batch;
  };
  const stun = (batch: string[]) => categoryEntries(batch, 'Character', 'Stun');

  const initialValues = {
    Chftp: { ChftpStun: true, ChftpStunDuration: 1.4, ChftpStunDisarms: true },
    Misc: { DisarmPickupDelay: true, DisarmPickupDelayDuration: .2 },
    Stun: { FreeStun: true, FreeStunDuration: .35, OutOfStaminaStunDuration: .7 },
  };
  const initialPersisted: Record<string, unknown> = {};
  for (const [category, values] of Object.entries(initialValues)) {
    await setAll(category, values);
    initialPersisted[`Character/${category}`] = values;
  }
  const initial = await applied('full-combined', 8);
  assert.equal(categoryCommands(initial).length, 3);
  assert.deepEqual(stun(initial), { FreeStun: 'True', FreeStunDuration: '0.35', OutOfStaminaStunDuration: '0.7' });
  assert.deepEqual(categoryEntries(initial, 'Character', 'Chftp'), { ChftpStun: 'True', ChftpStunDuration: '1.40', ChftpStunDisarms: 'True' });
  assert.deepEqual(categoryEntries(initial, 'Character', 'Misc'), { DisarmPickupDelay: 'True', DisarmPickupDelayDuration: '0.20' });
  assert.deepEqual(await applied('unchanged-full', 8), initial);

  // Distinct new durations replace the selected-only stage the mod used to replay.
  await setAll('Stun', { FreeStunDuration: 1.2, OutOfStaminaStunDuration: .25 });
  await setAll('Chftp', { ChftpStunDuration: 2.3 });
  const distinct = await applied('distinct-durations', 8);
  assert.deepEqual(stun(distinct), { FreeStun: 'True', FreeStunDuration: '1.2', OutOfStaminaStunDuration: '0.25' });
  assert.equal(categoryEntries(distinct, 'Character', 'Chftp')!.ChftpStunDuration, '2.30');
  await setAll('Stun', { FreeStunDuration: 0, OutOfStaminaStunDuration: 0 });
  assert.deepEqual(stun(await applied('zero-new-durations', 8)), { FreeStun: 'True', FreeStunDuration: '0', OutOfStaminaStunDuration: '0' });
  await setAll('Stun', { FreeStun: false, FreeStunDuration: .6, OutOfStaminaStunDuration: .7 });
  assert.deepEqual(stun(await applied('disabled-parameter-retained', 8)), { FreeStun: 'False', FreeStunDuration: '0.6', OutOfStaminaStunDuration: '0.7' });

  reset('Character', 'Stun', 'FreeStunDuration');
  const replacement = await applied('replacement-removes-one-key', 7);
  assert(!replacement.some((command) => command.includes('"FreeStunDuration"')));
  assert.deepEqual(stun(replacement), { FreeStun: 'False', OutOfStaminaStunDuration: '0.7' });
  await setAll('Stun', { FreeStun: true, FreeStunDuration: .35 });
  await applied('reapply-combined', 8);

  for (const [category, values] of Object.entries(initialValues)) {
    for (const key of Object.keys(values)) reset('Character', category, key);
  }
  assert.deepEqual(await applied('empty-replacement-wipe-only', 0), [WIPE]);
  if (process.env.EZ_STUN_COMBINED_CAPTURE_PATH) await writeFile(process.env.EZ_STUN_COMBINED_CAPTURE_PATH, JSON.stringify({
    boundary: 'Feature review harness (isolated editor store, persistence and Apply everything after a wipe). Native replay is separate.',
    initialPersisted, captures,
  }, null, 2));
});
console.log('PASS: combined stun keys through the editor and Apply; full, unchanged, distinct, zero, disabled parameter and replacement/removal');
