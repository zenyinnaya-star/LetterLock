'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

/* Presentation-only HUD pieces for story combat: top turn-order bar + bottom command deck.
   All rules stay on the server; Battle.tsx passes plain data + callbacks. */

export type Cmd = 'attack' | 'skills' | 'guard' | 'book' | 'item';

export type OrderItem = { id: string; name: string; src: string; side: 'hero' | 'enemy'; cur: boolean; done: boolean; spd: number };

export function TopBar({ location, round, rounds, order, turnLabel, turnSub, pill, ready, readyTotal, waiting, timer, warn, skillsHref, onLog }: {
  location: string; round: number; rounds: number; order: OrderItem[]; turnLabel: string; turnSub: string; pill: 'mine' | 'play' | 'wait';
  ready: number; readyTotal: number; waiting: string; timer: string; warn: boolean; skillsHref: string; onLog: () => void;
}) {
  return (
    <div className="bx-top">
      <div className="bx-logo"><b>LetterLock</b><span>{location} · Round {round}<small>/{rounds}</small></span></div>
      <div className="bx-order" aria-label="Turn order">
        {order.map((o) => (
          <motion.div layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} key={o.id}
            className={`bx-ord ${o.side}${o.cur ? ' cur' : ''}${o.done ? ' done' : ''}`} title={`${o.name} · SPD ${o.spd}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.src} alt={o.name} draggable={false} />
          </motion.div>
        ))}
        <small className="bx-ord-l">TURN ORDER</small>
      </div>
      <div className={`bx-turn ${pill}`}><b>{turnLabel}</b><span>{turnSub}</span></div>
      <div className="bx-mp">
        <div className="bx-mp-t"><span>{readyTotal > 1 ? 'MULTIPLAYER' : 'SOLO'}</span><b className={warn ? 'warn' : ''}>⏱ {timer}</b></div>
        <div className="bx-mp-r">{readyTotal > 1 ? `${ready}/${readyTotal} Ready` : `${ready}/${readyTotal} Ready`}</div>
        <div className="bx-mp-w">{waiting ? `⌛ Waiting for: ${waiting}` : ' '}</div>
        <div className="bx-mp-b"><Link href={skillsHref}>✦ Skills</Link><button type="button" onClick={onLog}>Log</button></div>
      </div>
    </div>
  );
}

export type Chip = { id: string; name: string; src: string; hp: number; max: number; sub?: string; picked?: boolean; down?: boolean };
export type Entry = { key: string; label: string; hint: string; disabled?: boolean; badge?: string; ult?: boolean; sel?: boolean; onUse: () => void };
export type PartyRow = { id: string; name: string; src: string; hp: number; max: number; ult: number; me: boolean; locked: boolean; down: boolean; shield: number; corr: number };

const CMD_INFO: Record<Cmd, { icon: string; title: string; text: string; power: string; cost: string; target: string; short: string }> = {
  attack: { icon: '⚔', title: 'Attack', text: 'A basic strike with your weapon.', power: '100%', cost: '—', target: 'Single Enemy', short: 'Deal physical damage to a target.' },
  skills: { icon: '✦', title: 'Skills', text: 'Ultimates and special cards you have earned.', power: 'varies', cost: 'Card / Ult', target: 'varies', short: 'Use an ultimate or a special card.' },
  guard: { icon: '🛡', title: 'Guard', text: 'Brace and gain a shield for this round.', power: 'Shield', cost: '—', target: 'Self', short: 'Take less damage this round.' },
  book: { icon: '📖', title: 'Book of Wisdom', text: 'Type a word fast to earn a special card.', power: 'Card', cost: 'Once / fight', target: 'Self', short: 'Type a word to draw a special.' },
  item: { icon: '⚗', title: 'Item', text: 'Use a potion or consumable.', power: 'varies', cost: 'Consumes item', target: 'varies', short: 'Use a potion or consumable.' },
};

export function CommandDeck({ sel, setSel, canAct, status, hero, ult, ultReady, chips, chipMode, chipTitle, onChip, confirmLabel, onConfirm, confirmDisabled, onCancel,
  skills, items, bookDisabled, party, log, round }: {
  sel: Cmd; setSel: (c: Cmd) => void; canAct: boolean; status: string; hero: string; ult: number; ultReady: boolean;
  chips: Chip[]; chipMode: 'target' | 'pick' | null; chipTitle: string; onChip: (id: string) => void;
  confirmLabel: string | null; onConfirm: () => void; confirmDisabled: boolean; onCancel: () => void;
  skills: Entry[]; items: Entry[]; bookDisabled: boolean; party: PartyRow[]; log: string[]; round: number;
}) {
  const cmds: Cmd[] = ['attack', 'skills', 'guard', 'book', 'item'];
  const info = CMD_INFO[sel];
  const list = sel === 'skills' ? skills : sel === 'item' ? items : null;
  return (
    <div className={`bx-deck${canAct ? '' : ' lock'}`}>
      <div className="bx-cmds">
        {cmds.map((c) => {
          const dis = !canAct || (c === 'book' && bookDisabled);
          return (
            <button key={c} type="button" className={`bx-cmd${sel === c ? ' sel' : ''}${c === 'skills' && ultReady ? ' hot' : ''}`} disabled={dis} onClick={() => setSel(c)}>
              <i>{CMD_INFO[c].icon}</i><span>{CMD_INFO[c].title}</span>
              {c === 'skills' && <em>{ultReady ? 'ULT!' : `${ult}/6`}</em>}
              {c === 'item' && items.length > 0 && <em>{items.length}</em>}
            </button>
          );
        })}
        <p className="bx-cmd-hint">{canAct ? info.short : status}</p>
      </div>

      <div className="bx-detail">
        <div className="bx-d-h"><i>{info.icon}</i><div><b>{info.title}</b><span>{info.text}</span></div></div>
        <div className="bx-d-stats"><span>Power <b>{info.power}</b></span><span>Cost <b>{info.cost}</b></span><span>Target <b>{info.target}</b></span></div>
        {!canAct ? <div className="bx-d-wait">{status}</div> : (<>
          {list && (
            <div className="bx-list">
              {list.length === 0 && <span className="bx-empty">{sel === 'item' ? 'No items. Buy potions at camp or read the Book of Wisdom.' : 'No skills yet. Fill your ultimate or read the Book of Wisdom.'}</span>}
              {list.map((e) => (
                <button key={e.key} type="button" className={`bx-entry${e.ult ? ' ult' : ''}${e.sel ? ' sel' : ''}`} disabled={e.disabled} title={e.hint} onClick={e.onUse}>
                  <b>{e.label}</b><small>{e.hint}</small>{e.badge && <em>{e.badge}</em>}
                </button>
              ))}
            </div>
          )}
          {chipMode && (
            <>
              <div className="bx-d-t">{chipTitle}</div>
              <div className="bx-chips">
                {chips.map((c) => (
                  <button key={c.id} type="button" className={`bx-chip${c.picked ? ' picked' : ''}${c.down ? ' down' : ''}`} onClick={() => onChip(c.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.src} alt="" draggable={false} />
                    <b>{c.name}</b><small>HP {Math.max(0, c.hp)}/{c.max}{c.sub ? ` · ${c.sub}` : ''}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="bx-d-act">
            {confirmLabel && <button type="button" className="bx-ok" disabled={confirmDisabled} onClick={onConfirm}><u>A</u> {confirmLabel}</button>}
            {(chipMode === 'pick' || sel !== 'attack') && <button type="button" className="bx-no" onClick={onCancel}><u>B</u> Cancel</button>}
          </div>
        </>)}
        <span className="bx-hero">{hero}</span>
      </div>

      <div className="bx-party">
        <div className="bx-ph">PARTY STATUS</div>
        {party.map((p) => (
          <div key={p.id} className={`bx-pr${p.me ? ' me' : ''}${p.down ? ' down' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt="" draggable={false} />
            <div className="bx-pr-b">
              <b>{p.name}{p.locked && !p.down ? ' ✓' : ''}</b>
              <div className="bx-bar hp"><i style={{ width: `${Math.max(0, Math.min(100, (p.hp / p.max) * 100))}%` }} /><span>HP {Math.max(0, p.hp)}/{p.max}</span></div>
              <div className="bx-bar ult"><i style={{ width: `${Math.min(100, (p.ult / 6) * 100)}%` }} /><span>ULT {p.ult}/6</span></div>
            </div>
            <div className="bx-tags">{p.shield > 0 && <span title="Shield">🛡{p.shield}</span>}{p.corr > 0 && <span title="Corruption">☠{p.corr}</span>}</div>
          </div>
        ))}
      </div>

      <div className="bx-log">
        <div className="bx-ph">COMBAT LOG</div>
        <div className="bx-log-b">{log.length === 0 ? <span className="bx-empty">The fight begins…</span> : log.map((l, i) => <div key={i}>{l}</div>)}</div>
        <div className="bx-log-r">— Round {round} —</div>
      </div>
    </div>
  );
}
