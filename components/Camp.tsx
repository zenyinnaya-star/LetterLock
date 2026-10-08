'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { ACT_BG, HERO_SPRITE, actOf } from '@/lib/art';
import { heroById, type HeroId } from '@/lib/heroes';
import { rpc, type BattleState, type CampState } from '@/lib/rpc';

const PATHS: Record<string, { name: string; glyph: string; perk: string; feature: string }> = {
  gambler: { name: 'Gambler', glyph: '🎲', perk: 'Opens the casino for the whole party. Your bets pay +0.4x and your first miss is forgiven', feature: 'Lucky Coin: +25 gold each camp' },
  thief: { name: 'Thief', glyph: '🗝️', perk: '+25% gold from every fight', feature: 'The Heist: answer one prompt to steal a free item' },
  hacker: { name: 'Hacker', glyph: '💾', perk: 'Unscramble vaults for rare cards', feature: 'The Vault: solve a scrambled word (fail = prices rise)' },
  oracle: { name: 'Oracle', glyph: '🔮', perk: 'See what waits ahead', feature: 'Fortune Tent: reveal the next encounter' },
  villain: { name: 'Villain', glyph: '🩸', perk: 'Trade health for power', feature: 'Dark Pact: -20% max HP, +25% Power (max 2)' },
  hero: { name: 'Hero', glyph: '⚔️', perk: 'Rally the party', feature: 'Sacred Oath: whole party starts next fight with +2 ult and 20 shield' },
};
const ERR: Record<string, string> = {
  NO_GOLD: 'Not enough gold.', HAND_FULL: 'Your hand is full (4 cards).', MAXED: 'Already maxed.', ALREADY_USED: 'Already used this camp.',
  NO_TARGET: 'Nobody has fallen.', BAD_STAKE: 'Stake between 10 and your gold.', HOUSE_CLOSED: 'The house is closed. You won too much.', IN_PROGRESS: 'Already in progress.', PACT_LIMIT: 'You already made two pacts.', CASINO_LOCKED: 'The casino is closed. A Gambler has to open it.', NOT_GAMBLER: 'Only a Gambler can open the casino.',
};
const errText = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k] : 'That did not work.'; };

function Timer({ ends, total }: { ends: string | null; total: number }) {
  const [l, setL] = useState(0);
  useEffect(() => {
    if (!ends) return;
    const t = () => setL(Math.max(0, (new Date(ends).getTime() - Date.now()) / 1000));
    t(); const i = setInterval(t, 200); return () => clearInterval(i);
  }, [ends]);
  return <div className="cp-timer"><i style={{ width: `${Math.min(100, (l / total) * 100)}%` }} /><span>{Math.ceil(l)}s</span></div>;
}

