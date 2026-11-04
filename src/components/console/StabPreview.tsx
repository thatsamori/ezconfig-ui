'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import { Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { halfMovementTime, progressAtTime, stabDuration, STAB_RELEASE_FACTOR, STOCK_CURVE_POINTS, type CurvePoint } from '@/lib/config/releaseCurve';
import { useConfigStore } from '@/lib/store/configStore';
import { previewRelease, type PreviewRelease } from './model';

/**
 * This stab beside a stock one in the curve dialog (stab-curve-keys#06), drawn as
 * movement progress with no game art. One clock moves both, so they stay comparable.
 *
 * It only reads: nothing here can save anything or create an override.
 */

/** The attack whose `Release` times the preview. */
export type PreviewAttack = { database: string; category: string };

/** Slow motion's share of real speed. The readout stays in real seconds. */
const SLOW_MOTION = 0.25;
/** In real seconds at any speed: a beat before a stab, so it reads as a new one, and a rest after it to see where it ended. */
const WAIT_AT_START = 0.15;
const WAIT_AT_END = 0.7;
/** The most one frame moves the clock, so a stall in the page can't skip a stab. */
const LONGEST_FRAME = 0.1;
/** The moments the ticks mark, as shares of the stab's time. */
const TENTHS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/** The clock both stabs read: seconds of the stab played, and real seconds waited at either end of it. */
export type StabClock = { moved: number; waited: number };

/** The clock after this much real time. Pure, and given the duration each time, so changing it or the speed never restarts a stab. */
export function advanceStabClock({ moved, waited }: StabClock, real: number, duration: number, speed: number): StabClock {
  if (moved === 0 && waited < WAIT_AT_START) return { moved, waited: waited + real };
  if (moved < duration) return { moved: Math.min(moved + real * speed, duration), waited: 0 };
  return waited + real < WAIT_AT_END ? { moved, waited: waited + real } : { moved: 0, waited: 0 };
}

/**
 * The global CSS rule for reduced motion only reaches CSS animations and
 * transitions, so this one has to ask for itself. Static markup has no setting to
 * read; the dialog only ever opens in a browser.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function watchReducedMotion(changed: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}
const useReducedMotion = () => useSyncExternalStore(watchReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);

/** Where a frame shows a stab: straight to the page, because a render must not restart or stutter the loop. */
function paintLane(lane: HTMLElement | null, progress: number) {
  lane?.style.setProperty('--stab-progress', String(progress));
  lane?.toggleAttribute('data-past-half', progress >= 0.5);
}

/** One stab's track. `still` holds it at that progress; otherwise its frames come from paintLane, and a render leaves them alone. */
function Lane({ name, kind, points, still, laneRef }: {
  name: string;
  kind: 'is-this' | 'is-stock';
  points: readonly CurvePoint[];
  still: number | undefined;
  laneRef: Ref<HTMLDivElement>;
}) {
  return <div ref={laneRef} className={`stab-lane ${kind}`} style={{ '--stab-progress': still ?? 0 } as CSSProperties} data-past-half={still !== undefined && still >= 0.5 ? '' : undefined}>
    <span>{name}</span>
    <div className="stab-track">
      <div className="stab-bar" />
      {TENTHS.map(time => <span key={time} className="stab-tick" style={{ left: `${progressAtTime(points, time) * 100}%` }} />)}
      <span className="stab-half" />
    </div>
  </div>;
}

const seconds = (value: number) => `${value.toFixed(2)} s`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
/** Compares the numbers as shown, so what is on screen adds up. */
function compared(mine: number, stock: number, inSeconds: boolean) {
  const gap = Number(stock.toFixed(2)) - Number(mine.toFixed(2));
  if (gap === 0) return 'Same as stock';
  if (inSeconds) return `${Math.abs(gap).toFixed(2)} s ${gap > 0 ? 'sooner' : 'later'} than stock`;
  return `${gap > 0 ? 'Sooner' : 'Later'} than stock`;
}

