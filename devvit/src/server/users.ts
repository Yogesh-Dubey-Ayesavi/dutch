import { BOT_AVATAR, defaultAvatar } from '../shared/avatars';
import { reddit, redis } from '@devvit/web/server';
import { CATALOG, DEFAULT_EQUIPPED, FREE_ITEMS, cosmeticsFrom, type ItemType } from '../shared/catalog';
import type { Profile, Seat } from '../shared/api';

/** Everyone starts from zero and climbs; a rating never goes below zero. */
export const START_RATING = 0;
export const BOT_ID = 'bot';
export const keys = {
  user: (id: string) => `user:${id}`,
  owned: (id: string) => `user:${id}:owned`,
  active: (id: string) => `user:${id}:active`,
  bot: (id: string) => `user:${id}:bot`,
  lb: 'lb:rating',
  queue: 'mm:queue',
  entry: (id: string) => `mm:entry:${id}`,
  match: (id: string) => `match:${id}`,
  settled: (id: string) => `match:${id}:settled`,
  result: (id: string) => `match:${id}:result`,
  share: (m: string, u: string) => `share:${m}:${u}`,
  pair: (a: string, b: string, day: string) => `pair:${[a, b].sort().join(':')}:${day}`,
  rate: (id: string, sec: number) => `rate:${id}:${sec}`,
};
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const inSeconds = (s: number) => new Date(Date.now() + s * 1000);
const TYPES: ItemType[] = ['back', 'table', 'face', 'flip'];

const AVATAR_TTL_MS = 7 * 86_400_000;
/** Look up the player's Reddit avatar at most once a week; a failed lookup must never block playing. */
async function fetchAvatar(id: string, username: string, u: Record<string, string>) {
  let url = '';
  try {
    url = (await Promise.race([reddit.getSnoovatarUrl(username), new Promise<undefined>((r) => setTimeout(r, 2000))])) ?? '';
  } catch { url = ''; }
  u.avatar = url; u.avatarAt = String(Date.now());
  await redis.hSet(keys.user(id), { avatar: url, avatarAt: u.avatarAt });
}
/** Only a first visit waits for Reddit's avatar lookup; after that a stale one is refreshed in the background. */
async function refreshAvatar(id: string, username: string, u: Record<string, string>) {
  if (u.avatarAt && Date.now() - Number(u.avatarAt) < AVATAR_TTL_MS) return;
  if (u.avatarAt) { void fetchAvatar(id, username, { ...u }).catch(() => {}); return; }
  await fetchAvatar(id, username, u);
}

export async function ensureUser(id: string, username: string): Promise<Record<string, string>> {
  const k = keys.user(id);
  let u = await redis.hGetAll(k);
  if (!u || !u.rating) {
    u = { username, rating: String(START_RATING), ratedGames: '0', wins: '0', chips: '0', lastDelta: '', lastDailyBonus: '', seenTutorial: '0',
      eq_back: DEFAULT_EQUIPPED.back, eq_table: DEFAULT_EQUIPPED.table, eq_face: DEFAULT_EQUIPPED.face, eq_flip: DEFAULT_EQUIPPED.flip };
    await Promise.all([redis.hSet(k, u), redis.hSet(keys.owned(id), Object.fromEntries(FREE_ITEMS.map((i) => [i, '1'])))]);
  } else if (u.username !== username && username) {
    await redis.hSet(k, { username });
    u.username = username;
  }
  await refreshAvatar(id, username, u);
  return u;
}

export const equippedOf = (u: Record<string, string>) => Object.fromEntries(TYPES.map((t) => [t, u[`eq_${t}`] || DEFAULT_EQUIPPED[t]])) as Record<ItemType, string>;

/** What a profile needs besides the user hash, all read at once. */
export async function profileReads(id: string) {
  const [owned, asc, total] = await Promise.all([redis.hGetAll(keys.owned(id)), redis.zRank(keys.lb, id), redis.zCard(keys.lb)]);
  return { owned: Object.keys(owned ?? {}), asc, total };
}

export async function profileOf(id: string, u: Record<string, string>, pre?: Awaited<ReturnType<typeof profileReads>>): Promise<Profile> {
  const { owned, asc, total } = pre ?? (await profileReads(id));
  const equipped = equippedOf(u);
  const ratedGames = Number(u.ratedGames || 0);
  const rank = ratedGames > 0 && asc !== undefined && asc !== null ? total - asc : null;
  return {
    userId: id, username: u.username, rating: Number(u.rating), lastDelta: u.lastDelta === '' || u.lastDelta === undefined ? null : Number(u.lastDelta),
    chips: Number(u.chips || 0), ratedGames, wins: Number(u.wins || 0), rank, dailyBonusReady: u.lastDailyBonus !== utcDay(),
    owned: [...new Set([...owned, ...FREE_ITEMS])].filter((i) => CATALOG.some((c) => c.id === i)), equipped, cosmetics: cosmeticsFrom(equipped), seenTutorial: u.seenTutorial === '1', tutorialAt: u.tutorialAt ?? '', avatar: u.avatar || defaultAvatar(id),
  };
}

export async function seatFor(id: string, username: string): Promise<Seat> {
  const u = await ensureUser(id, username);
  return { userId: id, username: u.username, rating: Number(u.rating), cosmetics: cosmeticsFrom(equippedOf(u)), bot: false, avatar: u.avatar || defaultAvatar(id) };
}

export function botSeat(rating: number): Seat {
  return { userId: BOT_ID, username: 'Warm-up bot', rating, bot: true, avatar: BOT_AVATAR, cosmetics: { back: 'red', table: 'blue', face: 'default', flip: 'classic' } };
}

/** 10 actions per second per user (Technical Spec: stop spam taps). */
export async function rateLimited(id: string): Promise<boolean> {
  const k = keys.rate(id, Math.floor(Date.now() / 1000));
  const n = await redis.incrBy(k, 1);
  if (n === 1) await redis.expire(k, 3);
  return n > 20;
}
