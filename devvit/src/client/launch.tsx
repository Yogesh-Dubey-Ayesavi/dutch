/** Launch · inline in the feed: a short card that draws its own felt and has one job, getting you into a duel. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import './styles.css';
import { api } from './api';
import { TableCard, card } from './TableCard';
import { FELT, INK, MINT, Y, fmt, signed } from './tokens';
import { Avatar, Diamond, Stage } from './ui';
import type { LeaderRow, SessionResponse } from '../shared/api';

/** The post's own aspect: the design is 390 wide, its height follows the post so nothing is letterboxed. */
function usePostHeight() {
  const get = () => Math.round(Math.min(900, Math.max(400, (390 * window.innerHeight) / Math.max(1, window.innerWidth))));
  const [h, setH] = useState(get);
  useEffect(() => { const on = () => setH(get()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return h;
}

const KICK = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#B7C2D6' } as const;
const PANE = { background: 'rgba(10,14,24,0.5)', border: '1px solid rgba(255,255,255,0.12)' } as const;
const STEPS = [
  { n: 1, t: 'Look', d: 'Peek at a few of your cards. Then they flip face down.' },
  { n: 2, t: 'Swap', d: 'Draw a card. Keep it if it’s lower than one of yours.' },
  { n: 3, t: 'Call LOW', d: 'Sure you have the fewest points? Call it and win.' },
];
const MEDAL = [Y, '#DCE4F2', 'oklch(0.72 0.12 60)'];

function Launch() {
  const [s, setS] = useState<SessionResponse | null>(null);
  const [top, setTop] = useState<LeaderRow[] | null>(null);
  useEffect(() => { api.session().then(setS, () => {}); api.leaderboard().then((l) => setTop(l.rows.slice(0, 3)), () => setTop([])); }, []);
  const H = usePostHeight();
  const p = s?.profile;
  const returning = !!p && p.ratedGames > 0;
  const live = s?.active ?? null;
  const first = !!p && !returning && !live;
  const open = (e: React.MouseEvent, entry = 'game') => requestExpandedMode(e.nativeEvent, entry);
  const stat = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(10,14,24,0.55)', border: '1px solid rgba(255,255,255,0.12)' } as const;
  return (
    <Stage height={H} background="#142D55">
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: FELT.blue.replace('ellipse 70% 60% at 50% 42%', 'ellipse 90% 80% at 75% 25%'), boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 80px rgba(0,0,0,0.45)', color: '#F2F0EA', display: 'flex', flexDirection: 'column', padding: '22px 20px 20px', boxSizing: 'border-box', gap: 14 }}>
        <div style={{ position: 'relative', minHeight: 132, flex: 'none' }}>
          <div style={{ position: 'absolute', right: -4, top: 2, width: 170, height: 130 }} aria-hidden>
            <div style={{ position: 'absolute', left: 0, top: 18 }}><TableCard w={70} tilt={-14} /></div>
            <div style={{ position: 'absolute', left: 48, top: 0 }}><TableCard w={70} card={card(12, 'hearts')} tilt={-2} /></div>
            <div style={{ position: 'absolute', left: 98, top: 14 }}><TableCard w={70} card={card(1, 'spades')} tilt={12} /></div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 58, lineHeight: 0.9, letterSpacing: '-0.02em', fontStretch: '75%', position: 'relative' }}>Clutch</div>
          <div style={{ fontSize: 16, lineHeight: 1.35, color: '#DCE4F2', maxWidth: 180, position: 'relative', marginTop: 10 }}>Your cards are face down. Remember them. Lowest score wins.</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: 14 }}>
        {!live && H >= 470 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <div style={KICK}>HOW IT WORKS · 1 ON 1</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {STEPS.map((x) => (
                <div key={x.n} style={{ ...PANE, padding: '10px 10px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ width: 22, height: 22, background: Y, color: INK, fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{x.n}</span>
                  <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{x.t}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.3, color: '#B7C2D6' }}>{x.d}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!live && H >= 560 && top && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <div style={{ ...KICK, display: 'flex', justifyContent: 'space-between' }}><span>TOP OF r/{s?.subreddit ?? '…'}</span>{p?.rank ? <span style={{ color: Y }}>YOU’RE #{fmt(p.rank)}</span> : null}</div>
            <div style={{ ...PANE, display: 'flex', flexDirection: 'column' }}>
              {top.length ? top.slice(0, returning && H < 640 ? 2 : 3).map((r, i) => (
                <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
                  <span style={{ width: 18, fontWeight: 800, fontSize: 18, fontStretch: '75%', color: MEDAL[i] }}>{r.rank}</span>
                  <Avatar name={r.username} size={28} src={r.avatar} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>u/{r.username}</span>
                  <span style={{ fontWeight: 800, fontSize: 22, fontStretch: '75%', lineHeight: 1 }}>{fmt(r.rating)}</span>
                </div>
              )) : (
                <div style={{ padding: '12px', fontSize: 14, color: '#DCE4F2' }}>No scores yet. Win one game to take #1.</div>
              )}
            </div>
          </div>
        )}
        </div>
        {returning && !live && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={stat}><div style={{ fontSize: 12, fontWeight: 700, color: '#B7C2D6' }}>Rating</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontWeight: 800, fontSize: 26, fontStretch: '75%', lineHeight: 1 }}>{fmt(p!.rating)}</span>{p!.lastDelta !== null && <span style={{ fontSize: 12, fontWeight: 800, color: p!.lastDelta >= 0 ? MINT : 'oklch(0.64 0.22 25)' }}>{signed(p!.lastDelta)}</span>}</div></div>
            <div style={stat}><div style={{ fontSize: 12, fontWeight: 700, color: '#B7C2D6' }}>Chips</div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Diamond /><span style={{ fontWeight: 800, fontSize: 26, fontStretch: '75%', lineHeight: 1 }}>{fmt(p!.chips)}</span></div></div>
          </div>
        )}
        {live && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: '#121110', border: '1px solid #3A3833', boxShadow: '4px 4px 0 #000' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: Y }}>GAME IN PROGRESS</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9C988E' }}>Round {live.round} of 13</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>vs u/{live.opponent}</div>
              <div style={{ fontWeight: 800, fontSize: 24, fontStretch: '75%' }}>{live.you} <span style={{ color: '#6E6A61' }}>·</span> {live.them}</div>
            </div>
            {live.botMsLeft !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 12.5, color: '#C8C4BA' }}>A bot is playing your turns · 0:{String(Math.ceil(live.botMsLeft / 1000)).padStart(2, '0')} left</div>
                <div style={{ height: 4, background: '#26241F' }}><div style={{ height: '100%', width: `${(live.botMsLeft / 60000) * 100}%`, background: Y }} /></div>
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={(e) => open(e)} style={{ height: 60, background: Y, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, boxShadow: '4px 4px 0 #000', flex: 'none' }}>
          {live ? 'Back to your game' : 'Play'}
        </button>
        {first && (
          <button type="button" onClick={(e) => open(e, 'tutorial')} style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#DCE4F2' }}>
            New here? <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>Learn to play in 3 minutes</span>
          </button>
        )}
      </div>
    </Stage>
  );
}

createRoot(document.getElementById('root')!).render(<Launch />);
