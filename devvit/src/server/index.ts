import type { IncomingMessage, ServerResponse } from 'node:http';
import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import { GameError, type Action } from '@engine';
import { CATALOG, itemById, type ItemType } from '../shared/catalog';
import type { ActiveMatchSummary, LeaderboardResponse, SessionResponse, SharePreview, ShopResponse } from '../shared/api';
import { EMOTES, CHAT_PRESETS, type ChatLine } from '../shared/protocol';
import { addChat, broadcast, cancelMatch, newId, sendLive, envelope, forfeit, loadMatch, mutate, nextTickAt, ping, markReady, playerAction, progress, settle, type MatchRecord } from './match';
import { cleanup, join, leave, poll, startBotGame } from './queue';
import { ensureUser, inSeconds, keys, profileOf, profileReads, rateLimited } from './users';
import { defaultAvatar } from '../shared/avatars';

type Json = Record<string, unknown>;
type Handler = (body: Json, params: string[]) => Promise<unknown>;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) => routes.push([method, new RegExp(`^${path.replace(/:\w+/g, '([\\w-]+)')}$`), h]);

async function me() {
  const userId = context.userId;
  if (!userId) throw new HttpError(401, 'Log in to play.');
  const username = context.username ?? (await reddit.getCurrentUsername()) ?? 'player';
  return { userId, username };
}
const totals = (rec: MatchRecord) => {
  const t: Record<string, number> = {};
  for (const h of rec.game.history) for (const [id, v] of Object.entries(h.scores)) t[id] = (t[id] ?? 0) + v;
  return t;
};
/** `actor` already gets the new state in their reply, so only the other player is pushed to. */
async function finishUp(rec: MatchRecord, changed: boolean, actor?: string) {
  if (rec.over) rec.result = (await settle(rec)) ?? rec.result;
  if (changed) await broadcast(rec, actor);
}
/** The seat check, done inside the match update itself (one read instead of two). */
/** A player counts as gone after 10 s without a ping (DISCONNECT_MS). The client pings every 5 s and moves count
 * too, so a ping only needs saving when the last sign of life is over 4.5 s old: at most ~5.5 s stale. */
const PING_WRITE_MS = 4_500;
function sit(rec: MatchRecord, userId: string) {
  if (!rec.seats.some((s) => s.userId === userId)) throw new HttpError(403, 'You are not in this game.');
}
async function seated(matchId: string, userId: string) {
  const rec = await loadMatch(matchId);
  if (!rec) throw new HttpError(404, 'That duel has ended.');
  if (!rec.seats.some((s) => s.userId === userId)) throw new HttpError(403, 'You are not in this duel.');
  return rec;
}

route('GET', '/api/session', async () => {
  const { userId, username } = await me();
  // Everything the first screen needs, read in parallel: one round of reads, then the live match if there is one.
  const [u, pre, id] = await Promise.all([ensureUser(userId, username), profileReads(userId), redis.get(keys.active(userId))]);
  const [profile, rec] = await Promise.all([profileOf(userId, u, pre), id ? loadMatch(id) : null]);
  let active: ActiveMatchSummary | null = null;
  if (rec && !rec.over) {
    const opp = rec.seats.find((s) => s.userId !== userId)!;
    const t = totals(rec);
    const gone = Date.now() - (rec.pings[userId] ?? 0);
    active = { matchId: rec.id, opponent: opp.username, round: rec.game.round, you: t[userId] ?? 0, them: t[opp.userId] ?? 0, botMsLeft: gone > 10_000 ? Math.max(0, 60_000 - gone) : null };
  }
  return { profile, active, subreddit: context.subredditName, appVersion: context.appVersion ?? null } satisfies SessionResponse;
});

route('POST', '/api/tutorial/progress', async (body) => {
  const { userId } = await me();
  const at = typeof body.at === 'string' && /^[a-z]{0,16}$/.test(body.at) ? body.at : null;
  if (at === null) throw new HttpError(400, 'Invalid tutorial step.');
  await redis.hSet(keys.user(userId), { tutorialAt: at });
  return { ok: true };
});
route('POST', '/api/tutorial/seen', async () => { const { userId } = await me(); await redis.hSet(keys.user(userId), { seenTutorial: '1' }); return { ok: true }; });

