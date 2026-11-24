/**
 * Stats for nerds (table menu → Stats for nerds): a see-through panel over the table with live network timings,
 * realtime pushes, frame rate and the match's state, refreshed twice a second. Made to be screenshotted.
 */
import { useEffect, useReducer, useState } from 'react';
import { probeEdge, snapshot, resetNerdStats, watchFrames } from '../nerd';
import { liveStatus, useRoom } from './store';
import { APP_VERSION_LABEL } from '../About';

const ms = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v}`);
const tone = (v: number | null | undefined, ok: number, meh: number) => (v === null || v === undefined ? '#8e8a80' : v <= ok ? '#6ee7a8' : v <= meh ? '#f5d76e' : '#ff7a6b');

export function NerdStats({ onClose }: { onClose: () => void }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [frames, setFrames] = useState({ fps: 0, long: 0, worst: 0 });
  const [copied, setCopied] = useState(false);
  useEffect(() => { const t = setInterval(tick, 500); return () => clearInterval(t); }, []);
  useEffect(() => watchFrames((fps, long, worst) => setFrames({ fps, long, worst })), []);
  useEffect(() => { void probeEdge(); const t = setInterval(() => void probeEdge(), 4000); return () => clearInterval(t); }, []);
  const env = useRoom((r) => r.env);
  const status = useRoom((r) => r.status);
  const ping = useRoom((r) => r.latency);
  const syncing = useRoom((r) => r.syncing);
  const s = snapshot();
  const v = env?.view;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number } }).connection;
  const now = Date.now() + (s.offset ?? 0);

  const lines: [string, string, string?][] = [
    ['Version', `${APP_VERSION_LABEL()}`],
    ['Match', env ? `${env.matchId.slice(0, 8)} · ${env.mode} · v${v?.version}` : '–'],
    ['State', v ? `rd ${v.round}/${v.rules.rounds} · ${v.phase} · turn ${v.players[v.turn]?.name ?? '?'}${v.caller ? ' · LOW called' : ''}` : '–'],
    ['Link', `${status}${syncing ? ' · sending' : ''}`, status === 'connected' ? '#6ee7a8' : '#ff7a6b'],
    ['Ping', `${ms(ping)} ms`, tone(ping, 150, 400)],
    ['Reddit edge', `${ms(s.edge.last)} ms (avg ${ms(s.edge.avg)}, best ${ms(s.edge.min)}) · phone ⇄ nearest Reddit server`, tone(s.edge.avg, 80, 200)],
    ['Last request', s.timing ? `${s.timing.kind} · ${s.timing.proto} · ${s.timing.reused ? 'reused link' : `NEW link ${s.timing.connect} ms (tls ${s.timing.tls})`} · wait ${s.timing.wait} · download ${s.timing.download}` : '–'],
    ['Waiting', `avg ${ms(s.waitAvg)} ms per request after sending · new links ${s.newConns}`, tone(s.waitAvg, 150, 400)],
    ['Push channel', liveStatus.channel ? (liveStatus.connected ? 'connected' : 'connecting…') : 'none (game started before this update)', liveStatus.connected ? '#6ee7a8' : '#8e8a80'],
    ['Pushes', `${s.pushes.n} · last ${s.pushes.lastAgo === null ? '–' : `${(s.pushes.lastAgo / 1000).toFixed(1)}s ago`} · lag ≈${ms(s.pushes.lag)} (max ${ms(s.pushes.lagMax)}) ms · ${s.pushes.bytes ? `${(s.pushes.bytes / 1024).toFixed(1)} KB` : '–'}`, tone(s.pushes.lag, 150, 400)],
    ['Next tick', env?.nextTickAt ? `in ${Math.max(0, env.nextTickAt - now)} ms` : 'none'],
    ['Requests', `${s.perSec}/s (last 10 s) · ${s.errors} failed${s.lastErrors.length ? ` · ${s.lastErrors.join(', ')}` : ''}`, s.perSec > 3 ? '#ff7a6b' : s.errors ? '#f5d76e' : undefined],
    ['Clock', s.offset === null ? '–' : `server ${s.offset >= 0 ? '+' : ''}${s.offset} ms`],
    ['Frames', `${frames.fps} fps · ${frames.long} long/s · worst ${frames.worst} ms`, tone(60 - frames.fps, 5, 20)],
    ['Device', `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x${conn?.effectiveType ? ` · ${conn.effectiveType}` : ''}${conn?.rtt ? ` · rtt ${conn.rtt}` : ''}${mem ? ` · heap ${Math.round(mem / 1048576)} MB` : ''}`],
  ];

  const text = () => [
    ...lines.map(([k, val]) => `${k}: ${val}`),
    'Calls (n · last · avg · p90 · max · server avg, ms):',
    ...s.per.map((p) => `  ${p.kind}: ${p.n} · ${ms(p.last)} · ${ms(p.avg)} · ${ms(p.p90)} · ${ms(p.max)} · ${ms(p.srv)}`),
    navigator.userAgent,
  ].join('\n');

  return (
    <div className="nerd" data-no-drag role="dialog" aria-label="Stats for nerds">
      <style>{CSS}</style>
      <div className="nerd-head">
        <b>Stats for nerds</b>
        <span>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(text()).then(() => setCopied(true), () => {}); }}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" onClick={resetNerdStats}>Reset</button>
          <button type="button" onClick={onClose} aria-label="Close stats">✕</button>
        </span>
      </div>
      {lines.map(([k, val, color]) => (
        <div key={k} className="nerd-row"><i>{k}</i><span style={color ? { color } : undefined}>{val}</span></div>
      ))}
      <table>
        <thead><tr><th>call</th><th>n</th><th>last</th><th>avg</th><th>p90</th><th>max</th><th>srv</th></tr></thead>
        <tbody>
          {s.per.map((p) => (
            <tr key={p.kind}>
              <td>{p.kind}</td><td>{p.n}</td>
              <td style={{ color: tone(p.last, 150, 400) }}>{ms(p.last)}</td>
              <td style={{ color: tone(p.avg, 150, 400) }}>{ms(p.avg)}</td>
              <td>{ms(p.p90)}</td><td>{ms(p.max)}</td><td>{ms(p.srv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="nerd-foot">ms · srv = time inside our server · the rest of a call is network + Reddit</div>
    </div>
  );
}

const CSS = `
.nerd { position: fixed; left: 8px; right: 8px; top: 8px; z-index: 450; max-width: 460px; margin: 0 auto; padding: 8px 10px 8px; background: rgba(10,10,9,0.86); color: #e9e6de; border: 1px solid #3a3833; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; backdrop-filter: blur(2px); pointer-events: auto; }
.nerd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
.nerd-head span { display: flex; gap: 6px; }
.nerd-head button { font: inherit; color: #e9e6de; background: #2a2924; border: 1px solid #4a4741; padding: 2px 8px; }
.nerd-row { display: flex; gap: 8px; }
.nerd-row i { font-style: normal; color: #8e8a80; width: 92px; flex: none; }
.nerd-row span { min-width: 0; overflow-wrap: anywhere; }
.nerd table { width: 100%; margin-top: 6px; border-collapse: collapse; font: inherit; }
.nerd th { color: #8e8a80; font-weight: 400; text-align: right; padding: 0 3px; }
.nerd td { text-align: right; padding: 0 3px; }
.nerd th:first-child, .nerd td:first-child { text-align: left; }
.nerd-foot { margin-top: 4px; color: #6e6a61; font-size: 10px; }
`;
