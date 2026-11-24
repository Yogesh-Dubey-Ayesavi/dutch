import { useEffect, useState } from 'react';
import { api } from '../api';
import { PlayingCard } from '../Card';
import { DANGER, FELT, INK, LINE, MINT, MUTED, PANEL, PANEL_LINE, SOFT, TXT, Y } from '../tokens';
import { BackIcon, Btn, ChipBalance, IconBtn, Sheet, Toast } from '../ui';
import type { ItemType } from '../../shared/catalog';
import type { ShopResponse } from '../../shared/api';

const TABS: [ItemType, string][] = [['back', 'Backs'], ['table', 'Tables'], ['face', 'Faces'], ['flip', 'Flips']];
const FLIP_ART: Record<string, [number, number]> = { classic: [0.5, 0], snap: [0.2, 0], spin: [0.6, -18], fold: [0.35, 8] };
type Item = ShopResponse['items'][number];

export function Shop({ onBack, onChange }: { onBack: () => void; onChange: () => void }) {
  const [data, setData] = useState<ShopResponse | null>(null);
  const [tab, setTab] = useState<ItemType>('back');
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ text: string; line: string; sub?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.shop().then(setData, (e) => setToast({ text: e.message, line: DANGER })); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);
  const items = data?.items.filter((i) => i.type === tab) ?? [];
  const equipped = (t: ItemType) => data?.items.find((i) => i.type === t && i.equipped);
  const current = items.find((i) => i.id === sel) ?? equipped(tab) ?? items[0];
  const preview = (t: ItemType) => (current && current.type === t ? current.key : equipped(t)?.key);
  const balance = data?.chips ?? 0;

  const run = async (f: () => Promise<ShopResponse>, done?: (d: ShopResponse) => void) => {
    setBusy(true);
    try { const d = await f(); setData(d); done?.(d); onChange(); } catch (e) { setToast({ text: (e as Error).message, line: DANGER }); } finally { setBusy(false); }
  };
  let cta = { text: '', kind: 'off' as 'hot' | 'white' | 'off', on: () => {} };
  if (current) {
    if (current.equipped) cta = { text: 'Equipped', kind: 'off', on: () => {} };
    else if (current.owned) cta = { text: `Equip ${current.name}`, kind: 'white', on: () => run(() => api.equip(current.id)) };
    else if (balance >= current.price) cta = { text: `Buy for ${current.price} chips`, kind: 'hot', on: () => setConfirm(current) };
    else cta = { text: `Need ${current.price - balance} more chips`, kind: 'off', on: () => {} };
  }

  return (
    <>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 48, height: 44, display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconBtn label="Back" onClick={onBack}><BackIcon /></IconBtn>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 22 }}>Shop</div>
        <ChipBalance chips={balance} />
      </div>
      <div style={{ position: 'absolute', left: 22, right: 22, top: 104, height: 128, borderRadius: '50%', background: FELT[preview('table') ?? 'blue'], boxShadow: '0 0 0 6px #6B4122, 0 0 0 8px #2A170A, inset 0 6px 14px rgba(0,0,0,0.55), inset 0 0 50px rgba(0,0,0,0.45), 0 14px 30px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ display: 'flex', gap: 5 }}>{[0, 1, 2, 3].map((i) => <PlayingCard key={i} down back={preview('back')} size="opp" />)}</div>
        <FlipPreview flip={preview('flip') ?? 'classic'} face={preview('face')} />
      </div>
      <div role="tablist" style={{ position: 'absolute', left: 16, right: 16, top: 250, height: 40, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 4 }}>
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => { setTab(t); setSel(null); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: tab === t ? TXT : PANEL, color: tab === t ? INK : MUTED, fontSize: 13.5, fontWeight: 800, border: `1px solid ${tab === t ? TXT : PANEL_LINE}` }}>{label}</button>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 300, bottom: 108, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gridAutoRows: 138, gap: 8 }}>
        {!data && [0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ background: '#1A1917' }} />)}
        {items.map((t) => {
          const on = current?.id === t.id;
          const st = t.equipped ? { s: 'Equipped', bg: Y, fg: INK, line: Y } : t.owned ? { s: 'Owned', bg: 'transparent', fg: SOFT, line: LINE } : { s: `◆ ${t.price}`, bg: 'transparent', fg: balance >= t.price ? TXT : DANGER, line: 'transparent' };
          const [sx, tilt] = FLIP_ART[t.key] ?? [1, 0];
          return (
            <button key={t.id} type="button" onClick={() => setSel(t.id)} aria-pressed={on}
              style={{ boxSizing: 'border-box', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: PANEL, boxShadow: on ? `inset 0 0 0 2px ${Y}, 0 0 16px oklch(0.9 0.17 100 / 0.35)` : `inset 0 0 0 1px ${PANEL_LINE}` }}>
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t.type === 'back' && <PlayingCard down back={t.key} size="tile" />}
                {t.type === 'table' && <div style={{ width: 88, height: 56, borderRadius: '50%', background: FELT[t.key], boxShadow: '0 0 0 4px #6B4122, inset 0 3px 8px rgba(0,0,0,0.5)' }} />}
                {t.type === 'face' && <PlayingCard rank="Q" suit="h" face={t.key} size="tile" />}
                {t.type === 'flip' && <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}><PlayingCard down size="mini" scaleX={sx} tilt={tilt} /><PlayingCard rank="7" suit="s" size="mini" /></div>}
              </div>
              <div style={{ lineHeight: 1.25, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{t.name}</div>
              <div style={{ height: 20, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 5, background: st.bg, color: st.fg, fontSize: 11.5, fontWeight: 800, border: `1px solid ${st.line}` }}>{st.s}</div>
            </button>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 36 }}>
        <Btn kind={cta.kind} size={21} onClick={cta.on} disabled={busy || cta.kind === 'off'}>{cta.text || '…'}</Btn>
      </div>
      {confirm && (
        <Sheet onClose={() => setConfirm(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {confirm.type === 'back' ? <PlayingCard down back={confirm.key} size="pile" /> : confirm.type === 'face' ? <PlayingCard rank="Q" suit="h" face={confirm.key} size="pile" /> : confirm.type === 'table' ? <div style={{ width: 88, height: 56, borderRadius: '50%', background: FELT[confirm.key], boxShadow: '0 0 0 4px #6B4122' }} /> : <PlayingCard down size="pile" />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.05 }}>Buy {confirm.name}?</div>
              <div style={{ fontSize: 14, color: MUTED }}>{{ back: 'Card back · your rival sees it too', table: 'Table · your side of the felt', face: 'Card face · ranks stay as readable', flip: 'Flip effect · plays when cards turn' }[confirm.type]}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#26241F', border: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 14, color: SOFT }}>Balance after</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 15, color: '#6E6A61', textDecoration: 'line-through' }}>{balance}</span><span style={{ fontWeight: 800, fontSize: 28, fontStretch: '75%', lineHeight: 0.9 }}>{balance - confirm.price}</span></div>
          </div>
          <Btn kind="hot" disabled={busy} onClick={() => { const c = confirm; setConfirm(null); void run(() => api.buy(c.id), () => setToast({ text: `${c.name} bought`, line: MINT, sub: `−${c.price} chips` })); }}>Buy for {confirm.price} chips</Btn>
          <Btn kind="quiet" h={48} size={16} onClick={() => setConfirm(null)}>Cancel</Btn>
        </Sheet>
      )}
      {toast && <Toast {...toast} />}
    </>
  );
}

/** The selected flip effect loops on the preview card. */
function FlipPreview({ flip, face }: { flip: string; face?: string }) {
  const [down, setDown] = useState(false);
  useEffect(() => { const t = setInterval(() => setDown((d) => !d), 1400); return () => clearInterval(t); }, []);
  return <PlayingCard rank="Q" suit="h" size="tile" face={face} down={down} flip={flip} />;
}
