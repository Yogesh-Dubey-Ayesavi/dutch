/**
 * Match lifecycle on Devvit: the rules engine is the single source of truth, Redis holds the state and
 * Realtime only says "version N is out". Each client then fetches its own redacted view, so a hidden card
 * value never travels on a shared channel. There is no game loop: every step stores a deadline and any
 * request after it (clients call /tick when their countdown hits zero) applies the timeout first.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { realtime, redis } from '@devvit/web/server';
import { addPlayer, applyAction, deck, expireTurn, GameError, newGame, viewFor, type Action, type Card, type Game, type Rules } from '@engine';
import { botMove, botThrow, forget, updateMemory } from './bot';
import { BOT_ID, START_RATING, inSeconds, keys, utcDay } from './users';
import type { ChipLine, MatchEnvelope, MatchResult, Seat } from '../shared/api';
import type { ChatLine, SoundName } from '../shared/protocol';
import { CHAT_HISTORY } from '../shared/protocol';
import { soundFor } from '../shared/sounds';

export const CLUTCH_RULES: Partial<Rules> = { rounds: 13, turnSeconds: 30, peekSeconds: 10, powers: true, burning: 'rank', callerMustBeLowest: true, maxTurns: 200, acePower: true };
/** Round end stays up at least this long; after that the round starts once both players press Next round. */
export const ROUND_MIN_MS = 10_000;
/** …and never longer than this, so a player who walked away cannot stall the duel. */
export const ROUND_MAX_MS = 40_000;
const MATCH_TTL_S = 2 * 60 * 60;
const DISCONNECT_MS = 10_000;
const FORFEIT_MS = 60_000;

export interface MatchRecord {
  id: string; mode: 'ranked' | 'bot'; createdAt: number; game: Game; seats: Seat[];
  pings: Record<string, number>; resultsAt: number | null; botAt: Record<string, number>; botThrowAt: Record<string, number>;
  memory: Record<string, string[]>; result: MatchResult | null; over: boolean;
  /** The sound the latest action made, played at both seats (same rules as the original table). */
  sound?: { name: SoundName; id: string } | null; chat?: ChatLine[];
  /** Players who pressed Next round on the current round-end screen. */
  readyNext?: string[];
  /** A random key per human seat: their private push channel is m_<match>_<key>, so a rival can't listen in. */
  live?: Record<string, string>;
}

export function shuffled(): Card[] {
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
export const newId = () => randomBytes(9).toString('hex');

export function createMatch(mode: 'ranked' | 'bot', a: Seat, b: Seat, now: number): MatchRecord {
  let g = newGame(a.userId, CLUTCH_RULES);
  g = addPlayer(g, a.userId, a.username, 0);
  g = addPlayer(g, b.userId, b.username, 1);
  g = applyAction(g, a.userId, { type: 'start' }, now, shuffled());
  const rec: MatchRecord = { id: newId(), mode, createdAt: now, game: g, seats: [a, b], pings: { [a.userId]: now, [b.userId]: now },
    resultsAt: null, botAt: {}, botThrowAt: {}, memory: {}, result: null, over: false,
    live: Object.fromEntries([a, b].filter((s) => !s.bot).map((s) => [s.userId, newId()])) };
  progress(rec, now);
  return rec;
}

export async function loadMatch(id: string): Promise<MatchRecord | null> {
  const raw = await redis.get(keys.match(id));
  return raw ? (JSON.parse(raw) as MatchRecord) : null;
}
export async function saveNew(rec: MatchRecord) { await redis.set(keys.match(rec.id), JSON.stringify(rec), { expiration: inSeconds(MATCH_TTL_S) }); }

/** Read-modify-write a match inside WATCH/MULTI/EXEC, retrying on a concurrent write. */
export async function mutate<T>(id: string, fn: (rec: MatchRecord, now: number) => T): Promise<{ rec: MatchRecord; out: T; changed: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const tx = await redis.watch(keys.match(id));
    const raw = await redis.get(keys.match(id));
    if (!raw) { await tx.unwatch(); throw new GameError('That duel is over.'); }
    const rec = JSON.parse(raw) as MatchRecord;
    const now = Date.now();
    let out: T;
    try { out = fn(rec, now); } catch (e) { await tx.unwatch(); throw e; }
    const next = JSON.stringify(rec);
    if (next === raw) { await tx.unwatch(); return { rec, out, changed: false }; }
    await tx.multi();
    await tx.set(keys.match(id), next, { expiration: inSeconds(MATCH_TTL_S) });
    try {
      const res = await tx.exec();
      if (res !== null && res !== undefined) return { rec, out, changed: true };
    } catch { /* lost the race; retry */ }
  }
  throw new GameError('The table is busy. Try again.');
}

