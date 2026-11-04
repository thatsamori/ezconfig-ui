import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyRow } from '../src/components/console/ConfigConsole';
import { groupsTaking, isReleaseCurveKey, previewRelease, showsKey, sweepChanges, sweepModes, sweepRows, sweepSettable, sweepStart, weapons } from '../src/components/console/model';
import { ReleaseCurveEditor } from '../src/components/console/ReleaseCurveEditor';
import { ReleaseCurveThumbnail } from '../src/components/console/ReleaseCurveThumbnail';
import { advanceStabClock, StabPreviewView, type StabClock } from '../src/components/console/StabPreview';
import { SweepList } from '../src/components/console/SweepPanel';
import { ReviewList } from '../src/components/game-servers/ApplyDialog';
import { WEAPON_CONFIG_OPTIONS, WeaponConfigGroupName } from '../src/lib/config/weaponConfigSchema';
import { pointsFromValue, STOCK_CURVE_POINTS, STOCK_RELEASE_CURVE } from '../src/lib/config/releaseCurve';
import { supportsCategory, type ConfigEntry } from '../src/lib/config/types';
import { NotesProvider } from '../src/lib/notes/NotesContext';
import type { ConfigState, ConfigValue } from '../src/lib/store/configStore';
import type { ReviewEntry } from '../src/lib/platform/live-configurations';

// Where a release curve shows, what writes it (stab-curve-keys#04), what the editor dialog holds (#05) and what its preview says (#06), as the value editor tests do it: static markup, no gestures. The gestures map onto the pure edits in release-curve.test.ts.

const curve = WEAPON_CONFIG_OPTIONS.Attack.find(entry => entry.configKey === 'ReleaseCurve')!;
const windup = WEAPON_CONFIG_OPTIONS.Attack.find(entry => entry.configKey === 'Windup')!;
const ALL = Object.values(WeaponConfigGroupName).filter(group => group !== 'General') as string[];
const FAST_START = [0, 0, 0.2, 0.9, 1, 1];
const LATE_WHIP = [0, 0, 0.8, 0.1, 1, 1];
const LONGSWORD_STAB = { database: 'Longsword', category: 'Stab' };
const none: ConfigState['values'] = { character: {}, weapons: {} };
const thumbnails = (html: string) => html.match(/class="curve-thumbnail[ "]/g)?.length ?? 0;
const STOCK_LINE = 'points="0,100 48,68 63,56 69,50 79,38 85,29 93,15 100,0"';

describe('the thumbnail', () => {
  const picture = (value: unknown) => renderToStaticMarkup(createElement(ReleaseCurveThumbnail, { value }));
  test('with no override shows the stock shape, marked as stock', () => {
    for (const value of [undefined, null]) {
      expect(picture(value)).toContain(STOCK_LINE);
      expect(picture(value)).toContain('curve-stock');
      expect(picture(value)).toContain('aria-label="Stock release curve"');
    }
  });
  test('draws an override with time across and progress up', () => {
    const html = picture(FAST_START);
    expect(html).toContain('points="0,100 20,10 100,0"');
    expect(html).not.toContain('curve-stock');
    expect(html).toContain('aria-label="Release curve: (0,0) (0.2,0.9) (1,1)"');
  });
  test('an override of the stock copy is still an override', () => {
    expect(picture(STOCK_RELEASE_CURVE)).toContain(STOCK_LINE);
    expect(picture(STOCK_RELEASE_CURVE)).not.toContain('curve-stock');
  });
  test('a value the rules refuse says so instead of drawing it', () => {
    for (const value of [[0, 0, 0.5, 0.5], [0, 0, 1], 5]) {
      const html = picture(value);
      expect(html).toContain('>Refused<');
      expect(html).not.toContain('polyline');
    }
  });
  test('holds no warning for a shape that passes, however extreme', () => {
    const html = picture([0, 0, 0.01, 1, 1, 1]);
    expect(html).not.toContain('Refused');
    expect(html).not.toMatch(/warn/i);
  });
});

