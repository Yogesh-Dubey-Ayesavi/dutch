/**
 * Interactive tutorial. Ideas get calm full-screen cards; practice happens on the real table, driven by the real
 * rules engine in the browser (tutorial/table.ts), so every gesture works as in a duel and cards stay face down.
 * A one-line coach sits in the app bar's slot, says the next move, and only lets that move through. Recall checks
 * (where is your 4? what's your total?) build the habit of knowing your cards. The script is tutorial/lessons.ts.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Card, Game } from '@engine';
import { GameTable } from '../dutch/table/GameTable';
import { PlayingCard as TablePlayingCard } from '../dutch/table/PlayingCard';
import { startLocal, stopMatch, usePrefs, useRoom } from '../dutch/store';
import { configureFlightSounds, configureSound, playSound } from '../dutch/sound';
import { PracticeTable, RIVAL, YOU, c, type Move } from '../tutorial/table';
import { SCRIPT, checkpointAt, checkpointOf, type Step, type Visual } from '../tutorial/lessons';
import { api } from '../api';
import { TableCard } from '../TableCard';
import { BOT_AVATAR } from '../../shared/avatars';
import { INK, MINT, MUTED, SOFT, TXT, Y } from '../tokens';
import type { Profile } from '../../shared/api';
import '../dutch/table/table.css';
import '../dutch/skin.css';

const RULES = [
  ['Know your cards', 'Peek, remember, and swap out the ones you haven’t seen.'],
  ['Keep the 0 card', 'Each round, one card is worth 0. Hold on to it.'],
  ['Watch your rival', 'Notice which low cards they keep, and where.'],
  ['Call LOW when you’re sure', 'Fewest points wins the round.'],
] as const;
const RIVAL_GAP = 1100;
const FIRST_SCENE = SCRIPT.find((s): s is Extract<Step, { kind: 'scene' }> => s.kind === 'scene')!.scene;
const rankName = (card: Card) => ({ 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' } as Record<number, string>)[card.rank] ?? String(card.rank);

function remember(at: string) {
  resumeAt = at;
  void api.tutorialProgress(at).catch(() => {});
}

/** `**bold**` → <b>. */
function rich(text: string): ReactNode {
  return text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>));
}

type Flash = { text: string; tone: 'good' | 'bad' } | null;

/** Progress made in this session (the profile is only re-read on the next load). */
let resumeAt: string | null = null;

