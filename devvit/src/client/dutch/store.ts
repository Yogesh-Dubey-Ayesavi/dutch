/**
 * The original Dutch client store, with the WebSocket swapped for the Devvit API + Realtime.
 * Everything the table relies on is kept as it was: optimistic hand reordering that queues up and is replayed
 * over every server snapshot, one action in flight at a time, deferred moves while reorders settle, sound
 * events, reaction bursts and chat. Realtime only says "version N is out"; each seat then fetches its own view.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import type { Action, GameView } from '@engine';
import { CHAT_HISTORY, type ChatLine, type SoundName } from '../../shared/protocol';
import type { MatchEnvelope } from '../../shared/api';
import { api, ApiError, onConnectivity } from '../api';
import { emoteSound, noteWrongFreeThrow, playSound } from './sound';
import { recordPush } from '../nerd';

interface Preferences { sound: boolean; volume: number; effects: boolean; dutchAlarm: boolean; alarmVolume: number; flightSounds: boolean; set: (p: Partial<Omit<Preferences, 'set'>>) => void }
export const usePrefs = create<Preferences>()(persist((set) => ({ sound: true, volume: 0.65, effects: true, dutchAlarm: true, alarmVolume: 0.3, flightSounds: true, set: (p) => set(p) }), { name: 'clutch-preferences' }));

/** A reaction or chat line floating over a seat for a moment. */
export interface Burst { id: string; playerId: string; emoji?: string; text?: string }
interface RoomStore {
  state: GameView | null; env: MatchEnvelope | null; code: string; status: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'closed'; error: string;
  /** Id of the action awaiting the server. Reorders never set this: they're optimistic and keep the hand live. */
  pending: string | null;
  /** Something (an action or a reorder) is on its way to the server. Drives the network indicator. */
  syncing: boolean;
  /** Round-trip time of the latest ping, in ms. */
  latency: number | null;
  bursts: Burst[]; chat: ChatLine[]; unread: number; chatOpen: boolean;
  set: (v: Partial<RoomStore>) => void;
}
export const useRoom = create<RoomStore>((set) => ({ state: null, env: null, code: '', status: 'offline', error: '', pending: null, syncing: false, latency: null, bursts: [], chat: [], unread: 0, chatOpen: false, set: (v) => set(v) }));
const room = () => useRoom.getState();

type Live = { v: number; over: boolean; sound?: { name: SoundName; id: string } | null; emote?: { playerId: string; emoji: string; id: string }; chat?: ChatLine };
let matchId: string | null = null;
let offset = 0;
let tickTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let offConn: (() => void) | undefined;
let lastSound: string | null | undefined;
const heard = new Set<string>();
let held: MatchEnvelope | null = null;
/** The private channel the server pushes this player's whole table to (see broadcast on the server). */
let liveChannel: string | null = null;
/** For Stats for nerds: whether the private push channel is up. */
export const liveStatus = { channel: null as string | null, connected: false, since: 0 };
function listen(env: MatchEnvelope) {
  if (local || !env.live || env.live === liveChannel) return;
  if (liveChannel) { try { disconnectRealtime(liveChannel); } catch { /* already closed */ } }
  liveChannel = env.live;
  connectRealtime({
    channel: env.live,
    // A push is the server's latest table: taken like any snapshot (held while one of our own moves is in flight).
    onMessage: (raw) => { const next = (raw as { env?: MatchEnvelope } | null)?.env; if (next) { recordPush(next.now, JSON.stringify(raw).length); if (reorderFlight || actionFlight) { if (!held || next.view.version >= held.view.version) held = next; } else ingest(next); } },
    onConnect: () => { liveStatus.connected = true; liveStatus.since = Date.now(); void refresh(); },
    onDisconnect: () => { liveStatus.connected = false; },
  });
  liveStatus.channel = env.live; liveStatus.connected = false;
}

/**
 * Where actions go. Normally the Devvit API; the tutorial swaps in a table that runs the same engine in the
 * browser, so the real board (gestures, animations, sounds) is what people learn on.
 */
export interface LocalTable {
  act: (action: Action, version: number) => Promise<MatchEnvelope>;
  state: () => MatchEnvelope;
}
let local: LocalTable | null = null;
const send = (id: string, action: Action, version: number) => local ? local.act(action, version) : api.act(id, action as never, version);

