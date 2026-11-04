import { describe, expect, test } from 'bun:test';
import { formatFloatArray } from '../src/lib/config/formatters';
import { acceptedCurvePoints, addCurvePoint, addCurvePointAfter, addedPointIndex, curveError, curveValueError, halfMovementTime, MAX_CURVE_POINTS, MIN_CURVE_POINTS, moveCurvePoint, newCurvePoint, nudgeCurvePoint, pointsFromValue, progressAtTime, removeCurvePoint, sameCurve, stabDuration, STAB_RELEASE_FACTOR, starterShape, STARTER_SHAPES, STOCK_CURVE_POINTS, STOCK_RELEASE_CURVE, valueFromPoints, type CurvePoint } from '../src/lib/config/releaseCurve';

// The curve module: the flat array and points, the shape rules (stab-curve-keys#04), the edits and starter shapes (#05), and what the preview reads from a curve (#06).

const FAST_START = [0, 0, 0.2, 0.9, 1, 1];

describe('the flat array and points', () => {
  test('a stored value is the same flat array as its points', () => {
    expect(pointsFromValue(FAST_START)).toEqual([{ time: 0, progress: 0 }, { time: 0.2, progress: 0.9 }, { time: 1, progress: 1 }]);
    expect(valueFromPoints(pointsFromValue(FAST_START)!)).toEqual(FAST_START);
  });
  test('values that do not pair up have no points', () => {
    expect(pointsFromValue([0, 0, 1])).toBeUndefined();
    expect(pointsFromValue([])).toEqual([]);
  });
  test('a value the rules refuse has no points to draw, whatever it holds', () => {
    expect(acceptedCurvePoints(FAST_START)).toEqual(pointsFromValue(FAST_START)!);
    for (const value of [[0, 0, 0.5, 0.5], [0, 0, 1], 5, 'x', { x: 1 }, [0, 'x'], null]) expect(acceptedCurvePoints(value), JSON.stringify(value)).toBeUndefined();
  });
});

describe('the stock shape', () => {
  test("is the spec's 8-point copy, and passes the rules", () => {
    expect(STOCK_RELEASE_CURVE).toEqual([0, 0, 0.48, 0.32, 0.63, 0.44, 0.69, 0.5, 0.79, 0.62, 0.85, 0.71, 0.93, 0.85, 1, 1]);
    expect(STOCK_CURVE_POINTS).toHaveLength(MAX_CURVE_POINTS);
    expect(curveError(STOCK_CURVE_POINTS)).toBeUndefined();
    expect(curveValueError(STOCK_RELEASE_CURVE)).toBeUndefined();
  });
});

