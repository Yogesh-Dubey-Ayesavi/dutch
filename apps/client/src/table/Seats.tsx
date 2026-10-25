import { useLayoutEffect, useRef, useState } from "react";
import type { GameView } from "../../../../packages/engine/src/index";
import { Avatar } from "../Avatar";
import { useRoom } from "../store";
import { PlayingCard } from "./PlayingCard";
import { EASE, reducedMotion, shake } from "./motion";

type Player = GameView["players"][number];

/** Seats sit on the rim of the oval, spread across its upper arc. */
export function seatPositions(count: number, w: number, h: number) {
  const portrait = h > w * 1.05;
  const cy = h * (portrait ? 0.5 : 0.54);
  const rx = w / 2 - (portrait ? 40 : 64);
  const ry = cy - 34;
  const from = portrait ? 198 : 190;
  const span = portrait ? 144 : 160;
  return Array.from({ length: count }, (_, i) => {
    const angle = count === 1 ? 270 : from + (i * span) / (count - 1);
    const rad = (angle * Math.PI) / 180;
    return { x: w / 2 + Math.cos(rad) * rx, y: cy + Math.sin(rad) * ry };
  });
}

export function Seat({
  state: s,
  player: p,
  x,
  y,
  active,
  pickable,
  picked,
  onOpen,
}: {
  state: GameView;
  player: Player;
  x: number;
  y: number;
  active: boolean;
  pickable: boolean;
  picked: number[];
  onOpen: () => void;
}) {
  const reaction = useRoom((r) => r.reactions[p.id]);
  const ref = useRef<HTMLDivElement>(null);
  const count = useRef(p.hand.length);
  const holding = !!s.drawn && s.players[s.turn]?.id === p.id;
  // A growing hand mid-round means a penalty card: give it a visible jolt.
  useLayoutEffect(() => {
    if (p.hand.length > count.current && s.phase !== "peeking")
      shake(ref.current);
    count.current = p.hand.length;
  }, [p.hand.length, s.phase]);
  // Slide the moved card when an opponent reorders their hand.
  const lastMove = useRef(s.swapEvent?.version);
  useLayoutEffect(() => {
    const event = s.swapEvent;
    if (!event || event.version === lastMove.current) return;
    lastMove.current = event.version;
    const move = event.move;
    if (!move || move.playerId !== p.id || reducedMotion()) return;
    const minis = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(".mini") ?? [],
    );
    const offs = minis.map((m) => m.offsetLeft);
    minis.forEach((m, i) => {
      let old = i;
      if (i === move.to) old = move.from;
      else if (move.from < move.to && i >= move.from && i < move.to)
        old = i + 1;
      else if (move.to < move.from && i > move.to && i <= move.from)
        old = i - 1;
      if (old === i) return;
      m.animate(
        [
          {
            transform: `translate(${offs[old] - offs[i]}px, ${i === move.to ? -8 : 0}px)`,
          },
          { transform: "none" },
        ],
        { duration: 420, easing: EASE },
      );
    });
  }, [s.swapEvent?.version]);
  const Tag = pickable ? "button" : "div";
  return (
    <Tag
      ref={ref as never}
      className={`seat ${active ? "active" : ""} ${pickable ? "pickable" : ""} ${p.connected ? "" : "away"}`}
      style={{ left: x, top: y }}
      onClick={pickable ? onOpen : undefined}
      aria-label={pickable ? `Choose from ${p.name}’s cards` : undefined}
    >
      <span className="seat-who">
        <Avatar
          avatar={p.avatar}
          name={p.name}
          connected={p.connected}
          active={active}
        />
        <span className="seat-name">{p.name}</span>
        {s.phase === "peeking" && p.peekDone && (
          <span className="seat-check" aria-label="Locked in">
            ✓
          </span>
        )}
      </span>
      <span className="minis">
        {p.hand.map((card, i) => (
          <span
            className={`mini ${picked.includes(i) ? "picked" : ""}`}
            key={i}
            data-player-slot={`${p.id}:${i}`}
          >
            <PlayingCard card={card} back={p.handBacks?.[i]} />
          </span>
        ))}
        {holding && (
          <span className="mini held-mini" aria-label="Holding a drawn card">
            <PlayingCard back={s.drawn?.back} />
          </span>
        )}
      </span>
      {reaction && <span className="emote-bubble">{reaction}</span>}
    </Tag>
  );
}

/** Opponent hands are small; choosing one of their cards happens here at full size. */
export function Tray({
  player: p,
  picked,
  onPick,
  onClose,
}: {
  player: Player;
  picked: number[];
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const [shown] = useState(() => Date.now());
  return (
    <>
      <div
        className="tray-back"
        onClick={() => Date.now() - shown > 250 && onClose()}
      />
      <div className="tray" role="dialog" aria-label={`${p.name}’s cards`}>
        <span className="seat-who">
          <Avatar avatar={p.avatar} name={p.name} connected={p.connected} />
          <span className="seat-name">{p.name}</span>
          <button className="tray-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </span>
        <span className="tray-cards">
          {p.hand.map((card, i) => (
            <button
              key={i}
              className={`tray-card ${picked.includes(i) ? "picked" : ""}`}
              onClick={() => onPick(i)}
              aria-label={`${p.name} card ${i + 1}`}
            >
              <PlayingCard card={card} back={p.handBacks?.[i]} />
            </button>
          ))}
        </span>
      </div>
    </>
  );
}
