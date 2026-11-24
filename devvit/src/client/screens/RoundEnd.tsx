import { useEffect } from 'react';
import { jokerRankForRound } from '@engine';
import { EngineCardView, PlayingCard, rankLabel } from '../Card';
import { play } from '../sound';
import { DANGER, DIM, INK, MINT, MUTED, PANEL, PANEL_LINE, SHEET, SOFT, TXT, Y } from '../tokens';
import { nextRound } from '../dutch/store';
import { Avatar, CountUp, useNow } from '../ui';
import type { MatchEnvelope } from '../../shared/api';

/** "Read top to bottom: who won the round, then why." Cards flip in turn, scores count up, auto-advances. */
export function RoundEnd({ env, offset }: { env: MatchEnvelope; offset: number }) {
  const v = env.view;
  const now = useNow(100, offset);
  const h = v.history.at(-1)!;
  const you = v.you;
  const opp = v.players.find((p) => p.id !== you)!;
  const oppSeat = env.seats.find((s) => s.userId !== you)!;
  const face = env.seats.find((s) => s.userId === you)!.cosmetics.face;
  const mine = h.scores[you], theirs = h.scores[opp.id];
  const iCalled = h.caller === you, failed = !!h.callFailed;
  const meWon = h.winners.includes(you) && !h.winners.includes(opp.id);
  const tie = h.winners.length > 1;
  const autoMe = h.autoDutch === you;
  const oppName = oppSeat.bot ? 'The bot' : `u/${opp.name}`;
  useEffect(() => { play(meWon ? 'victory' : 'flip', 0.5); }, []);  

  let head = `${oppName} takes round ${h.round}`, headBg = TXT, headFg = INK;
  let sub = `Their ${theirs} beats your ${mine}. Lower total takes the round.`;
  if (iCalled && failed) { head = 'Your call failed'; headBg = DANGER; headFg = '#FFFFFF'; sub = `You called with ${mine}; they had ${theirs}. You start round ${h.round + 1} with ${4 + (h.extraCards?.[you] ?? 0)} cards.`; }
  else if (autoMe) { head = 'Auto-Dutch!'; headBg = MINT; headFg = '#0B2A20'; sub = `You emptied your hand. You score 0, they score ${theirs}.${env.mode === 'ranked' ? ' +10 chips.' : ''}`; }
  else if (meWon) { head = `You win round ${h.round}`; headBg = MINT; headFg = '#0B2A20'; sub = `Your ${mine} beats their ${theirs}. Lower total takes the round.`; }
  else if (tie) { head = `Round ${h.round} tied`; sub = `You both scored ${mine}.`; }
  else if (h.caller === opp.id && !failed) sub = `They called LOW with ${theirs} and you had ${mine}.`;
  else if (h.caller === opp.id && failed) sub = `They called with ${theirs} but your ${mine} was as low. They start next round with an extra card.`;

  const WIN = `inset 0 0 0 2px ${MINT}`, LOSE = `inset 0 0 0 1px ${PANEL_LINE}`, FAIL = `inset 0 0 0 2px ${DANGER}`;
  const next = h.round + 1, nextJoker = jokerRankForRound(next);
  const extra = h.extraCards?.[you] ?? 0;
  const btn = `Round ${next} of ${v.rules.rounds}${extra ? ` · you start with ${4 + extra} cards` : nextJoker ? ` · ${rankLabel(nextJoker)}s are worth 0` : ''}`;
  const left = env.resultsUntil ? Math.max(0, env.resultsUntil - now) : 0;
  // The screen stays up at least 10 s; after that the round starts once both players press Next round (or after 40 s).
  const totalMs = 10_000;
  const leftMax = env.resultsMaxUntil ? Math.max(0, env.resultsMaxUntil - now) : 0;
  const iReady = env.nextReady.includes(you);
  const canPress = left <= 0 && !iReady;

  const seat = (id: string, name: string, isYou: boolean) => {
    const cards = h.hands[id] ?? [];
    const won = h.winners.includes(id) && !tie;
    const ring = isYou && iCalled && failed ? FAIL : won ? WIN : LOSE;
    const tag = isYou && iCalled && failed ? { t: 'CALLED', bg: DANGER, fg: '#FFFFFF' } : won ? { t: 'WINS ROUND', bg: MINT, fg: '#0B2A20' } : null;
    const scoreFg = isYou && iCalled && failed ? DANGER : won ? MINT : TXT;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px 12px', background: SHEET, boxShadow: ring, flex: 'none', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={name} size={26} you={isYou} bot={!isYou && oppSeat.bot} src={env.seats.find((x) => (x.userId === (isYou ? you : opp.id)))?.avatar} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>{isYou ? 'You' : oppSeat.bot ? oppSeat.username : `u/${name}`}</div>
          {tag && <div style={{ padding: '3px 6px', background: tag.bg, color: tag.fg, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em' }}>{tag.t}</div>}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: DIM }}>ROUND</div>
          <div style={{ fontWeight: 800, fontSize: 38, lineHeight: 0.8, fontStretch: '75%', color: scoreFg }}><CountUp from={0} to={h.scores[id]} ms={1200} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: cards.length > 4 ? 4 : 8, flexWrap: 'wrap' }}>
          {cards.length ? cards.map((c, i) => (
            <div key={c.id} style={{ animation: `cl-flip-classic 260ms ${(isYou ? 4 : 0) * 120 + i * 120}ms both` }}>
              <EngineCardView card={c} jokerRank={h.jokerRank} size={cards.length > 4 ? 'tile' : 'pile'} face={face} />
            </div>
          )) : [0, 1, 2, 3].map((i) => <PlayingCard key={i} size="pile" state="ghost" />)}
        </div>
        {isYou && !cards.length && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', color: MINT }}>HAND EMPTIED</div>}
      </div>
    );
  };

  return (
    <div style={{ position: 'absolute', left: 16, right: 16, top: 48, bottom: 36, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', color: MUTED }}>ROUND {h.round} OF {v.rules.rounds}</div>
        {h.jokerRank && <div style={{ padding: '4px 4px 4px 10px', display: 'flex', alignItems: 'center', gap: 8, background: PANEL, border: `1px solid ${PANEL_LINE}`, fontSize: 12.5, fontWeight: 700, color: SOFT }}>{rankLabel(h.jokerRank)}s were worth 0<PlayingCard rank={rankLabel(h.jokerRank)} suit="s" size="mini" face={face} /></div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
        <div style={{ alignSelf: 'flex-start', transform: 'rotate(-2deg)', background: headBg, color: headFg, padding: '6px 16px', fontWeight: 800, fontSize: 46, letterSpacing: '-0.02em', lineHeight: 1, boxShadow: '6px 6px 0 #000', fontStretch: '80%', animation: 'cl-stamp 400ms ease-out' }}>{head}</div>
        <div style={{ fontSize: 15.5, lineHeight: 1.4, color: SOFT, textWrap: 'pretty' } as React.CSSProperties}>{sub}</div>
      </div>
      {seat(opp.id, opp.name, false)}
      {seat(you, v.players.find((p) => p.id === you)!.name, true)}
      <div style={{ flex: 1 }} />
      <div style={{ height: 64, display: 'flex', alignItems: 'stretch', boxShadow: '4px 4px 0 #000', flex: 'none' }}>
        <button type="button" disabled={!canPress} onClick={nextRound} aria-label="Next round" style={{ flex: 1, background: canPress ? Y : '#26241F', color: canPress ? INK : DIM, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '0 16px', textAlign: 'left', cursor: canPress ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: canPress ? '#4B483F' : DIM }}>{iReady ? 'READY' : 'NEXT ROUND'}</div>
          <div style={{ fontWeight: 800, fontSize: canPress ? 18 : 16, lineHeight: 1.1 }}>{iReady ? 'Waiting for your rival…' : canPress ? btn : `Available in ${Math.ceil(left / 1000)}s`}</div>
        </button>
        <div style={{ position: 'relative', width: 72, background: INK, color: TXT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 0 0 2px ${TXT}`, overflow: 'hidden' }}>
          <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 0.9, fontStretch: '75%' }}>{Math.ceil((left > 0 ? left : leftMax) / 1000)}</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: MUTED }}>{left > 0 ? 'SEC' : 'AUTO'}</div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 4, width: `${((left > 0 ? left : leftMax) / (left > 0 ? totalMs : 30_000)) * 100}%`, background: TXT }} />
        </div>
      </div>
    </div>
  );
}