describe('the shape rules', () => {
  test('accept a curve however extreme, without a limit on how steep or flat it is', () => {
    expect([MIN_CURVE_POINTS, MAX_CURVE_POINTS]).toEqual([2, 8]);
    for (const value of [
      [0, 0, 1, 1], // Steady
      FAST_START,
      [0, 0, 0.8, 0.1, 1, 1], // Late whip
      [0, 0, 0.01, 1, 1, 1], // All the movement in the first 1%.
      [0, 0, 0.99, 0, 1, 1], // All the movement in the last 1%.
      [0, 0, 0.5, 0.5, 0.75, 0.5, 1, 1], // A flat stretch.
      [0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 1, 1], // 8 points.
    ]) expect(curveValueError(value), JSON.stringify(value)).toBeUndefined();
  });
  const refused: [string, unknown, string][] = [
    ['no points', [], 'Use 2 to 8 points; this curve has 0.'],
    ['one point', [0, 0], 'Use 2 to 8 points; this curve has 1.'],
    ['nine points', [0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 1, 1], 'Use 2 to 8 points; this curve has 9.'],
    ['values that do not pair up', [0, 0, 1], 'Use time and progress pairs; this curve has 3 values.'],
    ['a time without its progress at the end', [0, 0, 0.5, 0.5, 1, 1, 1], 'Use time and progress pairs; this curve has 7 values.'],
    ['starting late', [0.01, 0, 1, 1], 'Start the curve at (0,0).'],
    ['starting part way through the movement', [0, 0.01, 1, 1], 'Start the curve at (0,0).'],
    ['ending early', [0, 0, 0.99, 1], 'End the curve at (1,1).'],
    ['stopping short of the end', [0, 0, 1, 0.99], 'End the curve at (1,1).'],
    ['two points at one time', [0, 0, 0.5, 0.5, 0.5, 0.6, 1, 1], 'Keep times increasing; point 3 is not after point 2.'],
    ['times out of order', [0, 0, 0.6, 0.5, 0.5, 0.6, 1, 1], 'Keep times increasing; point 3 is not after point 2.'],
    ['a time past the end', [0, 0, 1.5, 0.5, 1, 1], 'Keep times increasing; point 3 is not after point 2.'],
    ['a time before the start', [0, 0, -0.5, 0.5, 1, 1], 'Keep times increasing; point 2 is not after point 1.'],
    ['moving backward', [0, 0, 0.4, 0.6, 0.5, 0.5, 1, 1], 'Keep progress from going backward; point 3 is below point 2.'],
    ['progress below the start', [0, 0, 0.5, -0.5, 1, 1], 'Keep progress from going backward; point 2 is below point 1.'],
    ['overshooting', [0, 0, 0.5, 1.5, 1, 1], 'Keep progress from going backward; point 3 is below point 2.'],
    ['a time off the grid', [0, 0, 0.205, 0.9, 1, 1], 'Use values on the 0.01 grid; 0.205 is not.'],
    ['a progress off the grid', [0, 0, 0.2, 0.905, 1, 1], 'Use values on the 0.01 grid; 0.905 is not.'],
    ['rounding error kept in a value', [0, 0, 0.1 + 0.2, 0.9, 1, 1], `Use values on the 0.01 grid; ${0.1 + 0.2} is not.`],
    ['not a list', 5, 'Use a list of time and progress numbers.'],
    ['not numbers', [0, 0, 'x', 0.5, 1, 1], 'Use a list of time and progress numbers.'],
  ];
  for (const [name, value, reason] of refused) test(`refuse ${name}, with the reason`, () => expect(curveValueError(value)).toBe(reason));
  test('refuse anything JSON cannot hold, which the type check also refuses', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(curveValueError([0, 0, bad, 0.5, 1, 1])).toBeDefined();
  });
  test('every value on the grid is sent exactly as it is stored', () => {
    for (let hundredths = 0; hundredths <= 100; hundredths++) {
      const value = hundredths / 100;
      expect(Number(formatFloatArray([value]))).toBe(value);
      if (hundredths > 0 && hundredths < 100) expect(curveError([{ time: 0, progress: 0 }, { time: value, progress: value }, { time: 1, progress: 1 }]), String(value)).toBeUndefined();
    }
  });
  test('two different times on the grid cannot round to the same text', () => {
    const sent = Array.from({ length: 101 }, (_, hundredths) => formatFloatArray([hundredths / 100]));
    expect(new Set(sent).size).toBe(101);
  });
});

// Points from a flat list, as the spec writes a curve.
const curve = (...value: number[]) => pointsFromValue(value)!;
/** Every edit's result must pass the shape rules, so each test's edit goes through this. */
const passing = (points: readonly CurvePoint[]) => {
  expect(curveError(points)).toBeUndefined();
  return points;
};
const FOUR_POINTS = curve(0, 0, 0.3, 0.2, 0.6, 0.7, 1, 1);