/* ---------- optimistic hand reordering ----------
 * A reorder shows immediately and is replayed on top of every server snapshot until the server confirms it.
 * Several quick drags queue up and are sent one at a time, each against the hand revision the previous one
 * produced, so a burst of rearranging can never fall back to an older order mid-way. */
let serverState: GameView | null = null;
let reorders: { from: number; to: number }[] = [];
let reorderFlight = false;
let actionFlight = false;
/** One ordinary action made while reorders were still settling; sent once they have. */
let deferred: Action | null = null;

function moveCard(view: GameView, from: number, to: number): GameView {
  const players = view.players.map((p) => {
    if (p.id !== view.you) return p;
    const hand = [...p.hand], backs = [...p.handBacks];
    const [card] = hand.splice(from, 1); hand.splice(to, 0, card);
    const [back] = backs.splice(from, 1); backs.splice(to, 0, back);
    return { ...p, hand, handBacks: backs };
  });
  const remap = (i: number) => i === from ? to : from < to && i > from && i <= to ? i - 1 : to < from && i >= to && i < from ? i + 1 : i;
  return { ...view, players, reveals: view.reveals.map((r) => r.owner === view.you ? { ...r, index: remap(r.index) } : r) };
}
const myRevision = (v: GameView | null) => v?.players.find((p) => p.id === v.you)?.handRevision ?? -1;
function display() { if (!serverState) return null; return reorders.reduce((v, m) => moveCard(v, m.from, m.to), serverState); }
const refreshSyncing = () => room().set({ syncing: actionFlight || reorderFlight });
function dropReorders() { reorders = []; deferred = null; }

function addBurst(b: Burst, ms: number) {
  room().set({ bursts: [...room().bursts.filter((x) => !(x.playerId === b.playerId && !!x.text === !!b.text)), b] });
  setTimeout(() => room().set({ bursts: room().bursts.filter((x) => x.id !== b.id) }), ms);
}
/**
 * Your own move's sound plays the moment you make it, not when the server answers (on Reddit that's 300 ms or
 * more away). The server still reports the sound; when it's the one already played, it is skipped.
 */
let instant: { name: SoundName; at: number } | null = null;
function instantSound(a: Action, v: GameView): SoundName | null {
  switch (a.type) {
    case 'draw': return 'draw';
    case 'initialPeek': case 'powerPeek': return 'flip';
    case 'swap': case 'discard': case 'undoCall': return 'snap';
    case 'call': return 'dutch';
    case 'blindSwap': case 'blindSwapBatch': case 'rearrange': return 'power';
    case 'burn': {
      // Only when the outcome is certain: a card you can see, matching the top of the pile, outside the final throws.
      const card = v.players.find((p) => p.id === v.you)?.hand[a.index ?? a.indices?.[0] ?? -1];
      const top = v.discard.at(-1);
      return card && top && card.rank === top.rank && !v.caller ? 'burn' : null;
    }
    default: return null;
  }
}
function hear(name: SoundName, id: string) {
  if (heard.has(id)) return;
  heard.add(id); if (heard.size > 100) heard.delete(heard.values().next().value!);
  if (instant && instant.name === name && Date.now() - instant.at < 6000 && serverState && id.endsWith(`:${serverState.you}`)) { instant = null; return; }
  playSound(name); if (name === 'penalty') noteWrongFreeThrow();
}
function addChatLine(line: ChatLine) {
  const store = room();
  const chat = [...store.chat.filter((l) => l.id !== line.id), line].slice(-CHAT_HISTORY);
  const mine = line.playerId === serverState?.you;
  const isNew = !store.chat.some((l) => l.id === line.id);
  room().set({ chat, unread: store.chatOpen || mine || !isNew ? store.unread : store.unread + 1 });
  if (!mine && isNew) playSound('tick');
}

