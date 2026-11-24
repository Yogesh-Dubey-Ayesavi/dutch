import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { isMuted, onMuted, setMuted } from './sound';
import { BOT_AVATAR, isFullBody } from '../shared/avatars';
import { DIM, GROUND, INK, LINE, MINT, MUTED, PANEL, PANEL_LINE, SHADOW, SHEET, SOFT, TXT, Y, avatarHue } from './tokens';

/** Every screen is laid out on the design's 390 × 844 phone frame and scaled to fit the web view. */
export function Stage({ children, height = 844, background = GROUND }: { children: ReactNode; height?: number; background?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = host.current!;
    const fit = () => setScale(Math.min(el.clientWidth / 390, el.clientHeight / height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);
  return (
    <div ref={host} style={{ position: 'fixed', inset: 0, background, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 390, height, flex: 'none', position: 'relative', transform: `scale(${scale})`, transformOrigin: '50% 50%', color: TXT }}>{children}</div>
    </div>
  );
}

type BtnKind = 'hot' | 'white' | 'quiet' | 'off' | 'danger' | 'mint';
const KIND: Record<BtnKind, CSSProperties> = {
  hot: { background: Y, color: INK, boxShadow: SHADOW },
  white: { background: TXT, color: INK, boxShadow: SHADOW },
  mint: { background: MINT, color: '#0B2A20', boxShadow: SHADOW },
  danger: { background: 'oklch(0.64 0.22 25)', color: '#FFFFFF', boxShadow: SHADOW },
  quiet: { border: `1px solid ${LINE}`, color: SOFT, fontWeight: 700, boxSizing: 'border-box' },
  off: { background: PANEL, color: DIM, boxShadow: `inset 0 0 0 1px ${PANEL_LINE}` },
};
export function Btn({ kind = 'hot', h = 60, size = 22, children, onClick, disabled, style, label }: { kind?: BtnKind; h?: number; size?: number; children: ReactNode; onClick?: (e: React.MouseEvent) => void; disabled?: boolean; style?: CSSProperties; label?: string }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontWeight: 800, fontSize: size, flex: 'none', width: '100%', ...KIND[kind], ...style }}>
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, label, style }: { children: ReactNode; onClick?: () => void; label: string; style?: CSSProperties }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PANEL, border: `1px solid ${PANEL_LINE}`, color: SOFT, boxSizing: 'border-box', flex: 'none', ...style }}>
      {children}
    </button>
  );
}

export const BackIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 3.5 5.5 9l5.5 5.5" /></svg>;
export const CheckIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 7 13.5 15 4.5" /></svg>;

export function MuteBtn() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuted(setM), []);
  return (
    <IconBtn label={m ? 'Sound off. Tap to turn on' : 'Sound on. Tap to mute'} onClick={() => setMuted(!m)}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M2.5 6.5h3l4-3v11l-4-3h-3Z" />
        {m ? <path d="M12.5 6.5l4 5M16.5 6.5l-4 5" strokeLinecap="round" /> : <path d="M12.5 6.5c1 1.4 1 3.6 0 5M14.8 4.5c2 2.6 2 6.4 0 9" />}
      </svg>
    </IconBtn>
  );
}

export const Diamond = ({ size = 8, color = MINT }: { size?: number; color?: string }) => <div style={{ width: size, height: size, background: color, transform: 'rotate(45deg)', flex: 'none' }} />;

export function ChipBalance({ chips }: { chips: number }) {
  return (
    <div style={{ height: 44, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: PANEL, border: `1px solid ${PANEL_LINE}`, boxSizing: 'border-box' }} aria-label={`${chips} chips`}>
      <Diamond /><span style={{ fontWeight: 800, fontSize: 20, fontStretch: '75%' }}>{chips.toLocaleString('en-US')}</span>
    </div>
  );
}