describe('moving a point', () => {
  test('puts it where it is aimed', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 1, { time: 0.4, progress: 0.5 }))).toEqual(curve(0, 0, 0.4, 0.5, 0.6, 0.7, 1, 1));
  });
  test('snaps both numbers to the grid', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 1, { time: 0.4049, progress: 0.2951 }))).toEqual(curve(0, 0, 0.4, 0.3, 0.6, 0.7, 1, 1));
  });
  test('stops one step before the time of the point after it', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 1, { time: 0.9, progress: 0.2 }))).toEqual(curve(0, 0, 0.59, 0.2, 0.6, 0.7, 1, 1));
  });
  test('stops one step after the time of the point before it', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 2, { time: 0.1, progress: 0.7 }))).toEqual(curve(0, 0, 0.3, 0.2, 0.31, 0.7, 1, 1));
  });
  test('stops level with the progress of the point after it, which keeps a flat stretch legal', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 1, { time: 0.3, progress: 0.95 }))).toEqual(curve(0, 0, 0.3, 0.7, 0.6, 0.7, 1, 1));
  });
  test('stops level with the progress of the point before it', () => {
    expect(passing(moveCurvePoint(FOUR_POINTS, 2, { time: 0.6, progress: 0.05 }))).toEqual(curve(0, 0, 0.3, 0.2, 0.6, 0.2, 1, 1));
  });
  test('stays inside the graph when aimed far outside it', () => {
    for (const [time, progress, expected] of [[-5, -5, curve(0, 0, 0.01, 0, 0.6, 0.7, 1, 1)], [Infinity, Infinity, curve(0, 0, 0.59, 0.7, 0.6, 0.7, 1, 1)]] as const) {
      expect(passing(moveCurvePoint(FOUR_POINTS, 1, { time, progress }))).toEqual(expected);
    }
  });
  test('leaves the endpoints where they are', () => {
    for (const index of [0, 3]) expect(moveCurvePoint(FOUR_POINTS, index, { time: 0.5, progress: 0.5 })).toBe(FOUR_POINTS);
  });
  test('does nothing for a point that is not there, or aimed at something that is not a number', () => {
    for (const index of [-1, 4, 1.5]) expect(moveCurvePoint(FOUR_POINTS, index, { time: 0.5, progress: 0.5 })).toBe(FOUR_POINTS);
    expect(moveCurvePoint(FOUR_POINTS, 1, { time: NaN, progress: 0.5 })).toBe(FOUR_POINTS);
    expect(moveCurvePoint(FOUR_POINTS, 1, { time: 0.5, progress: NaN })).toBe(FOUR_POINTS);
  });
  test('hands back the same points when the move changes nothing, so a press and release is no edit', () => {
    expect(moveCurvePoint(FOUR_POINTS, 1, { time: 0.3, progress: 0.2 })).toBe(FOUR_POINTS);
    expect(moveCurvePoint(FOUR_POINTS, 1, { time: 0.302, progress: 0.198 })).toBe(FOUR_POINTS);
  });
  test('leaves the points it was given alone', () => {
    const before = structuredClone(FOUR_POINTS);
    moveCurvePoint(FOUR_POINTS, 1, { time: 0.4, progress: 0.5 });
    expect(FOUR_POINTS).toEqual(before);
  });
  test('can use every step between two neighbours without leaving the grid', () => {
    for (let hundredths = 1; hundredths < 100; hundredths++) {
      const moved = moveCurvePoint(curve(0, 0, 0.5, 0.5, 1, 1), 1, { time: hundredths / 100, progress: hundredths / 100 });
      passing(moved);
      expect(moved[1]).toEqual({ time: hundredths / 100, progress: hundredths / 100 });
    }
  });
});

describe('nudging a point', () => {
  test('moves it one step along the axis asked for', () => {
    expect(passing(nudgeCurvePoint(FOUR_POINTS, 1, 1, 0))).toEqual(curve(0, 0, 0.31, 0.2, 0.6, 0.7, 1, 1));
    expect(passing(nudgeCurvePoint(FOUR_POINTS, 1, -1, 0))).toEqual(curve(0, 0, 0.29, 0.2, 0.6, 0.7, 1, 1));
    expect(passing(nudgeCurvePoint(FOUR_POINTS, 1, 0, 1))).toEqual(curve(0, 0, 0.3, 0.21, 0.6, 0.7, 1, 1));
    expect(passing(nudgeCurvePoint(FOUR_POINTS, 1, 0, -1))).toEqual(curve(0, 0, 0.3, 0.19, 0.6, 0.7, 1, 1));
  });
  test('lands exactly on the grid where adding 0.01 would not', () => {
    // 0.07 + 0.01 is 0.08000000000000002 in floating point.
    expect(passing(nudgeCurvePoint(curve(0, 0, 0.07, 0.07, 1, 1), 1, 1, 1))).toEqual(curve(0, 0, 0.08, 0.08, 1, 1));
  });
  test('walks up to a neighbour and stops there, a step at a time', () => {
    let points: readonly CurvePoint[] = curve(0, 0, 0.3, 0.2, 0.33, 0.21, 1, 1);
    for (let press = 0; press < 5; press++) points = passing(nudgeCurvePoint(points, 1, 1, 1));
    expect(points).toEqual(curve(0, 0, 0.32, 0.21, 0.33, 0.21, 1, 1));
    expect(nudgeCurvePoint(points, 1, 1, 1)).toBe(points);
  });
  test('leaves the endpoints where they are', () => {
    for (const index of [0, 3]) expect(nudgeCurvePoint(FOUR_POINTS, index, 1, 1)).toBe(FOUR_POINTS);
  });
});

