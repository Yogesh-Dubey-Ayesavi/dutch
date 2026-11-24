/**
 * The warm-up bot, also used as autopilot for a disconnected player. It plays through the same engine actions
 * as a human and only uses what its seat could legitimately know: cards it peeked, drew or Jack-peeked.
 */
import { canCallDutch, jokerRankForRound, powerOwnerId, value, type Action, type Card, type Game } from '@engine';

export interface BotMove { action: Action; delayMs: number }

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const UNKNOWN_GUESS = 6.5;

function knownSlots(g: Game, id: string, memory: Set<string>) {
  const p = g.players.find((pl) => pl.id === id)!;
  const joker = jokerRankForRound(g.round);
  return p.hand.map((card, index) => ({ index, card, known: memory.has(card.id), v: value(card, joker) }));
}

/** Free throw: a known card of the same rank as the live reaction window. */
export function botThrow(g: Game, id: string, memory: Set<string>, now: number): Action | null {
  const w = g.reactionWindow;
  if (!w || now >= w.deadline || g.rules.burning === 'off') return null;
  if (!(g.phase === 'playing' || g.phase === 'reaction' || (g.phase === 'power' && g.handPower))) return null;
  const p = g.players.find((pl) => pl.id === id);
  if (!p || g.pendingCall) return null;
  const top = g.discard.at(-1);
  if (top && g.freeThrown?.[top.id] === id) return null;
  const joker = jokerRankForRound(g.round);
  const index = p.hand.findIndex((c) => memory.has(c.id) && (g.rules.burning === 'rank' ? c.rank === w.rank : value(c, joker) === w.value));
  if (index < 0) return null;
  return { type: 'burn', index, match: 'discard', handRevision: p.handRevision, targetId: top?.id };
}

/** The next deliberate move for this seat, if it has one. */
export function botMove(g: Game, id: string, memory: Set<string>, opts: { autopilot: boolean }): BotMove | null {
  const me = g.players.find((p) => p.id === id);
  if (!me || g.pendingCall) return null;
  const opp = g.players.find((p) => p.id !== id)!;
  const slots = knownSlots(g, id, memory);
  const joker = jokerRankForRound(g.round);

  // The moderator decides how many cards everyone may see. An absent player's choice times out to 2.
  if (g.phase === 'choosing') {
    if (g.moderator !== id || opts.autopilot) return null;
    return { action: { type: 'peekCount', count: [0, 1, 2, 2][rand(0, 3)] }, delayMs: rand(1200, 2200) };
  }

  if (g.phase === 'peeking' && !me.peekDone) {
    if (opts.autopilot) return null; // an absent player's peek simply times out
    const allowed = Math.min(g.peekCount ?? 2, me.hand.length);
    const next = Array.from({ length: allowed }, (_, i) => i).find((i) => !me.peeked.includes(i));
    return { action: next === undefined ? { type: 'finishPeek' } : { type: 'initialPeek', index: next }, delayMs: rand(500, 900) };
  }

  if (g.phase === 'power' && powerOwnerId(g) === id) {
    const kind = g.handPower?.kind ?? g.power;
    if (kind === 'blindSwap') {
      const worst = slots.filter((s) => s.known && s.v >= 7).sort((a, b) => b.v - a.v)[0];
      if (worst && opp.hand.length) return { action: { type: 'blindSwap', firstPlayerId: id, firstIndex: worst.index, secondPlayerId: opp.id, secondIndex: rand(0, opp.hand.length - 1) }, delayMs: rand(1100, 1900) };
    }
    if (kind === 'rearrange' && opp.hand.length >= 2) {
      const a = rand(0, opp.hand.length - 1);
      let b = rand(0, opp.hand.length - 2);
      if (b >= a) b++;
      return { action: { type: 'rearrange', moves: [{ playerId: opp.id, firstIndex: a, secondIndex: b }] }, delayMs: rand(1000, 1800) };
    }
    return { action: { type: 'skipPower' }, delayMs: rand(700, 1200) };
  }

  // A Jack's peek can be spent any time: use it on an unknown card.
  if ((g.peeks[id] ?? 0) > 0 && (g.phase === 'playing' || g.phase === 'power')) {
    const unknown = slots.find((s) => !s.known);
    if (unknown) return { action: { type: 'powerPeek', playerId: id, index: unknown.index }, delayMs: rand(600, 1100) };
  }

  if (g.phase !== 'playing' || g.players[g.turn]?.id !== id) return null;

  if (!g.drawn) {
    const unknown = slots.filter((s) => !s.known).length;
    const estimate = slots.reduce((sum, s) => sum + (s.known ? s.v : UNKNOWN_GUESS), 0);
    if (!opts.autopilot && canCallDutch(g, id) && ((unknown === 0 && estimate <= 7) || estimate <= 4)) return { action: { type: 'call' }, delayMs: rand(1200, 2000) };
    const top = g.discard.at(-1);
    const takeTop = !opts.autopilot && top && g.freeThrown?.[top.id] !== id && value(top, joker) <= 3;
    return { action: { type: 'draw', source: takeTop ? 'discard' : 'deck' }, delayMs: rand(1100, 2100) };
  }

  const drawn = g.drawn.card;
  const dv = value(drawn, joker);
  const known = slots.filter((s) => s.known).sort((a, b) => b.v - a.v);
  const unknown = slots.filter((s) => !s.known);
  const worst = known[0];
  const swap = (index: number): BotMove => ({ action: { type: 'swap', index, handRevision: me.handRevision }, delayMs: rand(900, 1700) });
  if (opts.autopilot) return g.drawn.fromDeck ? { action: { type: 'discard' }, delayMs: 800 } : swap(0);
  if (worst && worst.v > dv && (dv <= 4 || !unknown.length || worst.v - dv >= 3)) return swap(worst.index);
  if (dv <= 4 && unknown.length) return swap(unknown[rand(0, unknown.length - 1)].index);
  if (worst && worst.v > dv) return swap(worst.index);
  if (!g.drawn.fromDeck) return swap(unknown[0]?.index ?? worst?.index ?? 0);
  return { action: { type: 'discard' }, delayMs: rand(800, 1400) };
}

/** Memory upkeep after any state change: keep cards still in hand, learn what this seat saw, forget a little. */
export function updateMemory(before: Game | null, after: Game, id: string, memory: Set<string>, action: Action | null, actor: string | null) {
  const me = after.players.find((p) => p.id === id);
  if (!me) return memory;
  if (before && before.round !== after.round) memory.clear();
  if (actor === id && action) {
    if (action.type === 'draw' && after.drawn) memory.add(after.drawn.card.id);
    if (action.type === 'initialPeek' || action.type === 'powerPeek') {
      const card = me.hand[action.index];
      if (card) memory.add(card.id);
    }
  }
  // An Ace rearranged this hand: it knows the cards moved but not where.
  if (after.swapEvent?.rearranged?.playerIds.includes(id) && after.swapEvent.actorId !== id && after.swapEvent.version !== before?.swapEvent?.version) {
    for (const c of me.hand) memory.delete(c.id);
  }
  const inHand = new Set(me.hand.map((c: Card) => c.id));
  if (after.drawn && after.players[after.turn]?.id === id) inHand.add(after.drawn.card.id);
  for (const cid of [...memory]) if (!inHand.has(cid)) memory.delete(cid);
  return memory;
}

/** Called once per bot turn: each remembered card slips with a small chance. */
export function forget(memory: Set<string>, chance = 0.06) {
  for (const cid of [...memory]) if (Math.random() < chance) memory.delete(cid);
}