describe('the attack-category limit', () => {
  test('the key is in Stab and AltStab only', () => {
    expect(ALL.filter(group => supportsCategory(curve, group))).toEqual(['Stab', 'AltStab']);
    expect(ALL.filter(group => supportsCategory(windup, group))).toEqual(ALL);
    expect(groupsTaking(curve, ALL)).toEqual(['Stab', 'AltStab']);
    expect(groupsTaking(curve, ['Strike'])).toEqual([]);
    expect(groupsTaking(windup, ALL)).toEqual(ALL);
  });
  test('a table shows its row with a stab showing, or to reset a value left in a strike', () => {
    expect(showsKey(curve, ['Strike'])).toBe(false);
    expect(showsKey(curve, ['Strike', 'AltStrike'])).toBe(false);
    expect(showsKey(curve, ['Strike', 'AltStab'])).toBe(true);
    expect(showsKey(curve, ['Stab'])).toBe(true);
    expect(showsKey(curve, ['General'])).toBe(false);
    expect(showsKey(curve, ['Strike'], { Strike: { ReleaseCurve: FAST_START } })).toBe(true);
    expect(showsKey(curve, ['Strike'], { AltStrike: { ReleaseCurve: FAST_START } })).toBe(false);
    expect(showsKey(windup, ['Strike'])).toBe(true);
  });
  test('names the key as a curve for the review, and nothing else', () => {
    expect(isReleaseCurveKey('ReleaseCurve')).toBe(true);
    for (const key of ['Windup', 'Damage', 'Release', 'Nope']) expect(isReleaseCurveKey(key), key).toBe(false);
  });
});

describe('a table row', () => {
  const row = (entry: ConfigEntry, groups: string[], Longsword: Record<string, Record<string, ConfigValue>>) => renderToStaticMarkup(createElement(NotesProvider, null, createElement(KeyRow, {
    entry, database: 'Longsword', groups, values: { character: {}, weapons: { Longsword } }, onSweep: () => {}, highlighted: false,
  })));
  test('offers a stab cell for each stab, and nothing in a strike', () => {
    const html = row(curve, ['Strike', 'Stab', 'AltStab'], {});
    expect(thumbnails(html)).toBe(2);
    expect(html).toContain('title="Strike does not take ReleaseCurve"');
    expect(html).not.toContain('Longsword Strike ReleaseCurve');
    expect(html).toContain('aria-label="Edit Longsword Stab ReleaseCurve"');
    expect(html).toContain('All weapons');
  });
  test('"Set all" writes to the stabs, even with a strike showing', () => {
    const html = row(curve, ['Strike', 'Stab', 'AltStab'], { AltStab: { ReleaseCurve: LATE_WHIP } });
    expect(html).toContain('Set all 2');
    expect(html).toContain('title="Write 0, 0, 0.8, 0.1, 1, 1 to Stab, AltStab"');
  });
  test('"Set all" copies from a stab, never a refused value left in a strike', () => {
    const html = row(curve, ['Strike', 'Stab', 'AltStab'], { Strike: { ReleaseCurve: FAST_START }, Stab: { ReleaseCurve: LATE_WHIP } });
    expect(html).toContain('title="Write 0, 0, 0.8, 0.1, 1, 1 to Stab, AltStab"');
    const onlyStrike = row(curve, ['Strike', 'Stab', 'AltStab'], { Strike: { ReleaseCurve: FAST_START } });
    expect(onlyStrike).not.toContain('Set all');
  });
  test('a value left in a strike shows with its Reset, and offers nothing that writes elsewhere', () => {
    const html = row(curve, ['Strike'], { Strike: { ReleaseCurve: FAST_START } });
    expect(html).toContain('aria-label="Reset Longsword Strike ReleaseCurve to game default"');
    expect(html).not.toContain('Set all');
    expect(html).not.toContain('All weapons');
  });
  test('a key with no limit is as it was', () => {
    const html = row(windup, ALL, { Strike: { Windup: 0.5 } });
    expect(html).toContain('Set all 4');
    expect(html).toContain('to Strike, AltStrike, Stab, AltStab');
    expect(html).not.toContain('does not take');
  });
});