route('POST', '/api/queue/join', async () => { const { userId, username } = await me(); return join(userId, username); });
route('POST', '/api/queue/poll', async () => { const { userId, username } = await me(); return poll(userId, username); });
route('POST', '/api/queue/leave', async () => { const { userId } = await me(); await leave(userId); return { ok: true }; });
route('POST', '/api/queue/bot', async () => {
  const { userId, username } = await me();
  const rec = await startBotGame(userId, username);
  return envelope(rec, userId, Date.now());
});

route('GET', '/api/match/:id/state', async (_b, [id]) => {
  const { userId } = await me();
  await seated(id, userId);
  const { rec, changed } = await mutate(id, (r, now) => ping(r, userId, now));
  await finishUp(rec, changed, userId);
  const shared = !!(await redis.get(keys.share(id, userId)));
  return envelope(rec, userId, Date.now(), shared);
});
route('POST', '/api/match/:id/action', async (body, [id]) => {
  const { userId } = await me();
  if (await rateLimited(userId)) throw new HttpError(429, 'Slow down a little.');
  const action = body.action as Action | undefined;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new HttpError(400, 'Invalid action.');
  if (['start', 'nextRound', 'rematch', 'rules', 'ready'].includes(action.type)) throw new HttpError(400, 'The table handles that.');
  if (JSON.stringify(action).length > 2048) throw new HttpError(400, 'Invalid action.');
  const { rec, changed } = await mutate(id, (r, now) => { sit(r, userId); r.pings[userId] = now; playerAction(r, userId, action, typeof body.v === 'number' ? body.v : undefined, now); });
  await finishUp(rec, changed, userId);
  return envelope(rec, userId, Date.now());
});
route('POST', '/api/match/:id/emote', async (body, [id]) => {
  const { userId } = await me();
  const rec = await seated(id, userId);
  if (!EMOTES.includes(String(body.emoji))) throw new HttpError(400, 'Unknown reaction.');
  await sendLive(rec, { emote: { playerId: userId, emoji: String(body.emoji), id: newId() } });
  return { ok: true };
});
route('POST', '/api/match/:id/chat', async (body, [id]) => {
  const { userId } = await me();
  await seated(id, userId);
  const text = String(body.text ?? '');
  if (!CHAT_PRESETS.includes(text)) throw new HttpError(400, 'Pick one of the quick replies.');
  let line: ChatLine | null = null;
  const { rec } = await mutate(id, (r, now) => { line = addChat(r, userId, text, now); });
  await sendLive(rec, { chat: line! });
  return { ok: true, line };
});
route('POST', '/api/match/:id/next', async (_b, [id]) => {
  const { userId } = await me();
  const { rec, changed } = await mutate(id, (r, now) => { sit(r, userId); r.pings[userId] = now; markReady(r, userId, now); });
  await finishUp(rec, changed, userId);
  return envelope(rec, userId, Date.now());
});
route('POST', '/api/match/:id/tick', async (_b, [id]) => {
  const { userId } = await me();
  const { rec, changed } = await mutate(id, (r, now) => { sit(r, userId); r.pings[userId] = now; progress(r, now); });
  await finishUp(rec, changed, userId);
  return envelope(rec, userId, Date.now());
});
route('POST', '/api/match/:id/ping', async (_b, [id]) => {
  const { userId } = await me();
  // Most pings change nothing worth saving: just read. Rewriting the match every 5 s took the same lock as moves,
  // so a ping landing with a move made one of them start over.
  const cur = await seated(id, userId);
  const now = Date.now();
  const due = nextTickAt(cur);
  if (!cur.over && now - (cur.pings[userId] ?? 0) < PING_WRITE_MS && (due === null || due > now)) return { ok: true, v: cur.game.version };
  const { rec, changed } = await mutate(id, (r, t) => ping(r, userId, t));
  await finishUp(rec, changed);
  return { ok: true, v: rec.game.version };
});
route('POST', '/api/match/:id/forfeit', async (_b, [id]) => {
  const { userId } = await me();
  await seated(id, userId);
  const { rec, changed } = await mutate(id, (r) => {
    // Leaving a bot game, or a duel that never got going, costs nothing.
    if (r.mode === 'bot' || r.game.history.length === 0) cancelMatch(r); else forfeit(r, userId);
  });
  await finishUp(rec, changed, userId);
  return envelope(rec, userId, Date.now());
});
/** Turned down a human duel found during a bot warm-up: the duel is called off for both, nobody loses. */
route('POST', '/api/match/:id/decline', async (_b, [id]) => {
  const { userId } = await me();
  await seated(id, userId);
  const { rec, changed } = await mutate(id, (r) => { if (r.game.history.length === 0) cancelMatch(r); });
  for (const s of rec.seats) if (!s.bot) await redis.del(keys.active(s.userId));
  await finishUp(rec, changed);
  return { ok: true };
});

