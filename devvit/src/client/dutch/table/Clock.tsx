/**
 * Everything on the table that counts down lives here, in small components that own their own clock.
 * The table itself never re-renders on a timer: a tick used to re-render the whole board (every SVG card)
 * five times a second, mid-drag and mid-flight included.
 *
 * Progress bars drain with one CSS animation per deadline (scaleX, compositor only) instead of a width that
 * is re-set every tick and transitioned, which relaid out and repainted the board on every frame.
 */
import { useEffect, useMemo, useReducer, type CSSProperties, type ReactNode } from "react";

/**
 * One timer per (deadline, step), shared by every countdown showing it, so the turn pill, the YOU box and the
 * plate all update in the same task and React commits them together.
 */
const clocks = new Map<string, { subs: Set<() => void>; timer?: ReturnType<typeof setTimeout> }>();
function subscribe(deadline: number, step: number, fn: () => void) {
  const key = `${deadline}:${step}`;
  let clock = clocks.get(key);
  if (!clock) {
    const c: { subs: Set<() => void>; timer?: ReturnType<typeof setTimeout> } = { subs: new Set() };
    const next = () => {
      const left = deadline - Date.now();
      if (left <= 0) return;
      c.timer = setTimeout(() => {
        c.subs.forEach((f) => f());
        next();
      }, (left % step || step) + 4);
    };
    next();
    clocks.set(key, (clock = c));
  }
  clock.subs.add(fn);
  return () => {
    clock.subs.delete(fn);
    if (!clock.subs.size) {
      clearTimeout(clock.timer);
      clocks.delete(key);
    }
  };
}

/** Milliseconds left until `deadline`; re-renders only when the shown value (whole seconds or tenths) changes. */
export function useTimeLeft(deadline: number | null | undefined, step: 1000 | 100 = 1000) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => (deadline ? subscribe(deadline, step, tick) : undefined), [deadline, step]);
  return deadline ? Math.max(0, deadline - Date.now()) : 0;
}

/** A bar that empties linearly until `deadline`, `total` seconds being a full bar. */
export function DrainBar({
  deadline,
  total,
  left,
  className = "",
  style,
}: {
  deadline: number;
  total: number;
  /** Current ms left, for the static fallback when animations are off. */
  left: number;
  className?: string;
  style?: CSSProperties;
}) {
  // Fixed per deadline so the per-second re-render never restarts or nudges the running animation.
  const timing = useMemo(() => {
    const ms = Math.max(1, total * 1000);
    return { animationDuration: `${ms}ms`, animationDelay: `${Math.round(Math.max(0, deadline - Date.now()) - ms)}ms` };
  }, [deadline, total]);
  return (
    <i
      key={deadline}
      className={`${className} drain`}
      style={{ ...style, ...timing, transform: `scaleX(${Math.min(1, left / 1000 / Math.max(1, total))})` }}
    />
  );
}

/**
 * The table's status tag, in the same style as the YOUR TURN / THEIR TURN tags: what's happening and the
 * seconds left, with the time draining along its bottom edge. A power adds its card badge and a Skip key.
 * The one-line instruction (`sub`) is shown by the table in the hint line under the hand, not in here.
 */
export function StatusBand({
  text,
  kind,
  deadline,
  total,
  tenths,
  badge,
  top,
  onSkip,
}: {
  text: string;
  kind: "hot" | "you";
  deadline: number | null;
  total: number;
  tenths?: boolean;
  /** A power's card letter (J, Q, A). */
  badge?: string;
  /** Where it sits, in design units. */
  top: number;
  /** Shows a Skip key beside the tag. */
  onSkip?: () => void;
}) {
  const left = useTimeLeft(deadline, tenths ? 100 : 1000);
  const sec = tenths ? `${(left / 1000).toFixed(1)}s` : `${Math.ceil(left / 1000)}s`;
  return (
    <div className="b-tagline" style={{ top: `calc(${top} * var(--u))` }} role="timer" aria-label={`${text} ${sec}`}>
      <div className={`b-pill ${kind}`}>
        {badge && <i className="b-pill-badge">{badge}</i>}
        <span>{text}</span>
        {deadline !== null && <b>{sec}</b>}
        <span className="b-pill-bar">{deadline ? <DrainBar deadline={deadline} total={total} left={left} /> : null}</span>
      </div>
      {onSkip && (
        <button type="button" className="b-pill-skip" data-no-drag onClick={onSkip}>
          Skip
        </button>
      )}
    </div>
  );
}

/** Whole seconds left, for labels. */
export function Seconds({ deadline, children }: { deadline: number | null; children: (s: number) => ReactNode }) {
  const left = useTimeLeft(deadline);
  return <>{children(Math.ceil(left / 1000))}</>;
}

/** The thin timer line under the YOU box and the rival's plate, yellow for the last two seconds. */
export function TimerLine({ deadline, total, className, urgent, calm }: { deadline: number; total: number; className: string; urgent: string; calm: string }) {
  const left = useTimeLeft(deadline);
  return <DrainBar className={className} deadline={deadline} total={total} left={left} style={{ background: Math.ceil(left / 1000) <= 2 ? urgent : calm }} />;
}
