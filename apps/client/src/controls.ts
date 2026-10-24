export interface GestureContext {
  canDraw: boolean;
  hasDiscard: boolean;
  canSwap: boolean;
  canDiscard: boolean;
  canBurn: boolean;
  handSize: number;
}
export type GestureIntent =
  | {type: 'draw'; source: 'deck' | 'discard'; swapIndex?: number}
  | {type: 'swap'; index: number}
  | {type: 'burn'; index: number; match: 'drawn' | 'discard'}
  | {type: 'discard'}
  | {type: 'hint'};

/** Convert a completed gesture into an intention; the server still validates every action. */
export function planGesture(source: string, target: string | null, dy: number, context: GestureContext): GestureIntent | null {
  const slot = target?.match(/^hand-(\d+)$/);
  const index = slot ? Number(slot[1]) : -1;
  const validSlot = index >= 0 && index < context.handSize;
  if (source === 'deck' || source === 'discard') {
    if (!context.canDraw || (source === 'discard' && !context.hasDiscard)) return null;
    if (validSlot) return {type: 'draw', source, swapIndex: index};
    return dy > 40 ? {type: 'draw', source} : null;
  }
  if (source === 'drawn') {
    if (validSlot && context.canSwap) return {type: 'swap', index};
    return (target === 'discard' || dy < -55) && context.canDiscard ? {type: 'discard'} : null;
  }
  const hand = source.match(/^hand-(\d+)$/);
  if (hand && Number(hand[1]) < context.handSize && (target === 'discard' || target === 'drawn' || dy < -55)) {
    if (target === 'discard' && context.canSwap) return {type: 'swap', index: Number(hand[1])};
    if (context.canBurn) {
      const match = target === 'drawn' || (target !== 'discard' && context.canDiscard) ? 'drawn' : 'discard';
      if ((match === 'drawn' && context.canDiscard) || (match === 'discard' && context.hasDiscard))
        return {type: 'burn', index: Number(hand[1]), match};
    }
    if (context.canSwap && target !== 'drawn') return {type: 'swap', index: Number(hand[1])};
    return {type: 'hint'};
  }
  return null;
}