describe('the All weapons sheet', () => {
  const rows = (mode: 'set' | 'reset', value: ConfigValue | undefined, values = none, selected: ReadonlySet<string> = new Set(weapons)) =>
    sweepRows({ entry: curve, groups: groupsTaking(curve, ALL), values, mode, value, base: undefined, selected });
  test('offers only Set and Reset for this key', () => {
    expect(sweepModes(curve)).toEqual(['set', 'reset']);
    expect(sweepModes(windup)).toEqual(['set', 'multiply', 'add', 'reset']);
  });
  test('Set writes to Stab and AltStab of each selected weapon, and nowhere else', () => {
    const groups = groupsTaking(curve, ALL);
    const changes = sweepChanges(rows('set', FAST_START), groups, curve.configKey);
    expect(changes).toHaveLength(weapons.length * 2);
    expect(new Set(changes.map(change => change.category))).toEqual(new Set(['Stab', 'AltStab']));
    expect(changes.every(change => change.key === 'ReleaseCurve' && change.value === FAST_START)).toBe(true);
    expect(sweepChanges(rows('set', FAST_START, none, new Set(['Rapier'])), groups, curve.configKey).map(({ database, category }) => [database, category])).toEqual([['Rapier', 'Stab'], ['Rapier', 'AltStab']]);
  });
  test('Set leaves a cell that already holds the curve, and Reset removes only overrides', () => {
    const groups = groupsTaking(curve, ALL);
    const values = { character: {}, weapons: { Rapier: { Stab: { ReleaseCurve: FAST_START } }, Spear: { AltStab: { ReleaseCurve: LATE_WHIP } } } };
    expect(sweepChanges(rows('set', FAST_START, values), groups, curve.configKey)).toHaveLength(weapons.length * 2 - 1);
    expect(sweepChanges(rows('reset', undefined, values), groups, curve.configKey)).toEqual([
      { database: 'Rapier', category: 'Stab', key: 'ReleaseCurve', value: null },
      { database: 'Spear', category: 'AltStab', key: 'ReleaseCurve', value: null },
    ]);
  });
  test('starts from the first stored curve it could set, never a bad shape', () => {
    expect(sweepStart(curve, [undefined, FAST_START])).toEqual(FAST_START);
    expect(sweepStart(curve, [[0, 0, 0.5, 0.5], LATE_WHIP])).toEqual(LATE_WHIP);
    expect(sweepStart(curve, [[0, 0, 0.5, 0.5]])).toBeUndefined();
    expect(sweepStart(curve, [undefined, undefined])).toBeUndefined();
    // Any other key starts from its first stored value, as it did.
    expect(sweepStart(windup, [undefined, 0.5])).toBe(0.5);
  });
  test('has nothing to write with no value, or one with a bad shape', () => {
    const groups = groupsTaking(curve, ALL);
    for (const value of [undefined, [0, 0, 0.5, 0.5], [0, 0, 1], [0, 0, 0.205, 0.9, 1, 1]]) {
      expect(sweepSettable(curve, value)).toBe(false);
      expect(sweepChanges(rows('set', value), groups, curve.configKey)).toEqual([]);
    }
    expect(sweepSettable(curve, FAST_START)).toBe(true);
    // Only a curve is judged here: a multiplier below a key's minimum is still a multiplier.
    expect(sweepSettable(windup, 0.9)).toBe(true);
  });
  const list = (mode: 'set' | 'reset', value: ConfigValue | undefined, values = none, selected: ReadonlySet<string> = new Set(weapons)) => renderToStaticMarkup(createElement(SweepList, {
    entry: curve, groups: ['Stab', 'AltStab'], rows: rows(mode, value, values, selected), mode, showsAfter: mode === 'reset' || sweepSettable(curve, value), disabled: false, onSelect: () => {},
  }));
  test('shows pictures in place of the stored value and what it will be', () => {
    const html = list('set', FAST_START);
    expect(thumbnails(html)).toBe(weapons.length * 4);
    expect(html.split('points="0,100 20,10 100,0"').length - 1).toBe(weapons.length * 2);
    expect(html.split(STOCK_LINE).length - 1).toBe(weapons.length * 2);
  });
  test('shows no After with nothing to set yet, and the stock shape as what Reset leaves', () => {
    expect(thumbnails(list('set', undefined))).toBe(weapons.length * 2);
    const values = { character: {}, weapons: { Rapier: { Stab: { ReleaseCurve: FAST_START } } } };
    const reset = list('reset', undefined, values);
    expect(thumbnails(reset)).toBe(weapons.length * 4);
    expect(reset.split('points="0,100 20,10 100,0"').length - 1).toBe(1);
  });
});

