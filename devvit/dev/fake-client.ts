/** Local stand-in for `@devvit/web/client`: a per-tab identity (`?as=name`) and Realtime over SSE. */
const as = new URLSearchParams(location.search).get('as') ?? sessionStorage.getItem('dev-user') ?? 'you';
sessionStorage.setItem('dev-user', as);
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => realFetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), 'x-dev-user': as } });
const sources = new Map<string, EventSource>();
export function connectRealtime<T>(o: { channel: string; onMessage: (m: T) => void; onConnect?: () => void }) {
  const es = new EventSource(`/dev/realtime?channel=${encodeURIComponent(o.channel)}`);
  es.onmessage = (e) => o.onMessage(JSON.parse(e.data));
  es.onopen = () => o.onConnect?.();
  sources.set(o.channel, es);
}
export function disconnectRealtime(channel: string) { sources.get(channel)?.close(); sources.delete(channel); }
export const requestExpandedMode = () => { location.href = 'game.html'; };
export const navigateTo = (u: string) => window.open(u, '_blank');
