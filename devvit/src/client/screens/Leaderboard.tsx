import { useEffect, useState } from 'react';
import { api } from '../api';
import { DIM, MINT, MUTED, PANEL_LINE, TXT, Y, avatarHue, fmt, signed } from '../tokens';
import { BackIcon, IconBtn } from '../ui';
import type { LeaderboardResponse, Profile } from '../../shared/api';

export function Leaderboard({ profile, subreddit, onBack }: { profile: Profile; subreddit: string; onBack: () => void }) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.leaderboard().then(setData, (e) => setErr(e.message)); }, []);
  const cols = '44px minmax(0,1fr) 80px';
  const meIn = data?.rows.some((r) => r.userId === profile.userId);
  const pinNote = !data ? 'Loading your rank…' : !data.me ? 'Play a ranked duel to get a rank' : meIn ? `Top 50 · ${profile.ratedGames} duels` : data.cutoff !== null ? `${fmt(data.cutoff - profile.rating + 1)} rating to reach the top 50` : `${profile.ratedGames} duels`;
  return (
    <>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 48, height: 44, display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconBtn label="Back" onClick={onBack}><BackIcon /></IconBtn>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}><div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1 }}>Leaderboard</div><div style={{ fontSize: 12.5, color: MUTED }}>Top 50 by rating · r/{subreddit}</div></div>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 108, height: 28, display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: DIM, borderBottom: `1px solid ${PANEL_LINE}` }}><span>#</span><span>PLAYER</span><span style={{ textAlign: 'right' }}>RATING</span></div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 140, bottom: 114, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!data && !err && [62, 48, 70, 55, 66, 44, 58, 72, 50, 64, 46].map((w, i) => (
          <div key={i} style={{ height: 48, flex: 'none', display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '0 12px', background: '#1A1917' }}>
            <div style={{ width: 20, height: 14, background: '#2A2924' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 28, height: 28, background: '#2A2924' }} /><div style={{ width: `${w}%`, height: 12, background: '#2A2924' }} /></div>
            <div style={{ justifySelf: 'end', width: 48, height: 16, background: '#2A2924' }} />
          </div>
        ))}
        {err && <div style={{ padding: 20, color: MUTED, textAlign: 'center' }}>{err}</div>}
        {data && !data.rows.length && <div style={{ padding: 20, color: MUTED, textAlign: 'center', fontSize: 15 }}>No ranked duels yet. Be the first on the board.</div>}
        {data?.rows.map((r) => {
          const you = r.userId === profile.userId;
          return (
            <div key={r.userId} style={{ height: 48, flex: 'none', display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '0 12px', background: you ? '#2A2924' : '#1A1917', boxShadow: you ? `inset 0 0 0 2px ${Y}` : 'none' }}>
              <div style={{ fontWeight: 800, fontSize: 22, fontStretch: '75%', color: r.rank <= 3 ? Y : MUTED }}>{r.rank}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 28, height: 28, flex: 'none', background: you ? 'oklch(0.78 0.12 250)' : `oklch(0.74 0.12 ${avatarHue(r.username)})`, color: '#141412', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{r.username[0]?.toUpperCase()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{you ? `You · u/${r.username}` : `u/${r.username}`}</div><div style={{ fontSize: 11.5, color: DIM }}>{r.duels} duels</div></div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 24, fontStretch: '75%' }}>{fmt(r.rating)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 36, height: 66, display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', alignItems: 'center', padding: '0 12px', background: '#2A2924', boxShadow: `inset 0 0 0 2px ${Y}, 4px 4px 0 #000`, opacity: data ? 1 : 0.5 }}>
        <div style={{ fontWeight: 800, fontSize: 22, fontStretch: '75%', color: Y }}>{data?.me ? fmt(data.me.rank) : '—'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, flex: 'none', background: 'oklch(0.78 0.12 250)', color: '#0C1626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{profile.username[0]?.toUpperCase()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 800, color: TXT }}>You</div><div style={{ fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pinNote}</div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {profile.lastDelta !== null && <span style={{ fontSize: 12, fontWeight: 800, color: profile.lastDelta >= 0 ? MINT : 'oklch(0.64 0.22 25)' }}>{signed(profile.lastDelta)}</span>}
          <span style={{ fontWeight: 800, fontSize: 26, fontStretch: '75%' }}>{fmt(profile.rating)}</span>
        </div>
      </div>
    </>
  );
}