/** Take a fresh envelope from the server. `ack` marks the response to our own in-flight request. */
function ingest(env: MatchEnvelope, ack?: 'reorder' | 'action') {
  if (env.matchId !== matchId) return;
  listen(env);
  if (!ack && (reorderFlight || actionFlight)) { if (!held || env.view.version >= held.view.version) held = env; return; }
  const next = env.view;
  const newer = !serverState || next.version >= serverState.version || next.you !== serverState.you;
  if (!newer && !env.result) return;
  if (ack === 'reorder') reorders.shift();
  else if (reorders.length && serverState && myRevision(next) !== myRevision(serverState)) dropReorders(); // the hand changed under the queue
  // Ticks, pings and refreshes often bring back the very snapshot we already show. Keep the old objects then, so
  // nothing on the table re-renders for it (every snapshot is fresh JSON, so identity is all React can compare).
  const unchanged = !!serverState && next.version === serverState.version && !ack && JSON.stringify(next) === JSON.stringify(serverState);
  if (newer && !unchanged) serverState = next;
  offset = env.now - Date.now();
  if (env.sound) { if (lastSound !== undefined) hear(env.sound.name, env.sound.id); lastSound = env.sound.id; } else if (lastSound === undefined) lastSound = null;
  const prev = room();
  const seats = prev.env && JSON.stringify(prev.env.seats) === JSON.stringify(env.seats) ? prev.env.seats : env.seats;
  const patch: Partial<RoomStore> = { env: seats === env.seats ? env : { ...env, seats }, status: 'connected' };
  if (!unchanged || !prev.state) patch.state = display();
  if (ack === 'action') patch.pending = null;
  const known = new Set(room().chat.map((l) => l.id));
  const fresh = (env.chat ?? []).filter((l) => !known.has(l.id));
  if (fresh.length) patch.chat = [...room().chat, ...fresh].sort((a, b) => a.at - b.at).slice(-CHAT_HISTORY);
  room().set(patch);
  scheduleTick();
}

function flushHeld() { const h = held; held = null; if (h) ingest(h); }

function scheduleTick() {
  clearTimeout(tickTimer);
  const env = room().env;
  if (!matchId || !env || env.result || env.nextTickAt === null) return;
  const wait = Math.max(150, env.nextTickAt - (Date.now() + offset) + 60);
  const id = matchId;
  if (local) return; // a local table runs its own clock
  tickTimer = setTimeout(async () => {
    if (id !== matchId) return;
    try { ingest(await api.tick(id)); } catch { scheduleTick(); }
  }, wait);
}

export async function refresh() {
  const id = matchId; if (!id) return;
  if (local) { ingest(local.state()); return; }
  try { ingest(await api.state(id)); } catch (e) { if (e instanceof ApiError && e.status !== 0) room().set({ error: e.message }); }
}

export function startMatch(id: string, initial: MatchEnvelope | null) {
  stopMatch();
  matchId = id; lastSound = undefined;
  room().set({ code: id, status: 'connecting', error: '', env: null, state: null, chat: [], bursts: [], unread: 0, pending: null, syncing: false });
  if (initial && initial.matchId === id) ingest(initial); else void refresh();
  const channel = `m_${id}`;
  connectRealtime<Live>({
    channel,
    onMessage: (m) => {
      if (m.sound) hear(m.sound.name, m.sound.id);
      if (m.emote) { addBurst({ id: m.emote.id, playerId: m.emote.playerId, emoji: m.emote.emoji }, 2600); emoteSound(m.emote.emoji); }
      if (m.chat) addChatLine(m.chat);
      const cur = room().env;
      if (!cur || m.v > cur.view.version || (m.over && !cur.result)) void refresh();
    },
    onConnect: () => void refresh(),
  });
  pingTimer = setInterval(async () => {
    const t = Date.now();
    try { const r = await api.ping(id); room().set({ latency: Date.now() - t }); if (serverState && r.v !== serverState.version) void refresh(); } catch { /* the offline state covers it */ }
  }, 5000);
  offConn = onConnectivity((off) => { room().set({ status: off ? 'reconnecting' : 'connected', latency: off ? null : room().latency }); if (!off) void refresh(); });
}

/** Seat the player at a table that runs in the browser (the tutorial). `push` delivers its own updates. */
export function startLocal(table: LocalTable) {
  stopMatch();
  local = table;
  const env = table.state();
  matchId = env.matchId; lastSound = undefined;
  room().set({ code: env.matchId, status: 'connected', error: '', env: null, state: null, chat: [], bursts: [], unread: 0, pending: null, syncing: false });
  ingest(env);
  return (next: MatchEnvelope) => { if (local === table) { if (reorderFlight || actionFlight) { if (!held || next.view.version >= held.view.version) held = next; } else ingest(next); } };
}