route('GET', '/api/leaderboard', async () => {
  const { userId, username } = await me();
  const u = await ensureUser(userId, username);
  const top = await redis.zRange(keys.lb, 0, 49, { by: 'rank', reverse: true });
  const rows = [] as LeaderboardResponse['rows'];
  for (const [i, m] of top.entries()) {
    const h = await redis.hMGet(keys.user(m.member), ['username', 'ratedGames', 'avatar']);
    rows.push({ rank: i + 1, userId: m.member, username: h[0] ?? 'player', rating: m.score, duels: Number(h[1] ?? 0), avatar: h[2] || defaultAvatar(m.member) });
  }
  const p = await profileOf(userId, u);
  const meRow = p.rank ? { rank: p.rank, userId, username: p.username, rating: p.rating, duels: p.ratedGames } : null;
  return { rows, me: meRow, cutoff: rows.length >= 50 ? rows[49].rating : null } satisfies LeaderboardResponse;
});

async function shopState(userId: string): Promise<ShopResponse> {
  const u = await redis.hGetAll(keys.user(userId));
  const p = await profileOf(userId, u);
  return { chips: p.chips, items: CATALOG.map((i) => ({ ...i, owned: p.owned.includes(i.id), equipped: p.equipped[i.type] === i.id })) };
}
route('GET', '/api/shop', async () => { const { userId, username } = await me(); await ensureUser(userId, username); return shopState(userId); });
route('POST', '/api/shop/buy', async (body) => {
  const { userId, username } = await me();
  await ensureUser(userId, username);
  const item = itemById(String(body.itemId));
  if (!item) throw new HttpError(400, 'Unknown item.');
  for (let attempt = 0; attempt < 2; attempt++) {
    const tx = await redis.watch(keys.user(userId));
    const chips = Number((await redis.hGet(keys.user(userId), 'chips')) ?? 0);
    if (await redis.hGet(keys.owned(userId), item.id)) { await tx.unwatch(); return shopState(userId); }
    if (chips < item.price) { await tx.unwatch(); throw new HttpError(400, `You need ${item.price - chips} more chips.`); }
    await tx.multi();
    await tx.hSet(keys.user(userId), { chips: String(chips - item.price) });
    await tx.hSet(keys.owned(userId), { [item.id]: '1' });
    try { const r = await tx.exec(); if (r !== null && r !== undefined) return shopState(userId); } catch { /* retry once */ }
  }
  throw new HttpError(409, 'Purchase failed. Try again.');
});
route('POST', '/api/shop/equip', async (body) => {
  const { userId } = await me();
  const item = itemById(String(body.itemId));
  if (!item) throw new HttpError(400, 'Unknown item.');
  if (item.price > 0 && !(await redis.hGet(keys.owned(userId), item.id))) throw new HttpError(400, 'Buy it first.');
  await redis.hSet(keys.user(userId), { [`eq_${item.type as ItemType}`]: item.id });
  return shopState(userId);
});

