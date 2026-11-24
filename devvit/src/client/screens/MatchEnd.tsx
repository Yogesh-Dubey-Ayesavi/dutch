import { useEffect, useState } from 'react';
import { api } from '../api';
import { play } from '../sound';
import { DANGER, INK, LINE, MINT, MUTED, PANEL, PANEL_LINE, SHEET, SOFT, TXT, Y, fmt, signed } from '../tokens';
import { Btn, CheckIcon, CountUp, Diamond, IconBtn, MuteBtn, Sheet } from '../ui';
import type { MatchEnvelope, SharePreview } from '../../shared/api';

export function MatchEnd({ env, subreddit, onPlayAgain, onHome, showToast }: { env: MatchEnvelope; subreddit: string; onPlayAgain: () => void; onHome: () => void; showToast: (t: string, line: string) => void }) {
  const r = env.result!;
  const you = env.view.you;
  const opp = env.seats.find((s) => s.userId !== you)!;
  const ranked = env.mode === 'ranked' && !r.cancelled && r.rating;
  const won = r.winner === you, tie = r.winner === null;
  const mine = r.scores[you] ?? 0, theirs = r.scores[opp.userId] ?? 0;
  const [share, setShare] = useState(false);
  useEffect(() => { play(won ? 'victory' : 'dutch', 0.6); }, []);  

  let head = won ? 'You won' : tie ? 'Dead even' : 'So close', headBg = won ? MINT : TXT, headFg = won ? '#0B2A20' : INK, size = 84;
  let sub = won ? `Beat u/${opp.username} by ${theirs - mine}.` : tie ? `You both finished on ${mine}.` : `u/${opp.username} finished ${mine - theirs} lower.`;
  const ad = r.autoDutchRounds[you] ?? [];
  if (won && ad.length) sub += ` Auto-Dutch in round ${ad.join(', ')}.`;
  if (r.forfeitBy && won) sub = `u/${opp.username} left in round ${env.view.round}. Win by forfeit.`;
  if (r.forfeitBy === you) { head = 'You left'; sub = 'Leaving counts as a loss.'; }
  if (env.mode === 'bot') { head = won ? 'You beat the bot' : 'The bot got you'; size = 56; sub = won ? 'Good practice. Ready for a real rival?' : 'Warm-up done. Ready for a real rival?'; headBg = TXT; headFg = INK; }
  if (r.cancelled) { head = 'Duel called off'; size = 56; sub = 'It ended before round 1 finished, so nothing changed.'; headBg = TXT; headFg = INK; }
  const rt = r.rating?.[you];
  const lines = r.chips?.[you] ?? [];
  const chipTotal = lines.reduce((s, l) => s + l.v, 0);

  return (
    <>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 48, bottom: 36, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: MUTED }}>{env.mode === 'bot' ? 'Warm-up over' : 'Duel over'} · {r.forfeitBy ? `round ${env.view.round}` : `${r.rounds} rounds`}</div>
          <MuteBtn />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 0 4px', flex: 'none' }}>
          <div style={{ alignSelf: 'flex-start', transform: 'rotate(-3deg)', background: headBg, color: headFg, padding: '8px 20px', fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1, boxShadow: '8px 8px 0 #000', fontStretch: '80%', animation: 'cl-stamp 420ms ease-out' }}>{head}</div>
          <div style={{ fontSize: 15.5, lineHeight: 1.4, color: SOFT, marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, flex: 'none' }}>
          <div style={{ padding: '12px 14px', background: PANEL, border: `1px solid ${won ? MINT : PANEL_LINE}`, display: 'flex', flexDirection: 'column', gap: 6 }}><div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>YOU</div><div style={{ fontWeight: 800, fontSize: 54, lineHeight: 0.82, fontStretch: '75%' }}>{mine}</div></div>
          <div style={{ padding: '12px 14px', background: PANEL, border: `1px solid ${PANEL_LINE}`, display: 'flex', flexDirection: 'column', gap: 6 }}><div style={{ fontSize: 12, fontWeight: 700, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.bot ? 'BOT' : `U/${opp.username.toUpperCase()}`}</div><div style={{ fontWeight: 800, fontSize: 54, lineHeight: 0.82, fontStretch: '75%', color: MUTED }}>{theirs}</div></div>
        </div>
        {ranked && rt && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: PANEL, border: `1px solid ${PANEL_LINE}`, flex: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: MUTED }}>RATING</div><div style={{ fontSize: 14, color: MUTED }}>{fmt(rt.from)} →</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 46, lineHeight: 0.85, fontStretch: '75%' }}><CountUp from={rt.from} to={rt.to} /></div>
                <div style={{ height: 30, padding: '0 8px', display: 'flex', alignItems: 'center', background: rt.to >= rt.from ? MINT : DANGER, color: INK, fontWeight: 800, fontSize: 17, animation: 'cl-snap 300ms 800ms both' }}>{signed(rt.to - rt.from)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 14px', background: PANEL, border: `1px solid ${PANEL_LINE}`, flex: 'none' }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${PANEL_LINE}`, fontSize: 14.5, animation: `cl-rise 240ms ${900 + i * 180}ms both` }}><span style={{ color: SOFT }}>{l.k}</span><span style={{ fontWeight: 800 }}>+{l.v}</span></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Diamond size={9} /><span style={{ fontSize: 14.5, fontWeight: 700 }}>Chips earned</span></div>
                <span style={{ fontWeight: 800, fontSize: 28, lineHeight: 0.9, fontStretch: '75%', color: MINT }}>+<CountUp from={0} to={chipTotal} ms={1200} /></span>
              </div>
            </div>
          </>
        )}
        {env.mode === 'bot' && (
          <div style={{ padding: 14, background: PANEL, border: `1px dashed ${LINE}`, display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}><div style={{ fontSize: 16, fontWeight: 800 }}>Warm-up game</div><div style={{ fontSize: 14, lineHeight: 1.4, color: MUTED }}>Bot duels don’t move your rating or earn chips. Your next real duel does.</div></div>
        )}
        <div style={{ flex: 1 }} />
        <Btn kind="hot" size={23} onClick={onPlayAgain}>{env.mode === 'bot' ? 'Find a real rival' : 'Play again'}</Btn>
        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          {ranked && <Btn kind="white" h={52} size={17} style={{ flex: 1 }} onClick={() => setShare(true)}>Share result</Btn>}
          <Btn kind="quiet" h={52} size={16} style={{ flex: 1 }} onClick={onHome}>Home</Btn>
        </div>
        <button type="button" onClick={() => api.subscribe().then(() => showToast(`Joined r/${subreddit}`, MINT), (e) => showToast(e.message, DANGER))} style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: MUTED, flex: 'none' }}>
          Join <span style={{ color: TXT, textDecoration: 'underline', textUnderlineOffset: 3 }}>r/{subreddit}</span> for weekly ladders
        </button>
      </div>
      {share && <ShareSheet matchId={env.matchId} subreddit={subreddit} onClose={() => setShare(false)} />}
    </>
  );
}

