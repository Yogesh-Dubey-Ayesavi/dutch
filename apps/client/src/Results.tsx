import { useEffect, useRef } from "react";
import { Crown, Shuffle, WifiOff } from "lucide-react";
import {
  roundLabelFor,
  value,
  type GameView,
} from "../../../packages/engine/src/index";
import { Avatar } from "./Avatar";
import { playChime, playOverspeed, playPullUp } from "./sound";
import { act, usePrefs, useRoom } from "./store";
import { PlayingCard, rankLabel } from "./table/PlayingCard";
import "./table/table.css";
import "./screens.css";

export function Results({ state: s }: { state: GameView }) {
  const room = useRoom();
  const effects = usePrefs((p) => p.effects);
  const isOwner = s.hostId === s.you;
  const owner = s.players.find((p) => p.id === s.hostId);
  const seenRounds = useRef(0);
  useEffect(() => {
    if (s.phase === "interrupted" || s.history.length <= seenRounds.current)
      return;
    seenRounds.current = s.history.length;
    const result = s.history.at(-1)!;
    if (!result.caller) return;
    const penalty = result.penaltyCards?.[result.caller] ?? 0;
    if (penalty >= 2) playOverspeed();
    else if (penalty === 1) playPullUp();
    else playChime();
  }, [s.phase, s.history.length]);
  if (s.phase === "interrupted")
    return (
      <section className="screen results paused">
        <WifiOff size={34} />
        <h1>Round paused</h1>
        <p>{s.message}</p>
        <p className="muted">No points were recorded for this round.</p>
        {isOwner && (
          <button
            className="deal-button"
            disabled={s.players.some((p) => !p.connected)}
            onClick={() => act({ type: "rematch" })}
          >
            New match <Shuffle size={18} />
          </button>
        )}
      </section>
    );
  const total = (id: string) =>
    s.history.reduce((sum, r) => sum + (r.scores[id] ?? 0), 0);
  const result = s.history.at(-1)!;
  const finished = s.phase === "finished";
  const sorted = [...s.players].sort((a, b) =>
    finished
      ? total(a.id) - total(b.id)
      : result.scores[a.id] - result.scores[b.id],
  );
  const winners = finished
    ? sorted.filter((p) => total(p.id) === total(sorted[0].id))
    : s.players.filter((p) => result.winners.includes(p.id));
  return (
    <section className="screen results">
      {finished && effects && (
        <div className="confetti-d" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i % 7) * 0.18}s`,
              }}
            />
          ))}
        </div>
      )}
      <header className="results-head">
        <Crown size={30} strokeWidth={1.4} className="crown" />
        <span className="eyebrow-d">
          {finished ? "Match over" : `Round ${roundLabelFor(result.round)}`}
          {result.jokerRank ? ` · ${rankLabel(result.jokerRank)}s are 0` : ""}
        </span>
        <h1>
          {winners.map((p) => p.name).join(" & ")}{" "}
          <em>{winners.length > 1 ? "tie" : "wins"}</em>
        </h1>
      </header>

      <ol className="score-list">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className={winners.some((w) => w.id === p.id) ? "winner" : ""}
          >
            <span className="place">{i + 1}</span>
            <Avatar avatar={p.avatar} name={p.name} connected={p.connected} />
            <span className="who">
              <b>
                {p.name}
                {p.id === s.you ? " (you)" : ""}
              </b>
              {result.caller === p.id && (
                <small className="called">Called Dutch</small>
              )}
              {result.autoDutch === p.id && (
                <small className="called">Out of cards</small>
              )}
            </span>
            <span className="cards-row">
              {result.hands[p.id]?.map((c, i, hand) => (
                <span
                  className={`result-card ${i >= hand.length - (result.penaltyCards?.[p.id] ?? 0) ? "extra" : ""}`}
                  key={c.id}
                  title={
                    i >= hand.length - (result.penaltyCards?.[p.id] ?? 0)
                      ? "Penalty card"
                      : undefined
                  }
                >
                  <PlayingCard card={c} />
                  <small>
                    {c.rank === result.jokerRank
                      ? 0
                      : value(c, result.jokerRank)}
                  </small>
                </span>
              ))}
            </span>
            <span className="points">
              <b>{result.scores[p.id]}</b>
              {finished && <small>Match {total(p.id)}</small>}
              {(result.penaltyCards?.[p.id] ?? 0) > 0 && (
                <small>
                  +{result.penaltyCards![p.id]} card
                  {result.penaltyCards![p.id] === 1 ? "" : "s"}
                  {!finished && " · carries into next round"}
                </small>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="results-foot">
        {isOwner ? (
          <button
            className="deal-button"
            disabled={!!room.pending || s.players.some((p) => !p.connected)}
            onClick={() => act({ type: finished ? "rematch" : "nextRound" })}
          >
            {finished ? "Play again" : "Next round"} <Shuffle size={18} />
          </button>
        ) : (
          <p className="waiting">
            <i /> {owner?.name} deals the next round
          </p>
        )}
      </div>
    </section>
  );
}
