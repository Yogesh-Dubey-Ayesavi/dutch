/**
 * "No clock on screen: how long a match takes is unknown. Instead, candidate players are dealt around a
 * turntable until one sticks." Port of the design's live carousel. Seats stay face down while searching (naming
 * players who aren't in the queue would suggest they are); the rival's card flips up when the server pairs you.
 */
import { useEffect, useRef, useState } from 'react';
import { cardUrl } from '../media';
import { api } from '../api';
import { DANGER, INK, LINE, MUTED, SOFT, TXT, Y, avatarHue, fmt } from '../tokens';
import { Btn, MuteBtn, Sheet } from '../ui';
import { PlayingCard } from '../Card';
import { play } from '../sound';
import type { Profile, Seat } from '../../shared/api';

interface Cand { name: string; letter: string; hue: number; rating: string }
const CX = 195, CY = 300, RX = 128, RY = 30, W = 72, H = 100, W0 = 0.0011;
const SETTLE = 1400, LOCK = 600, FLY = 650, DEAL = 2000;
const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const clamp = (u: number) => Math.min(1, Math.max(0, u));

export function Matchmaking({ profile, onMatched, onBot, onCancel, showToast }: { profile: Profile; onMatched: (matchId: string) => void; onBot: () => void; onCancel: () => void; showToast: (t: string, l: string) => void }) {
  const [found, setFound] = useState<{ seat: Seat; matchId: string; at: number } | null>(null);
  const [offer, setOffer] = useState(false);
  const dismissed = useRef(false);
  const [t, setT] = useState(0);
  const start = useRef(performance.now());

  useEffect(() => {
    let alive = true, timer = 0;
    const handle = (s: Awaited<ReturnType<typeof api.poll>>) => {
      if (!alive) return;
      if (s.status === 'matched') { play('shuffle'); setFound({ seat: s.opponent, matchId: s.matchId, at: performance.now() }); return; }
      if (s.status === 'waiting' && s.offerBot && !dismissed.current) setOffer(true);
      timer = window.setTimeout(() => api.poll().then(handle, retry), 3000);
    };
    const retry = () => { if (alive) timer = window.setTimeout(() => api.poll().then(handle, retry), 3000); };
    api.join().then(handle, (e) => { showToast(e.message, DANGER); retry(); });
    return () => { alive = false; clearTimeout(timer); };
  }, []);  

  useEffect(() => { let id = 0; const tick = () => { setT(performance.now() - start.current); id = requestAnimationFrame(tick); }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => { if (!found) return; const tm = setTimeout(() => onMatched(found.matchId), SETTLE + LOCK + FLY + DEAL); return () => clearTimeout(tm); }, [found, onMatched]);

  // The carousel: ten seats around an ellipse; the rival is seat 0.
  const rival: Cand | null = found ? { name: found.seat.username, letter: found.seat.username[0]?.toUpperCase() ?? '?', hue: avatarHue(found.seat.username), rating: fmt(found.seat.rating) } : null;
  // Every other seat stays face down: only a player the server actually paired you with is ever named.
  const pool: (Cand | null)[] = Array.from({ length: 10 }, (_, i) => (i === 0 && rival ? rival : null));
  const N = pool.length, STEP = (Math.PI * 2) / N;
  const ft = found ? performance.now() - found.at : 0;
  const foundBase = useRef(0);
  if (found && !foundBase.current) foundBase.current = Math.ceil((W0 * t + 0.5) / (Math.PI * 2)) * Math.PI * 2;
  const base = !found ? W0 * t : W0 * (t - ft) + (foundBase.current - W0 * (t - ft)) * ease(ft / SETTLE);
  const lock = found && ft >= SETTLE && ft < SETTLE + LOCK, flown = found && ft >= SETTLE + LOCK;
  const fly = ease((ft - SETTLE - LOCK) / FLY), fade = clamp((ft - SETTLE) / 400), inF = clamp(t / 350);
  const items = pool.map((p, i) => {
    const th = base + i * STEP, d = Math.cos(th), k = (d + 1) / 2;
    let x = CX + RX * Math.sin(th), y = CY + RY * d + 20, sc = 0.62 + 0.38 * k, op = 0.25 + 0.75 * k * k, flipX = 0.3 + 0.7 * Math.abs(d);
    let faceUp = d > 0 && !!p, z = Math.round(k * 100), ring = '0 6px 14px rgba(0,0,0,0.45)';
    const isR = i === 0 && !!found;
    if (isR && (lock || flown)) ring = `0 0 0 3px ${Y}, 0 0 30px oklch(0.9 0.17 100 / 0.5), 0 10px 20px rgba(0,0,0,0.5)`;
    if (!isR && found) op *= 1 - fade;
    if (isR && lock) { sc = 1 + 0.08 * Math.sin((ft - SETTLE) / 90); flipX = 1; faceUp = true; }
    if (isR && flown) { x += (CX - x) * fly; y += (235 - y) * fly; sc += (1.5 - sc) * fly; flipX = 1; faceUp = true; z = 200; }
    return { key: i, p, x, y, sc, op: op * inF, flipX, faceUp, z, ring };
  }).sort((a, b) => a.z - b.z);
  const dealing = found ? Math.max(1, Math.ceil((SETTLE + LOCK + FLY + DEAL - ft) / 1000)) : 0;

  return (
    <>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 48, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, fontSize: 20 }}>{found ? 'Rival found' : 'Finding a duel'}</div>
        <MuteBtn />
      </div>
      <div style={{ position: 'absolute', inset: 0, top: 0 }} aria-hidden>
        <div style={{ position: 'absolute', left: CX - 165, top: CY - 8, width: 330, height: 120, borderRadius: '50%', background: 'radial-gradient(ellipse 70% 60% at 50% 42%, #2F5C9A 0%, #1E4176 55%, #142D55 100%)', boxShadow: '0 0 0 6px #6B4122, 0 0 0 8px #2A170A, inset 0 6px 14px rgba(0,0,0,0.55), 0 24px 40px rgba(0,0,0,0.6)', opacity: (1 - (flown ? fly : 0)) * inF }} />
        {items.map((m) => (
          <div key={m.key} style={{ position: 'absolute', left: m.x - W / 2, top: m.y - H / 2 - 30, width: W, height: H, transform: `scale(${m.sc}) scaleX(${m.flipX})`, transformOrigin: '50% 100%', opacity: m.op, zIndex: m.z }}>
            {m.faceUp && m.p ? (
              <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 6, boxShadow: m.ring, background: 'linear-gradient(165deg,#FFFFFF,#F1EEE6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 4 }}>
                <div style={{ width: 34, height: 34, background: `oklch(0.74 0.13 ${m.p.hue})`, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17 }}>{m.p.letter}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: INK, maxWidth: '92%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>u/{m.p.name}</div>
                <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 0.9, fontStretch: '75%', color: INK }}>{m.p.rating}</div>
              </div>
            ) : <img src={cardUrl('Blue_Back')} alt="" style={{ width: '100%', height: '100%', display: 'block', borderRadius: 6, boxShadow: m.ring }} />}
          </div>
        ))}
        <div style={{ position: 'absolute', left: 24, right: 24, top: 470, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', opacity: (1 - (flown ? fly : 0)) * inF }}>
          <div style={{ fontWeight: 800, fontSize: 34, lineHeight: 1, letterSpacing: '-0.01em', fontStretch: '80%', color: lock ? Y : TXT }}>{lock ? 'Rival found' : offer ? 'Still shuffling' : 'Shuffling the table'}</div>
          <div style={{ fontSize: 16.5, lineHeight: 1.4, color: MUTED, maxWidth: 280 }}>Looking for a player close to your rating, {fmt(profile.rating)}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{[0, 1, 2].map((j) => <div key={j} style={{ width: 7, height: 7, background: TXT, opacity: 0.25 + 0.75 * Math.max(0, Math.sin(t / 260 - j * 0.9)) }} />)}</div>
        </div>
        {flown && found && (
          <>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 272, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: clamp((ft - SETTLE - LOCK - 450) / 350) }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: Y }}>YOUR RIVAL</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>u/{found.seat.username}</div>
            </div>
            <div style={{ position: 'absolute', left: 40, right: 40, top: 345, display: 'flex', alignItems: 'center', gap: 12, opacity: clamp((ft - SETTLE - LOCK - 650) / 300) }}>
              <div style={{ flex: 1, height: 1, background: LINE }} /><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '0.12em', color: '#6E6A61' }}>VS</div><div style={{ flex: 1, height: 1, background: LINE }} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 385 + (1 - clamp((ft - SETTLE - LOCK - 800) / 400)) * 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, opacity: clamp((ft - SETTLE - LOCK - 800) / 400) }}>
              <PlayingCard down back={profile.cosmetics.back} size="hand" />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 20, fontWeight: 800 }}>You</span><span style={{ fontWeight: 800, fontSize: 30, fontStretch: '75%', color: SOFT }}>{fmt(profile.rating)}</span></div>
            </div>
          </>
        )}
      </div>
      {found ? (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 40, height: 64, display: 'flex', boxShadow: '4px 4px 0 #000' }}>
          <div style={{ flex: 1, background: TXT, color: INK, display: 'flex', alignItems: 'center', padding: '0 18px', fontWeight: 800, fontSize: 20 }}>Dealing in</div>
          <div style={{ width: 80, background: Y, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 44, fontStretch: '75%' }}>{dealing}</div>
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 40 }}>
          <Btn kind="quiet" h={56} size={17} onClick={() => { void api.leave(); onCancel(); }}>Cancel</Btn>
        </div>
      )}
      {offer && !found && (
        <Sheet>
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.05, fontStretch: '85%' }}>No one around. Warm up against a bot?</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.4, color: MUTED }}>Bot duels don’t change your rating or chips. We keep looking while you play.</div>
          <Btn kind="hot" style={{ marginTop: 4 }} onClick={onBot}>Play the bot</Btn>
          <Btn kind="quiet" h={48} size={16} onClick={() => { dismissed.current = true; setOffer(false); }}>Keep waiting</Btn>
        </Sheet>
      )}
    </>
  );
}