function ShareSheet({ matchId, subreddit, onClose }: { matchId: string; subreddit: string; onClose: () => void }) {
  const [p, setP] = useState<SharePreview | null>(null);
  const [state, setState] = useState<'preview' | 'posting' | 'posted' | 'already' | 'error'>('preview');
  const [err, setErr] = useState('');
  useEffect(() => { api.sharePreview(matchId).then((x) => { setP(x); if (x.already) setState('already'); }, (e) => { setErr(e.message); setState('error'); }); }, [matchId]);
  const post = async () => { setState('posting'); try { setP(await api.share(matchId)); setState('posted'); } catch (e) { setErr((e as Error).message); setState('error'); } };
  const when = state === 'posted' ? 'just now' : state === 'already' && p?.sharedAt ? ago(p.sharedAt) : state;
  const view = () => { if (p?.permalink) window.open(p.permalink, '_blank'); };
  return (
    <Sheet onClose={state === 'posting' ? undefined : onClose}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ fontWeight: 800, fontSize: 24 }}>Share result</div><div style={{ fontSize: 13.5, color: MUTED }}>Posts as a comment in r/{subreddit}</div></div>
        <IconBtn label="Close" onClick={onClose} style={{ background: '#26241F', borderColor: LINE, fontSize: 22 }}>×</IconBtn>
      </div>
      <div style={{ background: '#F7F5EF', color: INK, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '4px 4px 0 #000', opacity: state === 'posting' ? 0.7 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 26, height: 26, background: INK, color: Y, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>C</div><div style={{ fontSize: 13, fontWeight: 700 }}>Clutch</div><div style={{ fontSize: 12.5, color: '#6E6A61' }}>· {when}</div></div>
        <div style={{ fontSize: 18, lineHeight: 1.4, fontWeight: 600, minHeight: 50 }}>{p?.text ?? (state === 'error' ? err : '…')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid #DDD8CC', fontSize: 12.5, color: '#4B483F' }}><span style={{ fontWeight: 800, color: INK }}>Clutch</span> · 1v1 card duel · Play in this post</div>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.4, color: '#6E6A61' }}>May post from the Clutch account until Reddit approves posting as you. Your username is in the text.</div>
      {state === 'preview' && <><Btn kind="hot" onClick={post} disabled={!p}>Post</Btn><Btn kind="quiet" h={48} size={16} onClick={onClose}>Cancel</Btn></>}
      {state === 'posting' && <><div style={{ position: 'relative', height: 60, background: TXT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, overflow: 'hidden' }}>Posting…<div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: '45%', background: INK, animation: 'cl-blink 1s infinite' }} /></div><Btn kind="quiet" h={48} size={16} disabled style={{ color: '#4F4C45', borderColor: PANEL_LINE }}>Cancel</Btn></>}
      {state === 'posted' && <><Btn kind="mint" size={19}><CheckIcon />Posted to r/{subreddit}</Btn><div style={{ display: 'flex', gap: 8 }}><Btn kind="white" h={48} size={16} style={{ flex: 1, boxShadow: 'none' }} onClick={view} disabled={!p?.permalink}>View comment</Btn><Btn kind="quiet" h={48} size={16} style={{ flex: 1 }} onClick={onClose}>Done</Btn></div></>}
      {state === 'already' && <><div style={{ height: 60, background: PANEL, color: '#6E6A61', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, boxShadow: `inset 0 0 0 1px ${PANEL_LINE}` }}>Already shared</div><div style={{ textAlign: 'center', fontSize: 14, color: MUTED }}>You shared this duel {p?.sharedAt ? ago(p.sharedAt) : 'earlier'}. {p?.permalink && <button type="button" onClick={view} style={{ color: TXT, textDecoration: 'underline', textUnderlineOffset: 3 }}>View it</button>}</div></>}
      {state === 'error' && <Btn kind="quiet" h={48} size={16} onClick={onClose} style={{ background: SHEET }}>Close</Btn>}
    </Sheet>
  );
}
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : `${m} min ago`; };
