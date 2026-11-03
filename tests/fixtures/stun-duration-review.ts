// Out-of-stamina stun duration through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { categoryEntries, featureReview, WIPE } from './feature-review-harness';

await featureReview('stun-duration', async ({ set, reset, saved, saveUnchecked, storeUnvalidated, apply }) => {
  const key = 'OutOfStaminaStunDuration';
  const prefix = 'string ezconfig Character Stun ';
  const capture: { cases: { value: number; command: string }[]; removal?: string[]; omittedUpsert?: string } = { cases: [] };
  set('Character', 'Chftp', 'ChftpStunDuration', 2.3);
  for (const value of [0.25, 0.6, 1.6, 0, 0.000001, 1.075]) {
    set('Character', 'Stun', key, value);
    assert.equal(await saved('Character', 'Stun', key), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Stun'), { [key]: String(value) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Chftp'), { ChftpStunDuration: '2.30' });
    capture.cases.push({ value, command: batch.find(command => command.startsWith(prefix))! });
  }

  // The editor refuses these: had it sent one, the save would fail or change the value.
  for (const value of [-1, Infinity, NaN, 1e40, Number.MIN_VALUE]) set('Character', 'Stun', key, value);
  assert.equal(await saved('Character', 'Stun', key), 1.075);
  for (const value of [-1, '0', 1e40, Number.MIN_VALUE]) {
    assert.equal(await saveUnchecked('Character', 'Stun', { [key]: value }), 400);
    assert.equal(await saved('Character', 'Stun', key), 1.075);
  }

  // A damaged saved value must stop Apply before its wipe is sent, rather
  // than relying on a later server rejection; the harness checks nothing was delivered.
  await storeUnvalidated('Character', 'Stun', { [key]: 1e40 });
  await assert.rejects(apply(), /Apply was refused \(500\)/);

  reset('Character', 'Stun', key);
  assert.equal(await saved('Character', 'Stun', key), undefined);
  capture.removal = await apply();
  assert.equal(capture.removal[0], WIPE);
  assert(!capture.removal.some(command => command.includes(key)));
  assert.equal(categoryEntries(capture.removal, 'Character', 'Stun'), undefined);
  capture.omittedUpsert = 'string ezconfig Character Stun {}';
  if (process.env.EZ_STUN_CAPTURE_PATH) await writeFile(process.env.EZ_STUN_CAPTURE_PATH, JSON.stringify(capture, null, 2));
});
console.log('PASS: editor/persistence/Apply preserves zero/default/tiny-positive precision; rejects invalid edits before persistence and invalid saved values before wipe; removal uses replacement.');
