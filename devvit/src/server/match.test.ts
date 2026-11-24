import { describe, expect, it, vi } from 'vitest';
vi.mock('@devvit/web/server', () => ({ redis: {}, realtime: { send: async () => {} } }));
import { createMatch, progress, playerAction, envelope, type MatchRecord } from './match';
import { botSeat } from './users';
import type { Seat } from '../shared/api';

const bot = (id: string): Seat => ({ ...botSeat(1000), userId: id, username: id });
function conserve(rec: MatchRecord) {
  const g = rec.game;
  const all = [...g.deck, ...g.discard, ...g.players.flatMap((p) => p.hand), ...(g.drawn ? [g.drawn.card] : [])];
  expect(all.length).toBe(104);
  expect(new Set(all.map((c) => c.id)).size).toBe(104);
}
function run(rec: MatchRecord, start: number) {
  let now = start, steps = 0;
  const kinds = new Set<string>();
  while (!rec.over && steps < 200_000) {
    now += 250; steps++;
    progress(rec, now);
    if (rec.game.handPower) kinds.add(rec.game.handPower.kind);
    if (rec.game.phase !== 'results' && rec.game.phase !== 'finished') conserve(rec);
  }
  return { now, steps, kinds };
}

describe('bot vs bot through the server loop', () => {
  it('plays full 13-round matches to the end, using Queen and Ace powers', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 6; m++) {
      const rec = createMatch('bot', bot('b1'), bot('b2'), 0);
      const { kinds } = run(rec, 0);
      kinds.forEach((k) => seen.add(k));
      expect(rec.over).toBe(true);
      expect(rec.game.history).toHaveLength(13);
      expect(rec.result?.scores).toBeDefined();
    }
    expect(seen.has('rearrange')).toBe(true);
    expect(seen.has('blindSwap')).toBe(true);
  });

  it('waits for a human dealer, lets a bot dealer pick 0, 1 or 2, and passes the deal each round', () => {
    const human: Seat = { userId: 'h', username: 'h', rating: 0, bot: false, cosmetics: botSeat(0).cosmetics };
    const rec = createMatch('bot', human, botSeat(0), 0);
    rec.pings.h = 1e12;
    progress(rec, 1000);
    expect(rec.game.phase).toBe('choosing');
    expect(rec.game.moderator).toBe('h');
    playerAction(rec, 'h', { type: 'peekCount', count: 1 }, undefined, 1000);
    expect(rec.game.peekCount).toBe(1);
    expect(rec.game.phase).toBe('peeking');
    // the bot opens; the next round the bot deals and picks within a few seconds
    rec.game = { ...rec.game, round: 1 };
    let now = 1000;
    while (rec.game.round === 1 && now < 2e6) { now += 500; progress(rec, now); if (rec.game.phase === 'peeking' && !rec.game.players[0].peekDone) playerAction(rec, 'h', { type: 'finishPeek' }, undefined, now); }
    expect(rec.game.phase).toBe('choosing');
    expect(rec.game.moderator).not.toBe('h');
    const t = now;
    while (rec.game.phase === 'choosing' && now < t + 5000) { now += 250; progress(rec, now); }
    expect(['peeking', 'playing']).toContain(rec.game.phase);
    expect([0, 1, 2]).toContain(rec.game.peekCount);
  });

  it('redacts hidden cards in every envelope it would send a human', () => {
    const human: Seat = { userId: 'h', username: 'h', rating: 1000, bot: false, cosmetics: botSeat(1000).cosmetics };
    const rec = createMatch('bot', human, botSeat(1000), 0);
    rec.pings.h = 1e12; // keep the human "connected" so the autopilot stays off
    let now = 0;
    for (let i = 0; i < 400 && !rec.over; i++) {
      now += 500;
      progress(rec, now);
      const e = envelope(rec, 'h', now);
      const opp = e.view.players.find((p) => p.id !== 'h')!;
      if (e.view.phase !== 'results' && e.view.phase !== 'finished') expect(opp.hand.every((c) => c === null)).toBe(true);
      expect('deck' in e.view).toBe(false);
      // the human just lets every turn time out
      if (e.view.phase === 'peeking' && !e.view.players.find((p) => p.id === 'h')!.peekDone) playerAction(rec, 'h', { type: 'finishPeek' }, undefined, now);
    }
  });

  it('accepts hand-only moves and free throws on a slightly stale version, rejects other stale actions', () => {
    const rec = createMatch('bot', bot('h'), bot('b2'), 0);
    const g = () => rec.game;
    const me = 'h';
    const v = g().version;
    // advance the table by one so the client's version is stale
    rec.game = { ...rec.game, version: v + 1 };
    const reorder = { type: 'reorder', from: 0, to: 1, handRevision: g().players.find((p) => p.id === me)!.handRevision } as never;
    expect(() => playerAction(rec, me, reorder, v, 1)).not.toThrow();
    expect(() => playerAction(rec, me, { type: 'draw', source: 'deck' } as never, v - 5, 1)).toThrow(/moved on/);
  });
});
