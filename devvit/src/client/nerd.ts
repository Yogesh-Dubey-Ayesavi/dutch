/**
 * Stats for nerds: what the network and the device are doing, so a screenshot of the panel says where lag comes from.
 * Every API call, every realtime push and (while the panel is open) every frame is recorded here.
 * Times are milliseconds. "srv" is the time our server spent on a request (it reports `_srv` in every reply), so
 * round trip − srv ≈ the network and Reddit's gateway.
 */
export interface Sample { kind: string; ms: number; srv: number | null; at: number; ok: boolean; status: number; t?: Timing | null }
/** Where a request's time went, from the browser's Resource Timing (same-origin, so every phase is visible). */
export interface Timing { proto: string; reused: boolean; connect: number; tls: number; wait: number; download: number }

export function timingOf(url: string, since: number): Timing | null {
  const all = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const e = [...all].reverse().find((x) => x.name.endsWith(url) && x.startTime >= since - 5);
  if (!e || !e.responseStart) return null;
  const connect = Math.round(e.connectEnd - e.connectStart);
  const tls = e.secureConnectionStart > 0 ? Math.round(e.connectEnd - e.secureConnectionStart) : 0;
  return { proto: e.nextHopProtocol || '?', reused: connect === 0, connect, tls, wait: Math.round(e.responseStart - e.requestStart), download: Math.round(e.responseEnd - e.responseStart) };
}

/** The round trip to Reddit's nearest servers alone: a tiny file the game already ships, never cached by the phone. */
let edge: number[] = [];
export async function probeEdge() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (!link?.href) return;
  const t0 = performance.now();
  try { await fetch(link.href, { method: 'HEAD', cache: 'no-store' }); } catch { return; }
  edge.push(Math.round(performance.now() - t0));
  if (edge.length > 10) edge = edge.slice(-10);
}

const KEEP = 40;
const samples: Sample[] = [];
const counts: Record<string, number> = {};
const pushes: { at: number; lag: number | null; bytes: number }[] = [];
let errors = 0;
let offset: number | null = null;
let startedAt = Date.now();

/** /api/match/abc/action → action, /api/queue/poll → queue/poll */
export function kindOf(path: string) {
  const p = path.replace(/^\/api\//, '').replace(/\?.*$/, '');
  const m = p.match(/^match\/[^/]+\/(\w+)/);
  return m ? m[1] : p;
}

export function recordCall(path: string, ms: number, srv: number | null, status: number, t: Timing | null = null) {
  const kind = kindOf(path);
  counts[kind] = (counts[kind] ?? 0) + 1;
  const ok = status >= 200 && status < 400;
  if (!ok) errors++;
  samples.push({ kind, ms: Math.round(ms), srv, at: Date.now(), ok, status, t });
  if (samples.length > KEEP * 6) samples.splice(0, samples.length - KEEP * 6);
}

/** The server clock minus ours, from a reply: its time against the middle of our round trip. */
export function recordClock(serverNow: number, localMid: number) { offset = Math.round(serverNow - localMid); }

/** A table pushed over the realtime channel. `serverNow` is when the server built it. */
export function recordPush(serverNow: number | null, bytes: number) {
  const lag = serverNow !== null && offset !== null ? Math.round(Date.now() + offset - serverNow) : null;
  pushes.push({ at: Date.now(), lag, bytes });
  if (pushes.length > KEEP) pushes.shift();
}

export function resetNerdStats() { samples.length = 0; pushes.length = 0; errors = 0; startedAt = Date.now(); for (const k of Object.keys(counts)) delete counts[k]; }

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]; };
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export interface KindStats { kind: string; n: number; last: number | null; avg: number | null; p90: number | null; max: number | null; srv: number | null }
export function snapshot() {
  const kinds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const per: KindStats[] = kinds.map((kind) => {
    const xs = samples.filter((s) => s.kind === kind).slice(-KEEP);
    const ms = xs.map((s) => s.ms);
    const srv = xs.map((s) => s.srv).filter((v): v is number => v !== null);
    return { kind, n: counts[kind], last: ms.at(-1) ?? null, avg: avg(ms), p90: pct(ms, 0.9), max: ms.length ? Math.max(...ms) : null, srv: avg(srv) };
  });
  const lags = pushes.map((p) => p.lag).filter((v): v is number => v !== null);
  const secs = Math.max(1, (Date.now() - startedAt) / 1000);
  const recent = samples.filter((s) => Date.now() - s.at < 10_000).length;
  const timed = samples.filter((x) => x.t).slice(-20);
  const newConns = timed.filter((x) => !x.t!.reused).length;
  const last = timed.at(-1);
  return {
    per, errors, offset, secs,
    edge: { last: edge.at(-1) ?? null, avg: avg(edge), min: edge.length ? Math.min(...edge) : null },
    timing: last ? { kind: last.kind, ...last.t! } : null,
    waitAvg: avg(timed.map((x) => x.t!.wait)),
    newConns: `${newConns}/${timed.length}`,
    perSec: Math.round((recent / Math.min(10, secs)) * 10) / 10,
    pushes: { n: pushes.length, lastAgo: pushes.length ? Date.now() - pushes.at(-1)!.at : null, lag: avg(lags), lagMax: lags.length ? Math.max(...lags) : null, bytes: avg(pushes.map((p) => p.bytes)) },
    lastErrors: samples.filter((s) => !s.ok).slice(-3).map((s) => `${s.kind} ${s.status}`),
  };
}

/** Frames per second and long frames, measured only while the panel is open. */
export function watchFrames(on: (fps: number, long: number, worst: number) => void) {
  let frames = 0, long = 0, worst = 0, last = performance.now(), windowStart = last, raf = 0;
  const loop = (t: number) => {
    const d = t - last; last = t; frames++;
    if (d > 50) long++;
    worst = Math.max(worst, d);
    if (t - windowStart >= 1000) { on(Math.round((frames * 1000) / (t - windowStart)), long, Math.round(worst)); frames = 0; long = 0; worst = 0; windowStart = t; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
