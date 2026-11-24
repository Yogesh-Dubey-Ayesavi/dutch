import { useState } from 'react';
import { Bot, Info, Users } from 'lucide-react';
import { AboutBody } from '../About';
import { TableCard, card } from '../TableCard';
import { FELT, INK, MINT, MUTED, PANEL, PANEL_LINE, SHADOW, TXT, Y, fmt, signed } from '../tokens';
import { Avatar, ChipBalance, Diamond, IconBtn, MuteBtn, Sheet } from '../ui';
import type { Profile } from '../../shared/api';

const ACE = card(1, 'spades'), QUEEN = card(12, 'hearts');

/** "Play with" small on top, who you play big underneath: fits a half-width button. */
const two = (who: string) => (
  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.65 }}>PLAY WITH</span>
    <span style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{who.charAt(0).toUpperCase() + who.slice(1)}</span>
  </span>
);

/** Shown until the server answers on a first visit: the real layout, with the numbers greyed out. */
export const GHOST_PROFILE: Profile = {
  userId: '', username: '', rating: 0, lastDelta: null, chips: 0, ratedGames: 0, wins: 0, rank: null, dailyBonusReady: false, owned: [],
  equipped: { back: '', table: '', face: '', flip: '' }, cosmetics: { back: 'blue', table: 'blue', face: 'default', flip: 'classic' }, seenTutorial: false, tutorialAt: '',
};
const bar = (w: number, h = 12) => <span style={{ display: 'inline-block', width: w, height: h, background: '#2E2C28', animation: 'cl-blink 1.4s infinite' }} />;

export function Home({ profile, subreddit, ghost = false, onFind, onBot, onShop, onBoard, onHowTo }: { profile: Profile; subreddit?: string; ghost?: boolean; onFind: () => void; onBot: () => void; onShop: () => void; onBoard: () => void; onHowTo: () => void }) {
  // Not onboarded yet: learning is the main action, a duel the secondary one.
  const learn = !profile.seenTutorial && profile.ratedGames === 0;
  const [about, setAbout] = useState(false);
  const delta = profile.lastDelta;
  const tile = (title: string, sub: string, on: () => void) => (
    <button type="button" onClick={on} style={{ height: 66, padding: '0 10px', minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 3, background: PANEL, border: `1px solid ${PANEL_LINE}`, textAlign: 'left' }}>
      <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1, maxWidth: '100%' }}>{title}</div><div style={{ fontSize: 12, color: MUTED, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </button>
  );
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, top: 48, bottom: 36, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
        <div style={{ fontWeight: 800, fontSize: 34, letterSpacing: '-0.02em', fontStretch: '75%' }}>Clutch</div>
        <div style={{ display: 'flex', gap: 6 }}><ChipBalance chips={profile.chips} /><MuteBtn /><IconBtn label="About Clutch: version and info" onClick={() => setAbout(true)}><Info size={18} strokeWidth={2} /></IconBtn></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: PANEL, border: `1px solid ${PANEL_LINE}`, flex: 'none' }}>
        {ghost ? <span style={{ width: 48, height: 48, flex: 'none', background: '#2E2C28' }} /> : <Avatar name={profile.username} size={48} you src={profile.avatar} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ghost ? bar(120, 14) : `u/${profile.username}`}</div>
          <div style={{ fontSize: 12.5, color: MUTED }}>{ghost ? bar(80) : profile.ratedGames ? `${profile.ratedGames} game${profile.ratedGames === 1 ? '' : 's'} · ${profile.wins} won` : 'No games yet'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: MUTED }}>RATING</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: delta === null ? MUTED : delta >= 0 ? MINT : 'oklch(0.64 0.22 25)' }}>{ghost ? '' : delta === null ? 'NEW' : signed(delta)}</span>
            <span style={{ fontWeight: 800, fontSize: 38, lineHeight: 0.85, fontStretch: '75%' }}>{ghost ? bar(34, 30) : fmt(profile.rating)}</span>
          </div>
        </div>
      </div>
      {profile.dailyBonusReady && profile.ratedGames > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: MINT, color: '#0B2A20', boxShadow: SHADOW, flex: 'none' }}>
          <Diamond size={10} color="#0B2A20" />
          <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>Daily bonus: your first game today pays <b>+25 chips</b></div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', left: 6, right: 6, top: 8, bottom: 8, borderRadius: '50%', background: FELT[profile.cosmetics.table] ?? FELT.blue, boxShadow: '0 0 0 7px #6B4122, 0 0 0 9px #2A170A, inset 0 6px 14px rgba(0,0,0,0.55), inset 0 0 60px rgba(0,0,0,0.45), 0 20px 40px rgba(0,0,0,0.6)' }} />
        <div style={{ position: 'relative', width: 240, height: 160 }}>
          <div style={{ position: 'absolute', left: 4, top: 14 }}><TableCard card={ACE} tilt={-12} /></div>
          <div style={{ position: 'absolute', left: 140, top: 14 }}><TableCard card={QUEEN} tilt={12} /></div>
          <div style={{ position: 'absolute', left: 72, top: 0 }}><TableCard /></div>
        </div>
      </div>
      {learn ? (
        // New player: both ways to play side by side, and Learn to play underneath as the one highlighted action.
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 'none' }}>
            <button type="button" onClick={onFind} style={{ height: 60, background: TXT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: SHADOW }}><Users size={22} strokeWidth={2.5} />{two('a person')}</button>
            <button type="button" onClick={onBot} style={{ height: 60, background: '#2A2924', color: TXT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: `${SHADOW}, inset 0 0 0 1px #3A3833` }}><Bot size={22} strokeWidth={2.5} />{two('a bot')}</button>
          </div>
          <button type="button" onClick={onHowTo} style={{ position: 'relative', height: 80, marginTop: 6, background: Y, color: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, boxShadow: SHADOW, flex: 'none', animation: 'home-beckon 2.2s ease-in-out infinite' }}>
            <span style={{ position: 'absolute', left: -4, top: -12, padding: '3px 8px', background: INK, color: Y, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', boxShadow: `inset 0 0 0 2px ${Y}` }}>NEW? START HERE</span>
            <div style={{ fontWeight: 800, fontSize: 28, lineHeight: 1 }}>Learn to play</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4B483F' }}>Play real hands as you learn · 3 min</div>
          </button>
          <style>{'@keyframes home-beckon { 50% { box-shadow: 4px 4px 0 #000, 0 0 0 6px oklch(0.9 0.17 100 / 0.25); } }'}</style>
        </>
      ) : (<>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 'none' }}>
        <button type="button" onClick={onFind} style={{ height: 60, background: Y, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: SHADOW }}><Users size={22} strokeWidth={2.5} />{two('a person')}</button>
        <button type="button" onClick={onBot} style={{ height: 60, background: INK, color: TXT, border: `2px solid ${TXT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: SHADOW }}><Bot size={22} strokeWidth={2.5} />{two('a bot')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, flex: 'none', color: TXT }}>
        {tile('Shop', 'Card backs, tables', onShop)}
        {tile('Leaderboard', profile.rank ? `You’re #${fmt(profile.rank)}` : 'Unranked', onBoard)}
        {tile('How to play', '3-min lesson', onHowTo)}
      </div>
      </>)}
      {about && <Sheet z={50} onClose={() => setAbout(false)}><AboutBody username={ghost ? undefined : profile.username} subreddit={subreddit} onClose={() => setAbout(false)} /></Sheet>}
    </div>
  );
}
