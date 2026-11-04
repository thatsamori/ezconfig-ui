/**
 * A release curve: how a stab's movement is spread across its release, as
 * straight lines between points of time and progress. The Draft stores and the
 * command sends the same flat array of pairs with the endpoints included, for
 * example 0.00,0.00,0.20,0.90,1.00,1.00 (mod ADR 0015). Everything else here
 * takes and returns points.
 *
 * Pure, so the validation and the editor share it: the shape rules, the stock and
 * starter shapes, the edits the editor maps its gestures onto, and what the preview
 * reads from a curve. The rules start strict on purpose: loosening them later is
 * harmless, and tightening them would turn saved Live configurations Blocked. A
 * curve that passes is never refused or warned about for being extreme.
 */
export type CurvePoint = { time: number; progress: number };

export const MIN_CURVE_POINTS = 2;
export const MAX_CURVE_POINTS = 8;
const GRID_DECIMALS = 2;

/** The real stock curve is an asset in the game; this is its 8-point copy, within 0.23% of the movement at every time. */
export const STOCK_CURVE_POINTS: readonly CurvePoint[] = [
  { time: 0, progress: 0 },
  { time: 0.48, progress: 0.32 },
  { time: 0.63, progress: 0.44 },
  { time: 0.69, progress: 0.5 },
  { time: 0.79, progress: 0.62 },
  { time: 0.85, progress: 0.71 },
  { time: 0.93, progress: 0.85 },
  { time: 1, progress: 1 },
];

/** The flat array as points; undefined when its values do not pair up. */
export function pointsFromValue(value: readonly number[]): CurvePoint[] | undefined {
  if (value.length % 2) return undefined;
  const points: CurvePoint[] = [];
  for (let index = 0; index < value.length; index += 2) points.push({ time: value[index], progress: value[index + 1] });
  return points;
}

export const valueFromPoints = (points: readonly CurvePoint[]): number[] => points.flatMap(({ time, progress }) => [time, progress]);

export const STOCK_RELEASE_CURVE = valueFromPoints(STOCK_CURVE_POINTS);

/**
 * On the 0.01 grid exactly as the two-decimal command format writes it, so what is
 * stored is what is sent, and rounding cannot make two times equal.
 */
const onGrid = (value: number) => Number(value.toFixed(GRID_DECIMALS)) === value;

/**
 * Why the shape rules refuse these points; undefined when they pass. Starting at
 * (0,0), ending at (1,1), increasing in time and never going backward also keeps
 * every number between 0 and 1.
 */
export function curveError(points: readonly CurvePoint[]): string | undefined {
  if (points.length < MIN_CURVE_POINTS || points.length > MAX_CURVE_POINTS) return `Use ${MIN_CURVE_POINTS} to ${MAX_CURVE_POINTS} points; this curve has ${points.length}.`;
  for (const { time, progress } of points) {
    const off = [time, progress].find(value => !onGrid(value));
    if (off !== undefined) return `Use values on the 0.01 grid; ${off} is not.`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first.time !== 0 || first.progress !== 0) return 'Start the curve at (0,0).';
  if (last.time !== 1 || last.progress !== 1) return 'End the curve at (1,1).';
  for (let index = 1; index < points.length; index++) {
    if (points[index].time <= points[index - 1].time) return `Keep times increasing; point ${index + 1} is not after point ${index}.`;
    if (points[index].progress < points[index - 1].progress) return `Keep progress from going backward; point ${index + 1} is below point ${index}.`;
  }
  return undefined;
}

const numbers = (value: unknown): number[] | undefined => Array.isArray(value) && value.every(item => typeof item === 'number') ? value : undefined;

/** Why the shape rules refuse a stored value; undefined when they pass. */
export function curveValueError(value: unknown): string | undefined {
  const list = numbers(value);
  if (!list) return 'Use a list of time and progress numbers.';
  const points = pointsFromValue(list);
  return points ? curveError(points) : `Use time and progress pairs; this curve has ${list.length} values.`;
}

/** The points of a stored value the shape rules accept, to draw it; undefined for any other value. */
export function acceptedCurvePoints(value: unknown): CurvePoint[] | undefined {
  return curveValueError(value) ? undefined : pointsFromValue(value as number[]);
}

/*
 * The edits, each from a curve that passes to a curve that passes, so no gesture
 * can produce a shape the rules refuse. They work in whole hundredths, where the
 * limits a neighbour sets can't pick up rounding error. An edit with nothing to do
 * hands back the same points it was given.
 */
const hundredths = (value: number) => Math.round(value * 100);
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * The point moved to where it is aimed, on the grid: it stops one step short of
 * the times of its neighbours and level with their progress. The endpoints stay put.
 */
export function moveCurvePoint(points: readonly CurvePoint[], index: number, target: CurvePoint): readonly CurvePoint[] {
  if (!Number.isInteger(index) || index <= 0 || index >= points.length - 1 || Number.isNaN(target.time) || Number.isNaN(target.progress)) return points;
  const [before, after] = [points[index - 1], points[index + 1]];
  const time = clamp(hundredths(target.time), hundredths(before.time) + 1, hundredths(after.time) - 1) / 100;
  const progress = clamp(hundredths(target.progress), hundredths(before.progress), hundredths(after.progress)) / 100;
  if (time === points[index].time && progress === points[index].progress) return points;
  return points.map((point, at) => at === index ? { time, progress } : point);
}

/** The point moved by whole steps of 0.01 along each axis, as far as its neighbours allow. */
export function nudgeCurvePoint(points: readonly CurvePoint[], index: number, timeSteps: number, progressSteps: number): readonly CurvePoint[] {
  const point = points[index];
  if (!point) return points;
  return moveCurvePoint(points, index, { time: (hundredths(point.time) + timeSteps) / 100, progress: (hundredths(point.progress) + progressSteps) / 100 });
}

