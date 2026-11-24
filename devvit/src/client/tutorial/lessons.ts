/**
 * The tutorial script. Teaching rules it follows:
 *  - One idea per screen. Basics are calm full-screen cards; the table only shows up when there's something to do.
 *  - The real game: cards stay face down. You know a card only because you peeked or took it, and later moves ask
 *    you to use that memory ("swap it onto your 9"), exactly like a duel.
 *  - Habits through repetition: quick recall checks (where is it? what's your total?) with instant feedback,
 *    inside one continuous round, so "know your cards" becomes a reflex.
 *  - Coach lines are one short sentence with the move in **bold**.
 * Round 1 is the setting throughout, so Kings are the Joker (worth 0).
 */
import type { Action, Card, Game } from '@engine';
import { RIVAL, YOU, c, type Move, type Scene } from './table';

export type Visual = 'values' | 'facedown' | 'powers' | 'call' | 'deal';
/** Coach text, fixed or worked out from the table (lines that depend on which cards you peeked). */
export type Say = string | ((g: Game) => string);
export type Step =
  /** A full-screen idea card (no table). */
  | { kind: 'card'; id: string; title: string; line: string; visual?: Visual; button: string }
  /** Deal a new staged position. */
  | { kind: 'scene'; id: string; scene: Scene }
  /** One move on the table. */
  | { kind: 'do'; say: Say; gate: (a: Action, g: Game) => string | null; done: (g: Game, m: Move) => boolean; glow?: string[]; nice?: string; call?: boolean; skip?: (g: Game) => boolean }
  /** Watch the rival play. */
  | { kind: 'watch'; say: Say; rival: Action[]; done: (g: Game) => boolean; stack?: () => Card; call?: boolean }
  /** A short note on the table, with an OK. */
  | { kind: 'tell'; say: string | ((g: Game) => string); button: string; call?: boolean }
  /** Recall check: tap the card. */
  | { kind: 'where'; say: Say; card: () => Card; right: string }
  /** Recall check: pick the answer. */
  | { kind: 'pick'; say: string; lead: string; options: string[]; answer: string; right: string; wrong: string };