export function Tutorial({ profile, onPlay, onPractice, onDone, onSeen }: { profile: Profile; onPlay: () => void; onPractice: () => void; onDone: () => void; onSeen: () => void }) {
  // Pick up where the player left off: the last chapter they reached, or the ending once they've finished.
  const saved = resumeAt ?? (profile.tutorialAt || (profile.seenTutorial ? 'done' : ''));
  const [i, setI] = useState(() => Math.max(0, checkpointAt(saved)));
  const [end, setEnd] = useState(saved === 'done');
  const [flash, setFlash] = useState<Flash>(null);
  const [deal, setDeal] = useState(0);
  const table = useRef<PracticeTable | null>(null);
  const seen = useRef(false);
  const state = useRoom((r) => r.state);
  const prefs = usePrefs();
  useEffect(() => { configureSound(prefs.sound, prefs.volume); }, [prefs.sound, prefs.volume]);
  useEffect(() => { configureFlightSounds(prefs.flightSounds); }, [prefs.flightSounds]);

  // The practice table lives for the whole tutorial.
  useEffect(() => {
    if (end) return;
    const t = new PracticeTable([
      { userId: YOU, username: profile.username, rating: profile.rating, bot: false, cosmetics: profile.cosmetics, avatar: profile.avatar },
      { userId: RIVAL, username: 'Rival', rating: 0, bot: true, cosmetics: { back: 'red', table: 'blue', face: 'default', flip: 'classic' }, avatar: BOT_AVATAR },
    ], FIRST_SCENE);
    table.current = t;
    t.push = startLocal(t);
    return () => { t.stop(); table.current = null; stopMatch(); };
  }, [end]);

  const step: Step | undefined = SCRIPT[i];
  const go = () => { setFlash(null); if (i + 1 >= SCRIPT.length) finish(); else setI(i + 1); };
  const finish = () => { if (!seen.current) { seen.current = true; onSeen(); } remember('done'); setEnd(true); };
  /** Remember the furthest chapter reached (Back never moves it backwards). */
  const best = useRef(i);
  const save = (at: number) => { const id = checkpointOf(at); if (id && at > best.current) { best.current = at; remember(id); } };
  const later = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The table as it was when each step began, so Back can put it back. */
  const snaps = useRef<Record<number, Game>>({});
  const back = () => {
    let j = i - 1;
    const skipped = (k: number) => { const x = SCRIPT[k]; return x.kind === 'scene' || (x.kind === 'do' && !!x.skip && !!snaps.current[k] && x.skip(snaps.current[k])); };
    while (j >= 0 && skipped(j)) j--;
    if (j < 0) return;
    later.current.forEach(clearTimeout); later.current = [];
    setFlash(null);
    const snap = snaps.current[j];
    if (snap && table.current) { table.current.restore(snap); setDeal((d) => d + 1); }
    setI(j);
  };
  const canBack = SCRIPT.slice(0, i).some((x) => x.kind !== 'scene');
  const after = (ms: number, fn: () => void) => { later.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => later.current.forEach(clearTimeout), []);

  // Wire the current step into the table: what's allowed, the rival's moves, and when it's done.
  useEffect(() => {
    const t = table.current;
    if (!t || end || !step) return;
    save(i);
    if (step.kind === 'scene') { t.load(step.scene); setDeal((d) => d + 1); setI(i + 1); return; }
    snaps.current[i] = structuredClone(t.g);
    if (step.kind === 'do' && step.skip?.(t.g)) { setI(i + 1); return; }
    t.gate = step.kind === 'do' ? step.gate
      : step.kind === 'watch' ? () => 'Watch your rival’s turn first.'
        : step.kind === 'where' || step.kind === 'pick' ? () => 'Answer the question first.'
          : () => `Tap ${step.kind === 'tell' || step.kind === 'card' ? step.button : 'OK'} first.`;
    let finished = false;
    t.onMove = (m: Move) => {
      if (finished) return;
      if (step.kind === 'do' && step.done(m.after, m)) {
        finished = true;
        if (step.nice) { after(500, () => setFlash({ text: step.nice!, tone: 'good' })); after(2300, go); } else after(700, go);
      } else if (step.kind === 'watch' && step.done(m.after)) { finished = true; after(500, go); }
    };
    if (step.kind === 'watch' && step.stack) t.stack(step.stack());
    const timers = step.kind === 'watch' ? step.rival.map((a, k) => setTimeout(() => t.rival(a), 1000 + k * RIVAL_GAP)) : [];
    return () => { timers.forEach(clearTimeout); t.onMove = null; };
  }, [i, end]);

  if (end) return <EndScreen onPlay={onPlay} onPractice={onPractice} onDone={onDone} replay={() => { best.current = 0; remember(SCRIPT[0].kind === 'card' ? SCRIPT[0].id : ''); setEnd(false); setFlash(null); setI(0); }} />;
  if (!step || step.kind === 'scene') return null;
  const progress = (i + 1) / SCRIPT.length;
  if (step.kind === 'card') return <IdeaCard step={step} progress={progress} onNext={go} onExit={onDone} onBack={canBack ? back : undefined} />;
  if (!state || !table.current) return null;

  const say = flash?.text ?? (step.kind === 'pick' ? step.lead : typeof step.say === 'function' ? step.say(table.current.g) : step.say);
  const glow = step.kind === 'do' && !flash ? step.glow : null;
  const pick = step.kind === 'pick' ? <Pick key={i} step={step} onAnswer={(right) => { setFlash({ text: right ? step.right : step.wrong, tone: right ? 'good' : 'bad' }); playSound(right ? 'burn' : 'tick'); after(2200, go); }} /> : null;
  const coach = (
    <div className={`tut-coach ${flash ? flash.tone : ''}`}>
      <span className="tut-bar"><i style={{ width: `${progress * 100}%` }} /></span>
      <button type="button" className="tut-back" onClick={back} disabled={!canBack} aria-label="Back to the previous step"><ChevronLeft strokeWidth={3} /></button>
      <p key={say}>{flash?.tone === 'good' && <span className="tut-tick">✓</span>}{rich(say)}</p>
      {step.kind === 'tell' && !flash && <button type="button" className="tut-ok" onClick={go}>{step.button}</button>}
      <button type="button" className="tut-x" onClick={onDone} aria-label="Close the lesson and go home (your progress is saved)"><X strokeWidth={3} /></button>
    </div>
  );

  return createPortal(
    <div className={`dutch-skin tut-table ${'call' in step && step.call ? '' : 'hide-call'}`}>
      <style>{CSS}{glow?.length ? `${glow.join(', ')} { outline: 3px solid ${Y}; outline-offset: 3px; animation: tut-glow 1.1s ease-in-out infinite; }` : ''}</style>
      <GameTable key={deal} state={state} open={() => {}} coach={<>{coach}{pick}</>} />
      {step.kind === 'where' && (
        <Where key={i} target={step.card()} hand={table.current.g.players[0].hand} onAnswer={(right, card) => {
          setFlash(right ? { text: step.right, tone: 'good' } : { text: `No, that’s your ${rankName(card)}. **Your ${rankName(step.card())} is the yellow one.**`, tone: 'bad' });
          playSound(right ? 'burn' : 'tick');
          after(right ? 2000 : 2600, go);
        }} />
      )}
    </div>,
    document.body,
  );
}