describe('removing a point', () => {
  test('takes it out and joins its neighbours', () => {
    expect(passing(removeCurvePoint(FOUR_POINTS, 1))).toEqual(curve(0, 0, 0.6, 0.7, 1, 1));
    expect(passing(removeCurvePoint(FOUR_POINTS, 2))).toEqual(curve(0, 0, 0.3, 0.2, 1, 1));
  });
  test('can take a curve down to Steady, and no further', () => {
    const steady = passing(removeCurvePoint(curve(0, 0, 0.5, 0.5, 1, 1), 1));
    expect(steady).toEqual(curve(0, 0, 1, 1));
    expect(removeCurvePoint(steady, 0)).toBe(steady);
    expect(removeCurvePoint(steady, 1)).toBe(steady);
  });
  test('leaves the endpoints, and a point that is not there', () => {
    for (const index of [0, 3, -1, 4, 1.5]) expect(removeCurvePoint(FOUR_POINTS, index)).toBe(FOUR_POINTS);
  });
});

describe('adding a point', () => {
  const SEVEN = curve(0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 1, 1);
  const EIGHT = curve(0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 1, 1);
  test('puts it in time order, where it is aimed', () => {
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: 0.25, progress: 0.75 }))).toEqual(curve(0, 0, 0.25, 0.75, 1, 1));
    expect(passing(addCurvePoint(FOUR_POINTS, { time: 0.1, progress: 0.15 }))).toEqual(curve(0, 0, 0.1, 0.15, 0.3, 0.2, 0.6, 0.7, 1, 1));
    expect(passing(addCurvePoint(FOUR_POINTS, { time: 0.8, progress: 0.9 }))).toEqual(curve(0, 0, 0.3, 0.2, 0.6, 0.7, 0.8, 0.9, 1, 1));
  });
  test('snaps both numbers to the grid', () => {
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: 0.2549, progress: 0.7451 }))).toEqual(curve(0, 0, 0.25, 0.75, 1, 1));
  });
  test('keeps progress between the points on either side', () => {
    expect(passing(addCurvePoint(FOUR_POINTS, { time: 0.4, progress: 0.95 }))).toEqual(curve(0, 0, 0.3, 0.2, 0.4, 0.7, 0.6, 0.7, 1, 1));
    expect(passing(addCurvePoint(FOUR_POINTS, { time: 0.4, progress: 0.01 }))).toEqual(curve(0, 0, 0.3, 0.2, 0.4, 0.2, 0.6, 0.7, 1, 1));
  });
  test('aimed at a time a point already has, takes the nearest free time', () => {
    expect(passing(addCurvePoint(curve(0, 0, 0.5, 0.5, 1, 1), { time: 0.5, progress: 0.6 }))).toEqual(curve(0, 0, 0.5, 0.5, 0.51, 0.6, 1, 1));
    expect(passing(addCurvePoint(curve(0, 0, 0.5, 0.5, 0.51, 0.6, 1, 1), { time: 0.5, progress: 0.3 }))).toEqual(curve(0, 0, 0.49, 0.3, 0.5, 0.5, 0.51, 0.6, 1, 1));
  });
  test('aimed at or past an end, lands just inside it', () => {
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: 0, progress: 0 }))).toEqual(curve(0, 0, 0.01, 0, 1, 1));
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: 1, progress: 1 }))).toEqual(curve(0, 0, 0.99, 1, 1, 1));
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: -3, progress: 9 }))).toEqual(curve(0, 0, 0.01, 1, 1, 1));
    expect(passing(addCurvePoint(curve(0, 0, 1, 1), { time: 9, progress: -3 }))).toEqual(curve(0, 0, 0.99, 0, 1, 1));
  });
  test('takes the eighth point, and at the limit of 8 adds nothing', () => {
    const eighth = passing(addCurvePoint(SEVEN, { time: 0.75, progress: 0.75 }));
    expect(eighth).toHaveLength(MAX_CURVE_POINTS);
    expect(addCurvePoint(eighth, { time: 0.9, progress: 0.9 })).toBe(eighth);
    expect(addCurvePoint(EIGHT, { time: 0.8, progress: 0.8 })).toBe(EIGHT);
    expect(addCurvePointAfter(EIGHT, 1)).toBe(EIGHT);
    expect(addCurvePointAfter(EIGHT)).toBe(EIGHT);
  });
  test('adds nothing when aimed at something that is not a number', () => {
    expect(addCurvePoint(FOUR_POINTS, { time: NaN, progress: 0.5 })).toBe(FOUR_POINTS);
    expect(addCurvePoint(FOUR_POINTS, { time: 0.5, progress: NaN })).toBe(FOUR_POINTS);
  });
  test('says where a new point would land, before it is added, as the graph shows it', () => {
    expect(newCurvePoint(FOUR_POINTS, { time: 0.4, progress: 0.95 })).toEqual({ time: 0.4, progress: 0.7 });
    expect(newCurvePoint(EIGHT, { time: 0.8, progress: 0.8 })).toBeUndefined();
  });
  test('names the index of the point it added', () => {
    const added = addCurvePoint(FOUR_POINTS, { time: 0.4, progress: 0.5 });
    expect(addedPointIndex(FOUR_POINTS, added)).toBe(2);
    expect(addedPointIndex(FOUR_POINTS, FOUR_POINTS)).toBe(-1);
  });
  test('leaves the points it was given alone', () => {
    const before = structuredClone(FOUR_POINTS);
    addCurvePoint(FOUR_POINTS, { time: 0.4, progress: 0.5 });
    expect(FOUR_POINTS).toEqual(before);
  });
});

