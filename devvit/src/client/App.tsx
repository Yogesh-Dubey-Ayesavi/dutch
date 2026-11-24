import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { DANGER, INK, LINE, MUTED, TXT, Y, fmt } from './tokens';
import { Avatar, Btn, Kicker, Loading, Sheet, Stage, Toast, useToast } from './ui';
import { startMatch, stopMatch, useRoom } from './dutch/store';
import { GHOST_PROFILE, Home } from './screens/Home';
import { setAppVersion } from './About';
import type { MatchEnvelope, Seat, SessionResponse } from '../shared/api';

// Home ships in the first file; everything else (the table, its card art, the tutorial, the other screens) loads
// in its own files, fetched in the background once Home is up (see `warm` below).
const load = {
  match: () => import('./dutch/DutchMatch'),
  tutorial: () => import('./screens/Tutorial'),
  queue: () => import('./screens/Matchmaking'),
  round: () => import('./screens/RoundEnd'),
  end: () => import('./screens/MatchEnd'),
  shop: () => import('./screens/Shop'),
  board: () => import('./screens/Leaderboard'),
};
const DutchMatch = lazy(() => load.match().then((m) => ({ default: m.DutchMatch })));
const Tutorial = lazy(() => load.tutorial().then((m) => ({ default: m.Tutorial })));
const Matchmaking = lazy(() => load.queue().then((m) => ({ default: m.Matchmaking })));
const RoundEnd = lazy(() => load.round().then((m) => ({ default: m.RoundEnd })));
const MatchEnd = lazy(() => load.end().then((m) => ({ default: m.MatchEnd })));
const Shop = lazy(() => load.shop().then((m) => ({ default: m.Shop })));
const Leaderboard = lazy(() => load.board().then((m) => ({ default: m.Leaderboard })));
let warmed = false;
/** Fetch the other screens while the player looks at Home, table first. */
function warm() {
  if (warmed) return;
  warmed = true;
  const go = () => { void load.match().then(() => import('./dutch/sound')).then((m) => m.preloadTableSounds()).then(load.tutorial).then(load.queue).then(() => Promise.all([load.round(), load.end(), load.shop(), load.board()])).catch(() => { warmed = false; }); };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
}

/** The last session seen on this device, so Home can show at once on the next visit while the server catches up. */
const CACHE = 'clutch.session';
function cached(): SessionResponse | null {
  try { const raw = localStorage.getItem(CACHE); return raw ? (JSON.parse(raw) as SessionResponse) : null; } catch { return null; }
}
function keep(s: SessionResponse) { try { localStorage.setItem(CACHE, JSON.stringify({ ...s, active: null })); } catch { /* private mode */ } }

type Screen = 'loading' | 'home' | 'howto' | 'queue' | 'match' | 'shop' | 'board';

