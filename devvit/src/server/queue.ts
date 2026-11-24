/** Matchmaking: a sorted set keyed by rating, re-checked on every join and poll (no background matcher). */
import { redis } from '@devvit/web/server';
import { createMatch, loadMatch, saveNew } from './match';
import { botSeat, inSeconds, keys, seatFor } from './users';
import type { QueueStatus, Seat } from '../shared/api';

const ENTRY_TTL_S = 60;
export const BOT_OFFER_MS = 30_000;

async function activeMatch(userId: string) {
  const id = await redis.get(keys.active(userId));
  if (!id) return null;
  const rec = await loadMatch(id);
  if (!rec || rec.over) { await redis.del(keys.active(userId)); return null; }
  return rec;
}

export async function join(userId: string, username: string): Promise<QueueStatus> {
  const live = await activeMatch(userId);
  if (live) return matched(live.id, live.seats, userId);
  const me = await seatFor(userId, username);
  const existing = await redis.hGetAll(keys.entry(userId));
  const joinedAt = existing?.joinedAt ?? String(Date.now());
  await redis.hSet(keys.entry(userId), { joinedAt, rating: String(me.rating), username });
  await redis.expire(keys.entry(userId), ENTRY_TTL_S);
  await redis.zAdd(keys.queue, { member: userId, score: me.rating });
  return poll(userId, username);
}

export async function leave(userId: string) {
  await redis.zRem(keys.queue, [userId]);
  await redis.del(keys.entry(userId));
}

function matched(matchId: string, seats: Seat[], userId: string): QueueStatus {
  return { status: 'matched', matchId, opponent: seats.find((s) => s.userId !== userId)! };
}

export async function poll(userId: string, username: string): Promise<QueueStatus> {
  const live = await activeMatch(userId);
  if (live) return matched(live.id, live.seats, userId);
  const entry = await redis.hGetAll(keys.entry(userId));
  if (!entry || !entry.joinedAt) return { status: 'idle' };
  await redis.expire(keys.entry(userId), ENTRY_TTL_S);
  const waited = Date.now() - Number(entry.joinedAt);
  const rating = Number(entry.rating);
  // Heal: being in the queue is what makes you findable, so re-assert it on every poll.
  await redis.zAdd(keys.queue, { member: userId, score: rating });
  const range = 100 + 50 * Math.floor(waited / 10_000);
  const near = await redis.zRange(keys.queue, rating - range, rating + range, { by: 'score' });
  const candidates = near.filter((m) => m.member !== userId).sort((a, b) => Math.abs(a.score - rating) - Math.abs(b.score - rating));
  for (const c of candidates) {
    const theirs = await redis.hGetAll(keys.entry(c.member));
    if (!theirs || !theirs.joinedAt) { await redis.zRem(keys.queue, [c.member]); continue; }
    const paired = await pair(userId, username, c.member, theirs.username ?? 'rival', c.score);
    if (paired) return paired;
  }
  return { status: 'waiting', waitedMs: waited, offerBot: waited >= BOT_OFFER_MS };
}

/**
 * Pair two queued players. Whoever has the lower user id is the one who pairs, so two polls can never pair each other
 * at once. The rival is claimed with ZREM, which is atomic: only one caller can ever take a given player out of the queue.
 */
async function pair(a: string, aName: string, b: string, bName: string, bScore: number): Promise<QueueStatus | null> {
  if (a > b) return null; // the other player's poll does the pairing
  let claimed = 0;
  try { claimed = await redis.zRem(keys.queue, [b]); } catch (e) { console.error('[queue] could not claim rival', e); return null; }
  if (!claimed) return null; // somebody else took them
  try {
    if (!(await redis.zRem(keys.queue, [a]))) { await redis.zAdd(keys.queue, { member: b, score: bScore }); return null; } // I was taken meanwhile: hand the rival back
    const seats = [await seatFor(a, aName), await seatFor(b, bName)];
    // The player who has waited longer (b) deals first. The match is stored before either player can see a pointer to it.
    const rec = createMatch('ranked', seats[1], seats[0], Date.now());
    await saveNew(rec);
    await redis.set(keys.active(a), rec.id, { expiration: inSeconds(7200) });
    await redis.set(keys.active(b), rec.id, { expiration: inSeconds(7200) });
    await redis.del(keys.entry(a), keys.entry(b));
    return matched(rec.id, rec.seats, a);
  } catch (e) {
    console.error('[queue] pairing failed, putting both back', e);
    try {
      const mine = Number(await redis.hGet(keys.entry(a), 'rating') ?? 0) || 0;
      await redis.zAdd(keys.queue, { member: a, score: mine }, { member: b, score: bScore });
    } catch { /* the next poll re-adds */ }
    return null;
  }
}
/** An unrated warm-up while the search continues. */
export async function startBotGame(userId: string, username: string) {
  const me = await seatFor(userId, username);
  const rec = createMatch('bot', me, botSeat(me.rating), Date.now());
  await saveNew(rec);
  await redis.set(keys.bot(userId), rec.id, { expiration: inSeconds(7200) });
  return rec;
}

export async function cleanup() {
  const all = await redis.zRange(keys.queue, 0, -1, { by: 'rank' });
  let removed = 0;
  for (const m of all) {
    const e = await redis.hGetAll(keys.entry(m.member));
    if (!e || !e.joinedAt) { await redis.zRem(keys.queue, [m.member]); removed++; }
  }
  return removed;
}
