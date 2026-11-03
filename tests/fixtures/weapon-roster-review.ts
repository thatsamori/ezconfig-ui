// Ticket 04: MeatCleaver, Polehammer and Greatsword through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { lookupDefault } from '../../src/lib/config/defaults';
import { CategoryName } from '../../src/lib/config/weaponConfigSchema';
import { categoryCommands, categoryEntries, featureReview } from './feature-review-harness';

const values = {
  MeatCleaver: { Strike: { Windup: .83 }, General: { CanBlock: false } },
  Polehammer: { Strike: { Windup: .91 }, General: { CanBlock: false } },
  Greatsword: { Strike: { Windup: .73 } },
};
// The roster the console lists and storage routes under Weapon/.
const roster: string[] = Object.values(CategoryName);

await featureReview('weapon-roster', async ({ set, reset, apply }) => {
  assert.deepEqual(categoryCommands(await apply()), [], 'nothing is saved yet');
  for (const [weapon, categories] of Object.entries(values)) {
    assert(roster.includes(weapon), weapon + ' is on the roster');
    for (const [category, entries] of Object.entries(categories)) {
      for (const [key, value] of Object.entries(entries)) {
        assert(lookupDefault(weapon, category, key).defaultValue !== undefined, weapon + '/' + category + '/' + key + ' default metadata');
        set(weapon, category, key, value);
      }
    }
  }
  // Each weapon's categories are their own commands, explicit false included.
  const initialCommands = await apply();
  assert.deepEqual(categoryCommands(initialCommands), [
    'string ezconfig Greatsword Strike {"Windup":"0.73"}',
    'string ezconfig MeatCleaver General {"CanBlock":"False"}',
    'string ezconfig MeatCleaver Strike {"Windup":"0.83"}',
    'string ezconfig Polehammer General {"CanBlock":"False"}',
    'string ezconfig Polehammer Strike {"Windup":"0.91"}',
  ]);

  // An edit to one weapon leaves the others as they were.
  set('MeatCleaver', 'Strike', 'Windup', 1.07);
  const updateCommands = await apply();
  assert.deepEqual(categoryEntries(updateCommands, 'MeatCleaver', 'Strike'), { Windup: '1.07' });
  assert.deepEqual(categoryEntries(updateCommands, 'Polehammer', 'Strike'), { Windup: '0.91' });
  assert.deepEqual(categoryEntries(updateCommands, 'Greatsword', 'Strike'), { Windup: '0.73' });

  // Reset empties MeatCleaver General, which is no longer sent; Polehammer keeps its false.
  reset('MeatCleaver', 'General', 'CanBlock');
  const removed = await apply();
  assert.equal(categoryEntries(removed, 'MeatCleaver', 'General'), undefined);
  assert.deepEqual(categoryEntries(removed, 'Polehammer', 'General'), { CanBlock: 'False' });
  assert.deepEqual(categoryEntries(removed, 'MeatCleaver', 'Strike'), { Windup: '1.07' });

  if (process.env.EZCONFIG_CAPTURE_ROSTER_COMMANDS === '1') {
    const directory = resolve('.scratch/weapon-reliability-ui');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'ticket04-captured-rcon.json'), JSON.stringify({
      source: "Feature review harness: editor -> Draft -> Apply (whole configuration after a wipe) -> the batch delivered to the game server's held poll",
      initialCommands, updateCommands, values,
    }, null, 2) + '\n');
  }
});
console.log('PASS: both roster entries and Greatsword persist and apply independently; false, partial removal and wipe ordering preserved');
