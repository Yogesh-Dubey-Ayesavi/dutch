/**
 * Port of the "Clutch Card" design component. Sizes, rings, lattice backs, power badges and the lock badge
 * follow the design source one to one. Faces are drawn as vectors (index, pips, framed courts); set
 * FACE_ART to use the Kennard SVGs in /cards/ exactly as the design's default face does.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card as EngineCard } from '@engine';
import { SERIF } from './tokens';
import { cardUrl, loadFace } from './media';

export const FACE_ART = true;
export type Size = 'xl' | 'hand' | 'pile' | 'tile' | 'opp' | 'mini';
export type CardState = 'idle' | 'tap' | 'sel' | 'touched' | 'locked' | 'penalty' | 'good' | 'dim' | 'ghost';
export type Suit = 's' | 'h' | 'd' | 'c';
export const SIZES: Record<Size, [number, number]> = { xl: [100, 140], hand: [74, 104], pile: [66, 92], tile: [56, 78], opp: [42, 60], mini: [30, 42] };
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rankLabel = (n: number) => RANKS[n];
export const suitOf = (c: EngineCard): Suit => c.suit[0] as Suit;

const PATHS: Record<Suit, string> = {
  h: 'M12 21.5C9 18.6 1.5 13 1.5 7.4a5.3 5.3 0 0 1 10.5-1.3 5.3 5.3 0 0 1 10.5 1.3c0 5.6-7.5 11.2-10.5 14.1Z',
  d: 'M12 1.5 20.5 12 12 22.5 3.5 12Z',
  s: 'M12 1.5C9.3 5.4 1.8 9.6 1.8 14.6a5 5 0 0 0 8.6 3.4c-.2 2-1.2 3.3-3 4.5h9.2c-1.8-1.2-2.8-2.5-3-4.5a5 5 0 0 0 8.6-3.4C22.2 9.6 14.7 5.4 12 1.5Z',
  c: 'M12 1.8a4.9 4.9 0 0 0-3.9 7.9A4.9 4.9 0 1 0 10.4 18c-.2 1.9-1.2 3.3-3 4.5h9.2c-1.8-1.2-2.8-2.6-3-4.5a4.9 4.9 0 1 0 2.3-8.3A4.9 4.9 0 0 0 12 1.8Z',
};
const SUITN = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const Y = 'oklch(0.88 0.16 95)', DANGER = 'oklch(0.62 0.22 25)', CMINT = 'oklch(0.8 0.14 165)';
const BACKS: Record<string, string> = { blue: '#1E3C8C', red: '#A3202A', green: '#17623F', black: '#1B1B1E', plum: '#5A2A78', gold: '#9A6B12', cream: '#D9CBA8' };

export interface CardProps {
  rank?: string; suit?: Suit; size?: Size; down?: boolean; state?: CardState; joker?: boolean; back?: string; face?: string;
  fourColor?: boolean; tilt?: number; scaleX?: number; flip?: string; label?: string; onClick?: () => void; style?: CSSProperties;
}

function Pip({ suit, size, col, style }: { suit: Suit; size: number; col: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden><path d={PATHS[suit]} fill={col} /></svg>;
}

const faceCache = new Map<string, string>();
/** The Kennard face as an inline image once it has loaded; until then the vector face is drawn. */
function useFaceArt(code: string | null) {
  const [art, setArt] = useState<string | null>(code ? faceCache.get(code) ?? null : null);
  useEffect(() => {
    if (!code) { setArt(null); return; }
    const hit = faceCache.get(code);
    if (hit) { setArt(hit); return; }
    let alive = true;
    void loadFace(code)?.then((url) => { faceCache.set(code, url); if (alive) setArt(url); }, () => {});
    return () => { alive = false; };
  }, [code]);
  return art;
}