/** Recall check on the real hand: tap where you think the card is; the tapped card (and the right one) turn up. */
function Where({ target, hand, onAnswer }: { target: Card; hand: Card[]; onAnswer: (right: boolean, card: Card) => void }) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  const [shown, setShown] = useState<number[]>([]);
  useLayoutEffect(() => {
    const measure = () => setRects(Array.from(document.querySelectorAll<HTMLElement>(`.board .hc[data-player-slot^="${YOU}:"]`)).map((el) => el.getBoundingClientRect()));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const right = hand.findIndex((x) => x.id === target.id);
  return (
    <>
      {rects.map((r, k) => (
        <button key={k} type="button" aria-label={`Is this your card? Card ${k + 1}`} disabled={shown.length > 0}
          onClick={() => { setShown(k === right ? [k] : [k, right]); playSound('flip'); onAnswer(k === right, hand[k]); }}
          style={{ position: 'fixed', left: r.left, top: r.top, width: r.width, height: r.height, zIndex: 60, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
          {shown.includes(k) && (
            <span className="tut-turned" style={{ outline: k === right ? `3px solid ${Y}` : 'none' }}><TablePlayingCard card={hand[k]} /></span>
          )}
        </button>
      ))}
    </>
  );
}

function Pick({ step, onAnswer }: { step: Extract<Step, { kind: 'pick' }>; onAnswer: (right: boolean) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="tut-pick">
      <p>{step.say}</p>
      <div>{step.options.map((o) => (
        <button key={o} type="button" disabled={!!chosen} className={chosen ? (o === step.answer ? 'right' : o === chosen ? 'wrong' : '') : undefined}
          onClick={() => { setChosen(o); onAnswer(o === step.answer); }}>{o}</button>
      ))}</div>
    </div>
  );
}

/** One idea, big and calm: a title, one line, a small picture, one button. */
function IdeaCard({ step, progress, onNext, onExit, onBack }: { step: Extract<Step, { kind: 'card' }>; progress: number; onNext: () => void; onExit: () => void; onBack?: () => void }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 24, height: 44, display: 'flex', alignItems: 'center', gap: 16 }}>
        <button type="button" onClick={onBack} disabled={!onBack} aria-label="Back to the previous step" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${onBack ? '#5A574F' : '#2E2C28'}`, color: onBack ? TXT : '#3A3833', background: onBack ? '#1F1E1B' : 'transparent' }}><ChevronLeft size={26} strokeWidth={3} /></button>
        <div style={{ flex: 1, height: 4, background: '#2E2C28' }}><div style={{ height: '100%', width: `${progress * 100}%`, background: Y, transition: 'width 300ms' }} /></div>
        <button type="button" onClick={onExit} aria-label="Close the lesson and go home (your progress is saved)" style={{ width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #5A574F', color: TXT, background: '#1F1E1B' }}><X size={24} strokeWidth={3} /></button>
      </div>
      <div key={step.title} style={{ position: 'absolute', left: 28, right: 28, top: 120, display: 'flex', flexDirection: 'column', gap: 14, animation: 'cl-rise 260ms ease-out both' }}>
        <div style={{ fontWeight: 800, fontSize: 42, lineHeight: 1, letterSpacing: '-0.01em', fontStretch: '80%' }}>{step.title}</div>
        <div style={{ fontSize: 19, lineHeight: 1.4, color: SOFT }}>{step.line}</div>
      </div>
      <div key={`v${step.title}`} style={{ position: 'absolute', left: 0, right: 0, top: 380, display: 'flex', justifyContent: 'center', animation: 'cl-rise 360ms ease-out both' }}>
        {step.visual && <Picture kind={step.visual} />}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 40 }}>
        <button type="button" onClick={onNext} style={{ width: '100%', height: 64, background: Y, color: INK, fontWeight: 800, fontSize: 24, boxShadow: '4px 4px 0 #000' }}>{step.button}</button>
      </div>
    </>
  );
}

function Picture({ kind }: { kind: Visual }) {
  if (kind === 'values') {
    const row: [Card, string][] = [[c(1, 'spades'), '1'], [c(5, 'hearts'), '5'], [c(10, 'clubs'), '10'], [c(11, 'diamonds'), '11'], [c(12, 'hearts'), '12'], [c(13, 'spades'), '13']];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {row.map(([card, v]) => (
            <div key={card.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <TableCard card={card} w={50} />
              <span style={{ fontWeight: 800, fontSize: 22, fontStretch: '75%' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em' }}>
          <span style={{ color: MINT, display: 'flex', alignItems: 'center', gap: 2 }}><ChevronLeft size={16} strokeWidth={3} />GOOD</span>
          <span style={{ color: 'oklch(0.64 0.22 25)', display: 'flex', alignItems: 'center', gap: 2 }}>BAD<ChevronRight size={16} strokeWidth={3} /></span>
        </div>
      </div>
    );
  }
  if (kind === 'facedown') {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <TableCard w={66} />
        <div style={{ transform: 'translateY(-18px) rotate(-4deg)', outline: `3px solid ${Y}`, outlineOffset: 3 }}><TableCard w={66} card={c(4, 'diamonds')} /></div>
        <TableCard w={66} />
        <TableCard w={66} />
      </div>
    );
  }
  if (kind === 'powers') {
    const rows: [Card, string, string][] = [[c(11, 'diamonds'), 'Jack', 'Peek at one of your cards'], [c(12, 'hearts'), 'Queen', 'Swap any 2 cards on the table'], [c(1, 'spades'), 'Ace', 'Switch 2 of their cards around']];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300 }}>
        {rows.map(([card, n, d]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <TableCard card={card} w={44} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 800, fontSize: 19 }}>{n}</span><span style={{ fontSize: 15, color: SOFT }}>{d}</span></div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'deal') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[0, 1, 2].map((n) => (
            <div key={n} style={{ width: 72, height: 72, background: n === 1 ? Y : '#F7F5EF', color: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '4px 4px 0 #000' }}>
              <span style={{ fontWeight: 800, fontSize: 32, lineHeight: 1, fontStretch: '75%' }}>{n}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.6 }}>{['NONE', 'ONE', 'TWO'][n]}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 1.4 }}>Fewer cards means more guessing.<br />The dealer switches every round.</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ padding: '14px 34px', background: Y, color: INK, fontWeight: 800, fontSize: 28, letterSpacing: '0.03em', fontStretch: '80%', boxShadow: '4px 4px 0 #000' }}>CALL LOW</div>
      <div style={{ fontSize: 15, color: MUTED }}>Also called “Dutch”</div>
    </div>
  );
}

function EndScreen({ onPlay, onPractice, onDone, replay }: { onPlay: () => void; onPractice: () => void; onDone: () => void; replay: () => void }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 70, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ alignSelf: 'flex-start', transform: 'rotate(-3deg)', background: MINT, color: '#0B2A20', padding: '8px 18px', fontWeight: 800, fontSize: 52, letterSpacing: '-0.02em', lineHeight: 1, boxShadow: '7px 7px 0 #000', fontStretch: '80%', animation: 'cl-rise 300ms ease-out both' }}>That’s Clutch</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.12em', color: MUTED, marginTop: 16 }}>HOW TO WIN, IN 4 RULES</div>
        {RULES.map(([t, d], k) => (
          <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 28, height: 28, flex: 'none', background: Y, color: INK, fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k + 1}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>{t}</span>
              <span style={{ fontSize: 14.5, color: SOFT, lineHeight: 1.35 }}>{d}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 40, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" onClick={onPlay} style={{ height: 64, background: Y, color: INK, fontWeight: 800, fontSize: 25, boxShadow: '4px 4px 0 #000' }}>Play with a person</button>
        <button type="button" onClick={onPractice} style={{ height: 54, background: TXT, color: INK, fontWeight: 800, fontSize: 18, boxShadow: '4px 4px 0 #000' }}>Play with a bot</button>
        <div style={{ display: 'flex' }}>
          <button type="button" onClick={replay} style={{ flex: 1, height: 44, color: MUTED, fontWeight: 700, fontSize: 15 }}>Replay the tutorial</button>
          <button type="button" onClick={onDone} style={{ flex: 1, height: 44, color: MUTED, fontWeight: 700, fontSize: 15 }}>Back to home</button>
        </div>
      </div>
    </>
  );
}

/** The coach takes exactly the app bar's slot (board units): one line of text, room to breathe. */
const CSS = `
.tut-table .board .tut-coach { position: absolute; left: calc(16 * var(--u)); right: calc(16 * var(--u)); top: calc(44 * var(--u)); min-height: calc(60 * var(--u)); z-index: 30; display: flex; align-items: center; gap: calc(10 * var(--u)); padding: calc(10 * var(--u)) calc(10 * var(--u)) calc(8 * var(--u)) calc(8 * var(--u)); background: #1f1e1b; border: 1px solid #3a3833; color: #f2f0ea; box-sizing: border-box; transition: background 200ms, border-color 200ms; }
.tut-table .tut-coach.good { background: ${MINT}; border-color: ${MINT}; color: #0b2a20; }
.tut-table .tut-coach.bad { background: #2b1d1a; border-color: oklch(0.64 0.22 25); }
.tut-table .tut-bar { position: absolute; left: 0; right: 0; top: 0; height: calc(3 * var(--u)); background: #2e2c28; }
.tut-table .tut-bar i { display: block; height: 100%; background: ${Y}; transition: width 300ms; }
.tut-table .tut-coach.good .tut-bar { opacity: 0; }
.tut-table .tut-coach p { margin: 0; flex: 1; font-size: calc(16 * var(--u)); line-height: 1.3; font-weight: 500; animation: tut-in 240ms ease-out both; }
.tut-table .tut-coach p b { font-weight: 800; }
.tut-table .tut-tick { display: inline-flex; align-items: center; justify-content: center; width: calc(20 * var(--u)); height: calc(20 * var(--u)); margin-right: calc(8 * var(--u)); background: #0b2a20; color: ${MINT}; font-weight: 800; font-size: calc(13 * var(--u)); vertical-align: calc(2 * var(--u)); }
.tut-table .tut-back { flex: none; width: calc(40 * var(--u)); height: calc(40 * var(--u)); display: flex; align-items: center; justify-content: center; color: #f2f0ea; background: #2a2924; border: 2px solid #5a574f; padding: 0; }
.tut-table .tut-back svg { width: calc(24 * var(--u)); height: calc(24 * var(--u)); }
.tut-table .tut-back:active { background: #3a3833; }
.tut-table .tut-back:disabled { color: #3a3833; border-color: #2e2c28; background: transparent; }
.tut-table .tut-coach.good .tut-back { color: #0b2a20; border-color: rgba(11,42,32,0.35); background: transparent; }
.tut-table .tut-ok { flex: none; height: calc(38 * var(--u)); padding: 0 calc(18 * var(--u)); background: ${Y}; color: ${INK}; font-weight: 800; font-size: calc(16 * var(--u)); border: 0; box-shadow: 3px 3px 0 #000; }
.tut-table .tut-ok:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
.tut-table .tut-x { flex: none; width: calc(40 * var(--u)); height: calc(40 * var(--u)); display: flex; align-items: center; justify-content: center; color: #f2f0ea; background: #2a2924; border: 2px solid #5a574f; padding: 0; }
.tut-table .tut-x svg { width: calc(22 * var(--u)); height: calc(22 * var(--u)); }
.tut-table .tut-x:active { background: #3a3833; }
.tut-table .tut-coach.good .tut-x { color: #0b2a20; border-color: rgba(11,42,32,0.35); background: transparent; }
.tut-table .board .tut-pick { position: absolute; z-index: 40; left: calc(16 * var(--u)); right: calc(16 * var(--u)); bottom: calc(26 * var(--u)); display: flex; align-items: center; justify-content: space-between; gap: calc(12 * var(--u)); padding: calc(12 * var(--u)) calc(12 * var(--u)) calc(12 * var(--u)) calc(16 * var(--u)); background: #1f1e1b; border: 1px solid #3a3833; box-shadow: 4px 4px 0 #000; animation: tut-up 280ms ease-out both; }
.tut-table .tut-pick p { margin: 0; font-size: calc(18 * var(--u)); font-weight: 800; color: #f2f0ea; }
.tut-table .tut-pick > div { display: flex; gap: calc(8 * var(--u)); flex: none; }
.tut-table .tut-pick button { width: calc(54 * var(--u)); height: calc(52 * var(--u)); background: #f2f0ea; color: ${INK}; font-weight: 800; font-size: calc(24 * var(--u)); border: 0; box-shadow: 3px 3px 0 #000; }
.tut-table.hide-call .board .b-call { visibility: hidden; }
.tut-table .tut-pick button.right { background: ${MINT}; }
.tut-table .tut-pick button.wrong { background: oklch(0.64 0.22 25); color: #fff; }
.tut-table .tut-pick button:disabled:not(.right):not(.wrong) { opacity: 0.4; }
.tut-table .tut-turned { position: absolute; inset: 0; display: block; animation: tut-flip 260ms ease-out both; }
/* The coach gives the instructions; the line under the hand only speaks up for refusals and powers. */
.tut-table .board .b-hint:not(.power) { visibility: hidden; }
@keyframes tut-up { from { opacity: 0; transform: translateY(10px); } }
@keyframes tut-in { from { opacity: 0; transform: translateY(3px); } }
@keyframes tut-flip { from { transform: rotateY(90deg); } }
@keyframes tut-glow { 50% { outline-color: transparent; } }
`;
