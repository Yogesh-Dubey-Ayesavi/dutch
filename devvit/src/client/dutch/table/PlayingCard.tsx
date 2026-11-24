import { memo } from "react";
import { CardBackImage, CardFace } from "../CardArtwork";
import type { Card, CardBack } from "@engine";

/** Purely visual card. Interaction lives on the wrapping slot element. */
function PlayingCardView({
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
    <span className={`pc back ${className}`} data-back={back ?? "black"}>
      <CardBackImage design={back ?? "black"} />
    </span>
  );
}

/**
 * Every server snapshot arrives as fresh JSON, so card objects never keep their identity. Compare what is drawn
 * instead: a card that looks the same is not re-rendered (its SVG face is the most expensive thing on the table).
 */
export const PlayingCard = memo(
  PlayingCardView,
  (a, b) =>
    a.className === b.className &&
    (a.back ?? null) === (b.back ?? null) &&
    (a.card?.id ?? null) === (b.card?.id ?? null) &&
    a.card?.rank === b.card?.rank &&
    a.card?.suit === b.card?.suit,
);

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
