'use client';

import { useEffect, useState } from 'react';
import { ClassIcon, Icon } from '@/components/icons';
import { CLASSES, CLASS_ORDER } from '@/lib/classes';
import { fetchHeroState, saveLoadout, type HeroState } from '@/lib/loadout';
import type { PlayerClass } from '@/lib/types';

const MIN = 3, MAX = 4;

/** Pick the 3-4 heroes you play with. Game modes only offer these. Locked heroes show their XP cost. */
export function LoadoutEditor() {
  const [st, setSt] = useState<HeroState | null>(null);
  const [sel, setSel] = useState<PlayerClass[]>([]);
  const [saved, setSaved] = useState<PlayerClass[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetchHeroState().then((s) => { if (s) { setSt(s); setSel(s.loadout); setSaved(s.loadout); } }); }, []);
  if (!st) return null;

  const info = new Map(st.heroes.map((h) => [h.class, h]));
  const dirty = sel.length !== saved.length || sel.some((c) => !saved.includes(c));
  const order = CLASS_ORDER.filter((c) => info.has(c)).sort((a, b) => (info.get(a)!.xp_required) - (info.get(b)!.xp_required));

  function toggle(c: PlayerClass) {
    setMsg(null);
    if (!info.get(c)?.open) return;
    if (sel.includes(c)) {
      if (sel.length <= MIN) { setMsg({ ok: false, text: `Keep at least ${MIN} heroes. Pick another before removing this one.` }); return; }
      setSel(sel.filter((x) => x !== c));
    } else {
      if (sel.length >= MAX) { setMsg({ ok: false, text: `Max ${MAX} heroes. Remove one first.` }); return; }
      setSel([...sel, c]);
    }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try { const r = await saveLoadout(sel); setSaved(r); setSel(r); setMsg({ ok: true, text: 'Loadout saved.' }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error && e.message.includes('LOCKED') ? 'One of those heroes is still locked.' : 'Could not save. Try again.' }); }
    setBusy(false);
  }

  return (
    <section className="pf-card">
      <span className="label pf-h"><Icon name="swords" size={20} /> Your heroes <em>{sel.length}/{MAX}</em></span>
      <span className="muted small">Choose {MIN}–{MAX}. Every game mode only offers these. Earn XP to unlock more.</span>
      <div className="lo-grid">
        {order.map((c) => {
          const h = info.get(c)!;
          const on = sel.includes(c);
          return (
            <button key={c} type="button" className={`lo-card${on ? ' on' : ''}${h.open ? '' : ' locked'}`} onClick={() => toggle(c)} aria-pressed={on} aria-disabled={!h.open}>
              <ClassIcon cls={c} size={44} />
              <b>{CLASSES[c].name}</b>
              <small>{!h.open ? <><Icon name="lock" size={11} /> {h.xp_required} XP</> : on ? 'In loadout' : 'Unlocked'}</small>
            </button>
          );
        })}
      </div>
      <div className="lo-bar">
        <span className="muted small">{st.xp} XP</span>
        <button type="button" className="btn sm" disabled={busy || !dirty || sel.length < MIN} onClick={() => void save()}>{busy ? 'Saving…' : 'Save loadout'}</button>
      </div>
      {msg && <div className={`note ${msg.ok ? '' : 'bad'}`}>{msg.text}</div>}
    </section>
  );
}
