/** Local stand-in for `@devvit/web/server`: in-memory Redis, a fixed identity per request, SSE for Realtime. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer as httpServer, type IncomingMessage, type ServerResponse } from 'node:http';

type Entry = { v: unknown; exp?: number };
const store = new Map<string, Entry>();
const live = (k: string) => { const e = store.get(k); if (!e) return undefined; if (e.exp && e.exp < Date.now()) { store.delete(k); return undefined; } return e; };
const version = new Map<string, number>();
const bump = (k: string) => version.set(k, (version.get(k) ?? 0) + 1);
const ttl = (o?: { expiration?: Date }) => o?.expiration ? o.expiration.getTime() : undefined;
type Z = Map<string, number>;
const zset = (k: string, make = false) => { let e = live(k); if (!e && make) { e = { v: new Map() as Z }; store.set(k, e); } return e?.v as Z | undefined; };
const hash = (k: string, make = false) => { let e = live(k); if (!e && make) { e = { v: {} as Record<string, string> }; store.set(k, e); } return e?.v as Record<string, string> | undefined; };

const ops = {
  async get(k: string) { return (live(k)?.v as string | undefined) ?? undefined; },
  async set(k: string, v: string, o?: { nx?: boolean; expiration?: Date }) { if (o?.nx && live(k)) return null; store.set(k, { v, exp: ttl(o) }); bump(k); return 'OK'; },
  async del(...ks: string[]) { for (const k of ks.flat()) { store.delete(k); bump(k); } },
  async expire(k: string, s: number) { const e = live(k); if (e) e.exp = Date.now() + s * 1000; },
  async incrBy(k: string, n: number) { const nv = Number(live(k)?.v ?? 0) + n; const e = live(k); store.set(k, { v: String(nv), exp: e?.exp }); bump(k); return nv; },
  async hGet(k: string, f: string) { return hash(k)?.[f]; },
  async hGetAll(k: string) { return { ...(hash(k) ?? {}) }; },
  async hMGet(k: string, fs: string[]) { return fs.map((f) => hash(k)?.[f]); },
  async hSet(k: string, o: Record<string, string>) { Object.assign(hash(k, true)!, o); bump(k); return Object.keys(o).length; },
  async zAdd(k: string, ...ms: { member: string; score: number }[]) { for (const m of ms) zset(k, true)!.set(m.member, m.score); bump(k); return ms.length; },
  async zScore(k: string, m: string) { return zset(k)?.get(m); },
  async zRem(k: string, ms: string[]) { for (const m of ms) zset(k)?.delete(m); bump(k); return ms.length; },
  async zCard(k: string) { return zset(k)?.size ?? 0; },
  async zRank(k: string, m: string) { const z = zset(k); if (!z || !z.has(m)) return undefined; return [...z.entries()].sort((a, b) => a[1] - b[1]).findIndex(([x]) => x === m); },
  async zRange(k: string, a: number, b: number, o?: { by?: string; reverse?: boolean }) {
    const z = zset(k); if (!z) return [];
    let rows = [...z.entries()].map(([member, score]) => ({ member, score })).sort((x, y) => x.score - y.score);
    if (o?.by === 'score') return rows.filter((r) => r.score >= a && r.score <= b);
    if (o?.reverse) rows = rows.reverse();
    return rows.slice(a, b < 0 ? undefined : b + 1);
  },
  async watch(...ks: string[]) {
    const watched = ks.flat(); const seen = watched.map((k) => version.get(k) ?? 0); let queue: (() => void)[] | null = null;
    const q = (f: () => void) => { (queue ??= []).push(f); };
    return {
      async multi() { queue = []; },
      async unwatch() { queue = null; },
      async set(k: string, v: string, o?: { expiration?: Date }) { q(() => { store.set(k, { v, exp: ttl(o) }); bump(k); }); },
      async del(...dk: string[]) { for (const k of dk.flat()) q(() => { store.delete(k); bump(k); }); },
      async hSet(k: string, o: Record<string, string>) { q(() => { Object.assign(hash(k, true)!, o); bump(k); }); },
      async zRem(k: string, ms: string[]) { q(() => { for (const m of ms) zset(k)?.delete(m); bump(k); }); },
      async exec() {
        if (watched.some((k, i) => (version.get(k) ?? 0) !== seen[i])) return null;
        for (const f of queue ?? []) f(); queue = null; return [];
      },
    };
  },
};
export const redis = ops;

const als = new AsyncLocalStorage<{ user: string }>();
const subs = new Map<string, Set<ServerResponse>>();
export const realtime = { async send(channel: string, msg: unknown) { for (const r of subs.get(channel) ?? []) r.write(`data: ${JSON.stringify(msg)}\n\n`); } };
export const context = {
  get userId() { return `t2_${als.getStore()?.user ?? 'you'}`; },
  get username() { return als.getStore()?.user ?? 'you'; },
  subredditName: 'test', postId: 't3_local',
};
export const reddit = {
  async getCurrentUsername() { return als.getStore()?.user ?? 'you'; },
  async submitComment(o: { text: string }) { console.log('[comment]', o.text); return { permalink: '/r/test/comments/local/x/' }; },
  async subscribeToCurrentSubreddit() { return; },
  // A stand-in snoovatar (head and shoulders) so the avatar path can be seen locally.
  async getSnoovatarUrl(u: string) { const h = [...u].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 160'><rect width='100' height='160' fill='hsl(${h} 60% 80%)'/><circle cx='50' cy='42' r='24' fill='hsl(${h} 50% 45%)'/><rect x='22' y='72' width='56' height='88' rx='24' fill='hsl(${h} 55% 35%)'/></svg>`)}`; },
  async submitCustomPost() { return { id: 't3_local', url: 'http://localhost:5180/game.html' }; },
};
export const getServerPort = () => 5181;
export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => unknown) {
  return httpServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/dev/realtime') {
      const ch = url.searchParams.get('channel') ?? '';
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': ok\n\n');
      (subs.get(ch) ?? subs.set(ch, new Set()).get(ch)!).add(res);
      req.on('close', () => subs.get(ch)?.delete(res));
      return;
    }
    if (url.pathname === '/dev/ace') {
      // Dev only: plant an Ace in the player's last hand slot so the Ace power can be tried at once.
      const user = String(url.searchParams.get('as') ?? 'you');
      void (async () => {
        const { mutate } = await import('../src/server/match');
        const id = url.searchParams.get('id')!;
        await mutate(id, (rec) => {
          const me = rec.game.players.find((p) => p.id === `t2_${user}`)!;
          const want = Number(url.searchParams.get('rank') ?? 1); const ix = rec.game.deck.findIndex((c) => c.rank === want);
          [me.hand[me.hand.length - 1], rec.game.deck[ix]] = [rec.game.deck[ix], me.hand[me.hand.length - 1]];
        });
        res.end('ok');
      })().catch((e) => { res.statusCode = 500; res.end(String(e)); });
      return;
    }
    if (url.pathname === '/dev/match') {
      // Dev only: give the player's first card the rank on top of the pile, so a free throw can be tried at once.
      const user = String(url.searchParams.get('as') ?? 'you');
      void (async () => {
        const { mutate } = await import('../src/server/match');
        await mutate(url.searchParams.get('id')!, (rec) => {
          const me = rec.game.players.find((p) => p.id === `t2_${user}`)!;
          me.hand[0] = { ...me.hand[0], rank: rec.game.discard.at(-1)!.rank, suit: 'hearts' };
        });
        res.end('ok');
      })().catch((e) => { res.statusCode = 500; res.end(String(e)); });
      return;
    }
    const user = String(req.headers['x-dev-user'] ?? 'you').replace(/[^\w-]/g, '').slice(0, 20) || 'you';
    als.run({ user }, () => handler(req, res));
  });
}