/** The curve without this point, which its neighbours' order keeps legal. The endpoints stay put. */
export function removeCurvePoint(points: readonly CurvePoint[], index: number): readonly CurvePoint[] {
  if (!Number.isInteger(index) || index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, at) => at !== index);
}

/**
 * Where a point aimed at `target` would land, on the grid: the nearest time no
 * point has, inside the ends, with progress between the points on either side.
 * Undefined with no room for another, at the limit of 8.
 */
export function newCurvePoint(points: readonly CurvePoint[], target: CurvePoint): CurvePoint | undefined {
  if (points.length >= MAX_CURVE_POINTS || Number.isNaN(target.time) || Number.isNaN(target.progress)) return undefined;
  const wanted = clamp(hundredths(target.time), 1, 99);
  const taken = new Set(points.map(point => hundredths(point.time)));
  // Fewer than 8 points always leave a free time among the 99 inside the ends.
  let time = wanted;
  for (let offset = 1; taken.has(time); offset++) time = [wanted + offset, wanted - offset].find(free => free >= 1 && free <= 99 && !taken.has(free)) ?? time;
  const next = points.findIndex(point => hundredths(point.time) > time);
  return { time: time / 100, progress: clamp(hundredths(target.progress), hundredths(points[next - 1].progress), hundredths(points[next].progress)) / 100 };
}

/** The curve with a point added where it is aimed; see newCurvePoint. */
export function addCurvePoint(points: readonly CurvePoint[], target: CurvePoint): readonly CurvePoint[] {
  const point = newCurvePoint(points, target);
  if (!point) return points;
  const next = points.findIndex(({ time }) => time > point.time);
  return [...points.slice(0, next), point, ...points.slice(next)];
}

/**
 * The curve with a point added halfway along the line after the point named, or
 * in the widest stretch of time when none is named or that line has no room. This
 * is adding with nothing to aim at, as from the keyboard.
 */
export function addCurvePointAfter(points: readonly CurvePoint[], index?: number): readonly CurvePoint[] {
  const steps = (at: number) => at >= 0 && at < points.length - 1 ? hundredths(points[at + 1].time) - hundredths(points[at].time) : 0;
  const widest = points.reduce((best, _, at) => steps(at) > steps(best) ? at : best, 0);
  const start = index !== undefined && steps(index) >= 2 ? index : widest;
  const [from, to] = [points[start], points[start + 1]];
  return addCurvePoint(points, { time: (from.time + to.time) / 2, progress: (from.progress + to.progress) / 2 });
}

/** Where `after` holds the point an add put in `before`; -1 when it added none. */
export const addedPointIndex = (before: readonly CurvePoint[], after: readonly CurvePoint[]) => after.findIndex(({ time }) => !before.some(point => point.time === time));

export const sameCurve = (a: readonly CurvePoint[], b: readonly CurvePoint[]) =>
  a.length === b.length && a.every((point, index) => point.time === b[index].time && point.progress === b[index].progress);

/** The shapes the editor offers as a starting point. Choosing one copies its points in, and nothing remembers which it was. */
export const STARTER_SHAPES = [
  { name: 'Stock', points: STOCK_CURVE_POINTS },
  { name: 'Steady', points: [{ time: 0, progress: 0 }, { time: 1, progress: 1 }] },
  { name: 'Fast start', points: [{ time: 0, progress: 0 }, { time: 0.2, progress: 0.9 }, { time: 1, progress: 1 }] },
  { name: 'Late whip', points: [{ time: 0, progress: 0 }, { time: 0.8, progress: 0.1 }, { time: 1, progress: 1 }] },
] as const satisfies readonly { name: string; points: readonly CurvePoint[] }[];

export type StarterShapeName = (typeof STARTER_SHAPES)[number]['name'];

/** A copy of a starter shape's points. */
export const starterShape = (name: StarterShapeName): CurvePoint[] => STARTER_SHAPES.find(shape => shape.name === name)!.points.map(point => ({ ...point }));

/*
 * What the preview reads from a curve that passes the rules. Keys are linear in the
 * game, so these follow the same straight lines the graph draws.
 */

/**
 * A stab's measured release runs this many times its `Release`, where a strike's
 * runs 1.0 x. Measured at three values on the Arming Sword in both grips and the
 * Longsword in the main grip, and not explained: stab-curve-keys#03, which would
 * have looked into it, was deferred. Change it here if that ever finds otherwise.
 */
export const STAB_RELEASE_FACTOR = 1.1;

/** How long a stab's movement lasts, in seconds, for this `Release`. */
export const stabDuration = (release: number) => release * STAB_RELEASE_FACTOR;

/** How far through its movement a stab is at this share of its time; outside the stab it rests at an end. */
export function progressAtTime(points: readonly CurvePoint[], time: number): number {
  const next = points.findIndex(point => point.time >= time);
  if (next < 0) return 1;
  if (next === 0 || points[next].time === time) return points[next].progress;
  const [from, to] = [points[next - 1], points[next]];
  return from.progress + (time - from.time) / (to.time - from.time) * (to.progress - from.progress);
}

const HALF = 0.5;

/**
 * When a stab of this duration reaches half its movement, in the duration's units.
 * It is the first moment: a curve flat at exactly half reaches half at the start of
 * the flat part. This is about movement only; when a stab connects is unmeasured.
 */
export function halfMovementTime(points: readonly CurvePoint[], duration: number): number {
  const next = points.findIndex(point => point.progress >= HALF);
  const [from, to] = [points[next - 1], points[next]];
  const time = to.progress === HALF ? to.time : from.time + (HALF - from.progress) / (to.progress - from.progress) * (to.time - from.time);
  return time * duration;
}