/** The preview, given everything it reads, so it can be rendered without a store or a browser's settings. */
export function StabPreviewView({ points, overridden, attack, release, onSheet, reducedMotion }: {
  points: readonly CurvePoint[];
  overridden: boolean;
  attack: PreviewAttack | undefined;
  release: PreviewRelease | undefined;
  /** On the All weapons sheet, `attack` stands in for a whole list of weapons. */
  onSheet: boolean;
  reducedMotion: boolean;
}) {
  const [slow, setSlow] = useState(false);
  const [playingOnce, setPlayingOnce] = useState(false);
  const duration = release && stabDuration(release.seconds);
  const moving = duration !== undefined && (!reducedMotion || playingOnce);

  const thisLane = useRef<HTMLDivElement>(null);
  const stockLane = useRef<HTMLDivElement>(null);
  const clock = useRef<StabClock>({ moved: 0, waited: 0 });
  /** What the running loop reads each frame, so an edit reaches it with no restart. */
  const latest = useRef({ points, duration, slow, stopAfterOnePass: reducedMotion });
  useEffect(() => {
    latest.current = { points, duration, slow, stopAfterOnePass: reducedMotion };
  });
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    let last: number | undefined;
    const step = (now: number) => {
      const { points: shape, duration: length = 0, slow: slowed, stopAfterOnePass } = latest.current;
      const before = clock.current;
      const real = last === undefined ? 0 : Math.min((now - last) / 1000, LONGEST_FRAME);
      last = now;
      clock.current = advanceStabClock(before, real, length, slowed ? SLOW_MOTION : 1);
      if (stopAfterOnePass && before.moved > 0 && clock.current.moved === 0) return setPlayingOnce(false);
      const time = length > 0 ? clock.current.moved / length : 0;
      paintLane(thisLane.current, progressAtTime(shape, time));
      paintLane(stockLane.current, progressAtTime(STOCK_CURVE_POINTS, time));
      frame = requestAnimationFrame(step);
    };
    const run = () => {
      last = undefined;
      frame = requestAnimationFrame(step);
    };
    // Browsers mostly stop frames in a hidden page already; this makes it certain, and starts it again without a jump.
    const hiddenOrShown = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', hiddenOrShown);
    if (!document.hidden) run();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', hiddenOrShown);
    };
  }, [moving]);

  const playOnce = () => {
    clock.current = { moved: 0, waited: 0 };
    setPlayingOnce(true);
  };

  const place = attack && `${attack.database} · ${attack.category}`;
  // With no clock, a duration of 1 gives shares of the release.
  const mine = halfMovementTime(points, duration ?? 1);
  const stock = halfMovementTime(STOCK_CURVE_POINTS, duration ?? 1);
  const figure = duration === undefined ? percent : seconds;
  const speed = !moving ? 'still' : slow ? '¼ speed' : 'real speed';
  const heldNote = duration === undefined
    ? 'With no usable Release there is no real speed to play at, so it holds still at the moment this stab reaches half its movement.'
    : reducedMotion && !moving
      ? 'Reduced motion is on, so it holds still at the moment this stab reaches half its movement.'
      : undefined;

  return <section className={`stab-preview${overridden ? ' is-override' : ''}`} aria-label="Stab preview">
    <div className="stab-stage">
      <div className="stab-head">
        <h3>Preview <span className="faint">{speed}</span></h3>
        {duration !== undefined && <div className="stab-controls">
          {reducedMotion && <button type="button" className="outline-button stab-play" disabled={playingOnce} onClick={playOnce}><Play size={12} />Play once</button>}
          <label className="override-filter"><Switch checked={slow} onCheckedChange={setSlow} /><span>Slow motion</span></label>
        </div>}
      </div>
      <div className="stab-lanes" role="img" aria-label="This stab and a stock stab, moving left to right from start to full movement. A line marks half.">
        {/* Standing still, both show the moment this stab reaches half its movement. */}
        <Lane name="This stab" kind="is-this" points={points} still={moving ? undefined : 0.5} laneRef={thisLane} />
        <Lane name="Stock" kind="is-stock" points={STOCK_CURVE_POINTS} still={moving ? undefined : progressAtTime(STOCK_CURVE_POINTS, halfMovementTime(points, 1))} laneRef={stockLane} />
        <div className="stab-scale" aria-hidden="true"><span>Start</span><span>Half</span><span>Full</span></div>
      </div>
      <p className="stab-note">{heldNote && <>{heldNote} </>}Each tick is a tenth of the time: bunched up is slow, spread out is fast.</p>
    </div>
    <div className="stab-readout">
      <h3>Reaches half its movement</h3>
      <dl className="stab-figures">
        <div className="is-this"><dt>This stab</dt><dd>{figure(mine)}</dd></div>
        <div><dt>Stock</dt><dd>{figure(stock)}</dd></div>
      </dl>
      <p className="stab-compared" role="status">{compared(mine, stock, duration !== undefined)}</p>
      {duration !== undefined
        ? <p className="stab-clock" title={`Stabs measured ${STAB_RELEASE_FACTOR} × Release in the game. Nothing has explained why yet.`}>
          {onSheet ? <>Timed as {place}, where you opened this sheet: </> : <>{place}: </>}a {Number(duration.toFixed(3))} s stab, {STAB_RELEASE_FACTOR} × its Release of {release!.seconds} s {release!.fromDraft ? 'in your Draft' : 'by default'}.
          {onSheet && ' Other weapons follow their own Release.'}
        </p>
        : <p className="stab-clock">Shares of the release, not seconds: {place ? `${place} has` : 'this has'} no single usable Release to time it by.</p>}
    </div>
  </section>;
}

/** The preview in the dialog: `Release` from the Draft or else its default, and the browser's reduced-motion setting. */
export function StabPreview({ points, overridden, attack, onSheet }: {
  points: readonly CurvePoint[];
  overridden: boolean;
  attack: PreviewAttack | undefined;
  onSheet: boolean;
}) {
  const values = useConfigStore(state => state.values);
  const reducedMotion = useReducedMotion();
  return <StabPreviewView points={points} overridden={overridden} attack={attack} release={attack && previewRelease(values, attack.database, attack.category)} onSheet={onSheet} reducedMotion={reducedMotion} />;
}
