import { recordCall, recordClock, timingOf } from './nerd';
import type { ClientAction, LeaderboardResponse, MatchEnvelope, QueueStatus, SessionResponse, SharePreview, ShopResponse } from '../shared/api';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
let offline = false;
const listeners = new Set<(o: boolean) => void>();
export const onConnectivity = (f: (o: boolean) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
function setOffline(o: boolean) { if (o !== offline) { offline = o; listeners.forEach((f) => f(o)); } }
if (typeof window !== 'undefined') { window.addEventListener('offline', () => setOffline(true)); window.addEventListener('online', () => setOffline(false)); }

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  const t0 = performance.now(), w0 = Date.now();
  try {
    res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    setOffline(true);
    recordCall(path, performance.now() - t0, null, 0);
    throw new ApiError(0, 'You’re offline. Reconnecting…');
  }
  setOffline(false);
  const data = await res.json().catch(() => ({}));
  const took = performance.now() - t0;
  const d0 = data as { _srv?: number; now?: number };
  recordCall(path, took, typeof d0._srv === 'number' ? d0._srv : null, res.status, timingOf(path, t0));
  if (typeof d0.now === 'number') recordClock(d0.now, w0 + took / 2);
  if (!res.ok) { const d = data as { error?: string; detail?: string }; throw new ApiError(res.status, `${d.error ?? 'Something went wrong.'}${d.detail ? ` (${d.detail})` : ''}`); }
  return data as T;
}

export const api = {
  session: () => call<SessionResponse>('GET', '/api/session'),
  tutorialSeen: () => call('POST', '/api/tutorial/seen'),
  tutorialProgress: (at: string) => call('POST', '/api/tutorial/progress', { at }),
  join: () => call<QueueStatus>('POST', '/api/queue/join'),
  poll: () => call<QueueStatus>('POST', '/api/queue/poll'),
  leave: () => call('POST', '/api/queue/leave'),
  bot: () => call<MatchEnvelope>('POST', '/api/queue/bot'),
  state: (id: string) => call<MatchEnvelope>('GET', `/api/match/${id}/state`),
  act: (id: string, action: ClientAction, v: number) => call<MatchEnvelope>('POST', `/api/match/${id}/action`, { action, v }),
  next: (id: string) => call<MatchEnvelope>('POST', `/api/match/${id}/next`),
  tick: (id: string) => call<MatchEnvelope>('POST', `/api/match/${id}/tick`),
  emote: (id: string, emoji: string) => call<{ ok: boolean }>('POST', `/api/match/${id}/emote`, { emoji }),
  chat: (id: string, text: string) => call<{ ok: boolean; line: import('../shared/protocol').ChatLine }>('POST', `/api/match/${id}/chat`, { text }),
  ping: (id: string) => call<{ ok: boolean; v: number }>('POST', `/api/match/${id}/ping`),
  forfeit: (id: string) => call<MatchEnvelope>('POST', `/api/match/${id}/forfeit`),
  decline: (id: string) => call('POST', `/api/match/${id}/decline`),
  leaderboard: () => call<LeaderboardResponse>('GET', '/api/leaderboard'),
  shop: () => call<ShopResponse>('GET', '/api/shop'),
  buy: (itemId: string) => call<ShopResponse>('POST', '/api/shop/buy', { itemId }),
  equip: (itemId: string) => call<ShopResponse>('POST', '/api/shop/equip', { itemId }),
  sharePreview: (id: string) => call<SharePreview>('GET', `/api/share/${id}/preview`),
  share: (id: string) => call<SharePreview>('POST', `/api/share/${id}`),
  subscribe: () => call('POST', '/api/subscribe'),
};
