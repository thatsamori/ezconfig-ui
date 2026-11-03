// The three parry timing keys beside a disabled ExperimentalParry, through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { categoryEntries, featureReview } from './feature-review-harness';

await featureReview('parry-timing', async ({ set, saved, apply }) => {
  const names = ['EasyParryDuration', 'NonHeldParryExtensionAndRiposteWindowExtra', 'RiposteWindowBase'];
  set('Character', 'Parry', 'ExperimentalParry', false);
  set('Character', 'Parry', 'ExperimentalParryDuration', 0.47);
  for (let zeroIndex = 0; zeroIndex < names.length; zeroIndex++) {
    const base = Object.fromEntries(names.map((key, index) => [key, index === zeroIndex ? 0 : (index + 1) / 10]));
    for (const [key, value] of Object.entries(base)) set('Character', 'Parry', key, value);
    assert.equal(await saved('Character', 'Parry', names[zeroIndex]), 0);
    assert.deepEqual(categoryEntries(await apply(), 'Character', 'Parry'), {
      ...Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value.toFixed(2)])),
      ExperimentalParry: 'False', ExperimentalParryDuration: '0.47',
    }, `${names[zeroIndex]} keeps its zero beside its siblings and the feature`);
  }
});
console.log('PASS: each timing key saves independently and Applies its zero beside its sibling and ExperimentalParry values');