const isHuman = (rec: MatchRecord, id: string) => !rec.seats.find((s) => s.userId === id)?.bot;
const disconnected = (rec: MatchRecord, id: string, now: number) => isHuman(rec, id) && now - (rec.pings[id] ?? 0) > DISCONNECT_MS;

function mem(rec: MatchRecord, id: string) { return new Set(rec.memory[id] ?? []); }

/** Apply one action for `actor` and keep every seat's memory honest. */
function act(rec: MatchRecord, actor: string, a: Action, now: number) {
  const before = rec.game;
  const needsDeck = a.type === 'nextRound' || a.type === 'start' || a.type === 'rematch';
  rec.game = applyAction(before, actor, a, now, needsDeck ? shuffled() : undefined);
  const name = soundFor(before, rec.game, actor, a, now);
  if (name) rec.sound = { name, id: `${rec.game.version}:${actor}` };
  for (const s of rec.seats) {
    if (s.bot || rec.memory[s.userId]) rec.memory[s.userId] = [...updateMemory(before, rec.game, s.userId, mem(rec, s.userId), a, actor)];
  }
}

/** Runs everything that is due: timeouts, round advance, bot moves, forfeits. */
export function progress(rec: MatchRecord, now: number) {
  if (rec.over) return;
  for (let guard = 0; guard < 12; guard++) {
    const g = rec.game;
    const expired = expireTurn(g, now);
    if (expired !== g) { rec.game = expired; continue; }
    if (g.phase === 'results') {
      rec.resultsAt ??= now;
      const elapsed = now - rec.resultsAt;
      const ready = rec.readyNext ?? [];
      const everyoneReady = rec.seats.every((x) => x.bot || ready.includes(x.userId) || disconnected(rec, x.userId, now));
      if ((elapsed >= ROUND_MIN_MS && everyoneReady) || elapsed >= ROUND_MAX_MS) { rec.resultsAt = null; rec.readyNext = []; act(rec, g.hostId, { type: 'nextRound' }, now); continue; }
      return;
    }
    if (g.phase === 'finished') { finish(rec, null); return; }
    // Forfeit: a player gone for 60 seconds loses.
    const gone = rec.seats.find((s) => !s.bot && now - (rec.pings[s.userId] ?? 0) > FORFEIT_MS);
    if (gone && rec.mode === 'ranked') { finish(rec, gone.userId); return; }
    if (!botStep(rec, now)) return;
  }
}

/**
 * A bot move may happen this much before its timer. The phone asks for it (a tick) this much early too, so the
 * ~300 ms trip through Reddit overlaps the bot's "thinking" pause instead of being added after it.
 */
export const BOT_EARLY_MS = 300;

/** One bot/autopilot step if due. Returns true when it changed the state. */
function botStep(rec: MatchRecord, now: number): boolean {
  for (const seat of rec.seats) {
    const id = seat.userId;
    const autopilot = !seat.bot && disconnected(rec, id, now);
    if (!seat.bot && !autopilot) { delete rec.botAt[id]; delete rec.botThrowAt[id]; continue; }
    const memory = mem(rec, id);
    // Free throws race the human: a random 600–1,500 ms reaction.
    const t = seat.bot ? botThrow(rec.game, id, memory, now) : null;
    if (t) {
      const at = rec.botThrowAt[id] ??= now + randomInt(600, 1500);
      if (now >= at - BOT_EARLY_MS) { delete rec.botThrowAt[id]; if (tryAct(rec, id, t, now)) return true; }
    } else delete rec.botThrowAt[id];
    const move = botMove(rec.game, id, memory, { autopilot });
    if (!move) { delete rec.botAt[id]; continue; }
    const at = rec.botAt[id] ??= now + move.delayMs;
    if (now < at - BOT_EARLY_MS) continue;
    delete rec.botAt[id];
    if (move.action.type === 'draw') { forget(memory); rec.memory[id] = [...memory]; }
    if (tryAct(rec, id, move.action, now)) return true;
  }
  return false;
}
function tryAct(rec: MatchRecord, id: string, a: Action, now: number) {
  try { act(rec, id, a, now); return true; } catch { return false; }
}

/** Apply a player's action, after running whatever is due. */
export function playerAction(rec: MatchRecord, actor: string, a: Action, clientVersion: number | undefined, now: number) {
  progress(rec, now);
  if (rec.over) throw new GameError('This duel has ended.');
  // Same freshness rules as the original table: turn actions must be based on the version the player saw, but
  // moves that only touch your own hand (reorder, peeks) or carry their own target + hand revision (a free
  // throw) must never bounce just because another update landed first.
  const recent = clientVersion !== undefined && clientVersion < rec.game.version && clientVersion >= rec.game.version - 1000;
  const concurrentThrow = a.type === 'burn' && recent && typeof a.targetId === 'string' && Number.isInteger(a.handRevision);
  const privateMove = recent && ((a.type === 'reorder' && Number.isInteger(a.handRevision)) || ['initialPeek', 'finishPeek', 'powerPeek'].includes(a.type));
  if (clientVersion !== undefined && clientVersion !== rec.game.version && !concurrentThrow && !privateMove && a.type !== 'undoCall') throw new GameError('The table moved on. Try that again.');
  act(rec, actor, a, now);
  progress(rec, now);
}

