'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

/* Presentation-only HUD pieces for story combat: top turn-order bar + bottom command deck.
   All rules stay on the server; Battle.tsx passes plain data + callbacks. */


const ICON: Record<string, React.ReactNode> = {
  word: <path d="M4 20 6 14 17 3l4 4L10 18Zm0 0 4-1M14 6l4 4" />,
  attack: <><path d="M4 20 15 9m0 0 5-5v5h-5ZM9 15l-2.5 2.5M5 14l5 5" /><path d="M20 20 9 9M9 9 4 4v5h5Z" /></>,
  skills: <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4Z" />,
  guard: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />,
  book: <><path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1Z" /><path d="M21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1Z" /></>,
  item: <><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" /><path d="M7.5 15h9" /></>,
  hourglass: <path d="M6 3h12M6 21h12M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9" />,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 3-6 6-6s6 2 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14c3 0 5 2 5 5" /></>,
  skull: <><path d="M5 11a7 7 0 0 1 14 0v3l-2 1v3H7v-3l-2-1Z" /><circle cx="9.5" cy="11.5" r="1.4" /><circle cx="14.5" cy="11.5" r="1.4" /></>,
  diamond: <path d="M12 3 21 12 12 21 3 12Z" />,
};
export function Icon({ n, size = 18 }: { n: string; size?: number }) {
  return <svg className="bx-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[n] ?? ICON.diamond}</svg>;
}