/** A player's Reddit avatar when they have one (cropped to the head), else their initial on a colour. */
export function Avatar({ name, size = 30, you = false, bot = false, src }: { name: string; size?: number; you?: boolean; bot?: boolean; src?: string }) {
  const [broken, setBroken] = useState(false);
  const bg = bot ? '#3A3833' : you ? 'oklch(0.78 0.12 250)' : `oklch(0.72 0.16 ${avatarHue(name)})`;
  const img = src || (bot ? BOT_AVATAR : undefined);
  const photo = !!img && !broken;
  const crop = !!img && isFullBody(img);
  return <div aria-hidden style={{ width: size, height: size, flex: 'none', background: bg, color: bot ? SOFT : '#141412', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(size * 0.5), overflow: 'hidden', position: 'relative' }}>{photo ? <img src={img} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={crop ? { position: 'absolute', left: '50%', top: 0, width: '170%', height: '170%', transform: 'translateX(-50%)', objectFit: 'cover', objectPosition: '50% 0%' } : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : (bot ? 'B' : name[0] ?? '?').toUpperCase()}</div>;
}

/** Bottom sheet with the dimmed backdrop used by every confirm in the design. */
export function Sheet({ children, onClose, z = 20 }: { children: ReactNode; onClose?: () => void; z?: number }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,7,0.6)', zIndex: z, animation: 'cl-fade 160ms ease-out' }} />
      <div role="dialog" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 16px 40px', background: SHEET, borderTop: `2px solid ${TXT}`, display: 'flex', flexDirection: 'column', gap: 12, zIndex: z + 1, animation: 'cl-rise 220ms cubic-bezier(.2,.8,.3,1)' }}>
        {children}
      </div>
    </>
  );
}

export function Toast({ text, line, sub }: { text: string; line: string; sub?: string }) {
  return (
    <div role="status" style={{ position: 'absolute', left: 16, right: 16, top: 48, zIndex: 40, animation: 'cl-toast 160ms ease-out' }}>
      <div style={{ minHeight: 54, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 14px', background: '#F7F5EF', color: INK, fontSize: 15, fontWeight: 800, boxShadow: '5px 5px 0 #000', borderLeft: `8px solid ${line}` }}>
        <span>{text}</span>{sub && <span style={{ fontSize: 13, color: '#4B483F', flex: 'none' }}>{sub}</span>}
      </div>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div role="alert" style={{ position: 'absolute', left: 16, right: 16, top: 48, zIndex: 45 }}>
      <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', background: TXT, color: INK, boxShadow: '5px 5px 0 #000' }}>
        <div style={{ display: 'flex', gap: 4 }}>{[1, 0.55, 0.25].map((o, i) => <div key={i} style={{ width: 6, height: 6, background: INK, opacity: o, animation: `cl-blink 1.2s ${i * 0.2}s infinite` }} />)}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}><div style={{ fontSize: 15, fontWeight: 800 }}>You’re offline. Reconnecting…</div><div style={{ fontSize: 12, color: '#4B483F' }}>Taps are paused until you’re back</div></div>
      </div>
    </div>
  );
}

export function useNow(intervalMs = 100, offset = 0) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), intervalMs); return () => clearInterval(t); }, [intervalMs, offset]);
  return now;
}

export function useToast() {
  const [toast, setToast] = useState<{ text: string; line: string; sub?: string; id: number } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);
  return [toast, (text: string, line: string, sub?: string) => setToast({ text, line, sub, id: Date.now() })] as const;
}

/** A number that counts from its previous value to the new one (Design Spec: rating change, 800 ms). */
export function CountUp({ to, from, ms = 800, format = (n: number) => n.toLocaleString('en-US') }: { to: number; from?: number; ms?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(from ?? to);
  useEffect(() => {
    const start = performance.now(), a = from ?? to;
    let id = 0;
    const step = (t: number) => { const u = Math.min(1, (t - start) / ms); setV(Math.round(a + (to - a) * (1 - Math.pow(1 - u, 3)))); if (u < 1) id = requestAnimationFrame(step); };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [to, from, ms]);
  return <>{format(v)}</>;
}

export const Kicker = ({ children, color = MUTED }: { children: ReactNode; color?: string }) => <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color }}>{children}</div>;

/** The loading screen: the same markup game.html shows before the script arrives (styles in loader.css). */
export function Loading({ note = 'Shuffling' }: { note?: string }) {
  return (
    <div className="cl-load" role="status" aria-label="Loading Clutch">
      <div className="cl-load-hand" aria-hidden>
        <div className="cl-load-card"><i className="cl-load-back" /></div>
        <div className="cl-load-card"><i className="cl-load-back" /></div>
        <div className="cl-load-card"><i className="cl-load-back" /><i className="cl-load-face">{'\u2660\uFE0E'}</i></div>
      </div>
      <div className="cl-load-text"><div className="cl-load-name">Clutch</div><div className="cl-load-note">{note}<b /></div></div>
    </div>
  );
}