async function shareText(matchId: string, userId: string) {
  const raw = await redis.get(keys.result(matchId));
  const rec = await loadMatch(matchId);
  if (!raw || !rec) throw new HttpError(404, 'That result has expired.');
  const r = JSON.parse(raw) as NonNullable<MatchRecord['result']>;
  if (rec.mode !== 'ranked' || r.cancelled) throw new HttpError(400, 'Only ranked duels can be shared.');
  const opp = rec.seats.find((s) => s.userId !== userId)!;
  const mine = r.scores[userId] ?? 0, theirs = r.scores[opp.userId] ?? 0;
  const verb = r.winner === userId ? (r.forfeitBy ? `beat u/${opp.username} by forfeit,` : `beat u/${opp.username}`) : r.winner === null ? `tied u/${opp.username}` : `lost to u/${opp.username}`;
  const parts = [`Clutch: ${verb} ${mine} to ${theirs}`];
  const ad = r.autoDutchRounds[userId] ?? [];
  if (ad.length) parts.push(`Auto-Dutch in round ${ad.join(', ')}`);
  const rt = r.rating?.[userId];
  if (rt) parts.push(`Rating ${rt.to.toLocaleString('en-US')} (${rt.to - rt.from >= 0 ? '+' : '−'}${Math.abs(rt.to - rt.from)})`);
  return parts.join(' · ');
}
route('GET', '/api/share/:id/preview', async (_b, [id]) => {
  const { userId } = await me();
  const text = await shareText(id, userId);
  const prev = await redis.get(keys.share(id, userId));
  const p = prev ? (JSON.parse(prev) as { at: number; permalink: string | null }) : null;
  return { text, already: !!p, sharedAt: p?.at ?? null, permalink: p?.permalink ?? null } satisfies SharePreview;
});
route('POST', '/api/share/:id', async (_b, [id]) => {
  const { userId } = await me();
  if (await redis.get(keys.share(id, userId))) throw new HttpError(409, 'Already shared.');
  const text = await shareText(id, userId);
  const postId = context.postId;
  if (!postId) throw new HttpError(400, 'Open the game post to share.');
  let comment;
  try { comment = await reddit.submitComment({ id: postId, text, runAs: 'USER' }); }
  catch { comment = await reddit.submitComment({ id: postId, text }); }
  const permalink = comment?.permalink ? `https://www.reddit.com${comment.permalink}` : null;
  await redis.set(keys.share(id, userId), JSON.stringify({ at: Date.now(), permalink }), { expiration: inSeconds(7 * 86400) });
  return { text, already: true, sharedAt: Date.now(), permalink } satisfies SharePreview;
});
route('POST', '/api/subscribe', async () => { await reddit.subscribeToCurrentSubreddit(); return { ok: true }; });

route('POST', '/internal/menu/create-post', async () => {
  const post = await reddit.submitCustomPost({ subredditName: context.subredditName, title: 'Clutch · Your cards are face down. Remember them. Lowest score wins.', entry: 'default' });
  return { navigateTo: post.url, showToast: { text: 'Clutch post created', appearance: 'success' } };
});
route('POST', '/internal/scheduler/cleanup', async () => ({ removed: await cleanup() }));

async function readBody(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 16_384) throw new HttpError(413, 'Too large.'); chunks.push(c as Buffer); }
  if (!chunks.length) return {};
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
function send(res: ServerResponse, status: number, body: unknown) {
  // Devvit rejects chunked replies: every response needs an explicit Content-Length.
  const data = Buffer.from(JSON.stringify(body ?? {}), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  try {
    const found = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!found) return send(res, 404, { error: 'Not found.' });
    const params = url.pathname.match(found[1])!.slice(1);
    const body = req.method === 'POST' ? await readBody(req) : {};
    const t0 = performance.now();
    const out = await found[2](body, params);
    // Time spent in our server (Stats for nerds splits a round trip into network vs. server with it).
    send(res, 200, out && typeof out === 'object' && !Array.isArray(out) ? { ...out, _srv: Math.round(performance.now() - t0) } : out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof GameError) return send(res, 409, { error: e.message });
    console.error('[api]', req.method, url.pathname, e);
    send(res, 500, { error: 'Something went wrong.', detail: (e instanceof Error ? e.message : String(e)).slice(0, 160) });
  }
});
server.listen(getServerPort());