describe('the editor dialog', () => {
  const writes: unknown[] = [];
  const editor = (value: ConfigValue | undefined, { reset = true, savesToDraft = true } = {}) => renderToStaticMarkup(createElement(ReleaseCurveEditor, {
    value, savesToDraft, attack: LONGSWORD_STAB, onChange: next => writes.push(next), onReset: reset ? () => writes.push('reset') : undefined,
  }));
  const sliders = (html: string) => [...html.matchAll(/role="slider"[^>]*aria-valuetext="([^"]*)"/g)].map(match => match[1]);
  /** The number fields, as label and value. */
  const fields = (html: string) => [...html.matchAll(/<input[^>]*aria-label="([^"]*)"[^>]*value="([^"]*)"/g)].map(match => `${match[1]} = ${match[2]}`);
  const addPointOff = /<button[^>]*disabled=""[^>]*>(<svg.*?<\/svg>)?Add point/;
  const STOCK_FIELDS = [[2, '0.48', '0.32'], [3, '0.63', '0.44'], [4, '0.69', '0.50'], [5, '0.79', '0.62'], [6, '0.85', '0.71'], [7, '0.93', '0.85']].flatMap(([point, time, progress]) => [`Point ${point} time = ${time}`, `Point ${point} progress = ${progress}`]);

  describe('with no override', () => {
    const html = editor(undefined);
    test('draws the stock shape with its inner points to drag, and no endpoints among them', () => {
      expect(sliders(html)).toEqual(['Time 0.48, progress 0.32', 'Time 0.63, progress 0.44', 'Time 0.69, progress 0.50', 'Time 0.79, progress 0.62', 'Time 0.85, progress 0.71', 'Time 0.93, progress 0.85']);
    });
    test('has a number field for each of those, and none for the endpoints', () => {
      expect(fields(html)).toEqual(STOCK_FIELDS);
      expect(html).not.toContain('Point 1 time');
      expect(html).not.toContain('Point 8 time');
    });
    test('says there is no override, and has nothing to reset', () => {
      expect(html).toContain('No override');
      expect(html).not.toContain('Reset to stock');
    });
    test('says the eight points of the stock shape are the limit, with Add point off', () => {
      expect(html).toContain('8 points is the limit');
      expect(html).toMatch(addPointOff);
    });
    test('offers the four starter shapes', () => {
      for (const name of ['Stock', 'Steady', 'Fast start', 'Late whip']) expect(html).toContain(`aria-label="Use the ${name} starter shape"`);
    });
    test('says nothing about a save, since opening made none', () => {
      expect(html).not.toContain('Saved');
      expect(html).not.toContain('Saving');
    });
  });

  describe('with an override', () => {
    const html = editor(FAST_START);
    test('draws its own points', () => {
      expect(sliders(html)).toEqual(['Time 0.20, progress 0.90']);
      expect(fields(html)).toEqual(['Point 2 time = 0.20', 'Point 2 progress = 0.90']);
    });
    test('offers Reset, which takes it back to the stock curve', () => {
      expect(html).toContain('Reset to stock');
      expect(html).not.toContain('No override');
    });
    test('has room for more points, with Add point on and no limit named', () => {
      expect(html).not.toContain('8 points is the limit');
      expect(html).toContain('Add point');
      expect(html).not.toMatch(addPointOff);
    });
    test('a copy of the stock shape is still an override, with Reset', () => {
      const stockCopy = editor(STOCK_RELEASE_CURVE);
      expect(stockCopy).toContain('Reset to stock');
      expect(fields(stockCopy)).toEqual(STOCK_FIELDS);
    });
    test('a curve with no inner points offers nothing to drag, and room to add', () => {
      const steady = editor([0, 0, 1, 1]);
      expect(sliders(steady)).toEqual([]);
      expect(fields(steady)).toEqual([]);
      expect(steady).not.toMatch(addPointOff);
    });
    test('has no OK or Cancel, as each change saves by itself', () => {
      for (const text of ['>OK<', '>Cancel<', '>Save<', '>Done<']) expect(html).not.toContain(text);
      expect(html).toContain('Each change saves to the Draft');
    });
  });

  describe('a shape that passes the rules', () => {
    const extremes: [string, number[]][] = [
      ['all the movement in the first 1%', [0, 0, 0.01, 1, 1, 1]],
      ['all the movement in the last 1%', [0, 0, 0.99, 0, 1, 1]],
      ['a long flat stretch', [0, 0, 0.01, 0.5, 0.99, 0.5, 1, 1]],
    ];
    for (const [name, value] of extremes) test(`shows no warning, with ${name}`, () => {
      const html = editor(value);
      expect(html).not.toMatch(/warn|extreme|steep|caution|careful|role="alert"/i);
      expect(html).toContain('Reset to stock');
    });
  });

  describe('on the All weapons sheet', () => {
    test('says the curve waits on the sheet, not that it saves to the Draft', () => {
      const html = editor(FAST_START, { reset: false, savesToDraft: false });
      expect(html).toContain('until you save it there');
      expect(html).not.toContain('saves to the Draft');
    });
    test('has no Reset of its own: the sheet has that as a mode', () => {
      expect(editor(FAST_START, { reset: false, savesToDraft: false })).not.toContain('Reset to stock');
    });
    test('with nothing chosen yet, says so', () => {
      const html = editor(undefined, { reset: false, savesToDraft: false });
      expect(html).toContain('Nothing chosen yet');
      expect(html).not.toContain('No override');
    });
  });

  test('holds the preview, timed by the attack it was opened on', () => {
    const html = editor(FAST_START);
    expect(html).toContain('Reaches half its movement');
    expect(html).toContain('Longsword · Stab');
    expect(html).toContain('0.04 s');
  });

  test('with no attack to time it by, the preview gives no seconds', () => {
    const html = renderToStaticMarkup(createElement(ReleaseCurveEditor, { value: FAST_START, savesToDraft: false, onChange: () => {} }));
    expect(html).toContain('no single usable Release');
    expect(html).not.toMatch(/\d s\b/);
  });

  test('rendering it, with or without an override, writes nothing', () => {
    expect(writes).toEqual([]);
  });
});