/** What the player saw in their opening peek: they choose any 2, and the round adapts to them. */
const memory = { peeked: [] as Card[] };
const rankName = (x: Card) => ({ 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' } as Record<number, string>)[x.rank] ?? String(x.rank);
const byRank = () => [...memory.peeked].sort((a, b) => a.rank - b.rank);
/** The lower peeked card stays in the hand all round (it's the one you'll free-throw); the higher one is swapped out. */
const low = () => byRank()[0] ?? FOUR;
const high = () => byRank()[1] ?? NINE;
const unseen = (g: Game) => [NINE, FOUR, EIGHT, TEN].filter((x) => !memory.peeked.some((p) => p.id === x.id) && me(g).hand.some((h) => h.id === x.id));
/** A card of the same rank as `x` that's still in the deck (red-back diamonds are never dealt in the round). */
const twin = (x: Card) => c(x.rank, 'diamonds', 'red');

const me = (g: Game) => g.players.find((p) => p.id === YOU)!;
const myTurn = (g: Game) => g.phase === 'playing' && g.players[g.turn]?.id === YOU && !g.drawn;
const idx = (a: Action) => ('indices' in a && a.indices) ? a.indices : ('index' in a && typeof a.index === 'number') ? [a.index] : [];
/** Every chosen slot holds one of these cards. */
const holds = (a: Action, g: Game, ...cards: Card[]) => idx(a).length > 0 && idx(a).every((i) => cards.some((x) => x.id === me(g).hand[i]?.id));
const mine = (m: Move, ...types: Action['type'][]) => m.actor === YOU && !!m.action && types.includes(m.action.type);

const DECK = ['.board .heap.deck'];
const PILE = ['.board .heap.discard'];
const CALL = ['.board .b-call'];
const theirCard = (i: number) => `.board [data-player-slot="${RIVAL}:${i}"]`;

const drawDeck = (say: string): Step => ({
  kind: 'do', say, glow: DECK,
  gate: (a) => (a.type === 'draw' && a.source === 'deck' ? null : '**Tap the deck** to draw.'),
  done: (g) => !!g.drawn,
});
const RIVAL_TOSS: Action[] = [{ type: 'draw', source: 'deck' }, { type: 'discard' }];
const watch = (say: string, rival: Action[] = RIVAL_TOSS): Step => ({ kind: 'watch', say, rival, done: myTurn });

// ---- The practice round: one continuous hand, start to finish ----
const NINE = c(9, 'clubs'), FOUR = c(4, 'diamonds'), EIGHT = c(8, 'spades'), TEN = c(10, 'hearts', 'red');
const THREE = c(3, 'hearts'), ACE = c(1, 'clubs', 'red'), KING = c(13, 'hearts');
const ROUND: Scene = {
  peek: true, turn: 'me',
  me: [NINE, FOUR, EIGHT, TEN],
  rival: [c(9, 'spades', 'red'), c(11, 'hearts', 'red'), c(7, 'diamonds', 'red'), c(12, 'clubs', 'red')],
  draws: [THREE, ACE, KING, c(10, 'spades')],
  pile: [c(6, 'clubs')],
};

// ---- Power drills ----
const JACK = c(11, 'diamonds'), JACK_DRAW = c(3, 'clubs');
const QUEEN = c(12, 'spades'), MY_TEN = c(10, 'diamonds');
const MY_ACE = c(1, 'spades');
const randomRival = [c(8, 'clubs', 'red'), c(10, 'clubs', 'red'), c(6, 'diamonds', 'red'), c(9, 'hearts', 'red')];

export const SCRIPT: Step[] = [
  { kind: 'card', id: 'values', visual: 'values', title: 'Fewest points wins', line: 'Every card is worth points. Add up your cards: whoever has fewer points wins the round.', button: 'Next' },
  { kind: 'card', id: 'facedown', visual: 'facedown', title: 'Your cards are face down', line: 'Even you can’t see them. You only get a quick peek, so remember what you saw.', button: 'Play' },

  { kind: 'scene', id: 'round', scene: ROUND },
  {
    kind: 'do', say: 'Tap **any 2** of your cards to peek at them.', glow: ['.board .hc'],
    gate: (a, g) => (a.type === 'initialPeek' || (a.type === 'finishPeek' && me(g).peeked.length >= 2) ? null : 'Tap **any 2** of your cards to peek at them.'),
    done: (g) => {
      if (!me(g).peekDone) return false;
      memory.peeked = me(g).peeked.map((i) => me(g).hand[i]).filter(Boolean);
      return true;
    },
    nice: 'They’re face down again. **Remember them.**',
  },
  { kind: 'where', say: () => `Quick check: **tap your ${rankName(low())}.**`, card: low, right: 'Correct! **Always know where your cards are.**' },
  drawDeck('Your turn. **Tap the deck** to draw a card.'),
  {
    kind: 'do', say: 'It’s a **3**, a low card. **Swap it with a card you haven’t seen.**',
    gate: (a, g) => a.type === 'discard' ? 'Keep the 3. Low cards are good.' : a.type !== 'swap' ? 'Tap a card you haven’t seen to swap the 3 in.' : holds(a, g, ...unseen(g)) ? null : 'You’ve seen that card. **Tap one you haven’t seen.**',
    done: (_g, m) => mine(m, 'swap'),
    nice: 'Good. A mystery card out, a low card in.',
  },
  watch('Your rival’s turn. **Watch the card they put down.**'),
  {
    kind: 'do', say: 'They put down an **Ace**, worth just 1. **Tap the pile** to take it.', glow: PILE,
    gate: (a) => (a.type === 'draw' && a.source === 'discard' ? null : 'Take the Ace: **tap the pile**.'),
    done: (g) => !!g.drawn,
  },
  {
    kind: 'do', say: () => `Now **swap the Ace with your ${rankName(high())}**, your highest card.`,
    gate: (a, g) => a.type !== 'swap' ? `Tap your ${rankName(high())} to swap the Ace in.` : holds(a, g, high()) ? null : `That’s not your ${rankName(high())}. It’s **one of the 2 cards you peeked**.`,
    done: (_g, m) => mine(m, 'swap'),
    nice: 'Low card on the pile? **Take it.** The deck could be anything.',
  },
  { ...watch('Your rival’s turn. **Watch the card they put down.**'), stack: () => twin(low()) } as Step,
  {
    kind: 'do', say: () => `They put down ${[1, 8].includes(low().rank) ? 'an' : 'a'} **${rankName(low())}**. You have one too! **Drag your ${rankName(low())} onto the pile.**`, glow: PILE,
    gate: (a, g) => a.type !== 'burn' ? `**Drag your ${rankName(low())} onto the pile.**` : holds(a, g, low()) ? null : `That’s not your ${rankName(low())}. Drag the wrong card and you get an extra one.`,
    done: (g) => me(g).hand.length === 3,
    nice: 'Same number as the pile? **Drag yours on, any time.** One less card!',
  },
  { kind: 'tell', say: 'Each round, one card is worth **0**. This round, it’s the **King**.', button: 'OK' },
  drawDeck('Your turn again. **Tap the deck** to draw.'),
  {
    kind: 'do', say: 'A **King**, worth **0** this round! **Swap it with the card you haven’t seen.**',
    gate: (a, g) => a.type === 'discard' ? 'Keep the King. It’s worth 0.' : a.type !== 'swap' ? 'Tap the card you haven’t seen to swap the King in.' : holds(a, g, ...unseen(g)) ? null : 'You’ve seen that card. **Tap the one you haven’t seen.**',
    done: (_g, m) => mine(m, 'swap'),
    nice: 'Now you know **all your cards**.',
  },
  { kind: 'pick', lead: 'You know all 3 of your cards now. **Add them up.**', say: 'What’s your total?', options: ['4', '14', '7'], answer: '4', right: 'Correct: 1 + 3 + 0 = **4**.', wrong: 'Not quite: 1 + 3 + 0 = **4**. Kings are 0.' },
  {
    kind: 'do', call: true, say: 'A total of 4 is very low. **Tap CALL LOW** to end the round.', glow: CALL,
    gate: (a) => (a.type === 'call' || a.type === 'undoCall' ? null : '**Tap CALL LOW.**'),
    done: (g) => g.caller === YOU,
  },
  { kind: 'watch', call: true, say: 'Your rival gets **one last turn**. Then all cards are shown.', rival: RIVAL_TOSS, done: (g) => g.phase === 'results' },
  {
    kind: 'tell', button: 'Next', call: true,
    say: (g) => { const h = g.history.at(-1); return `You have **${h?.scores[YOU] ?? 4}**, your rival **${h?.scores[RIVAL] ?? 39}**. **You win the round!**`; },
  },
  { kind: 'card', id: 'call', visual: 'call', title: 'Call only when you’re sure', line: 'Calling ends the round. If your rival has fewer points, you lose it and get an extra card next round.', button: 'Next' },

  { kind: 'card', id: 'powers', visual: 'powers', title: 'Power cards', line: 'When a Jack, Queen or Ace leaves your hand, you get to use its power.', button: 'Try them' },
  { kind: 'scene', id: 'jack', scene: { me: [JACK, c(6, 'hearts'), c(5, 'spades'), c(2, 'clubs')], rival: randomRival, draws: [JACK_DRAW], pile: [c(9, 'spades')], known: [0], turn: 'me' } },
  drawDeck('Your 1st card is a **Jack**. Get it out of your hand: **tap the deck**.'),
  {
    kind: 'do', say: '**Swap the 3 into your Jack’s spot.**',
    gate: (a, g) => a.type !== 'swap' ? 'Tap your Jack to swap the 3 in.' : holds(a, g, JACK) ? null : 'That’s not your Jack. It’s your **1st card**.',
    done: (_g, m) => mine(m, 'swap'),
  },
  {
    kind: 'do', say: 'Jack power: **tap a card you haven’t seen** to peek at it.',
    gate: (a, g) => a.type !== 'powerPeek' ? '**Tap a card you haven’t seen** to peek at it.' : me(g).hand[a.index]?.id === JACK_DRAW.id ? 'You’ve seen that one: it’s your 3. **Tap another card.**' : null,
    done: (_g, m) => mine(m, 'powerPeek'),
    nice: '**Jack: peek at one of your cards.**',
  },
  { kind: 'scene', id: 'queen', scene: { me: [QUEEN, MY_TEN, c(3, 'clubs'), c(1, 'hearts')], rival: randomRival, draws: [c(7, 'diamonds')], pile: [c(5, 'spades'), c(2, 'hearts', 'red')], known: [0, 1], turn: 'rival' } },
  watch('Your cards: **Queen** and **10**. Watch where your rival puts the **2**.', [{ type: 'draw', source: 'discard' }, { type: 'swap', index: 1 }]),
  drawDeck('It went to **their 2nd card**. **Tap the deck** to draw.'),
  {
    kind: 'do', say: '**Swap the 7 into your Queen’s spot.**',
    gate: (a, g) => a.type !== 'swap' ? 'Tap your Queen to swap the 7 in.' : holds(a, g, QUEEN) ? null : 'That’s not your Queen. It’s your **1st card**.',
    done: (g) => g.phase === 'power',
  },
  {
    kind: 'do', say: 'Queen power: **tap your 10, then their 2nd card.** They trade places.', glow: [theirCard(1)],
    gate: (a, g) => {
      if (a.type !== 'blindSwap' && a.type !== 'blindSwapBatch') return a.type === 'skipPower' ? 'Don’t skip. Take their 2!' : 'Tap **your 10**, then **their 2nd card**.';
      const pairs = a.type === 'blindSwap' ? [a] : a.pairs;
      const p = pairs[0];
      const mineAt = p.firstPlayerId === YOU ? p.firstIndex : p.secondPlayerId === YOU ? p.secondIndex : -1;
      const theirsAt = p.firstPlayerId === RIVAL ? p.firstIndex : p.secondPlayerId === RIVAL ? p.secondIndex : -1;
      return pairs.length === 1 && me(g).hand[mineAt]?.id === MY_TEN.id && theirsAt === 1 ? null : 'Swap **your 10** (your 2nd card) with **their 2nd card**.';
    },
    done: (_g, m) => mine(m, 'blindSwap', 'blindSwapBatch'),
    nice: 'Their 2 is yours now. **Always watch what they keep.**',
  },
  { kind: 'scene', id: 'ace', scene: { me: [MY_ACE, c(3, 'hearts'), c(2, 'diamonds'), c(4, 'clubs')], rival: randomRival, draws: [c(1, 'diamonds', 'red')], pile: [c(6, 'clubs')], known: [0], turn: 'rival' } },
  watch('Your 1st card is an **Ace**. **Watch the card your rival puts down.**'),
  {
    kind: 'do', say: 'They put down an Ace. **Drag your Ace onto it.**', glow: PILE,
    gate: (a, g) => a.type !== 'burn' ? '**Drag your Ace onto the pile.**' : holds(a, g, MY_ACE) ? null : 'That’s not your Ace. It’s your **1st card**.',
    done: (g) => g.phase === 'power',
  },
  {
    kind: 'do', say: 'Ace power: **tap 2 of their cards** to switch them around.',
    gate: (a) => (a.type === 'rearrange' ? null : 'Tap **2 of their cards**.'),
    done: (_g, m) => mine(m, 'rearrange'),
    nice: 'Now they don’t know **where their cards are**.',
  },

  // ---- Who deals: the dealer picks how many cards everyone sees, the other player goes first, roles switch each round ----
  { kind: 'card', id: 'deal', visual: 'deal', title: 'Taking turns to deal', line: 'Each round, one of you deals and picks how many cards you can both look at: 0, 1 or 2. The other player goes first.', button: 'Try it' },
  { kind: 'scene', id: 'dealing', scene: { deal: true, turn: 'rival', me: [c(7, 'clubs'), c(2, 'spades'), c(12, 'diamonds'), c(5, 'hearts')], rival: randomRival, pile: [c(8, 'hearts')] } },
  {
    kind: 'do', say: 'You deal this round. **Pick a number**: how many cards can each of you look at?',
    gate: (a) => (a.type === 'peekCount' ? null : '**Pick 0, 1 or 2** first.'),
    done: (g) => g.phase !== 'choosing',
  },
  {
    kind: 'do', say: (g) => `Now **peek at ${g.peekCount === 1 ? '1 card' : '2 cards'}**, then tap **Done**.`, glow: ['.board .hc'],
    skip: (g) => g.phase !== 'peeking',
    gate: (a, g) => (a.type === 'initialPeek' || (a.type === 'finishPeek' && me(g).peeked.length >= (g.peekCount ?? 2)) ? null : `Peek at ${g.peekCount === 1 ? '1 card' : '2 cards'}, then tap **Done**.`),
    done: (g) => me(g).peekDone,
  },
  watch('You dealt, so **your rival goes first**.'),
  { kind: 'tell', say: 'Next round, **your rival deals** and you go first. It switches every round.', button: 'Done' },
];

/**
 * Where the tutorial can pick up again: each idea card and each new deal (a mid-round position can't be rebuilt,
 * so progress is kept per chapter). 'done' means finished.
 */
export const checkpointAt = (id: string) => SCRIPT.findIndex((x) => (x.kind === 'card' || x.kind === 'scene') && x.id === id);
export const checkpointOf = (index: number): string | null => { const x = SCRIPT[index]; return x && (x.kind === 'card' || x.kind === 'scene') ? x.id : null; };