// The keyboard has no place to aim at, so a new point starts on the line, for arrow keys and number fields to place.
describe('adding a point with nothing to aim at', () => {
  test('goes halfway along the line after the point named', () => {
    expect(passing(addCurvePointAfter(FOUR_POINTS, 0))).toEqual(curve(0, 0, 0.15, 0.1, 0.3, 0.2, 0.6, 0.7, 1, 1));
    expect(passing(addCurvePointAfter(FOUR_POINTS, 1))).toEqual(curve(0, 0, 0.3, 0.2, 0.45, 0.45, 0.6, 0.7, 1, 1));
    expect(passing(addCurvePointAfter(FOUR_POINTS, 2))).toEqual(curve(0, 0, 0.3, 0.2, 0.6, 0.7, 0.8, 0.85, 1, 1));
  });
  test('with no point named, or the last, goes in the widest stretch of time', () => {
    const widestIsSecond = curve(0, 0, 0.1, 0.2, 0.7, 0.4, 1, 1);
    expect(passing(addCurvePointAfter(widestIsSecond))).toEqual(curve(0, 0, 0.1, 0.2, 0.4, 0.3, 0.7, 0.4, 1, 1));
    expect(passing(addCurvePointAfter(widestIsSecond, 3))).toEqual(curve(0, 0, 0.1, 0.2, 0.4, 0.3, 0.7, 0.4, 1, 1));
  });
  test('after a point with no room behind it, goes in the widest stretch instead', () => {
    expect(passing(addCurvePointAfter(curve(0, 0, 0.5, 0.5, 0.51, 0.51, 1, 1), 1))).toEqual(curve(0, 0, 0.25, 0.25, 0.5, 0.5, 0.51, 0.51, 1, 1));
  });
  test('stays on the grid when a stretch has an odd number of steps', () => {
    const added = passing(addCurvePointAfter(curve(0, 0, 0.5, 0.5, 0.53, 0.55, 1, 1), 1));
    expect(added).toHaveLength(5);
    expect(added[2].time === 0.51 || added[2].time === 0.52).toBe(true);
  });
  test('turns Steady into a line with a point in the middle', () => {
    expect(passing(addCurvePointAfter(curve(0, 0, 1, 1)))).toEqual(curve(0, 0, 0.5, 0.5, 1, 1));
  });
});

