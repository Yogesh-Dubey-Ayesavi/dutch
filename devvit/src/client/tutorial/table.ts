/**
 * A practice table that runs the real rules engine in the browser. The tutorial seats the player here through
 * the match store (startLocal), so the board, gestures, animations and sounds are exactly a duel's. Each lesson
 * deals a staged position (Scene); the coach decides which moves are allowed (gate) and scripts the rival.
 */
import { addPlayer, applyAction, deck, expireTurn, newGame, viewFor, type Action, type Card, type Game, type Rules } from '@engine';
import { soundFor } from '../../shared/sounds';
import type { MatchEnvelope, Seat } from '../../shared/api';
import type { SoundName } from '../../shared/protocol';
import type { LocalTable } from '../dutch/store';

export const YOU = 'you';
export const RIVAL = 'rival';
const RULES: Partial<Rules> = { rounds: 13, turnSeconds: 30, peekSeconds: 10, powers: true, burning: 'rank', callerMustBeLowest: true, maxTurns: 200, acePower: true };

/** A card by rank (1 = Ace … 13 = King). Each scene must use a card at most once (there are two decks: red and blue backs). */
export const c = (rank: number, suit: Card['suit'], back: Card['back'] = 'black'): Card => ({ id: `${back}-${suit}-${rank}`, rank, suit, back });

export interface Scene {
  me: Card[];
  rival: Card[];
  /** The next cards off the deck, in the order they'll be drawn. */
  draws?: Card[];
  /** The discard pile, bottom first (the last one is on top). */
  pile: Card[];
  /** Cards the player is shown at the start (they turn face down after a few seconds, as a peek does). */
  known?: number[];
  turn: 'me' | 'rival';
  /** Start in the opening peek. */
  peek?: boolean;
  /** Start with you dealing: you pick how many cards each player may look at, then the rival goes first. */
  deal?: boolean;
}

function build(sc: Scene, version: number, now: number): Game {
  let g = newGame(YOU, RULES);
  g = addPlayer(g, YOU, 'You', 0);
  g = addPlayer(g, RIVAL, 'Rival', 1);
  g = applyAction(g, YOU, { type: 'start' }, now, deck());
  const staged = [...sc.me, ...sc.rival, ...(sc.draws ?? []), ...sc.pile];
  const used = new Set(staged.map((x) => x.id));
  if (used.size !== staged.length) throw new Error('A scene uses the same card twice.');
  const rest = deck().filter((x) => !used.has(x.id));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  g.deck = [...rest, ...[...(sc.draws ?? [])].reverse()]; // cards are drawn from the end
  g.discard = [...sc.pile];
  g.players[0] = { ...g.players[0], hand: [...sc.me], peeked: [], peekDone: !sc.peek && !sc.deal, handRevision: 0 };
  g.players[1] = { ...g.players[1], hand: [...sc.rival], peeked: [], peekDone: true, handRevision: 0 };
  g.turn = sc.turn === 'me' ? 0 : 1;
  g.phase = sc.deal ? 'choosing' : sc.peek ? 'peeking' : 'playing';
  g.moderator = sc.deal ? YOU : RIVAL;
  g.peekCount = 2;
  g.reveals = {};
  g.peeks = {};
  g.jackReveals = { [YOU]: (sc.known ?? []).map((i) => sc.me[i].id) };
  g.reactionWindow = null;
  g.freeThrown = {};
  g.swapEvent = null;
  g.drawEvent = null;
  g.dutchWindowFor = null;
  g.version = version;
  g.message = '';
  return tame(g);
}

/** No turn clock while learning. The undo window after a call and the final free throws keep theirs. */
function tame(g: Game): Game {
  if (['playing', 'power', 'peeking', 'choosing'].includes(g.phase)) g.deadline = null;
  return g;
}

export type Move = { actor: string; action: Action | null; before: Game; after: Game };

export class PracticeTable implements LocalTable {
  g: Game;
  /** Returns why a move isn't allowed right now, or null to let it through. */
  gate: ((a: Action, g: Game) => string | null) | null = null;
  onMove: ((m: Move) => void) | null = null;
  push: ((e: MatchEnvelope) => void) | null = null;
  private sound: { name: SoundName; id: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private seats: Seat[], scene: Scene) {
    this.g = build(scene, 1, Date.now());
  }

  /** Deal a new staged position (always a newer version, so the table takes it). */
  load(scene: Scene) {
    clearTimeout(this.timer);
    this.g = build(scene, this.g.version + 10, Date.now());
    this.sound = { name: 'shuffle', id: `deal:${this.g.version}` };
    this.push?.(this.state());
  }

  state(): MatchEnvelope {
    return {
      matchId: 'practice', mode: 'bot', now: Date.now(), view: viewFor(this.g, YOU, [YOU, RIVAL]), seats: this.seats,
      nextTickAt: null, resultsUntil: null, resultsMaxUntil: null, nextReady: [], opponentStatus: 'bot', forfeitAt: null,
      result: null, shared: false, sound: this.sound, chat: [],
    };
  }

  /** Put `card` on top of the deck, so the next draw is that card (staging a lesson around what the player knows). */
  stack(card: Card) {
    this.g = { ...this.g, deck: [...this.g.deck.filter((x) => x.id !== card.id), card] };
  }

  /** Put the table back exactly as it was (the tutorial's Back), as a newer version so the board takes it. */
  restore(snapshot: Game) {
    clearTimeout(this.timer);
    this.g = { ...structuredClone(snapshot), version: this.g.version + 10 };
    this.sound = null;
    this.schedule();
    this.push?.(this.state());
  }

  /** The player's own moves, as the store sends them. A short delay keeps the table's flight animations honest. */
  act(a: Action): Promise<MatchEnvelope> {
    return new Promise((resolve, reject) => setTimeout(() => {
      try {
        const no = a.type === 'reorder' ? null : this.gate?.(a, this.g);
        if (no) throw new Error(no.replace(/\*\*/g, ''));
        this.apply(YOU, a);
        resolve(this.state());
      } catch (e) { reject(e instanceof Error ? e : new Error('That didn’t work.')); }
    }, 90));
  }

  /** A scripted move by the rival. */
  rival(a: Action) {
    try { this.apply(RIVAL, a); this.push?.(this.state()); } catch (e) { console.warn('practice rival', e); }
  }

  stop() { clearTimeout(this.timer); this.gate = null; this.onMove = null; this.push = null; }

  private apply(actor: string, a: Action) {
    const before = this.g;
    const now = Date.now();
    const after = tame(applyAction(before, actor, a, now));
    this.g = after;
    const name = soundFor(before, after, actor, a, now);
    if (name) this.sound = { name, id: `${after.version}:${actor}` };
    this.schedule();
    this.onMove?.({ actor, action: a, before, after });
  }

  /** Only two clocks run here: the undo window after a call, and the final free throws. */
  private schedule() {
    clearTimeout(this.timer);
    const g = this.g;
    const due = g.pendingCall?.deadline ?? (g.phase === 'reaction' ? g.deadline : null);
    if (due == null) return;
    this.timer = setTimeout(() => {
      const before = this.g;
      const after = expireTurn(before, Date.now() + 5);
      if (after === before) return this.schedule();
      this.g = tame(after);
      if (after.phase === 'results' && before.phase !== 'results') this.sound = { name: 'dutch', id: `end:${after.version}` };
      this.schedule();
      this.onMove?.({ actor: '', action: null, before, after: this.g });
      this.push?.(this.state());
    }, Math.max(0, due - Date.now()) + 20);
  }
}