describe('the Apply review', () => {
  const review = (props: { entries: Partial<ReviewEntry>[]; addedToDefault?: boolean }) => renderToStaticMarkup(createElement(ReviewList, {
    title: 'Changes', addedToDefault: props.addedToDefault,
    entries: props.entries.map(entry => ({ database: 'Longsword', category: 'Stab', key: 'ReleaseCurve', ...entry })),
  }));
  test('a changed curve shows the old and new pictures', () => {
    const html = review({ entries: [{ live: LATE_WHIP, draft: FAST_START }] });
    expect(thumbnails(html)).toBe(2);
    expect(html).toContain('points="0,100 80,90 100,0"');
    expect(html).toContain('points="0,100 20,10 100,0"');
    expect(html).not.toContain('0.2,0.9,1,1');
  });
  test('an added curve shows what it replaces, the stock shape', () => {
    const html = review({ entries: [{ draft: FAST_START }], addedToDefault: true });
    expect(html).toContain(STOCK_LINE);
    expect(html).toContain('points="0,100 20,10 100,0"');
  });
  test('before the first Apply, an added curve shows only itself', () => {
    const html = review({ entries: [{ draft: FAST_START }] });
    expect(thumbnails(html)).toBe(1);
    expect(html).not.toContain(STOCK_LINE);
  });
  test('a reset curve shows the stock shape it returns to', () => {
    const html = review({ entries: [{ live: FAST_START }] });
    expect(thumbnails(html)).toBe(2);
    expect(html).toContain(STOCK_LINE);
    expect(html).not.toContain('game default');
  });
  test('a refused curve says so, and any other key reads as it did', () => {
    expect(review({ entries: [{ draft: [0, 0, 0.5, 0.5] }] })).toContain('>Refused<');
    const other = review({ entries: [{ key: 'Windup', live: 0.5, draft: 0.6 }, { key: 'Damage', live: [1, 2] }] });
    expect(thumbnails(other)).toBe(0);
    expect(other).toContain('0.5');
    expect(other).toContain('[1,2]');
    expect(other).toContain('game default');
  });
});