export function LeftParty({ rows, active }: { rows: PartyRow[]; active?: string }) {
  return (
    <div className="bx-left">
      {rows.map((p) => (
        <div key={p.id} className={`bx-lc${p.me ? ' me' : ''}${p.down ? ' down' : ''}${active === p.id ? ' act' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt="" draggable={false} />
          <div className="bx-lc-b">
            <div className="bx-bar hp"><i style={{ width: `${Math.max(0, Math.min(100, (p.hp / p.max) * 100))}%` }} /><span>HP <b>{Math.max(0, p.hp)}</b>/{p.max}</span></div>
            <div className="bx-bar ult"><i style={{ width: `${Math.min(100, (p.ult / 6) * 100)}%` }} /><span>ULT <b>{p.ult}</b>/6</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export type Cmd = 'attack' | 'word' | 'skills' | 'guard' | 'book' | 'item';
export type WordUi = { prompt: string; locked: string; value: string; onChange: (v: string) => void; mode: 'attack' | 'guard' | 'heal'; onMode: (m: 'attack' | 'guard' | 'heal') => void; msg: string };

export type OrderItem = { id: string; name: string; src: string; side: 'hero' | 'enemy'; cur: boolean; done: boolean; spd: number };

export function TopBar({ location, round, rounds, order, turnLabel, turnSub, pill, multi, ready, readyTotal, waiting, timer, warn, skillsHref, onLog }: {
  location: string; round: number; rounds: number; order: OrderItem[]; turnLabel: string; turnSub: string; pill: 'mine' | 'play' | 'wait';
  multi: boolean; ready: number; readyTotal: number; waiting: string; timer: string; warn: boolean; skillsHref: string; onLog: () => void;
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
        <div className="bx-mp-t"><span><Icon n="users" size={14} /> {multi ? 'MULTIPLAYER' : 'SOLO'}</span><b className={warn ? 'warn' : ''}><Icon n="hourglass" size={12} /> {timer}</b></div>
        <div className="bx-mp-r">{multi ? `${ready}/${readyTotal} Ready` : pill === 'mine' ? 'Your move' : 'Story run'}</div>
        <div className="bx-mp-w">{waiting ? <><Icon n="hourglass" size={12} /> Waiting for: {waiting}</> : ' '}</div>
        <div className="bx-mp-b"><Link href={skillsHref}>Skills</Link><button type="button" onClick={onLog}>Log</button></div>
      </div>
    </div>
  );
}

export type Chip = { id: string; name: string; src: string; hp: number; max: number; sub?: string; picked?: boolean; down?: boolean };
export type Entry = { key: string; label: string; hint: string; disabled?: boolean; badge?: string; ult?: boolean; sel?: boolean; onUse: () => void };
export type PartyRow = { id: string; name: string; src: string; hp: number; max: number; ult: number; me: boolean; locked: boolean; down: boolean; shield: number; corr: number };

const CMD_INFO: Record<Cmd, { icon: string; title: string; text: string; power: string; cost: string; target: string; short: string }> = {
  attack: { icon: 'attack', title: 'Attack', text: 'A basic strike with your weapon.', power: '100%', cost: '—', target: 'Single Enemy', short: 'Deal physical damage to a target.' },
  word: { icon: 'word', title: 'Cast Word', text: 'Type a word that fits the prompt. Longer and rarer words hit harder.', power: 'By word', cost: '—', target: 'Single Enemy', short: 'Type a word for bonus power.' },
  skills: { icon: 'skills', title: 'Skills', text: 'Ultimates and special cards you have earned.', power: 'varies', cost: 'Card / Ult', target: 'varies', short: 'Use an ultimate or a special card.' },
  guard: { icon: 'guard', title: 'Guard', text: 'Brace and gain a shield for this round.', power: 'Shield', cost: '—', target: 'Self', short: 'Take less damage this round.' },
  book: { icon: 'book', title: 'Book of Wisdom', text: 'Type a word fast to earn a special card.', power: 'Card', cost: 'Once / fight', target: 'Self', short: 'Type a word to draw a special.' },
  item: { icon: 'item', title: 'Item', text: 'Use a potion or consumable.', power: 'varies', cost: 'Consumes item', target: 'varies', short: 'Use a potion or consumable.' },
};

export function CommandDeck({ sel, setSel, canAct, status, hero, ult, ultReady, chips, chipMode, chipTitle, onChip, confirmLabel, onConfirm, confirmDisabled, onCancel,
  skills, items, bookDisabled, party, log, round, word }: {
  sel: Cmd; setSel: (c: Cmd) => void; canAct: boolean; status: string; hero: string; ult: number; ultReady: boolean;
  chips: Chip[]; chipMode: 'target' | 'pick' | null; chipTitle: string; onChip: (id: string) => void;
  confirmLabel: string | null; onConfirm: () => void; confirmDisabled: boolean; onCancel: () => void;
  skills: Entry[]; items: Entry[]; bookDisabled: boolean; party: PartyRow[]; log: string[]; round: number; word: WordUi;
}) {
  const cmds: Cmd[] = ['attack', 'word', 'skills', 'guard', 'book', 'item'];
  const info = CMD_INFO[sel];
  const list = sel === 'skills' ? skills : sel === 'item' ? items : null;
  return (
    <div className={`bx-deck${canAct ? '' : ' lock'}`}>
      <div className="bx-cmds">
        {cmds.map((c) => {
          const dis = !canAct || (c === 'book' && bookDisabled);
          return (
            <button key={c} type="button" className={`bx-cmd${sel === c ? ' sel' : ''}${c === 'skills' && ultReady ? ' hot' : ''}`} disabled={dis} onClick={() => setSel(c)}>
              <Icon n={CMD_INFO[c].icon} /><span>{CMD_INFO[c].title}</span>
              {c === 'skills' && <em>{ultReady ? 'ULT!' : `${ult}/6`}</em>}
              {c === 'item' && items.length > 0 && <em>{items.length}</em>}
            </button>
          );
        })}
        <p className="bx-cmd-hint">{canAct ? info.short : status}</p>
      </div>

      <div className="bx-detail" data-sel={sel}>
        <div className="bx-d-h"><i><Icon n={info.icon} size={30} /></i><div><b>{info.title}</b><span>{info.text}</span></div></div>
        <div className="bx-d-stats"><span>Power <b>{info.power}</b></span><span>Cost <b>{info.cost}</b></span><span>Target <b>{info.target}</b></span></div>
        {!canAct ? <div className="bx-d-wait">{status}</div> : (<>
          {sel === 'word' && (
            <div className="bx-word">
              <div className="bx-w-p"><span>PROMPT</span><b>{word.prompt || '—'}</b>{word.locked && <em>Locked letters: {word.locked.toUpperCase().split('').join(' ')}</em>}</div>
              <div className="bx-w-m">
                {(['attack', 'guard', 'heal'] as const).map((m) => <button key={m} type="button" className={word.mode === m ? 'on' : ''} onClick={() => word.onMode(m)}>{m === 'attack' ? 'Strike' : m === 'guard' ? 'Guard' : 'Heal'}</button>)}
              </div>
              <input className="bx-w-i" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20} value={word.value} placeholder="Type your word…"
                onChange={(e) => word.onChange(e.target.value.replace(/[^a-zA-Z]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && !confirmDisabled) onConfirm(); }} />
              {word.msg && <div className="bx-w-msg">{word.msg}</div>}
            </div>
          )}
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
              <b>{p.name}{p.locked && !p.down ? ' (ready)' : ''}</b>
              <div className="bx-bar hp"><i style={{ width: `${Math.max(0, Math.min(100, (p.hp / p.max) * 100))}%` }} /><span>HP {Math.max(0, p.hp)}/{p.max}</span></div>
              <div className="bx-bar ult"><i style={{ width: `${Math.min(100, (p.ult / 6) * 100)}%` }} /><span>ULT {p.ult}/6</span></div>
            </div>
            <div className="bx-tags">{p.shield > 0 && <span title="Shield"><Icon n="guard" size={12} />{p.shield}</span>}{p.corr > 0 && <span title="Corruption"><Icon n="skull" size={12} />{p.corr}</span>}</div>
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
