'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  acceptedCurvePoints, addCurvePoint, addCurvePointAfter, addedPointIndex, MAX_CURVE_POINTS, moveCurvePoint, newCurvePoint, nudgeCurvePoint, removeCurvePoint, sameCurve, STARTER_SHAPES, starterShape, STOCK_CURVE_POINTS, valueFromPoints, type CurvePoint, type StarterShapeName,
} from '@/lib/config/releaseCurve';
import { useConfigStore, type ConfigValue } from '@/lib/store/configStore';
import { isOverride } from './model';
import { ReleaseCurveThumbnail } from './ReleaseCurveThumbnail';
import { StabPreview, type PreviewAttack } from './StabPreview';

/**
 * The dialog where an owner draws a release curve (stab-curve-keys#05). Every
 * gesture maps onto an edit in the curve module, so none can make a shape the
 * rules refuse. What a gesture holds stays here until it ends, then goes out
 * through `onChange` as one change: opening saves nothing and creates no override.
 */

/** The graph's own coordinates; the page scales them to fit. */
const VIEW = { width: 560, height: 396, left: 38, right: 14, top: 14, bottom: 34 };
const PLOT_WIDTH = VIEW.width - VIEW.left - VIEW.right;
const PLOT_HEIGHT = VIEW.height - VIEW.top - VIEW.bottom;
const x = (time: number) => VIEW.left + time * PLOT_WIDTH;
const y = (progress: number) => VIEW.top + (1 - progress) * PLOT_HEIGHT;
const line = (points: readonly CurvePoint[]) => points.map(({ time, progress }) => `${x(time)},${y(progress)}`).join(' ');
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const number = (value: number) => value.toFixed(2);

/** Steps of 0.01 along time and progress. */
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const isMiddle = (points: readonly CurvePoint[], index: number) => index > 0 && index < points.length - 1;
/** How near a press has to be to take hold of a point, in the graph's own coordinates. */
const REACH = 15;
/** The movable point nearest a press, within reach; -1 for none. By distance, so a point packed against a neighbour or an endpoint can still be taken. */
function pointWithinReach(points: readonly CurvePoint[], aim: CurvePoint) {
  let nearest = -1;
  let distance = REACH;
  points.forEach((point, index) => {
    const away = Math.hypot((aim.time - point.time) * PLOT_WIDTH, (aim.progress - point.progress) * PLOT_HEIGHT);
    if (isMiddle(points, index) && away <= distance) [nearest, distance] = [index, away];
  });
  return nearest;
}

/** A press being dragged: the points it started from, what it has made of them so far, and how far off the point's centre it took hold. */
type Drag = { index: number; start: readonly CurvePoint[]; points: readonly CurvePoint[]; grab: CurvePoint };

