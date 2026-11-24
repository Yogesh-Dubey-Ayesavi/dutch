/** The original Dutch table, with Clutch's own menus (leave, settings, rules) around it. */
import { useEffect, useState, type ReactNode } from 'react';
import { GameTable } from './table/GameTable';
import { configureFlightSounds, configureSound, playSound } from './sound';
import { usePrefs, useRoom } from './store';
import type { ModalName } from './ui';
import { DANGER, INK, LINE, MUTED, SHEET, SOFT, TXT, Y } from '../tokens';
import { Btn, Kicker } from '../ui';
import { AboutBody } from '../About';
import { NerdStats } from './NerdStats';
import './table/table.css';
import './skin.css';

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,8,7,0.6)' }} />
      <div role="dialog" style={{ position: 'relative', width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto', padding: '20px 16px calc(28px + env(safe-area-inset-bottom, 0px))', background: SHEET, borderTop: `2px solid ${TXT}`, display: 'flex', flexDirection: 'column', gap: 12, color: TXT, animation: 'cl-rise 200ms ease-out' }}>{children}</div>
    </div>
  );
}
const Toggle = ({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 4px', borderBottom: `1px solid ${LINE}`, fontWeight: 700, fontSize: 16 }}>
    <span>{label}</span>
    <span style={{ width: 46, height: 26, background: on ? Y : '#2E2C28', position: 'relative', flex: 'none' }}><span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, background: on ? INK : MUTED, transition: 'left .15s' }} /></span>
  </button>
);
const Rule = ({ k, children }: { k: string; children: ReactNode }) => <div style={{ display: 'flex', gap: 12, fontSize: 14.5, lineHeight: 1.35 }}><b style={{ width: 74, flex: 'none', color: Y }}>{k}</b><span style={{ color: SOFT }}>{children}</span></div>;

export function DutchMatch({ onLeave }: { onLeave: () => Promise<void> | void }) {
  const state = useRoom((r) => r.state);
  const prefs = usePrefs();
  const [modal, setModal] = useState<ModalName>(null);
  // Stats for nerds stays up while you play (it isn't a modal): the menu item toggles it.
  const [nerds, setNerds] = useState(false);
  const open = (m: ModalName) => (m === 'nerds' ? setNerds((x) => !x) : setModal(m));
  useEffect(() => { configureSound(prefs.sound, prefs.volume); }, [prefs.sound, prefs.volume]);
  useEffect(() => { configureFlightSounds(prefs.flightSounds); }, [prefs.flightSounds]);
  if (!state) return null;
  return (
    <div className={`dutch-skin ${prefs.effects ? '' : 'no-effects'}`}>
      <GameTable state={state} open={open} />
      {nerds && <NerdStats onClose={() => setNerds(false)} />}
      {modal === 'leave' && (
        <Modal onClose={() => setModal(null)}>
          <Kicker color={DANGER}>LEAVE GAME</Kicker>
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.05 }}>Leave this game?</div>
          <div style={{ fontSize: 14.5, color: MUTED }}>{state.history.length === 0 ? 'The game has barely started, so leaving costs you nothing.' : 'If you leave, you lose and your rival wins.'}</div>
          <Btn kind="danger" h={56} size={20} onClick={() => { setModal(null); void onLeave(); }}>Leave game</Btn>
          <Btn kind="quiet" h={48} size={16} onClick={() => setModal(null)} style={{ color: TXT }}>Keep playing</Btn>
        </Modal>
      )}
      {modal === 'about' && (
        <Modal onClose={() => setModal(null)}>
          <AboutBody username={state.players.find((p) => p.id === state.you)?.name} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'settings' && (
        <Modal onClose={() => setModal(null)}>
          <Kicker color={Y}>SETTINGS</Kicker>
          <Toggle label="Sound" on={prefs.sound} set={(v) => { prefs.set({ sound: v }); if (v) { configureSound(true, prefs.volume); playSound('snap'); } }} />
          <Toggle label="Alarm on the last turn" on={prefs.dutchAlarm} set={(v) => prefs.set({ dutchAlarm: v })} />
          <Toggle label="Card sounds" on={prefs.flightSounds} set={(v) => prefs.set({ flightSounds: v })} />
          <Toggle label="Animations" on={prefs.effects} set={(v) => prefs.set({ effects: v })} />
          <Btn kind="white" h={52} size={18} onClick={() => setModal(null)} style={{ marginTop: 6 }}>Done</Btn>
        </Modal>
      )}
      {modal === 'rules' && (
        <Modal onClose={() => setModal(null)}>
          <Kicker color={Y}>HOW TO PLAY</Kicker>
          <Rule k="Goal">Finish each round with the fewest points. Ace = 1, 2 to 10 = their number, Jack = 11, Queen = 12, King = 13. After 13 rounds, the lowest total wins.</Rule>
          <Rule k="The 0 card">Each round, one card is worth 0: Kings in round 1, Queens in round 2, and so on down. Keep them.</Rule>
          <Rule k="Start">You each get 4 cards, face down. One of you deals and picks how many cards each player may look at: 0, 1 or 2. The other player goes first. The dealer switches every round.</Rule>
          <Rule k="Your turn">Take the top card of the deck or the pile. Tap one of your cards to swap the new card in, and the old one goes on the pile. Don’t want a deck card? Tap Discard. A card from the pile must be swapped in.</Rule>
          <Rule k="Match">Any time, even on your rival’s turn: if your card has the same number as the top of the pile, drag it on. One less card to count. Wrong card? You get an extra one.</Rule>
          <Rule k="Call LOW">Sure you have the fewest points? Tap Call LOW. Your rival gets one last turn, then all cards are shown. If you’re not the lowest, you score nothing and get extra cards next round.</Rule>
          <Rule k="Jack">Swap or match a Jack out of your hand: peek at one of your cards.</Rule>
          <Rule k="Queen">Swap or match a Queen out of your hand: swap any 2 cards on the table, without looking.</Rule>
          <Rule k="Ace">Swap or match an Ace out of your hand: switch 2 of your rival’s cards around. They see that something moved, not what.</Rule>
          <div style={{ fontSize: 13, color: MUTED }}>Powers only work from your hand, not straight from the deck. You can skip them.</div>
          <Btn kind="white" h={52} size={18} onClick={() => setModal(null)} style={{ marginTop: 6 }}>Got it</Btn>
        </Modal>
      )}
    </div>
  );
}
