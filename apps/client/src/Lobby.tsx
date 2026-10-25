import { useState } from "react";
import { ArrowRight, Check, Crown, Link, Plus, Settings } from "lucide-react";
import type { GameView } from "../../../packages/engine/src/index";
import { Avatar } from "./Avatar";
import { playSound } from "./sound";
import { act, useRoom } from "./store";
import type { ModalName } from "./ui";
import "./table/table.css";
import "./screens.css";

/** Seats fill as friends arrive; the owner deals when two or more are here. */
export function Lobby({
  state,
  open,
}: {
  state: GameView;
  open: (m: ModalName) => void;
}) {
  const room = useRoom();
  const [copied, setCopied] = useState(false);
  const owner = state.players.find((p) => p.id === state.hostId);
  const isOwner = state.hostId === state.you;
  const everyoneHere = state.players.every((p) => p.connected);
  const canDeal =
    state.players.length >= 2 &&
    everyoneHere &&
    !room.pending &&
    room.status === "connected";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${room.code}`,
      );
      setCopied(true);
      playSound("snap");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      room.set({ error: "Share the table code instead." });
    }
  };
  return (
    <section className="screen lobby">
      <div className="lobby-code">
        <span className="eyebrow-d">Table code</span>
        <div
          className="code-tiles"
          data-testid="room-code"
          aria-label={room.code}
        >
          {room.code.split("").map((ch, i) => (
            <span key={i} aria-hidden="true">
              {ch}
            </span>
          ))}
        </div>
        <button className="ghost-button" onClick={copy}>
          {copied ? <Check size={16} /> : <Link size={16} />}
          {copied ? "Link copied" : "Copy invite link"}
        </button>
        <button className="rules-line" onClick={() => open("rules")}>
          <Settings size={14} />
          {state.rules.turnSeconds}s turns · House rules
        </button>
      </div>

      <div className="lobby-panel">
        <div className="seats-head">
          <h1>Players</h1>
          <span>{state.players.length} / 8</span>
        </div>
        <ul className="seat-list">
          {state.players.map((p) => (
            <li key={p.id}>
              <Avatar avatar={p.avatar} name={p.name} connected={p.connected} />
              <b>{p.name}</b>
              {p.id === state.you && <small>you</small>}
              {p.id === state.hostId && (
                <Crown size={15} className="crown" aria-label="Table owner" />
              )}
              {!p.connected && <small className="away">reconnecting</small>}
            </li>
          ))}
          {state.players.length < 8 && (
            <li className="open-seat">
              <button onClick={copy}>
                <span className="plus">
                  <Plus size={18} />
                </span>
                Invite a friend
              </button>
            </li>
          )}
        </ul>
        {isOwner ? (
          <button
            className="deal-button"
            disabled={!canDeal}
            onClick={() => act({ type: "start" })}
          >
            {state.players.length < 2 ? "Waiting for a friend" : "Deal"}
            {state.players.length >= 2 && <ArrowRight size={20} />}
          </button>
        ) : (
          <p className="waiting">
            <i /> {owner?.name ?? "The owner"} deals when everyone’s in
          </p>
        )}
      </div>
    </section>
  );
}