export function ping(rec: MatchRecord, id: string, now: number) {
  rec.pings[id] = now;
  delete rec.botAt[id];
  progress(rec, now);
}

function totals(g: Game) {
  const t: Record<string, number> = Object.fromEntries(g.players.map((p) => [p.id, 0]));
  for (const h of g.history) for (const [id, v] of Object.entries(h.scores)) t[id] = (t[id] ?? 0) + v;
  return t;
}

function finish(rec: MatchRecord, forfeitBy: string | null) {
  const g = rec.game;
  const scores = totals(g);
  const [a, b] = rec.seats.map((s) => s.userId);
  let winner: string | null = scores[a] === scores[b] ? null : scores[a] < scores[b] ? a : b;
  if (forfeitBy) winner = forfeitBy === a ? b : a;
  const autoDutchRounds: Record<string, number[]> = { [a]: [], [b]: [] };
  for (const h of g.history) if (h.autoDutch) autoDutchRounds[h.autoDutch]?.push(h.round);
  rec.result = { winner, forfeitBy, scores, rounds: g.history.length, rating: null, chips: null, autoDutchRounds, cancelled: false };
  rec.over = true;
}

/** Rating and chips, once per match, after the final state is saved. Bot duels and duels that end before
 *  round 1 finishes change nothing. */
export async function settle(rec: MatchRecord): Promise<MatchResult | null> {
  if (!rec.over || !rec.result) return rec.result;
  const first = await redis.set(keys.settled(rec.id), '1', { nx: true, expiration: inSeconds(7 * 86400) });
  if (!first) { const saved = await redis.get(keys.result(rec.id)); return saved ? JSON.parse(saved) : rec.result; }
  const r = rec.result;
  if (rec.mode === 'ranked' && r.rounds >= 1 && !r.cancelled) {
    const [A, B] = rec.seats;
    const ua = await redis.hGetAll(keys.user(A.userId)), ub = await redis.hGetAll(keys.user(B.userId));
    const day = utcDay();
    const pairCount = await redis.incrBy(keys.pair(A.userId, B.userId, day), 1);
    await redis.expire(keys.pair(A.userId, B.userId, day), 86400);
    const ra = Number(ua.rating ?? START_RATING), rb = Number(ub.rating ?? START_RATING);
    const sa = r.winner === null ? 0.5 : r.winner === A.userId ? 1 : 0;
    const ka = Number(ua.ratedGames || 0) < 20 ? 40 : 20, kb = Number(ub.ratedGames || 0) < 20 ? 40 : 20;
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    const counts = pairCount <= 3;
    const na = counts ? Math.max(0, Math.round(ra + ka * (sa - ea))) : ra, nb = counts ? Math.max(0, Math.round(rb + kb * ((1 - sa) - (1 - ea)))) : rb;
    r.rating = { [A.userId]: { from: ra, to: na }, [B.userId]: { from: rb, to: nb } };
    r.chips = {};
    for (const [seat, u, next] of [[A, ua, na], [B, ub, nb]] as const) {
      const lines: ChipLine[] = [];
      lines.push(r.winner === seat.userId ? { k: r.forfeitBy ? 'Win by forfeit' : 'Win', v: 50 } : { k: 'Played a duel', v: 15 });
      for (const round of r.autoDutchRounds[seat.userId] ?? []) lines.push({ k: `Auto-Dutch · round ${round}`, v: 10 });
      if (u.lastDailyBonus !== day) lines.push({ k: 'First duel today', v: 25 });
      r.chips[seat.userId] = lines;
      const gained = lines.reduce((s, l) => s + l.v, 0);
      await redis.hSet(keys.user(seat.userId), {
        rating: String(next), lastDelta: String(next - Number(u.rating ?? START_RATING)), ratedGames: String(Number(u.ratedGames || 0) + 1),
        wins: String(Number(u.wins || 0) + (r.winner === seat.userId ? 1 : 0)), chips: String(Number(u.chips || 0) + gained), lastDailyBonus: day,
      });
      await redis.zAdd(keys.lb, { member: seat.userId, score: next });
    }
  }
  await redis.set(keys.result(rec.id), JSON.stringify(r), { expiration: inSeconds(7 * 86400) });
  for (const s of rec.seats) if (!s.bot) {
    if ((await redis.get(keys.active(s.userId))) === rec.id) await redis.del(keys.active(s.userId));
    if ((await redis.get(keys.bot(s.userId))) === rec.id) await redis.del(keys.bot(s.userId));
  }
  return r;
}