export function Camp({ b, token, state }: { b: BattleState; token: string | null; state: { code: string; v: number } }) {
  const [c, setC] = useState<CampState | null>(null);
  const [tab, setTab] = useState<'shop' | 'casino' | 'path'>('shop');
  const [msg, setMsg] = useState('');
  const [word, setWord] = useState('');
  const [stake, setStake] = useState(25);
  const [last, setLast] = useState('');
  const [left, setLeft] = useState(90);

  const load = useCallback(async () => { if (token) { try { setC(await rpc.getCamp(token)); } catch { /* ignore */ } } }, [token]);
  useEffect(() => { void load(); }, [load, state.v, b.version]);
  useEffect(() => { const i = setInterval(() => void load(), 2500); return () => clearInterval(i); }, [load]);

  useEffect(() => {
    if (!c) return;
    const t = () => { const l = Math.max(0, Math.ceil((new Date(c.camp_ends).getTime() - Date.now()) / 1000)); setLeft(l); if (l <= 0 && token) void rpc.campStep(token).then(() => load()).catch(() => undefined); };
    t(); const i = setInterval(t, 1000); return () => clearInterval(i);
  }, [c, token, load]);

  async function run<T>(fn: () => Promise<T>, ok?: (r: T) => string) {
    setMsg('');
    try { const r = await fn(); if (ok) setMsg(ok(r)); await load(); return r; } catch (e) { setMsg(errText(e)); await load(); return null; }
  }

  const heroes = b.units.filter((u) => u.side === 'hero');
  const next = b.stage + 1;
  if (!c || !token) return <div className="center muted">Setting up camp…</div>;
  const pending = !c.path;

  return (
    <div className="cp">
      <div className="cp-bg" style={{ backgroundImage: `url(${ACT_BG[actOf(next)]})` }} />
      <div className="cp-shade" />
      <div className="cp-in">
        <header className="cp-head">
          <div><small>CAMP · AFTER ENCOUNTER {b.stage}</small><h1>Rest. Spend. Gamble.</h1></div>
          <div className="cp-gold">🪙 <b>{c.gold}</b> gold{c.pbonus > 0 && <span> · +{Math.round(c.pbonus * 100)}% Power</span>}</div>
        </header>

        <div className="cp-party">
          {heroes.map((u) => {
            const info = u.hero ? heroById(u.hero as HeroId) : null;
            return (
              <div key={u.id} className={`cp-h${u.player_id === b.me ? ' me' : ''}`} style={{ ['--hc' as string]: info?.color ?? '#64748b' }}>
                {u.hero && /* eslint-disable-next-line @next/next/no-img-element */ <img src={HERO_SPRITE[u.hero]} alt="" draggable={false} />}
                <b>{u.hero ?? u.name}</b>
                <i><u style={{ width: `${Math.round((u.hp / u.max_hp) * 100)}%` }} /></i>
                <small>{u.hp}/{u.max_hp}</small>
              </div>
            );
          })}
        </div>

        <nav className="cp-tabs">
          <Link href={`/skills?from=${encodeURIComponent(`/room/${state.code}`)}`} className="cp-link">✦ Skills</Link>
          <Link href={`/stats?from=${encodeURIComponent(`/room/${state.code}`)}`} className="cp-link">📊 Stats</Link>
          <button type="button" className={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')}>🛒 Shop</button>
          <button type="button" className={tab === 'casino' ? 'on' : ''} onClick={() => setTab('casino')}>🎰 Casino{c.casino_open ? ' ●' : ''}</button>
          <button type="button" className={tab === 'path' ? 'on' : ''} onClick={() => setTab('path')}>{pending ? '✦ Choose Pathway' : `${PATHS[c.path!]?.glyph} ${PATHS[c.path!]?.name}`}</button>
        </nav>

        <section className="cp-panel">
          {tab === 'shop' && (
            <>
              {c.price_up && <div className="cp-warn">The vault locked: prices are +20% this camp.</div>}
              {c.gear_shop && (<>
                <div className="cp-h">⚔ GEAR · lasts the whole run</div>
                <div className="cp-grid">
                  {c.gear_shop.map((g) => (
                    <button key={g.slot} type="button" className={`cp-item gear${g.tier ? ' owned' : ''}`} disabled={!g.next || c.gold < g.next.price}
                      onClick={() => void run(() => rpc.campGear(token, g.slot), (r) => `Equipped ${r.name}!`)}>
                      <small className="cp-slot">{g.slot.toUpperCase()} {'◆'.repeat(g.tier)}{'◇'.repeat(2 - g.tier)}</small>
                      {g.next ? <><b>{g.next.name}</b><span>{g.next.desc}</span><em>🪙 {g.next.price}</em></> : <><b>{g.have}</b><span>Fully upgraded</span><em>MAX</em></>}
                      {g.have && g.next && <span className="cp-have">Equipped: {g.have}</span>}
                    </button>
                  ))}
                </div>
                <div className="cp-h">🧪 SUPPLIES</div>
              </>)}
              <div className="cp-grid">
                {c.shop.map((it) => (
                  <button key={it.id} type="button" className="cp-item" disabled={c.gold < it.price} onClick={() => void run(() => rpc.campBuy(token, it.id), (r) => r.card ? `Got a card: ${r.card.replace('_', ' ')}` : 'Bought!')}>
                    <b>{it.name}</b><span>{it.desc}</span><em>🪙 {it.price}</em>
                  </button>
                ))}
                <button type="button" className="cp-item free" disabled={c.flags.includes('rest')} onClick={() => void run(() => rpc.campRest(token), () => 'You rest. +20% HP')}>
                  <b>Rest by the fire</b><span>Heal yourself 20%</span><em>FREE</em>
                </button>
              </div>
              {!!c.cards?.length && (<>
                <div className="cp-h">💰 SELL · your hand</div>
                <div className="cp-grid">
                  {c.cards.map((card, i) => (
                    <button key={card + i} type="button" className="cp-item" onClick={() => void run(() => rpc.campSell(token, i), (r) => `Sold ${r.card.replace('_', ' ')} for ${r.gold} gold`)}>
                      <b>{card.replace(/_/g, ' ')}</b><span>Sell this card</span><em>+🪙 {['sweep', 'heal_all', 'cleanse'].includes(card) ? 20 : card.startsWith('sp_') ? 30 : 70}</em>
                    </button>
                  ))}
                </div>
              </>)}
            </>
          )}

          {tab === 'casino' && (
            <>
              {c.casino_open === false && !c.casino.active ? (
                <div className="cp-casino cp-locked">
                  <p className="cp-big">🎰 The casino is closed</p>
                  {c.path === 'gambler'
                    ? <><p>You're the <b>Gambler</b>. Open the house and the whole party can bet this camp.</p>
                        <button type="button" className="btn lg" onClick={() => void run(() => rpc.casinoOpen(token), () => 'The house is open!')}>🎲 Open the casino</button></>
                    : <p>Only a <b>Gambler</b> can open it. {c.gambler_here ? 'Ask your Gambler to open the house.' : 'Nobody in the party walks the Gambler pathway. Pick it in the Pathway tab to unlock the casino.'}</p>}
                </div>
              ) : c.casino.closed ? <div className="cp-warn">The house is closed. You cleaned them out.</div> : !c.casino.active ? (
                <div className="cp-casino">
                  <p>Answer <b>5 timed prompts</b> in a row. Get <b>3</b> right to win back <b>1.5x</b>, <b>4</b> for <b>2.2x</b>, <b>5</b> for <b>3.2x</b>. Fewer and the house keeps your stake.</p>
                  <div className="cp-stakes">
                    {[10, 25, 50, 100].filter((s) => s <= c.gold).map((s) => <button key={s} type="button" className={stake === s ? 'on' : ''} onClick={() => setStake(s)}>{s}</button>)}
                    {c.gold >= 10 && <button type="button" className={stake === c.gold ? 'on' : ''} onClick={() => setStake(c.gold)}>All in ({c.gold})</button>}
                  </div>
                  <button type="button" className="btn lg" disabled={c.gold < 10} onClick={() => { setLast(''); void run(() => rpc.casinoStart(token, Math.min(stake, c.gold))); }}>🎰 Place bet · {Math.min(stake, c.gold)}</button>
                  <div className="cp-h">⚡ QUICK GAMES · same stake</div>
                  <div className="cp-grid">
                    <button type="button" className="cp-item" disabled={c.gold < 10} onClick={() => void run(() => rpc.casinoRoll(token, Math.min(stake, c.gold), 'flip'), (r) => (r.win ? `🪙 Heads! You win ${r.payout}` : 'Tails. The house keeps it.'))}>
                      <b>Coin Flip</b><span>48% to double your stake</span><em>2x</em>
                    </button>
                    <button type="button" className="cp-item" disabled={c.gold < 10} onClick={() => void run(() => rpc.casinoRoll(token, Math.min(stake, c.gold), 'jackpot'), (r) => (r.win ? `💎 JACKPOT! You win ${r.payout}` : 'No jackpot this time.'))}>
                      <b>Jackpot Spin</b><span>17% to win big</span><em>5x</em>
                    </button>
                  </div>
                  {c.gold < 10 && <div className="muted small">You need at least 10 gold.</div>}
                  {last && <div className="cp-result">{last}</div>}
                </div>
              ) : (
                <form className="cp-casino" onSubmit={(e) => { e.preventDefault(); const w = word; setWord('');
                  void run(() => rpc.casinoAnswer(token, w), (r) => { if (!r.ok) return 'Not that. Try again!'; if (r.done) { setLast(`${r.wins}/5 right. Payout ${r.payout} (stake ${r.stake}).`); return ''; } return r.hit ? 'Correct!' : 'Missed.'; }); }}>
                  <div className="cp-round">Round {c.casino.round} / 5 · {c.casino.wins} right · stake {c.casino.stake}{c.casino.lucky ? ' · 🍀 free pass ready' : ''}</div>
                  <div className="cp-prompt">{c.casino.prompt}</div>
                  <Timer ends={c.casino.ends_at} total={14} />
                  <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Type a word that fits…" />
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn" disabled={!word.trim()}>Answer ▸</button>
                    <button type="button" className="btn ghost" onClick={() => { setWord(''); void run(() => rpc.casinoAnswer(token, ''), (r) => (r.done ? (setLast(`${r.wins}/5 right. Payout ${r.payout}.`), '') : 'Skipped.')); }}>Skip</button>
                  </div>
                </form>
              )}
            </>
          )}

          {tab === 'path' && (
            pending ? (
              <>
                <p className="muted small">Choose one pathway. It gives a perk and a special feature at every camp.</p>
                <div className="cp-grid">
                  {Object.entries(PATHS).map(([id, p]) => (
                    <button key={id} type="button" className="cp-item" onClick={() => void run(() => rpc.pickPathway(token, id), () => `You walk the ${p.name} path.`)}>
                      <b>{p.glyph} {p.name}</b><span>{p.perk}</span><em>{p.feature}</em>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="cp-casino">
                <h3>{PATHS[c.path!].glyph} {PATHS[c.path!].name}</h3>
                <p className="muted">{PATHS[c.path!].perk}</p>
                {c.puzzle ? (
                  <form onSubmit={(e) => { e.preventDefault(); const w = word; setWord(''); void run(() => rpc.pathAnswer(token, w), (r) => r.text ?? (r.ok ? 'Success!' : 'Try again!')); }} className="cp-casino">
                    <div className="cp-prompt">{c.puzzle.kind === 'vault' ? `Unscramble: ${c.puzzle.text.toUpperCase()}` : c.puzzle.text}</div>
                    <Timer ends={c.puzzle.ends_at} total={c.puzzle.kind === 'vault' ? 20 : 15} />
                    <input className="input" autoFocus autoComplete="off" autoCapitalize="none" value={word} onChange={(e) => setWord(e.target.value)} placeholder={c.puzzle.kind === 'vault' ? 'The word…' : 'A word that fits…'} />
                    <div className="row" style={{ gap: 8 }}><button className="btn" disabled={!word.trim()}>Go ▸</button>
                      <button type="button" className="btn ghost" onClick={() => void run(() => rpc.pathAnswer(token, ''), (r) => r.text ?? '')}>Give up</button></div>
                  </form>
                ) : (
                  <button type="button" className="btn lg" disabled={c.flags.includes('path')} onClick={() => void run(() => rpc.pathOpen(token), (r) => r.text ?? (r.gold ? `+${r.gold} gold` : ''))}>
                    {c.flags.includes('path') ? 'Used this camp' : PATHS[c.path!].feature}
                  </button>
                )}
              </div>
            )
          )}
          <AnimatePresence>{msg && <motion.div className="cp-msg" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{msg}</motion.div>}</AnimatePresence>
        </section>

        <footer className="cp-foot">
          <div className="muted small">{c.oath ? '⚔️ Oath sworn · ' : ''}Next: Encounter {next} · {c.ready_count}/{c.hero_count} ready · camp ends in {left}s</div>
          <button type="button" className="cp-go" disabled={c.ready} onClick={() => void run(() => rpc.campReady(token))}>{c.ready ? 'WAITING FOR PARTY…' : 'MARCH ON ▸'}</button>
        </footer>
      </div>
    </div>
  );
}