describe('the starter shapes', () => {
  // Written out from the spec's table, not read back from the module.
  const SPEC: [string, number[]][] = [
    ['Stock', [0, 0, 0.48, 0.32, 0.63, 0.44, 0.69, 0.5, 0.79, 0.62, 0.85, 0.71, 0.93, 0.85, 1, 1]],
    ['Steady', [0, 0, 1, 1]],
    ['Fast start', [0, 0, 0.2, 0.9, 1, 1]],
    ['Late whip', [0, 0, 0.8, 0.1, 1, 1]],
  ];
  test("are the spec's four, in its order", () => {
    expect(STARTER_SHAPES.map(shape => shape.name)).toEqual(SPEC.map(([name]) => name as never));
  });
  for (const [name, value] of SPEC) {
    test(`${name} has the spec's points, and passes the rules`, () => {
      const points = starterShape(name as (typeof STARTER_SHAPES)[number]['name']);
      expect(valueFromPoints(points)).toEqual(value);
      passing(points);
    });
  }
  test('Fast start and Late whip send what the game took in the real-server pass', () => {
    expect(formatFloatArray(valueFromPoints(starterShape('Fast start')))).toBe('0.00,0.00,0.20,0.90,1.00,1.00');
    expect(formatFloatArray(valueFromPoints(starterShape('Late whip')))).toBe('0.00,0.00,0.80,0.10,1.00,1.00');
  });
  test('are copied out, so editing the copy leaves the shape as it was', () => {
    const copy = starterShape('Fast start');
    copy[1].progress = 0.5;
    copy.pop();
    expect(valueFromPoints(starterShape('Fast start'))).toEqual([0, 0, 0.2, 0.9, 1, 1]);
  });
  test('Stock has no room for a ninth point, and the others do', () => {
    const add = (name: (typeof STARTER_SHAPES)[number]['name']) => addCurvePointAfter(starterShape(name)).length;
    expect(add('Stock')).toBe(8);
    expect(add('Steady')).toBe(3);
    expect(add('Fast start')).toBe(4);
    expect(add('Late whip')).toBe(4);
  });
});

describe('comparing two curves', () => {
  test('goes by their points, not which array holds them', () => {
    expect(sameCurve(curve(0, 0, 1, 1), curve(0, 0, 1, 1))).toBe(true);
    expect(sameCurve(curve(0, 0, 1, 1), curve(0, 0, 0.5, 0.5, 1, 1))).toBe(false);
    expect(sameCurve(curve(0, 0, 0.5, 0.5, 1, 1), curve(0, 0, 0.5, 0.6, 1, 1))).toBe(false);
    expect(sameCurve(curve(0, 0, 0.5, 0.5, 1, 1), curve(0, 0, 0.6, 0.5, 1, 1))).toBe(false);
  });
});

describe('any run of edits', () => {
  // Seeded, so a failure repeats; the aim is the shape rules holding, not any one result.
  const generator = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (const { name } of STARTER_SHAPES) {
    test(`from ${name} ends every step on a shape the rules accept`, () => {
      const random = generator(name.length * 7919);
      let points: readonly CurvePoint[] = starterShape(name);
      const sizes = new Set<number>();
      for (let step = 0; step < 4000; step++) {
        // Aimed anywhere, including off the graph and off the grid; at any index, including the endpoints and ones that are not there.
        const target = { time: random() * 2 - 0.5, progress: random() * 2 - 0.5 };
        const index = Math.floor(random() * (points.length + 2)) - 1;
        const edit = Math.floor(random() * 4);
        // Stretches of mostly adding and mostly removing, so the run reaches both ends of what a curve can be.
        const growing = step % 200 < 100;
        points = edit === 0 ? nudgeCurvePoint(points, index, Math.floor(random() * 3) - 1, Math.floor(random() * 3) - 1)
          : edit === 1 ? moveCurvePoint(points, index, target)
            : !growing ? removeCurvePoint(points, index)
              : edit === 2 ? addCurvePoint(points, target)
                : addCurvePointAfter(points, random() < 0.5 ? index : undefined);
        expect(curveError(points), JSON.stringify(points)).toBeUndefined();
        expect(curveValueError(valueFromPoints(points))).toBeUndefined();
        sizes.add(points.length);
      }
      expect(sizes.has(2)).toBe(true);
      expect(sizes.has(MAX_CURVE_POINTS)).toBe(true);
    });
  }
});