const now0 = () => Date.now();
export function nextTickAt(rec: MatchRecord): number | null {
  if (rec.over) return null;
  const g = rec.game;
  const c = [g.deadline, g.pendingCall?.deadline, g.reactionWindow?.deadline, rec.resultsAt !== null ? rec.resultsAt + (now0() < rec.resultsAt + ROUND_MIN_MS ? ROUND_MIN_MS : ROUND_MAX_MS) : null,
    ...[...Object.values(rec.botAt), ...Object.values(rec.botThrowAt)].map((x) => x - BOT_EARLY_MS)].filter((x): x is number => typeof x === 'number');
  // Computed right after progress() ran, so anything already past is spent (a closed match window keeps its old
  // deadline). Counting it made every client tick every 150 ms for the rest of the turn.
  const now = now0();
  const ahead = c.filter((x) => x > now);
  return ahead.length ? Math.min(...ahead) : null;
}

export function envelope(rec: MatchRecord, viewer: string, now: number, shared = false): MatchEnvelope {
  const opp = rec.seats.find((s) => s.userId !== viewer)!;
  const oppGone = !opp.bot && disconnected(rec, opp.userId, now);
  return {
    matchId: rec.id, mode: rec.mode, now, live: rec.live?.[viewer] ? liveChannel(rec, viewer) : null, view: viewFor(rec.game, viewer, rec.seats.filter((s) => s.bot || !disconnected(rec, s.userId, now)).map((s) => s.userId)),
    seats: rec.seats, nextTickAt: nextTickAt(rec), resultsUntil: rec.resultsAt !== null ? rec.resultsAt + ROUND_MIN_MS : null, resultsMaxUntil: rec.resultsAt !== null ? rec.resultsAt + ROUND_MAX_MS : null, nextReady: rec.readyNext ?? [],
    opponentStatus: opp.bot ? 'bot' : oppGone ? 'disconnected' : 'connected', forfeitAt: oppGone ? (rec.pings[opp.userId] ?? now) + FORFEIT_MS : null,
    result: rec.result, shared, sound: rec.sound ?? null, chat: rec.chat ?? [],
  };
}

export const liveChannel = (rec: MatchRecord, userId: string) => `m_${rec.id}_${rec.live![userId]}`;

/**
 * Push the new table to every human seat except `actor` (who gets it in their reply), each on their private
 * channel with their own view. A bot game pushes nothing. Falls back to the shared "something changed" notice
 * (the client then fetches) for older matches without keys, or if a push fails.
 */
export async function broadcast(rec: MatchRecord, actor?: string) {
  const now = Date.now();
  const to = rec.seats.filter((s) => !s.bot && s.userId !== actor);
  if (!to.length) return;
  const sent = await Promise.all(to.map(async (s) => {
    if (!rec.live?.[s.userId]) return false;
    try { await realtime.send(liveChannel(rec, s.userId), { env: envelope(rec, s.userId, now) } as never); return true; } catch (e) { console.error('realtime push', e); return false; }
  }));
  if (sent.every(Boolean)) return;
  try { await realtime.send(`m_${rec.id}`, { v: rec.game.version, over: rec.over, sound: rec.sound ?? null }); } catch (e) { console.error('realtime', e); }
}

export function cancelMatch(rec: MatchRecord) {
  rec.over = true;
  rec.result = { winner: null, forfeitBy: null, scores: totals(rec.game), rounds: rec.game.history.length, rating: null, chips: null, autoDutchRounds: {}, cancelled: true };
}
export function forfeit(rec: MatchRecord, id: string) { if (!rec.over) finish(rec, id); }
export { BOT_ID };

export function addChat(rec: MatchRecord, playerId: string, text: string, now: number): ChatLine {
  const line: ChatLine = { id: newId(), playerId, text, at: now };
  rec.chat = [...(rec.chat ?? []), line].slice(-CHAT_HISTORY);
  return line;
}
export async function sendLive(rec: MatchRecord, msg: { emote?: { playerId: string; emoji: string; id: string }; chat?: ChatLine }) {
  try { await realtime.send(`m_${rec.id}`, { v: rec.game.version, over: rec.over, ...msg } as never); } catch (e) { console.error('realtime', e); }
}

/** A player pressed Next round. Counts only while the round-end screen is up. */
export function markReady(rec: MatchRecord, userId: string, now: number) {
  if (rec.game.phase === 'results') { rec.readyNext ??= []; if (!rec.readyNext.includes(userId)) rec.readyNext.push(userId); }
  progress(rec, now);
}