export function PlayingCard(p: CardProps) {
  const size = p.size ?? 'hand';
  const [w, h] = SIZES[size];
  const rank = p.rank || 'A', suit = p.suit || 's';
  const ink = '#15161A', red = '#C21F2B';
  const col = p.fourColor ? { s: ink, h: red, d: '#1F5FBF', c: '#127A45' }[suit] : suit === 'h' || suit === 'd' ? red : ink;
  const down = !!p.down, state = p.state ?? 'idle', ghost = state === 'ghost';
  const radius = Math.round(w * 0.075);

  // Flip on the vertical axis whenever a card turns face up or down (250 ms; reduced motion cross-fades).
  const prevDown = useRef(down);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (prevDown.current === down) return;
    prevDown.current = down;
    setFlipping(true);
    const t = setTimeout(() => setFlipping(false), 300);
    return () => clearTimeout(t);
  }, [down]);

  const rings: string[] = [];
  if (state === 'tap') rings.push(`0 0 0 2px ${Y}`, '0 0 14px oklch(0.88 0.16 95 / 0.45)');
  if (state === 'sel') rings.push(`0 0 0 3px ${Y}`, '0 0 18px oklch(0.88 0.16 95 / 0.55)');
  if (state === 'touched') rings.push('0 0 0 2px #FFFFFF', '0 0 0 7px rgba(255,255,255,0.22)');
  if (state === 'locked') rings.push('0 0 0 2px #B9B3A6');
  if (state === 'penalty') rings.push(`0 0 0 3px ${DANGER}`, '0 0 18px oklch(0.62 0.22 25 / 0.6)');
  if (state === 'good') rings.push(`0 0 0 3px ${CMINT}`);
  const shadow = ghost ? 'inset 0 2px 6px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)'
    : [...rings, '0 1px 1px rgba(0,0,0,0.35)', state === 'sel' ? '0 16px 24px rgba(0,0,0,0.5)' : '0 4px 10px rgba(0,0,0,0.35)'].join(', ');
  const wrap: CSSProperties = {
    position: 'relative', width: w, height: h, flex: 'none', borderRadius: radius, boxShadow: shadow,
    transform: `translateY(${state === 'sel' ? -12 : 0}px) rotate(${p.tilt ?? 0}deg) scaleX(${p.scaleX ?? 1})`,
    opacity: state === 'dim' ? 0.4 : 1, background: ghost ? 'rgba(0,0,0,0.22)' : 'transparent', boxSizing: 'border-box',
    transition: 'transform 180ms cubic-bezier(.2,.8,.3,1), box-shadow 180ms', cursor: p.onClick ? 'pointer' : undefined,
    animation: state === 'touched' ? 'cl-touch 900ms ease-out 2' : state === 'penalty' ? 'cl-shake 400ms ease-in-out' : undefined,
    ...p.style,
  };
  const inner: CSSProperties = { position: 'absolute', inset: 0, borderRadius: radius, animation: flipping ? `cl-flip-${p.flip ?? 'classic'} 260ms ease-out` : undefined };

  const backName = p.back ?? 'blue';
  const field = BACKS[backName] ?? BACKS.blue;
  const backArt = backName === 'blue' ? cardUrl('Blue_Back') : backName === 'red' ? cardUrl('Red_Back') : null;
  const lineC = backName === 'cream' ? 'rgba(90,50,20,0.45)' : 'rgba(255,255,255,0.42)';
  const margin = Math.max(2, Math.round(w * 0.06)), lat = Math.max(4, Math.round(w * 0.075)), md = Math.round(w * 0.36);

  const face = p.face ?? 'default';
  const fam = face === 'mono' ? "ui-monospace, 'SF Mono', Menlo, monospace" : face === 'modern' ? "'Bricolage Grotesque Variable', sans-serif" : SERIF;
  const small = size === 'opp' || size === 'mini';
  const rfs = size === 'mini' ? 17 : Math.max(14, Math.round(w * 0.2));
  const idxW = Math.round(w * 0.2);
  const idxBase: CSSProperties = { position: 'absolute', width: Math.max(idxW, rfs), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 };
  const idxTL: CSSProperties = size === 'mini' ? { ...idxBase, top: 5, left: 0, right: 0, width: 'auto' } : { ...idxBase, top: Math.round(h * 0.04), left: Math.round(w * 0.04) };
  const idxBR: CSSProperties = { ...idxBase, bottom: Math.round(h * 0.04), right: Math.round(w * 0.04), transform: 'rotate(180deg)' };
  const idxRank: CSSProperties = { fontFamily: fam, fontWeight: 700, fontSize: rfs, lineHeight: 0.9, color: col, letterSpacing: rank === '10' ? '-0.08em' : 0, fontStretch: face === 'modern' ? '75%' : '100%' };
  const idxPip = Math.max(9, Math.round(rfs * 0.62));
  const n = ({ A: 1, J: 11, Q: 12, K: 13 } as Record<string, number>)[rank] ?? parseInt(rank, 10);
  const two = [[50, 22], [50, 78]], four = [[31, 22], [69, 22], [31, 78], [69, 78]], six = [...four, [31, 50], [69, 50]];
  const eight = [20, 40, 60, 80].flatMap((y) => [[31, y], [69, y]]);
  const LAY: Record<number, number[][]> = { 2: two, 3: [...two, [50, 50]], 4: four, 5: [...four, [50, 50]], 6: six, 7: [...six, [50, 36]], 8: [...six, [50, 36], [50, 64]], 9: [...eight, [50, 50]], 10: [...eight, [50, 30], [50, 70]] };
  const isAce = n === 1, isCourt = n > 10;
  const pipSize = isAce ? Math.round(w * (suit === 's' ? 0.46 : 0.38)) : Math.round(w * 0.17);
  const art = useFaceArt(FACE_ART && face === 'default' && size !== 'mini' ? `${rank}${suit.toUpperCase()}` : null);
  const useArt = !!art;
  let pips: CSSProperties[] = [];
  if (!small) {
    const coords = isAce ? [[50, 50]] : LAY[n] ?? [];
    const areaL = w * 0.2, areaW = w * 0.6, areaT = h * 0.1, areaH = h * 0.8;
    pips = coords.map(([x, y]) => ({ position: 'absolute', left: areaL + (x / 100) * areaW - pipSize / 2, top: areaT + (y / 100) * areaH - pipSize / 2, transform: y > 52 && !isAce ? 'rotate(180deg)' : 'none' }));
  } else if (!isCourt && size === 'opp') pips = [{ position: 'absolute', left: w / 2 - 8, top: h * 0.55 - 8 }];
  const gold = '#B8902E';
  const isPow = rank === 'J' || rank === 'Q' || rank === 'A';
  const bs = Math.max(14, Math.round(w * 0.2));
  // The design never labels the Joker on a card: players must remember the round's Joker rank.
  const badge: CSSProperties = { position: 'absolute', top: Math.round(h * 0.04), right: Math.round(w * 0.05), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', zIndex: 3 };
  const label = p.label ?? (down ? 'Face-down card' : `${rank} of ${SUITN[suit]}`);

  return (
    <div style={wrap} onClick={p.onClick} role={p.onClick ? 'button' : 'img'} aria-label={label}>
      {!ghost && <div style={inner}>
        {down ? (
          backArt ? <img src={backArt} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', borderRadius: radius }} /> : (
            <div style={{ position: 'absolute', inset: 0, borderRadius: radius, background: 'linear-gradient(160deg, #FFFFFF, #F1EFE8)', padding: margin, boxSizing: 'border-box', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: Math.max(1, radius * 0.45), backgroundColor: field, overflow: 'hidden',
                backgroundImage: `repeating-linear-gradient(45deg, ${lineC} 0 1px, transparent 1px ${lat}px), repeating-linear-gradient(-45deg, ${lineC} 0 1px, transparent 1px ${lat}px), radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.14), transparent 70%)` }}>
                <div style={{ position: 'absolute', inset: Math.max(2, Math.round(w * 0.04)), border: `1px solid ${lineC}`, borderRadius: 1 }} />
                {size !== 'mini' && (
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: md, height: Math.round(md * 1.3), marginLeft: -md / 2, marginTop: -Math.round(md * 0.65), borderRadius: '50%', background: field,
                    border: `1.5px solid ${backName === 'cream' ? 'rgba(90,50,20,0.7)' : 'rgba(255,255,255,0.85)'}`, boxShadow: `0 0 0 ${Math.max(2, Math.round(w * 0.03))}px ${field}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: Math.round(md * 0.62), lineHeight: 1, color: backName === 'cream' ? '#6A3A1A' : '#FFFFFF' }}>C</span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: 'linear-gradient(165deg, #FFFFFF 0%, #FAF8F2 55%, #EFEBE1 100%)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.09), inset 0 1px 0 #FFFFFF' }}>
            {useArt && <img src={art ?? undefined} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', zIndex: 1 }} />}
            {!useArt && <div style={idxTL}><span style={idxRank}>{rank}</span><Pip suit={suit} size={idxPip} col={col} /></div>}
            {!small && !useArt && <div style={idxBR}><span style={idxRank}>{rank}</span><Pip suit={suit} size={idxPip} col={col} /></div>}
            {!useArt && pips.map((st, i) => <Pip key={i} suit={suit} size={pipSize} col={col} style={st} />)}
            {isCourt && !small && !useArt && (
              <div style={{ position: 'absolute', left: '19%', right: '19%', top: '11%', bottom: '11%', border: `1.5px solid ${gold}`, borderRadius: 2, display: 'flex', flexDirection: 'column',
                background: 'repeating-linear-gradient(45deg, rgba(184,144,46,0.10) 0 2px, transparent 2px 6px), linear-gradient(180deg, #FFFDF6, #F6EFDC)', boxShadow: `inset 0 0 0 2px #FFFDF6, inset 0 0 0 3px ${col}33` }}>
                {[0, 1].map((half) => (
                  <div key={half} style={{ display: 'contents' }}>
                    {half === 1 && <div style={{ height: 1.5, background: gold, margin: '0 4px' }} />}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, transform: half ? 'rotate(180deg)' : undefined }}>
                      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: Math.round(w * 0.3), lineHeight: 1, color: col }}>{rank}</span>
                      <Pip suit={suit} size={Math.round(w * 0.14)} col={col} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isPow && !small && (
              <div style={{ ...badge, width: bs, height: bs, background: '#15161A', color: '#FFFFFF' }} title={rank === 'J' ? 'Jack: peek' : rank === 'Q' ? 'Queen: blind swap' : 'Ace: shuffle theirs'}>
                {rank === 'J' && <svg width="70%" height="70%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M1.5 8 Q8 1.5 14.5 8 Q8 14.5 1.5 8Z" /><circle cx="8" cy="8" r="2.2" fill="currentColor" /></svg>}
                {rank === 'Q' && <svg width="70%" height="70%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h11M10 2l3 3-3 3" /><path d="M14 11H3M6 8l-3 3 3 3" /></svg>}
                {rank === 'A' && <svg width="70%" height="70%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 4h3l7 8h3M1.5 12h3l7-8h3" /></svg>}
              </div>
            )}
          </div>
        )}
      </div>}
      {state === 'locked' && (
        <div style={{ position: 'absolute', top: 3, left: '50%', marginLeft: -10, width: 20, height: 18, borderRadius: 4, background: '#B9B3A6', color: '#141412', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="6.5" rx="1" fill="currentColor" /><path d="M2.8 5V3.6a2.2 2.2 0 0 1 4.4 0V5" stroke="currentColor" strokeWidth="1.6" /></svg>
        </div>
      )}
    </div>
  );
}

/** Shorthand for an engine card. */
export function EngineCardView({ card, jokerRank, ...rest }: Omit<CardProps, 'rank' | 'suit'> & { card: EngineCard | null; jokerRank?: number | null }) {
  if (!card) return <PlayingCard {...rest} down />;
  return <PlayingCard {...rest} rank={rankLabel(card.rank)} suit={suitOf(card)} joker={jokerRank === card.rank} />;
}
