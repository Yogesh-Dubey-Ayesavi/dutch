import type { Card } from '@engine';
import { CardBackImage, CardFace } from './dutch/CardArtwork';

/** The same card art as the table (Delft back, printed faces), for screens outside the match. Width in px; 100:144. */
export function TableCard({ card, w = 96, tilt = 0, back = 'black' }: { card?: Card; w?: number; tilt?: number; back?: Card['back'] }) {
  const red = card && (card.suit === 'hearts' || card.suit === 'diamonds');
  return (
    <span style={{ display: 'block', width: w, height: w * 1.44, borderRadius: '8% / 5.6%', overflow: 'hidden', transform: tilt ? `rotate(${tilt}deg)` : undefined, color: red ? 'oklch(0.64 0.22 25)' : '#141412', background: card ? 'linear-gradient(160deg,#fff,#f2f0ea 60%,#e3e9f7)' : undefined, boxShadow: card ? '0 2px 0 #c9d3ec, 0 10px 22px #000a' : '0 10px 22px #000a' }}>
      <span style={{ display: 'block', width: '100%', height: '100%' }}>{card ? <CardFace card={card} /> : <CardBackImage design={back} />}</span>
    </span>
  );
}

export const card = (rank: number, suit: Card['suit']): Card => ({ id: `show-${rank}-${suit}`, rank, suit, back: 'black' });