describe('the stab preview', () => {
  const none: ConfigState['values'] = { character: {}, weapons: {} };
  const draftWith = (Release: ConfigValue): ConfigState['values'] => ({ character: {}, weapons: { Longsword: { Stab: { Release } } } });

  describe("the Release that times it", () => {
    test('is the default with nothing in the Draft, for that weapon and category', () => {
      expect(previewRelease(none, 'Longsword', 'Stab')).toEqual({ seconds: 0.35, fromDraft: false });
    });
    test("is the Draft's override when there is one", () => {
      expect(previewRelease(draftWith(0.5), 'Longsword', 'Stab')).toEqual({ seconds: 0.5, fromDraft: true });
      // An override elsewhere changes nothing here.
      expect(previewRelease(draftWith(0.5), 'Longsword', 'AltStab')?.fromDraft).toBe(false);
    });
    test('falls back to the default after a Reset', () => {
      expect(previewRelease(draftWith(null), 'Longsword', 'Stab')).toEqual({ seconds: 0.35, fromDraft: false });
    });
    test('is nothing for a stored value that cannot time a stab, not the default instead', () => {
      for (const value of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY, 'x', true, [0.3]]) expect(previewRelease(draftWith(value), 'Longsword', 'Stab'), String(value)).toBeUndefined();
    });
    test('is nothing with no default to go on', () => {
      expect(previewRelease(none, 'NotAWeapon', 'Stab')).toBeUndefined();
      expect(previewRelease(none, 'Longsword', 'NotACategory')).toBeUndefined();
    });
    test('exists for both stabs of every weapon on the roster today', () => {
      for (const weapon of weapons) for (const category of ['Stab', 'AltStab']) expect(previewRelease(none, weapon, category), `${weapon} ${category}`).toBeDefined();
    });
  });

  const preview = (value: number[], { seconds = 0.35, fromDraft = false, onSheet = false, reducedMotion = false, known = true, overridden = true } = {}) => renderToStaticMarkup(createElement(StabPreviewView, {
    points: pointsFromValue(value)!, overridden, attack: LONGSWORD_STAB, release: known ? { seconds, fromDraft } : undefined, onSheet, reducedMotion,
  }));
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  /** Each lane's held place, in the order they are drawn. */
  const held = (html: string) => [...html.matchAll(/--stab-progress:([\d.]+)/g)].map(match => Number(match[1]));

  describe('the readout', () => {
    test('compares each with stock on the 1.1 x clock, for a 0.35 s Release', () => {
      const fast = text(preview(FAST_START));
      expect(fast).toContain('This stab 0.04 s');
      expect(fast).toContain('Stock 0.27 s');
      expect(fast).toContain('0.23 s sooner than stock');
      const late = text(preview(LATE_WHIP));
      expect(late).toContain('This stab 0.34 s');
      expect(late).toContain('Stock 0.27 s');
      expect(late).toContain('0.07 s later than stock');
    });
    test('says the same as stock for the stock shape', () => {
      const same = text(preview(STOCK_RELEASE_CURVE));
      expect(same).toContain('This stab 0.27 s');
      expect(same).toContain('Same as stock');
    });
    test('follows the Release it is given', () => {
      const html = text(preview(FAST_START, { seconds: 0.5, fromDraft: true }));
      expect(html).toContain('This stab 0.06 s');
      expect(html).toContain('Stock 0.38 s');
      expect(html).toContain('a 0.55 s stab, 1.1 × its Release of 0.5 s in your Draft');
    });
    test('names where its clock comes from', () => {
      expect(text(preview(FAST_START))).toContain('Longsword · Stab: a 0.385 s stab, 1.1 × its Release of 0.35 s by default');
    });
    test('says movement, and never claims anything about a hit', () => {
      for (const options of [{}, { reducedMotion: true }, { known: false }, { onSheet: true }]) {
        const html = text(preview(FAST_START, options));
        expect(html).toContain('movement');
        expect(html).not.toMatch(/\bhits?\b|\bhitting\b|connect|land/i);
      }
    });
    test('on the sheet, names the attack it stands on and says others differ', () => {
      const html = text(preview(FAST_START, { onSheet: true }));
      expect(html).toContain('Timed as Longsword · Stab, where you opened this sheet');
      expect(html).toContain('Other weapons follow their own Release');
    });
  });

  describe('playing', () => {
    test('offers slow motion, and starts both stabs from the start on one clock', () => {
      const html = preview(FAST_START);
      expect(text(html)).toContain('Slow motion');
      expect(text(html)).toContain('real speed');
      expect(held(html)).toEqual([0, 0]);
      expect(html).not.toContain('Play once');
    });
    test('draws no override in its neutral colour', () => {
      expect(preview(FAST_START)).toContain('stab-preview is-override');
      expect(preview(STOCK_RELEASE_CURVE, { overridden: false })).not.toContain('is-override');
    });
    test('marks where each tenth of the time falls, along straight lines', () => {
      const ticks = [...preview(FAST_START).matchAll(/class="stab-tick" style="left:([\d.]+)%/g)].map(match => Number(match[1]));
      expect(ticks).toHaveLength(18);
      expect(ticks[0]).toBeCloseTo(45, 8); // Fast start at a tenth of the time.
      expect(ticks[1]).toBeCloseTo(90, 8);
      expect(ticks[9]).toBeCloseTo(100 * 0.32 * 0.1 / 0.48, 8); // Stock at a tenth of the time.
    });
  });

  describe('with reduced motion on', () => {
    const html = preview(FAST_START, { reducedMotion: true });
    test('holds still at the moment this stab reaches half, with stock where it is then', () => {
      const [mine, stock] = held(html);
      expect(mine).toBe(0.5);
      expect(stock).toBeCloseTo(0.32 / 0.48 * (0.5 / 0.9 * 0.2), 8);
      expect(text(html)).toContain('Reduced motion is on');
    });
    test('keeps the readout', () => {
      expect(text(html)).toContain('This stab 0.04 s');
      expect(text(html)).toContain('0.23 s sooner than stock');
    });
    test('starts only when asked, once', () => {
      expect(html).toContain('Play once');
    });
    test('marks the stock lane past half only when it is', () => {
      const late = preview(LATE_WHIP, { reducedMotion: true });
      expect(late.match(/data-past-half/g)?.length).toBe(2);
      expect(html.match(/data-past-half/g)?.length).toBe(1);
    });
  });

  describe('with no known Release', () => {
    const html = text(preview(FAST_START, { known: false }));
    test('gives shares of the release and no seconds, and says why', () => {
      expect(html).toContain('This stab 11%');
      expect(html).toContain('Stock 69%');
      expect(html).toContain('Sooner than stock');
      expect(html).toContain('Longsword · Stab has no single usable Release');
      expect(html).not.toMatch(/\d s\b/);
    });
    test('holds still, with nothing to play: no real speed to play at', () => {
      const markup = preview(FAST_START, { known: false });
      expect(held(markup)[0]).toBe(0.5);
      expect(html).toContain('no usable Release there is no real speed to play at');
      expect(markup).not.toContain('Play once');
      expect(markup).not.toContain('role="switch"');
    });
    test('with no attack either, names none', () => {
      const unnamed = text(renderToStaticMarkup(createElement(StabPreviewView, { points: STOCK_CURVE_POINTS, overridden: false, attack: undefined, release: undefined, onSheet: true, reducedMotion: false })));
      expect(unnamed).toContain('this has no single usable Release');
      expect(unnamed).toContain('Same as stock');
      expect(unnamed).not.toContain('undefined');
    });
  });

  describe('the clock', () => {
    const FRAME = 1 / 60;
    const start: StabClock = { moved: 0, waited: 0 };
    /** Frames until the clock has gone through one whole stab, as the seconds spent moving. */
    function timeMoving(duration: number, speed: number) {
      let clock = start;
      let spent = 0;
      for (let frame = 0; frame < 100000; frame++) {
        const next = advanceStabClock(clock, FRAME, duration, speed);
        if (next.moved > clock.moved) spent += FRAME;
        if (next.moved === duration) return spent;
        clock = next;
      }
      throw new Error('never finished');
    }
    test('runs a stab in real time, and slowed by the speed', () => {
      expect(Math.abs(timeMoving(0.385, 1) - 0.385)).toBeLessThan(FRAME * 1.5);
      expect(Math.abs(timeMoving(0.385, 0.25) - 0.385 * 4)).toBeLessThan(FRAME * 1.5);
    });
    test('waits a beat first, rests at the end, then loops', () => {
      let clock = start;
      const seen = new Set<string>();
      for (let frame = 0; frame < 200; frame++) {
        clock = advanceStabClock(clock, FRAME, 0.385, 1);
        seen.add(clock.moved === 0 ? 'start' : clock.moved === 0.385 ? 'end' : 'moving');
        if (seen.size === 3 && clock.moved === 0) return;
      }
      throw new Error(`did not loop: ${[...seen]}`);
    });
    test('does not move on a frame with no time in it, as when a hidden page comes back', () => {
      const moving = { moved: 0.1, waited: 0 };
      expect(advanceStabClock(moving, 0, 0.385, 1)).toEqual(moving);
    });
    test('keeps its place when the speed changes', () => {
      const moving = { moved: 0.1, waited: 0 };
      expect(advanceStabClock(moving, 0.1, 0.385, 0.25).moved).toBeCloseTo(0.125, 10);
      expect(advanceStabClock(moving, 0.1, 0.385, 1).moved).toBeCloseTo(0.2, 10);
    });
    test('copes with the duration changing under it', () => {
      const shorter = advanceStabClock({ moved: 0.3, waited: 0 }, FRAME, 0.2, 1);
      expect(shorter.moved).toBe(0.3); // Past the end now, so it rests and starts again.
      expect(advanceStabClock({ moved: 0.3, waited: 0.69 }, FRAME, 0.2, 1)).toEqual({ moved: 0, waited: 0 });
      expect(advanceStabClock({ moved: 0.3, waited: 0.5 }, FRAME, 0.6, 1).moved).toBeCloseTo(0.3 + FRAME, 10);
    });
  });
});
