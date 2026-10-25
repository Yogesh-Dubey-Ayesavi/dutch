import { useEffect, useRef, useState } from "react";
import {
  CHOOSE_SECONDS,
  FINAL_REACTION_MS,
  type GameView,
} from "../../../../packages/engine/src/index";
import { Avatar } from "../Avatar";
import { playSound } from "../sound";

/** Owns the 4 Hz clock so the rest of the table does not re-render every tick. */
export function TurnPill({
  state: s,
  activeId,
  powerMine,
}: {
  state: GameView;
  activeId: string | null;
  powerMine: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const total =
    (s.phase === "choosing"
      ? CHOOSE_SECONDS
      : s.phase === "peeking"
        ? s.rules.peekSeconds
        : s.phase === "reaction"
          ? FINAL_REACTION_MS / 1000
          : s.rules.turnSeconds) || 30;
  const seconds = s.deadline
    ? Math.max(0, Math.ceil((s.deadline - now) / 1000))
    : 0;
  // A ticking clock only once Dutch is called: the last lap should feel tense.
  useEffect(() => {
    if (!s.caller || !["playing", "power", "reaction"].includes(s.phase) || !seconds) {
      lastTick.current = null;
      return;
    }
    if (lastTick.current !== null && seconds !== lastTick.current)
      playSound("tick", { rate: seconds <= 5 ? 1.24 : 1 });
    lastTick.current = seconds;
  }, [seconds, s.caller, s.phase]);
  const active = s.players.find((p) => p.id === activeId);
  const mine = activeId === s.you;
  const moderator = s.players.find((p) => p.id === s.moderator);
  const label =
    s.phase === "choosing"
      ? s.moderator === s.you
        ? "You choose"
        : `${moderator?.name ?? "Moderator"} chooses`
      : s.phase === "peeking"
        ? "Memorize"
        : s.phase === "reaction"
          ? "Free throws"
          : s.phase === "power"
          ? powerMine
            ? "Your power"
            : `${active?.name ?? "Player"}’s power`
          : mine
            ? "Your turn"
            : (active?.name ?? "");
  return (
    <div
      className={`turn-pill ${mine || s.phase === "peeking" || (s.phase === "choosing" && s.moderator === s.you) ? "mine" : ""} ${s.caller || s.autoDutch ? "final" : ""} ${seconds <= 5 && s.deadline ? "hurry" : ""}`}
      role="timer"
      aria-label={`${label}, ${seconds} seconds left`}
    >
      {!mine && s.phase !== "peeking" && s.phase !== "choosing" && active && (
        <Avatar avatar={active.avatar} name={active.name} />
      )}
      <span className="turn-label">{label}</span>
      {(s.caller || s.autoDutch) && <span className="final-tag">Final</span>}
      <span
        className="turn-ring"
        style={{ "--p": Math.min(1, seconds / total) } as React.CSSProperties}
      >
        <b>{seconds}</b>
      </span>
    </div>
  );
}