describe('how far a stab has moved at a time', () => {
  test('is straight lines between the points, as keys are linear in the game', () => {
    const points = starterShape('Fast start');
    expect(progressAtTime(points, 0)).toBe(0);
    expect(progressAtTime(points, 0.1)).toBeCloseTo(0.45, 10);
    expect(progressAtTime(points, 0.2)).toBe(0.9);
    expect(progressAtTime(points, 0.6)).toBeCloseTo(0.95, 10);
    expect(progressAtTime(points, 1)).toBe(1);
  });
  test('holds through a flat part', () => {
    const points = pointsFromValue([0, 0, 0.5, 0.5, 0.75, 0.5, 1, 1])!;
    expect(progressAtTime(points, 0.5)).toBe(0.5);
    expect(progressAtTime(points, 0.6)).toBe(0.5);
    expect(progressAtTime(points, 0.75)).toBe(0.5);
  });
  test('stays at the ends for a time outside the stab', () => {
    const points = starterShape('Late whip');
    expect(progressAtTime(points, -0.5)).toBe(0);
    expect(progressAtTime(points, 1.5)).toBe(1);
  });
  test('agrees with every point of every starter shape', () => {
    for (const { points } of STARTER_SHAPES) for (const point of points) expect(progressAtTime(points, point.time)).toBe(point.progress);
  });
});

describe('the time a stab reaches half its movement', () => {
  const half = (value: number[], duration: number) => halfMovementTime(pointsFromValue(value)!, duration);
  test('is right for a 0.35 s stab on each named shape', () => {
    expect(halfMovementTime(starterShape('Fast start'), 0.35).toFixed(2)).toBe('0.04');
    expect(halfMovementTime(STOCK_CURVE_POINTS, 0.35).toFixed(2)).toBe('0.24');
    expect(halfMovementTime(starterShape('Late whip'), 0.35).toFixed(2)).toBe('0.31');
    expect(halfMovementTime(starterShape('Steady'), 0.35)).toBeCloseTo(0.175, 10);
  });
  test('is on the line between the points either side of half, not at a point', () => {
    expect(halfMovementTime(starterShape('Fast start'), 1)).toBeCloseTo(0.5 / 0.9 * 0.2, 10);
    expect(halfMovementTime(starterShape('Late whip'), 1)).toBeCloseTo(0.8 + 0.4 / 0.9 * 0.2, 10);
  });
  test('is at the start of a flat part at exactly half', () => {
    expect(half([0, 0, 0.5, 0.5, 0.75, 0.5, 1, 1], 0.35)).toBeCloseTo(0.5 * 0.35, 10);
    expect(half([0, 0, 0.01, 0.5, 0.99, 0.5, 1, 1], 0.35)).toBeCloseTo(0.01 * 0.35, 10);
    expect(half([0, 0, 0.3, 0.2, 0.4, 0.5, 0.5, 0.5, 0.6, 0.5, 1, 1], 1)).toBeCloseTo(0.4, 10);
  });
  test('passes straight through a flat part below or above half', () => {
    expect(half([0, 0, 0.2, 0.4, 0.8, 0.4, 1, 1], 1)).toBeCloseTo(0.8 + 0.1 / 0.6 * 0.2, 10);
    expect(half([0, 0, 0.2, 0.6, 0.8, 0.6, 1, 1], 1)).toBeCloseTo(0.5 / 0.6 * 0.2, 10);
  });
  test('holds at the extremes the rules allow', () => {
    expect(half([0, 0, 0.01, 1, 1, 1], 1)).toBeCloseTo(0.005, 10);
    expect(half([0, 0, 0.99, 0, 1, 1], 1)).toBeCloseTo(0.995, 10);
  });
  test('scales with the duration it is given', () => {
    expect(halfMovementTime(STOCK_CURVE_POINTS, 0.7)).toBeCloseTo(2 * halfMovementTime(STOCK_CURVE_POINTS, 0.35), 10);
    expect(halfMovementTime(STOCK_CURVE_POINTS, 1)).toBe(0.69);
  });
  test('the curve really is at half then', () => {
    for (const { points } of STARTER_SHAPES) expect(progressAtTime(points, halfMovementTime(points, 1))).toBeCloseTo(0.5, 10);
  });
});

describe('the clock', () => {
  test("is the measured 1.1 x the weapon's Release, kept in one named place", () => {
    expect(STAB_RELEASE_FACTOR).toBe(1.1);
    expect(stabDuration(0.35)).toBeCloseTo(0.385, 10);
    expect(stabDuration(1)).toBe(STAB_RELEASE_FACTOR);
  });
});
