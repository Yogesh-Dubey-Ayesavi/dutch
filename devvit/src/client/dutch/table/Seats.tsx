import { useLayoutEffect, useRef, useState } from "react";
import type { Card, GameView } from "@engine";
import { Avatar } from "../Avatar";
import { isFullBody } from "../../../shared/avatars";
import { PlayingCard, cardName, rankLabel } from "./PlayingCard";
import { useK } from "../board";
import { EASE, fan, reducedMotion, shake } from "./motion";
import { Seconds, TimerLine } from "./Clock";

type Player = GameView["players"][number];

const Y = "oklch(0.9 0.17 100)";

/** The rival's Reddit avatar (head crop), or their initial when they have none or it won't load. */
function PlateAvatar({ name, hue, url }: { name: string; hue: number; url?: string }) {
  const [broken, setBroken] = useState(false);
  const photo = !!url && !broken;
  return (
    <span className="b-plate-av" style={{ background: `oklch(0.72 0.18 ${hue})`, position: "relative", overflow: "hidden" }}>
      {photo ? (
        <img src={url} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={isFullBody(url!) ? { position: "absolute", left: "50%", top: 0, width: "170%", height: "170%", transform: "translateX(-50%)", objectFit: "cover", objectPosition: "50% 0%" } : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/**
 * The opponent's face-down row just inside the felt (their plate lives in the header, see RivalPlate). Cards are tappable straight away when a power targets them.
 */
export function Seat({
  state: s,
  player: p,
  called,
  pickable,
  picked,
  touched,
  onPick,
}: {
  state: GameView;
  player: Player;
  called: boolean;
  pickable: boolean;
  picked: number[];
  /** Slots a power just moved, pulsed white. */
  touched: number[];
  onPick: (index: number) => void;
}) {
  const k = useK();
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
  const lift = picked.length || called ? 6 : 0;
  return (
    <>
      <div
        ref={ref}
        data-seat={p.id}
        className={`b-opp ${pickable ? "pickable" : ""} ${p.connected ? "" : "away"}`}
        style={{ top: `calc(${150 + lift} * var(--u))` }}
      >
        <span className="minis">
          {p.hand.map((card, i) => {
            const Tag = pickable ? "button" : "span";
            return (
              <Tag
                className={`mini ${picked.includes(i) ? "picked" : ""} ${pickable ? "tap" : ""} ${touched.includes(i) ? "touched" : ""} ${called ? "locked" : ""}`}
                key={i}
                data-player-slot={`${p.id}:${i}`}
                style={{ width: 42 * k, height: 60 * k }}
                onClick={pickable ? () => onPick(i) : undefined}
                aria-label={pickable ? `${p.name} card ${i + 1}` : undefined}
              >
                <PlayingCard card={card} back={p.handBacks?.[i]} />
              </Tag>
            );
          })}
          {holding && (
            <span className="mini held-mini" aria-label="Holding a drawn card" style={{ width: 42 * k, height: 60 * k }}>
              <PlayingCard back={s.drawn?.back} />
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/**
 * The rival's detail plate, in the header slot where the round used to be: avatar, name, rating · round,
 * TURN/CALLED tag, score and, on their turn, the countdown with its draining bar along the bottom.
 */
export function RivalPlate({
  state: s,
  player: p,
  rating,
  score,
  turn,
  called,
  deadline,
  total,
  hue,
  avatarUrl,
  round,
  rounds,
}: {
  state: GameView;
  player: Player;
  rating: number | null;
  score: number;
  turn: boolean;
  called: boolean;
  deadline: number | null;
  total: number;
  hue: number;
  avatarUrl?: string;
  round: number;
  rounds: number;
}) {
  return (
    <div
      data-plate={p.id}
      className={`b-plate ${turn ? "is-turn" : ""} ${called ? "is-called" : ""} ${p.connected ? "" : "away"}`}
      style={called ? { borderColor: Y } : undefined}
    >
      <PlateAvatar name={p.name} hue={hue} url={avatarUrl} />
      <span className="b-plate-who">
        <b>u/{p.name}</b>
        <small>
          {rating !== null ? `${rating.toLocaleString("en-US")} · ` : ""}
          Rd {round}/{rounds}
          {s.phase === "peeking" && p.peekDone ? " · ready" : ""}
          {!p.connected ? " · away" : ""}
        </small>
      </span>
      {called ? (
        <span className="b-tag" style={{ background: Y, color: "#141412" }}>CALLED</span>
      ) : turn ? (
        <span className="b-tag" style={{ background: "#F2F0EA", color: "#141412" }}>TURN</span>
      ) : null}
      <span className="b-plate-score">{score}</span>
      {turn && (
        <>
          <span className="b-plate-bar">
            {deadline ? <TimerLine className="" deadline={deadline} total={total} urgent={Y} calm="#F2F0EA" /> : null}
          </span>
          <Seconds deadline={deadline}>
            {(v) => {
              const shown = deadline ? v : 0;
              return <span className="b-plate-sec" style={{ background: shown <= 2 ? Y : "#F2F0EA" }}>{shown}s</span>;
            }}
          </Seconds>
        </>
      )}
    </div>
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
          <Avatar id={p.id} name={p.name} connected={p.connected} />
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

/** Anyone can browse the whole discard pile — it's public knowledge at the table. */
export function DiscardTray({
  cards,
  jokerRank,
  onClose,
}: {
  cards: Card[];
  jokerRank: number | null;
  onClose: () => void;
}) {
  const [shown] = useState(() => Date.now());
  const ordered = [...cards].reverse(); // newest (the current top) first
  return (
    <>
      <div
        className="tray-back"
        onClick={() => Date.now() - shown > 250 && onClose()}
      />
      <div
        className="tray discard-tray"
        role="dialog"
        aria-label="Discard pile"
      >
        <span className="seat-who">
          <span className="seat-name">
            Discard pile <small>{cards.length} card{cards.length === 1 ? "" : "s"}</small>
          </span>
          <button className="tray-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </span>
        <span className="tray-cards discard-arc">
          {ordered.map((card, i) => {
            const f = fan(ordered.length, ordered.length - 1 - i, 2);
            return (
              <span
                key={card.id}
                className={`discard-arc-card ${i === 0 ? "top" : ""}`}
                style={
                  {
                    "--rot": `${f.r}deg`,
                    "--delay": `${Math.min(i, 24) * 18}ms`,
                  } as React.CSSProperties
                }
                title={cardName(card)}
              >
                <PlayingCard card={card} />
                {i === 0 && <small>Top</small>}
              </span>
            );
          })}
        </span>
        {jokerRank && (
          <p className="discard-joker-hint">
            {rankLabel(jokerRank)}s score 0 this round.
          </p>
        )}
      </div>
    </>
  );
}