export function App() {
  const start = new URLSearchParams(location.search).get('start') ?? (location.pathname.endsWith('tutorial.html') ? 'howto' : null);
  const [session, setSessionState] = useState<SessionResponse | null>(null);
  /** True once the server has answered; until then Home shows the cached profile, or greyed placeholders. */
  const [fresh, setFresh] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => (start === 'howto' ? 'loading' : 'home'));
  const setSession = useCallback((s: SessionResponse) => { setAppVersion(s.appVersion); setSessionState(s); setFresh(true); keep(s); }, []);
  const [early] = useState(cached);
  /** A tap on Home before the server answered: carried out as soon as it does. */
  const pending = useRef<(() => void) | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [initial, setInitial] = useState<MatchEnvelope | null>(null);
  const [toast, showToast] = useToast();
  const [fatal, setFatal] = useState('');

  const reload = useCallback(() => api.session().then(setSession, (e) => setFatal(e.message)), [setSession]);
  useEffect(() => {
    api.session().then((s) => {
      setSession(s);
      if (s.active) { pending.current = null; setMatchId(s.active.matchId); setScreen('match'); }
      // New players land on Home too, which offers them Learn (highlighted) and both ways to play.
      else if (start === 'howto') setScreen('howto');
      const go = pending.current; pending.current = null; go?.();
    }, (e) => setFatal(e.message));
  }, []);
  useEffect(() => { if (screen === 'home') warm(); }, [screen]);

  const markSeen = useCallback(() => { void api.tutorialSeen().catch(() => {}); }, []);
  const onError = useCallback((m: string) => showToast(m, DANGER), [showToast]);
  const env = useRoom((r) => r.env);
  const offset = env ? env.now - Date.now() : 0;
  // Only a real match is started/stopped here: the tutorial seats you at its own local table.
  useEffect(() => { if (screen !== 'match' || !matchId) return; startMatch(matchId, initial); return () => stopMatch(); }, [screen, matchId]);  
  useEffect(() => { const e = useRoom.getState().error; if (e) { onError(e); useRoom.getState().set({ error: '' }); } }, [useRoom((r) => r.error)]);  

  // While warming up against the bot, keep looking for a human (Design: "Found during a bot game").
  const [rival, setRival] = useState<{ matchId: string; seat: Seat; at: number } | null>(null);
  const inBotGame = screen === 'match' && env?.mode === 'bot' && !env.result;
  useEffect(() => {
    if (!inBotGame) return;
    let alive = true;
    const t = setInterval(async () => {
      try { const s = await api.poll(); if (alive && s.status === 'matched') { setRival({ matchId: s.matchId, seat: s.opponent, at: Date.now() }); clearInterval(t); } } catch { /* next poll */ }
    }, 6000);
    return () => { alive = false; clearInterval(t); };
  }, [inBotGame]);
  const joinRival = useCallback(async () => {
    if (!rival) return;
    if (matchId) await api.forfeit(matchId).catch(() => {});
    setInitial(null); setMatchId(rival.matchId); setRival(null);
  }, [rival, matchId]);
  const stayWithBot = async () => { if (!rival) return; await api.decline(rival.matchId).catch(() => {}); await api.leave().catch(() => {}); setRival(null); };
  const [rivalLeft, setRivalLeft] = useState(8);
  const joinRef = useRef(joinRival); joinRef.current = joinRival;
  useEffect(() => {
    if (!rival) return;
    const t = setInterval(() => { const left = 8 - Math.floor((Date.now() - rival.at) / 1000); setRivalLeft(left); if (left <= 0) { clearInterval(t); void joinRef.current(); } }, 200);
    return () => clearInterval(t);
  }, [rival]);

  // A cancelled duel (the other player stayed with their bot) sends you back to the queue.
  useEffect(() => {
    if (env?.result?.cancelled && env.mode === 'ranked' && env.view.history.length === 0) { showToast('Your rival stayed in their warm-up. Back to the queue.', '#8E8A80'); setScreen('queue'); }
  }, [env?.result?.cancelled]);  

  const goHome = () => { void api.leave().catch(() => {}); setMatchId(null); setInitial(null); void reload(); setScreen('home'); };
  const findDuel = () => { setMatchId(null); setInitial(null); setScreen('queue'); };

  if (fatal) return <Stage><div style={{ position: 'absolute', left: 24, right: 24, top: 300, textAlign: 'center' }}><div style={{ fontWeight: 800, fontSize: 28 }}>Can’t reach the table</div><div style={{ color: MUTED, marginTop: 8 }}>{fatal}</div><div style={{ marginTop: 20 }}><Btn kind="hot" h={52} size={18} onClick={() => { setFatal(''); reload(); }}>Try again</Btn></div></div></Stage>;
  const shown = session ?? early;
  const ghost = !shown;
  // Before the server answers, Home is all there is: taps wait for the answer (they need the real profile).
  const ready = <T extends unknown[]>(fn: (...a: T) => void) => (...a: T) => { if (fresh) fn(...a); else pending.current = () => fn(...a); };

  if (!session && screen !== 'home') return <Loading />;
  const profile = shown?.profile ?? GHOST_PROFILE;
  const startBot = async () => { try { const e = await api.bot(); setInitial(e); setMatchId(e.matchId); setScreen('match'); } catch (err) { showToast((err as Error).message, DANGER); } };
  let body: React.ReactNode = null;
  if (screen === 'home') body = <Home profile={profile} subreddit={shown?.subreddit} ghost={ghost} onFind={ready(findDuel)} onBot={ready(() => void startBot())} onShop={ready(() => setScreen('shop'))} onBoard={ready(() => setScreen('board'))} onHowTo={ready(() => setScreen('howto'))} />;
  if (screen === 'howto') body = <Tutorial profile={profile} onSeen={markSeen} onDone={() => { void reload(); setScreen('home'); }} onPlay={findDuel} onPractice={() => void startBot()} />;
  if (screen === 'queue') body = <Matchmaking profile={profile} showToast={showToast} onCancel={goHome}
    onMatched={(id) => { setInitial(null); setMatchId(id); setScreen('match'); }}
    onBot={() => void startBot()} />;
  if (screen === 'shop') body = <Shop onBack={() => { void reload(); setScreen('home'); }} onChange={() => void reload()} />;
  if (screen === 'board') body = <Leaderboard profile={profile} subreddit={shown!.subreddit} onBack={() => setScreen('home')} />;
  if (screen === 'match') {
    if (!env || env.matchId !== matchId) body = <div style={{ position: 'absolute', left: 0, right: 0, top: 380, textAlign: 'center', color: MUTED, fontWeight: 700 }}>Dealing…</div>;
    else if (env.result) body = <MatchEnd env={env} subreddit={shown!.subreddit} showToast={showToast} onHome={goHome} onPlayAgain={() => { void reload(); findDuel(); }} />;
    else if (env.view.phase === 'results') body = <RoundEnd env={env} offset={offset} />;
    else body = null;
  }
  const tableLive = screen === 'match' && !!env && env.matchId === matchId && !env.result && env.view.phase !== 'results';
  const onLeave = async () => { if (!env) return; try { await api.forfeit(env.matchId); } catch (e) { showToast((e as Error).message, DANGER); } };

  return (
    <>
    <Suspense fallback={<Loading />}>
    {tableLive && <DutchMatch onLeave={onLeave} />}
    {tableLive && !rival ? null : <Stage background={tableLive ? 'rgba(0,0,0,0)' : undefined}>
      {body}
      {toast && !tableLive && <Toast {...toast} />}
      {rival && (
        <Sheet z={60}>
          <Kicker color={Y}>RIVAL FOUND</Kicker>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#26241F', border: `1px solid ${LINE}` }}>
            <Avatar name={rival.seat.username} size={40} src={rival.seat.avatar} />
            <div style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>u/{rival.seat.username}</div>
            <div style={{ fontWeight: 800, fontSize: 30, fontStretch: '75%', color: '#C8C4BA' }}>{fmt(rival.seat.rating)}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.05, fontStretch: '85%' }}>Leave the bot game?</div>
          <div style={{ fontSize: 14.5, color: MUTED }}>The warm-up didn’t count, so you lose nothing.</div>
          <div style={{ height: 60, display: 'flex', alignItems: 'stretch', boxShadow: '4px 4px 0 #000', marginTop: 4 }}>
            <button type="button" onClick={() => void joinRival()} style={{ flex: 1, background: Y, color: INK, fontWeight: 800, fontSize: 22 }}>Join the duel</button>
            <div style={{ width: 60, background: INK, color: Y, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, fontStretch: '75%', boxShadow: `inset 0 0 0 3px ${Y}` }}>{Math.max(0, rivalLeft)}</div>
          </div>
          <Btn kind="quiet" h={48} size={16} onClick={() => void stayWithBot()} style={{ color: TXT }}>Stay with the bot</Btn>
        </Sheet>
      )}
    </Stage>}
    </Suspense>
    </>
  );
}
