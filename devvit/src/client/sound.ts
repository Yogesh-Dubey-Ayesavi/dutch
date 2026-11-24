import { audioUrl } from './media';
/** Sound is off until the player's first tap (Design Spec), with a mute toggle on every screen. */
export type Cue = 'draw' | 'flip' | 'snap' | 'penalty' | 'power' | 'dutch' | 'victory' | 'tick' | 'shuffle' | 'deal' | 'burn';
const KEY = 'clutch.muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let unlocked = false;
const cache = new Map<Cue, HTMLAudioElement>();
const subs = new Set<(m: boolean) => void>();
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { unlocked = true; }, { once: true, capture: true });
export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ } subs.forEach((f) => f(m)); }
export const onMuted = (f: (m: boolean) => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function play(cue: Cue, volume = 0.7) {
  if (muted || !unlocked) return;
  let a = cache.get(cue);
  if (!a) { a = new Audio(audioUrl(`${cue}.wav`)); cache.set(cue, a); }
  try { const n = a.cloneNode() as HTMLAudioElement; n.volume = volume; void n.play().catch(() => {}); } catch { /* ignore */ }
}
