import { CardBackArtwork, CardFace } from "../CardArtwork";
import type { Card, CardBack } from "../../../../packages/engine/src/index";

/** Purely visual card. Interaction lives on the wrapping slot element. */
export function PlayingCard({
  card,
  back,
  className = "",
}: {
  card?: Card | null;
  back?: CardBack | null;
  className?: string;
}) {
  if (card) {
    const red = card.suit === "hearts" || card.suit === "diamonds";
    return (
      <span className={`pc face ${red ? "red" : ""} ${className}`}>
        <CardFace card={card} />
      </span>
    );
  }
  return (
    <span className={`pc back ${className}`}>
      <CardBackArtwork design={back ?? "black"} />
    </span>
  );
}

export const rankLabel = (rank: number) =>
  ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] ?? String(rank);

export const SUIT_GLYPH = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

export const cardName = (card: Card) =>
  `${rankLabel(card.rank)} of ${card.suit}`;