export function stopMatch() {
  local = null;
  if (matchId) { try { disconnectRealtime(`m_${matchId}`); } catch { /* already closed */ } }
  if (liveChannel) { try { disconnectRealtime(liveChannel); } catch { /* already closed */ } liveChannel = null; }
  liveStatus.channel = null; liveStatus.connected = false;
  clearTimeout(tickTimer); clearInterval(pingTimer); offConn?.(); offConn = undefined;
  matchId = null; serverState = null; held = null; lastSound = undefined;
  reorders = []; deferred = null; reorderFlight = false; actionFlight = false;
  room().set({ state: null, env: null, code: '', status: 'offline', error: '', pending: null, syncing: false, latency: null, bursts: [], chat: [], unread: 0, chatOpen: false });
}
export const leave = async () => stopMatch();

function pump() {
  if (!matchId || !serverState || reorderFlight || actionFlight) return;
  const next = reorders[0];
  const size = serverState.players.find((p) => p.id === serverState!.you)?.hand.length ?? 0;
  if (next && (next.from >= size || next.to >= size)) { dropReorders(); room().set({ state: display() }); return; }
  if (next) {
    const id = matchId;
    reorderFlight = true; refreshSyncing();
    send(id, { type: 'reorder', from: next.from, to: next.to, handRevision: myRevision(serverState) }, serverState.version).then((env) => {
      reorderFlight = false; ingest(env, 'reorder'); refreshSyncing(); flushHeldIfIdle(); pump();
    }).catch((e) => {
      // The hand changed under the queued moves (a swap, a penalty card…). Show the server's truth quietly.
      reorderFlight = false; dropReorders(); refreshSyncing(); room().set({ state: display() });
      if (e instanceof ApiError && e.status === 0) return;
      flushHeldIfIdle(); void refresh();
    });
    return;
  }
  if (deferred) { const a = deferred; deferred = null; act(a); }
}
function flushHeldIfIdle() { if (!reorderFlight && !actionFlight && !reorders.length) flushHeld(); }

/** Moves one of your own cards. Returns false when the move can't be made right now. */
export function reorderHand(from: number, to: number) {
  const { state, status } = room();
  if (!state || !serverState || status !== 'connected' || from === to) return false;
  const me = state.players.find((p) => p.id === state.you);
  if (!me || from < 0 || to < 0 || from >= me.hand.length || to >= me.hand.length) return false;
  reorders.push({ from, to });
  room().set({ state: display() });
  pump(); return true;
}

/** `silent`: the table already played this move's sound (a move made before it could be sent). */
export function act(action: Action, opts: { silent?: boolean } = {}) {
  const { state, status } = room();
  if (!matchId || !state || !serverState || status !== 'connected' || actionFlight) return;
  // Indices in `action` refer to the hand as shown, which includes reorders still settling: wait for them.
  if (reorders.length || reorderFlight) { deferred = action; return; }
  if (action.type === 'burn') {
    const me = state.players.find((p) => p.id === state.you);
    const drawn = action.match === 'drawn' || (action.match === undefined && state.players[state.turn]?.id === state.you && state.drawn);
    action = { ...action, handRevision: action.handRevision ?? me?.handRevision, targetId: action.targetId ?? (drawn ? state.drawn?.card?.id : state.discard.at(-1)?.id) };
  }
  const id = matchId;
  const now = instantSound(action, state);
  if (now) { if (!opts.silent) playSound(now); instant = { name: now, at: Date.now() }; }
  actionFlight = true; room().set({ pending: id, error: '' }); refreshSyncing();
  send(id, action, serverState.version).then((env) => {
    actionFlight = false; ingest(env, 'action'); refreshSyncing(); flushHeldIfIdle(); pump();
  }).catch((e) => {
    actionFlight = false; instant = null;
    room().set({ error: e instanceof Error ? e.message : 'That didn’t work.', pending: null }); refreshSyncing();
    // A rejected move is a gentle tick, not the wrong-free-throw penalty sound.
    playSound('tick');
    flushHeldIfIdle(); void refresh(); pump();
  });
}
export function emote(emoji: string) { if (matchId && !local) void api.emote(matchId, emoji).catch(() => {}); }
export function sendChat(text: string) {
  const t = text.trim(); if (!t || !matchId || local) return false;
  void api.chat(matchId, t).then((r) => addChatLine(r.line)).catch(() => {});
  return true;
}

/** Press Next round on the round-end screen. */
export function nextRound() { const id = matchId; if (id) void api.next(id).then((env) => ingest(env), () => {}); }