/** One point's number, as typed until it is committed; a commit goes through the same edit as a drag, so it lands where the rules let it. */
function CurveNumber({ value, label, onSelect, onCommit, onNudge }: {
  value: number;
  label: string;
  onSelect: () => void;
  onCommit: (value: number) => void;
  onNudge: (value: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const finish = () => {
    if (text === null) return;
    setText(null);
    if (text.trim() && Number.isFinite(Number(text))) onCommit(Number(text));
  };
  return <input aria-label={label} type="number" step="0.01" inputMode="decimal" value={text ?? number(value)} data-curve-gesture={text === null ? undefined : ''} onChange={event => setText(event.target.value)} onFocus={event => {
    onSelect();
    event.currentTarget.select();
  }} onBlur={finish} onKeyDown={event => {
    if (event.key === 'Enter') finish();
    if (event.key === 'Escape') setText(null);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const from = text !== null && text.trim() && Number.isFinite(Number(text)) ? Number(text) : value;
      setText(null);
      onNudge(from + (event.key === 'ArrowUp' ? 0.01 : -0.01));
    }
  }} />;
}

/** The dialog's contents, on their own so they can be rendered without one. */
export function ReleaseCurveEditor({ value, onChange, onReset, savesToDraft, attack }: {
  value: ConfigValue | undefined;
  onChange: (value: number[]) => void;
  /** Removes the override, which restores the real stock curve. */
  onReset?: () => void;
  /** Whether a change goes to the Draft, or waits on the All weapons sheet. */
  savesToDraft: boolean;
  /** The attack whose `Release` times the preview. */
  attack?: PreviewAttack;
}) {
  const overridden = isOverride(value);
  const stored: readonly CurvePoint[] = (overridden ? acceptedCurvePoints(value) : undefined) ?? STOCK_CURVE_POINTS;
  const [held, setHeld] = useState<readonly CurvePoint[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<CurvePoint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [noRoom, setNoRoom] = useState(false);
  const [edited, setEdited] = useState(false);
  const points = held ?? stored;
  const chosen = selected !== null && isMiddle(points, selected) ? selected : null;
  const atLimit = points.length >= MAX_CURVE_POINTS;

  const root = useRef<HTMLDivElement>(null);
  const graph = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  /** What takes focus once the points have rendered, since an edit can remove what has it. */
  const focusNext = useRef<number | 'add' | 'starter' | null>(null);
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLElement | SVGElement>(next === 'add' ? '[data-add-point]' : next === 'starter' ? '[data-first-starter]' : `[data-point="${next}"]`)?.focus();
  });

  /** What a gesture holds becomes the value when it ends, if it changed anything. */
  const commit = (next: readonly CurvePoint[]) => {
    setHeld(null);
    if (sameCurve(next, stored)) return;
    setEdited(true);
    setNoRoom(false);
    onChange(valueFromPoints(next));
  };
  /** An arrow key held counts as a drag, ending when it is released or focus leaves. */
  const settle = () => {
    if (held && !drag.current) commit(held);
  };

  const selectAndFocus = (index: number | null, otherwise: 'add' | 'starter' = 'add') => {
    setSelected(index);
    focusNext.current = index ?? otherwise;
  };
  const addPoint = (after?: number) => {
    const next = addCurvePointAfter(points, after);
    if (next === points) return setNoRoom(true);
    commit(next);
    selectAndFocus(addedPointIndex(points, next));
  };
  const removePoint = (index: number) => {
    const next = removeCurvePoint(points, index);
    commit(next);
    // The keyboard carries on from the point before, or the one that took its place.
    selectAndFocus(index > 1 ? index - 1 : next.length > 2 ? 1 : null);
  };
  const chooseStarter = (name: StarterShapeName) => {
    const next = starterShape(name);
    setHeld(null);
    setSelected(null);
    setNoRoom(false);
    // With no override, Stock still copies its points in: choosing a shape is the edit.
    if (overridden && sameCurve(next, stored)) return;
    setEdited(true);
    onChange(valueFromPoints(next));
  };
  const reset = () => {
    setHeld(null);
    setEdited(true);
    setNoRoom(false);
    selectAndFocus(null, 'starter');
    onReset?.();
  };

  /** Where the pointer is aimed, in the graph's numbers: anywhere, for the edits to limit. */
  const aimedAt = (event: PointerEvent): CurvePoint => {
    const box = graph.current!.getBoundingClientRect();
    return {
      time: ((event.clientX - box.left) * (VIEW.width / box.width) - VIEW.left) / PLOT_WIDTH,
      progress: 1 - ((event.clientY - box.top) * (VIEW.height / box.height) - VIEW.top) / PLOT_HEIGHT,
    };
  };
  const press = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const aim = aimedAt(event);
    let index = pointWithinReach(points, aim);
    let start = points;
    let grab = { time: 0, progress: 0 };
    if (index >= 0) grab = { time: aim.time - points[index].time, progress: aim.progress - points[index].progress };
    else if ((event.target as Element).hasAttribute('data-plot')) {
      // A press adds the point there and holds on to it, so one gesture can place it.
      start = addCurvePoint(points, aim);
      if (start === points) return setNoRoom(true);
      index = addedPointIndex(points, start);
    } else return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, start, points: start, grab };
    setDragging(true);
    setHeld(start);
    setHover(null);
    selectAndFocus(index);
  };
  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const aim = aimedAt(event);
      drag.current.points = moveCurvePoint(drag.current.start, drag.current.index, { time: aim.time - drag.current.grab.time, progress: aim.progress - drag.current.grab.progress });
      setHeld(drag.current.points);
    } else if (event.pointerType === 'mouse') setHover((event.target as Element).closest('[data-plot], [data-point]') ? aimedAt(event) : null);
  };
  const letGo = () => {
    const finished = drag.current;
    if (!finished) return;
    drag.current = null;
    setDragging(false);
    commit(finished.points);
  };
  const dropGesture = () => {
    drag.current = null;
    setDragging(false);
    setHeld(null);
  };
  const pointKey = (event: KeyboardEvent, index: number) => {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      if (!drag.current) setHeld(nudgeCurvePoint(points, index, arrow[0], arrow[1]));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (!drag.current) removePoint(index);
    } else if (event.key === 'Insert' || event.key === '+' || event.key === '=') {
      event.preventDefault();
      if (!drag.current) addPoint(index);
    } else if (event.key === 'Escape' && held) dropGesture();
  };

  /** What a press would do from where the mouse is: take this point, or add the ghost. */
  const pressable = hover ? pointWithinReach(points, hover) : -1;
  const ghost = hover && pressable < 0 ? newCurvePoint(points, hover) : undefined;
  /** The point the readout and its guides follow. */
  const shown = ghost ?? (chosen !== null ? points[chosen] : undefined);
  const hint = atLimit
    ? `${MAX_CURVE_POINTS} points is the limit. Remove one to add another.`
    : 'Click the graph to add a point, drag to move it, Delete to remove it.';

  return <div className="curve-editor-body" ref={root} onBlur={settle} onKeyUp={event => {
    if (ARROWS[event.key]) settle();
  }}>
    <div className="curve-editor-graph">
      <svg
        ref={graph}
        className={`curve-graph${overridden ? ' is-override' : ''}${atLimit ? ' at-limit' : ''}`}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="group"
        aria-label="Release curve graph: time across, progress up"
        data-dragging={dragging ? '' : undefined}
        data-curve-gesture={held ? '' : undefined}
        // Focus goes where the press means it to, once the points have rendered.
        onMouseDown={event => event.preventDefault()}
        onPointerDown={press}
        onPointerMove={movePointer}
        onPointerUp={letGo}
        onPointerCancel={dropGesture}
        onPointerLeave={() => setHover(null)}
      >
        <rect className="curve-plot" data-plot="" x={VIEW.left} y={VIEW.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="4" />
        {TICKS.map(tick => <g key={tick} className="curve-tick">
          {tick > 0 && tick < 1 && <path d={`M${x(tick)} ${VIEW.top}V${VIEW.top + PLOT_HEIGHT}M${VIEW.left} ${y(tick)}H${VIEW.left + PLOT_WIDTH}`} />}
          <text x={x(tick)} y={VIEW.top + PLOT_HEIGHT + 15} textAnchor="middle">{tick}</text>
          <text x={VIEW.left - 7} y={y(tick) + 4} textAnchor="end">{tick}</text>
        </g>)}
        <text className="curve-axis" x={VIEW.left + PLOT_WIDTH / 2} y={VIEW.height - 3} textAnchor="middle">Time</text>
        <text className="curve-axis" transform={`translate(10 ${VIEW.top + PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle">Progress</text>
        <polygon className="curve-graph-fill" points={`${line(points)} ${x(1)},${y(0)}`} />
        <polyline className="curve-graph-stock" points={line(STOCK_CURVE_POINTS)} />
        <polyline className="curve-graph-line" points={line(points)} />
        {shown && <path className="curve-guide" d={`M${x(shown.time)} ${y(shown.progress)}V${y(0)}M${x(shown.time)} ${y(shown.progress)}H${x(0)}`} />}
        {ghost && <circle className="curve-ghost" cx={x(ghost.time)} cy={y(ghost.progress)} r="6" />}
        {points.map((point, index) => isMiddle(points, index)
          ? <g
            key={index}
            className={`curve-handle${chosen === index ? ' is-selected' : ''}${pressable === index ? ' is-near' : ''}`}
            transform={`translate(${x(point.time)} ${y(point.progress)})`}
            data-point={index}
            tabIndex={0}
            role="slider"
            aria-label={`Point ${index + 1}`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={point.time}
            aria-valuetext={`Time ${number(point.time)}, progress ${number(point.progress)}`}
            onFocus={() => setSelected(index)}
            onKeyDown={event => pointKey(event, index)}
          >
            <circle className="curve-handle-hit" r="15" />
            <circle className="curve-handle-ring" r="11" />
            <circle className="curve-handle-dot" r="6" />
          </g>
          : <g key={index} className="curve-endpoint" transform={`translate(${x(point.time)} ${y(point.progress)})`}>
            <title>{index === 0 ? 'Every stab starts here, at (0,0)' : 'Every stab finishes here, at (1,1)'}</title>
            <circle className="curve-handle-hit" r="12" />
            <circle className="curve-endpoint-dot" r="4" />
          </g>)}
        {shown && <text className="curve-readout" x={Math.min(x(shown.time) + 12, VIEW.left + PLOT_WIDTH - 72)} y={y(shown.progress) < VIEW.top + 26 ? y(shown.progress) + 24 : y(shown.progress) - 14}>{number(shown.time)}, {number(shown.progress)}</text>}
      </svg>
      <div className="curve-graph-notes">
        <p className={`curve-hint${atLimit && noRoom ? ' is-limit' : ''}`} role="status">{hint}</p>
        <p className="curve-legend"><span className="curve-legend-line" />This curve<span className="curve-legend-stock" />Stock</p>
      </div>
    </div>
    <div className="curve-editor-side">
      <section aria-label="Starter shapes">
        <h3>Starter shapes</h3>
        <div className="curve-starters">{STARTER_SHAPES.map(({ name, points: shape }, index) => <button key={name} type="button" className="curve-starter" data-first-starter={index === 0 ? '' : undefined} aria-label={`Use the ${name} starter shape`} onClick={() => chooseStarter(name)}>
          <ReleaseCurveThumbnail value={valueFromPoints(shape)} />
          <span>{name}</span>
        </button>)}</div>
      </section>
      <section aria-label="Points">
        <h3>Points <span className="faint">{points.length} of {MAX_CURVE_POINTS}</span></h3>
        <table className="curve-fields">
          <thead><tr><th scope="col">Point</th><th scope="col">Time</th><th scope="col">Progress</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>{points.map((point, index) => isMiddle(points, index)
            ? <tr key={index} className={chosen === index ? 'is-selected' : undefined}>
              <th scope="row">{index + 1}</th>
              <td><CurveNumber value={point.time} label={`Point ${index + 1} time`} onSelect={() => setSelected(index)} onCommit={time => commit(moveCurvePoint(points, index, { ...point, time }))} onNudge={time => setHeld(moveCurvePoint(points, index, { ...point, time }))} /></td>
              <td><CurveNumber value={point.progress} label={`Point ${index + 1} progress`} onSelect={() => setSelected(index)} onCommit={progress => commit(moveCurvePoint(points, index, { ...point, progress }))} onNudge={progress => setHeld(moveCurvePoint(points, index, { ...point, progress }))} /></td>
              <td><button type="button" className="icon-button" aria-label={`Remove point ${index + 1}`} onClick={() => removePoint(index)}><X size={12} /></button></td>
            </tr>
            : <tr key={index} className="faint" title={index === 0 ? 'Every stab starts here' : 'Every stab finishes here'}>
              <th scope="row">{index + 1}</th><td>{number(point.time)}</td><td>{number(point.progress)}</td><td />
            </tr>)}</tbody>
        </table>
        <button type="button" className="outline-button curve-add" data-add-point="" disabled={atLimit} onClick={() => addPoint(chosen ?? undefined)}><Plus size={13} />Add point</button>
      </section>
    </div>
    <StabPreview points={points} overridden={overridden} attack={attack} onSheet={!savesToDraft} />
    <footer className="curve-editor-footer">
      <p>
        {savesToDraft
          ? <>{overridden ? 'This attack has its own curve.' : 'No override: this attack uses the game\'s stock curve, and your first edit makes one.'} Each change saves to the Draft. Nothing reaches the game server until you Apply.</>
          : overridden ? 'This curve stays here until you save it there, on the sheet.' : 'Nothing chosen yet. Draw a curve or pick a starter shape, then save it on the sheet.'}
        {savesToDraft && edited && <DraftSaveState />}
      </p>
      {overridden && onReset && <button type="button" className="outline-button" onClick={reset}><RotateCcw size={13} />Reset to stock</button>}
    </footer>
  </div>;
}

/** How the dialog's changes are doing, once it has made one. */
function DraftSaveState() {
  const saveState = useConfigStore(state => state.saveState);
  const saveError = useConfigStore(state => state.saveError);
  return <span className={`curve-save-state${saveState === 'saved' || saveState === 'saving' ? '' : ' save-problem'}`} role="status">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved.' : saveError}</span>;
}

export function ReleaseCurveDialog({ place, onClose, ...editor }: {
  /** Where this curve sits, as the dialog names it. */
  place: string;
  onClose: () => void;
} & Parameters<typeof ReleaseCurveEditor>[0]) {
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog open onOpenChange={open => {
    if (!open) onClose();
  }}>
    <DialogContent
      className="curve-editor"
      // Focus waits on the dialog itself: on a point it would select that point, and opening changes nothing.
      onOpenAutoFocus={event => {
        opener.current = document.activeElement as HTMLElement | null;
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.focus();
      }}
      // With no DialogTrigger, nothing else takes focus back to the thumbnail that opened this.
      onCloseAutoFocus={event => {
        event.preventDefault();
        opener.current?.focus();
      }}
      // Escape lets go of a drag or what is being typed before it closes anything.
      onEscapeKeyDown={event => {
        if (event.target instanceof Element && event.target.closest('[data-curve-gesture]')) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>Stab curve</DialogTitle>
        <DialogDescription>{place}</DialogDescription>
      </DialogHeader>
      <ReleaseCurveEditor {...editor} />
    </DialogContent>
  </Dialog>;
}
