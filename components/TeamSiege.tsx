'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTeamExtra } from '@/hooks/useTeamExtra';
import { prepareAnswer } from '@/lib/answer';
import { audio } from '@/lib/audio';
import { REASONS } from '@/lib/errors';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import { siegeArtVars } from '@/lib/siegeArt';
import type { PublicPlayer, RoomState, Team } from '@/lib/types';
import type { PhaseProps } from './phases';
import { PlayerAvatar } from './PlayerAvatar';
import { teamLabel } from './team';
import { nameOf } from './ui';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PHASE_SECS: Record<string, number> = { reveal: 6, guess: 20, react: 8 };

/* ───────── pieces ───────── */

export function Crown({ size = 18 }: { size?: number }) {
  return (
    <svg className="s-crown" width={size} height={size * 0.8} viewBox="0 0 30 24" aria-hidden>
      <path d="M2 20 L4 6 L10 13 L15 3 L20 13 L26 6 L28 20 Z" fill="url(#crowng)" stroke="#6b4a10" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="2" y="19" width="26" height="4" rx="1" fill="#c9952e" stroke="#6b4a10" strokeWidth="1.2" />
      <circle cx="15" cy="3.2" r="2" fill="#d23b3b" /><circle cx="4" cy="6" r="1.6" fill="#3b7dd2" /><circle cx="26" cy="6" r="1.6" fill="#3b7dd2" />
      <defs><linearGradient id="crowng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a3" /><stop offset="1" stopColor="#c48a22" /></linearGradient></defs>
    </svg>
  );
}

export function Crest({ team }: { team: Team }) {
  const [broken, setBroken] = useState(false);
  if (team.image_url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="s-crest-img" src={team.image_url} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  // default heraldry: a shield with the team initial
  return (
    <svg className="s-crest-svg" viewBox="0 0 60 70" aria-hidden>
      <path d="M30 3 L56 12 L52 44 Q48 60 30 67 Q12 60 8 44 L4 12 Z" fill={team.idx === 0 ? '#1d3f7a' : '#7a1d24'} stroke="#e8c46a" strokeWidth="3" />
      <text x="30" y="44" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="900" fontSize="28" fill="#f3dc9a">{(/^Team [AB]$/.test(team.name) ? team.name.slice(-1) : (team.name || '?').trim().charAt(0)).toUpperCase()}</text>
    </svg>
  );
}

function TeamBanner({ state, team, side, mine, rally }: { state: RoomState; team: Team; side: 'left' | 'right'; mine: boolean; rally: boolean }) {
  const t = useT();
  const members = state.players.filter((p) => p.team_id === team.id && !p.quit);
  return (
    <div className={`s-banner ${side} c${team.idx}${mine ? ' mine' : ''}${rally ? ' rally' : ''}`}>
      <div className={`s-flag c${team.idx}`}><Crest team={team} /></div>
      <div className="s-banner-info">
        <b className="s-team-name">{teamLabel(t, team)}</b>
        <div className="s-members">
          {members.map((p) => (
            <span key={p.id} className={`s-member${team.leader_id === p.id ? ' king' : ''}${p.id === state.me?.id ? ' me' : ''}`} title={p.name}>
              {team.leader_id === p.id && <Crown size={20} />}
              <PlayerAvatar p={p} size={team.leader_id === p.id ? 40 : 32} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hourglass({ msLeft, total }: { msLeft: number; total: number }) {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const frac = total > 0 ? Math.max(0, Math.min(1, msLeft / (total * 1000))) : 0;
  const topY = 12 + (1 - frac) * 30, botY = 92 - frac * 0 - (1 - frac) * 30;
  return (
    <div className={`s-hourglass${secs <= 5 && secs > 0 ? ' urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 70 104" aria-hidden>
        <defs>
          <clipPath id="hgTop"><path d="M14 10 H56 Q56 34 37 50 H33 Q14 34 14 10 Z" /></clipPath>
          <clipPath id="hgBot"><path d="M33 54 H37 Q56 70 56 94 H14 Q14 70 33 54 Z" /></clipPath>
          <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6d38a" /><stop offset="1" stopColor="#c88f3c" /></linearGradient>
        </defs>
        <path d="M14 10 H56 Q56 34 37 50 H33 Q14 34 14 10 Z M33 54 H37 Q56 70 56 94 H14 Q14 70 33 54 Z" fill="rgba(200,225,255,.12)" stroke="rgba(220,235,255,.5)" strokeWidth="1.5" />
        <rect x="10" y={topY} width="50" height="45" fill="url(#sand)" clipPath="url(#hgTop)" />
        <rect x="10" y={botY} width="50" height="45" fill="url(#sand)" clipPath="url(#hgBot)" />
        {frac > 0 && frac < 1 && <line className="s-stream" x1="35" y1="50" x2="35" y2={Math.max(56, botY)} stroke="#f0c77a" strokeWidth="1.6" />}
        <rect x="6" y="2" width="58" height="8" rx="2" fill="#5a3d1c" stroke="#2b1c0c" strokeWidth="1.5" />
        <rect x="6" y="94" width="58" height="8" rx="2" fill="#5a3d1c" stroke="#2b1c0c" strokeWidth="1.5" />
        <rect x="8" y="9" width="4" height="86" fill="#3d2912" /><rect x="58" y="9" width="4" height="86" fill="#3d2912" />
      </svg>
      <span className="s-time">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
    </div>
  );
}

/** A castle wall: one stone per locked letter. Known letters are engraved; revealed ones are cracked. */
function Wall({ stones, side, shattered, shields, team }: { stones: { l: string | null; revealed: boolean }[]; side: 'left' | 'right'; shattered: string | null; shields: number; team: Team }) {
  return (
    <div className={`s-wall ${side}`} key={`w${shields}`}>
      {/* the castle flies its own team's banner (their uploaded image) */}
      <div className="s-castle-flag" aria-hidden><i className="s-pole" /><div className={`s-flag c${team.idx}`}><Crest team={team} /></div></div>
      {shields > 0 && <div className="s-shields" aria-hidden>{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div>}
      <div className="s-stones" style={{ ['--cols' as string]: Math.min(6, Math.max(4, stones.length)) }}>
        {stones.map((s, i) => (
          <span key={`${s.l ?? 'x'}${i}`} className={`s-stone${s.revealed ? ' cracked' : ''}${s.l && s.l === shattered ? ' shatter' : ''}${!s.l ? ' blank' : ''}`}>
            {s.l ?? ''}
            {s.l && s.l === shattered && <span className="s-debris">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--a' as string]: `${k * 45 + 15}deg` }} />)}</span>}
          </span>
        ))}
        {stones.length === 0 && <span className="s-stone ghost" />}
      </div>
    </div>
  );
}

/* ───────── VFX: arrow volleys and catapult boulders, from wall to wall ───────── */
type Pt = { x: number; y: number };
type Fx = { id: number; kind: 'volley' | 'boulder' | 'miss'; from: Pt; to: Pt };
const center = (el: Element | null | undefined): Pt | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const FxShot = memo(function FxShot({ fx }: { fx: Fx }) {
  const dx = fx.to.x - fx.from.x, dy = fx.to.y - fx.from.y;
  const style = { left: fx.from.x, top: fx.from.y, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` } as React.CSSProperties;
  if (fx.kind === 'boulder') return <><i className="s-boulder" style={style} /><i className="s-impact" style={{ left: fx.to.x, top: fx.to.y }} /></>;
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className={`s-arrow${fx.kind === 'miss' ? ' miss' : ''}`} style={{ ...style, ['--d' as string]: `${i * 0.05}s`, ['--off' as string]: `${(i - 3) * 9}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` }} />
      ))}
    </>
  );
});

/* ───────── main ───────── */

export function TeamSiege({ state, token, msLeft, act }: PhaseProps) {
  const t = useT();
  const phase = state.room.phase;
  const me = state.me;
  const teams = state.teams ?? [];
  const myTeam = teams.find((x) => x.id === me?.team_id) ?? teams[0];
  const enemy = teams.find((x) => x.id !== myTeam?.id);
  const canPlay = !!me && !me.eliminated && !!token && !!me.team_id;
  const tx = useTeamExtra(token, !!me?.team_id);
  const total = phase === 'answer' ? state.room.answer_seconds : PHASE_SECS[phase] ?? 0;
  const secs = Math.ceil(msLeft / 1000);
  const members = (tm?: Team) => state.players.filter((p) => tm && p.team_id === tm.id);
  const enemyRef: PublicPlayer | undefined = members(enemy)[0];

  /* walls */
  const ourStones = useMemo(() => {
    if (me?.team_id === myTeam?.id && me) return me.letters.map((l) => ({ l: l.hidden ? null : l.letter, revealed: !!l.revealed }));
    const ref = members(myTeam)[0];
    return Array.from({ length: myTeam?.letter_count ?? 0 }, (_, i) => ({ l: ref?.revealed[i] ?? null, revealed: !!ref?.revealed[i] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.letters, myTeam?.letter_count, state.players]);
  const theirStones = useMemo(() => Array.from({ length: enemy?.letter_count ?? 0 }, (_, i) => ({ l: enemyRef?.revealed[i] ?? null, revealed: !!enemyRef?.revealed[i] })), [enemy?.letter_count, enemyRef?.revealed]);

  /* answer */
  const lang = state.room.settings.lang ?? 'en';
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const banned = useMemo(() => new Set(me?.letters.map((l) => l.letter) ?? []), [me?.letters]);
  const prepared = prepareAnswer(word, lang);
  const typed = prepared.letters.toUpperCase().split('');
  const isBad = (c: string) => !me?.hacked && banned.has(c);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { setWord(''); setPick(null); if (phase === 'answer') window.setTimeout(() => inputRef.current?.focus(), 300); }, [state.room.round, phase]);
  async function submitWord() {
    if (!token || !prepared.send || busy) return;
    setBusy(true); audio.unlock();
    await act(() => rpc.answer(token, prepared.send));
    setBusy(false);
  }

  /* guess (focus fire) */
  const myCall = tx?.calls.find((c) => c.caller_id === me?.id && !c.resolved);
  const target = members(enemy).find((p) => !p.eliminated);
  async function fire(l: string) {
    if (!token || !target || busy) return;
    setBusy(true); audio.unlock();
    await act(() => rpc.guess(token, target.id, l));
    setBusy(false);
  }

  /* king's rally */
  const isKing = !!me && myTeam?.leader_id === me.id;
  const rallyNow = !!tx?.rallies?.includes(myTeam?.id ?? '');
  const enemyRally = !!tx?.rallies?.includes(enemy?.id ?? '');
  async function rally() { if (!token) return; audio.unlock(); await act(() => rpc.teamRally(token)); }

  /* effects */
  const [fxs, setFxs] = useState<Fx[]>([]);
  const [shatterL, setShatterL] = useState<string | null>(null), [shatterR, setShatterR] = useState<string | null>(null);
  const [shieldL, setShieldL] = useState(0), [shieldR, setShieldR] = useState(0);
  const [quake, setQuake] = useState(0);
  const lWall = useRef<HTMLDivElement>(null), rWall = useRef<HTMLDivElement>(null);
  function shoot(kind: Fx['kind'], fromLeft: boolean, delay = 0) {
    const from = center(fromLeft ? lWall.current : rWall.current), to = center(fromLeft ? rWall.current : lWall.current);
    if (!from || !to) return;
    window.setTimeout(() => {
      const f = { id: Date.now() + Math.random(), kind, from, to };
      setFxs((v) => [...v.slice(-5), f]);
      window.setTimeout(() => setFxs((v) => v.filter((x) => x.id !== f.id)), 1600);
    }, delay);
  }
  const prev = useRef<{ theirRev: number; ourRev: number; pend: string; phase: string; rally: boolean; enemyRally: boolean } | null>(null);
  useEffect(() => {
    const pendKey = state.pending.map((p) => `${p.id}:${p.status}`).join(',');
    const cur = { theirRev: enemyRef?.revealed.length ?? 0, ourRev: ourStones.filter((s) => s.revealed).length, pend: pendKey, phase, rally: rallyNow, enemyRally };
    const p = prev.current; prev.current = cur;
    if (!p) return;
    if (cur.theirRev > p.theirRev) { audio.volley(); shoot('volley', true); window.setTimeout(() => { audio.shatter(); setShatterR(enemyRef?.revealed[enemyRef.revealed.length - 1] ?? null); }, 650); }
    if (cur.ourRev > p.ourRev) {
      audio.volley(); shoot('volley', false);
      const hit = ourStones.filter((s) => s.revealed).map((s) => s.l).pop() ?? null;
      window.setTimeout(() => { audio.shatter(); setShatterL(hit); setQuake(Date.now()); }, 650);
    }
    if (cur.pend !== p.pend) {
      const before = new Map(p.pend.split(',').filter(Boolean).map((x) => x.split(':') as [string, string]));
      state.pending.forEach((pd) => {
        const toUs = state.players.find((x) => x.id === pd.target_id)?.team_id === myTeam?.id;
        const was = before.get(String(pd.id));
        if (!was) { audio.catapult(); shoot('boulder', !toUs); window.setTimeout(() => { audio.boulder(); if (toUs) setQuake(Date.now()); }, 900); }
        else if (was !== 'blocked' && pd.status === 'blocked') { audio.clang(); if (toUs) setShieldL(Date.now()); else setShieldR(Date.now()); }
      });
    }
    if (cur.rally && !p.rally) audio.horn();
    if (cur.enemyRally && !p.enemyRally) audio.horn(true);
    if (cur.phase === 'answer' && p.phase !== 'answer') audio.drums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemyRef?.revealed.length, ourStones, state.pending, phase, rallyNow, enemyRally]);
  // my lone call resolving as a miss: arrows fall short
  const missKey = tx?.calls.filter((c) => c.resolved && !c.correct).map((c) => c.letter).join('');
  const lastMiss = useRef('');
  useEffect(() => {
    if (missKey && missKey !== lastMiss.current && lastMiss.current !== '') { audio.volley(); shoot('miss', true); }
    lastMiss.current = missKey ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missKey]);

  /* keep the command bar above the rack */
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rack = document.querySelector('.rack-inner');
    const set = () => rootRef.current?.style.setProperty('--rack-h', `${rack ? (rack as HTMLElement).offsetHeight + 14 : 0}px`);
    set();
    if (!rack) return;
    const ro = new ResizeObserver(set); ro.observe(rack);
    return () => ro.disconnect();
  });

  if (!myTeam || !enemy) return null;
  const a = myTeam.points, b = enemy.points;
  const tug = a + b > 0 ? a / (a + b) : 0.5;

  /* the scroll in the middle */
  let scroll: React.ReactNode;
  if (phase === 'answer') scroll = <span className="s-scroll-big">{state.prompt}</span>;
  else if (phase === 'reveal') scroll = <span className="s-scroll-mid">{t('sg.words_in')}</span>;
  else if (phase === 'guess') scroll = <span className="s-scroll-mid">{t('sg.call_two')}</span>;
  else scroll = <span className="s-scroll-mid">{t('sg.brace')}</span>;

  /* command bar */
  let plate = t('sg.war_council');
  let bar: React.ReactNode = null;
  if (!canPlay) {
    bar = <div className="s-bar-msg">{t('tm.spec_team')}</div>;
  } else if (phase === 'answer') {
    plate = t('sg.your_word');
    const boxes = Math.max(7, typed.length + (typed.length < 12 ? 1 : 0));
    bar = (
      <form className="s-answer" onSubmit={(e) => { e.preventDefault(); void submitWord(); }}>
        <label className="s-tiles" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: boxes }, (_, i) => {
            const c = typed[i];
            return <span key={i} className={`s-tile${c ? ' on' : ''}${c && isBad(c) ? ' bad' : ''}${i === typed.length ? ' caret' : ''}`}>{c ?? ''}</span>;
          })}
          <input ref={inputRef} className="s-hidden-input" value={word} maxLength={30} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
            lang={lang} aria-label={t('ph.your_answer')} onChange={(e) => { setWord(e.target.value); void rpc.setDraft(token!, e.target.value).catch(() => undefined); }} />
        </label>
        <div className="s-foot">
          <span className={`s-status${me.answer ? (me.answer.valid ? ' ok' : ' bad') : ''}`}>
            {me.answer ? (me.answer.valid ? t('sg.sealed', { n: me.answer.points }) : `${me.answer.word ? me.answer.word.toUpperCase() : ''} · ${REASONS[me.answer.reason ?? ''] ?? me.answer.reason ?? ''}`)
              : typed.some(isBad) ? t('ph.banned') : t('tm.teammates')}
          </span>
          {isKing && tx?.rally_used === false && <button type="button" className="s-horn-btn" onClick={() => void rally()} title={t('sg.rally_tip')}>📯 {t('sg.rally')}</button>}
          {rallyNow && <span className="s-rally-on">{t('sg.rally_on')}</span>}
          <button className="s-fire" disabled={!prepared.send || busy}>{me.answer ? t('ph.change') : t('sg.seal')}</button>
        </div>
      </form>
    );
  } else if (phase === 'guess') {
    plate = t('sg.call');
    bar = me.guess ? (
      <div className={`s-bar-msg ${me.guess.correct ? 'ok' : 'bad'}`}>{me.guess.correct ? t('sg.breach', { l: me.guess.letter }) : t('sg.held', { l: me.guess.letter })}</div>
    ) : myCall ? (
      <div className="s-bar-msg">{t('tf.called', { l: myCall.letter })}</div>
    ) : (
      <div className="s-answer">
        <div className="s-keys">
          {ALPHABET.map((l) => <button key={l} type="button" className={`s-key${pick === l ? ' sel' : ''}`} disabled={!!enemyRef?.revealed.includes(l)} onClick={() => setPick(l)}>{l}</button>)}
        </div>
        <div className="s-foot">
          <span className="s-status">{pick ? t('sg.aim', { l: pick, team: teamLabel(t, enemy) }) : t('wst.pick')}</span>
          <button className="s-fire" disabled={!pick || busy} onClick={() => pick && void fire(pick)}>{t('sg.fire')}</button>
        </div>
      </div>
    );
  } else if (phase === 'react') {
    plate = t('sg.hold');
    const ready = state.players.find((p) => p.id === me.id)?.react_ready;
    bar = (
      <div className="s-foot center">
        <span className="s-status">{t('ph.cards_note')}</span>
        <button className="s-fire" disabled={!!ready} onClick={() => token && void act(() => rpc.reactReady(token))}>{ready ? t('wst.ready') : t('sg.hold')}</button>
      </div>
    );
  } else {
    bar = <div className="s-bar-msg">{t('sg.words_in')}</div>;
  }

  // focus fire gives every caller a guess row; show each breach once
  const breaches = state.guess_results.filter((g, i, all) => g.correct && all.findIndex((x) => x.correct && x.letter === g.letter
    && state.players.find((p) => p.id === x.target_id)?.team_id === state.players.find((p) => p.id === g.target_id)?.team_id) === i);
  const reveal = (id: string) => state.reveal.find((r) => r.player_id === id);

  return (
    <div ref={rootRef} className={`siege p-${phase}${secs <= 5 && secs > 0 ? ' tense' : ''}${rallyNow ? ' rally-l' : ''}${enemyRally ? ' rally-r' : ''}`} style={siegeArtVars}>
      <div className="s-embers" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="s-vignette" aria-hidden />
      <div className="s-fx" aria-hidden>{fxs.map((f) => <FxShot key={f.id} fx={f} />)}</div>
      {quake > 0 && <div key={`q${quake}`} className="s-hurt" aria-hidden />}

      <div className="s-top">
        <TeamBanner state={state} team={myTeam} side="left" mine rally={rallyNow} />
        <div className="s-center-top">
          <Hourglass msLeft={msLeft} total={total} />
          <div className="s-tug" aria-label={`${a} to ${b}`}>
            <b className="s-score c0">{a}</b>
            <div className="s-rope"><motion.i className="s-knot" animate={{ left: `${(1 - tug) * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} /></div>
            <b className="s-score c1">{b}</b>
          </div>
          <span className="s-round">{t('tm.round_of', { n: Math.max(1, state.room.round), m: state.room.settings.rounds ?? 5 })}</span>
        </div>
        <TeamBanner state={state} team={enemy} side="right" mine={false} rally={enemyRally} />
      </div>

      <div className="s-field">
        <div ref={lWall} className="s-wall-slot left"><Wall stones={ourStones} side="left" shattered={shatterL} shields={shieldL} team={myTeam} /></div>
        <div className="s-mid">
          <motion.div className="s-scroll" key={`${phase}-${state.room.round}`} initial={{ scaleX: 0.2, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 18 }}>
            {scroll}
          </motion.div>
          {phase === 'reveal' && (
            <div className="s-reveals">
              {[myTeam, enemy].map((tm) => (
                <div key={tm.id} className={`s-rev c${tm.idx}`}>
                  {members(tm).map((p) => {
                    const r = reveal(p.id);
                    return (
                      <motion.div key={p.id} className={`s-rev-row${r?.valid ? '' : ' bad'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        <span>{p.id === me?.id ? t('du.you') : p.name}</span><b>{r?.word ? r.word.toUpperCase() : '—'}</b><em>{r?.valid ? `+${r.points}` : ''}</em>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {phase === 'guess' && canPlay && tx && (
            <div className="s-intel">
              {tx.intel && (
                <div className={`s-note ${tx.intel.kind}`}>
                  <span className="s-note-h">{t('tf.intel')}</span>
                  <span>{tx.intel.kind === 'suspects' ? t('tf.suspects') : t('tf.clean')}</span>
                  <div className="s-note-letters">{tx.intel.letters.map((l) => <b key={l}>{l}</b>)}</div>
                  <em>{t('tf.share')}</em>
                </div>
              )}
              <div className="s-note calls">
                <span className="s-note-h">{t('tf.calls')}</span>
                {tx.calls.length === 0 && <em>{t('tf.no_calls')}</em>}
                {tx.calls.map((c) => (
                  <div key={c.caller_id} className={`s-call${c.resolved ? (c.correct ? ' ok' : ' bad') : ''}`}>
                    <b>{c.letter}</b><span>{c.caller_id === me?.id ? t('du.you') : nameOf(state, c.caller_id)}</span>
                    <em>{c.resolved ? (c.correct ? t('tf.cracked') : t('tf.missed')) : t('tf.waiting')}</em>
                    {!me?.guess && !myCall && !c.resolved && c.caller_id !== me?.id && <button className="s-back" onClick={() => void fire(c.letter)}>{t('tf.backup')}</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {phase === 'react' && (
            <ul className="s-log">
              {breaches.map((g, i) => <li key={`g${i}`}>{t('sg.log_breach', { team: teamLabel(t, teams.find((x) => x.id === state.players.find((p) => p.id === g.target_id)?.team_id)), l: g.letter ?? '' })}</li>)}
              {state.pending.map((p) => <li key={`p${p.id}`}>{t('sg.log_catapult', { n: p.amount, team: teamLabel(t, teams.find((x) => x.id === state.players.find((q) => q.id === p.target_id)?.team_id)) })}{p.status === 'blocked' ? ` · ${t('sg.blocked')}` : ''}</li>)}
              {breaches.length === 0 && state.pending.length === 0 && <li>{t('sg.quiet')}</li>}
            </ul>
          )}
        </div>
        <div ref={rWall} className="s-wall-slot right"><Wall stones={theirStones} side="right" shattered={shatterR} shields={shieldR} team={enemy} /></div>
      </div>

      <div className="s-bar">
        <div className="s-plate">{plate}</div>
        {bar}
      </div>
    </div>
  );
}

/* ───────── finale: flag on the enemy keep, or ruins ───────── */
export function SiegeFinale({ state, token, act }: Omit<PhaseProps, 'msLeft'>) {
  const t = useT();
  const teams = state.teams ?? [];
  const win = teams.find((x) => x.idx === state.room.winner_team);
  const mine = teams.find((x) => x.id === state.me?.team_id);
  const iWon = !!win && !!mine && win.id === mine.id;
  const iLost = !!win && !!mine && win.id !== mine.id;
  const isHost = state.me?.id === state.room.host_id;
  useEffect(() => {
    const id = window.setTimeout(() => (iLost ? audio.siegeLose() : audio.siegeWin()), 500);
    return () => window.clearTimeout(id);
  }, [iLost]);
  const shown = iLost ? mine! : win ?? teams[0];
  return (
    <div className={`siege p-finished${iLost ? ' lost' : ' won'}`} style={siegeArtVars}>
      <div className="s-embers" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="s-vignette" aria-hidden />
      {!iLost && shown && (
        <motion.div className="s-keep-flag" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 1.6, ease: 'easeOut' }} aria-hidden>
          <i className="s-pole" /><div className={`s-flag big c${shown.idx}`}><Crest team={shown} /></div>
        </motion.div>
      )}
      <div className="s-final">
        <motion.div className={`s-verdict${iLost ? ' lost' : ''}`} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 160, damping: 16 }}>
          {win ? (iWon ? t('sg.victory') : iLost ? t('sg.defeat') : t('tm.win', { team: teamLabel(t, win) })) : t('tm.draw')}
        </motion.div>
        <div className="s-final-sub">{win ? (iLost ? t('sg.ruins', { team: teamLabel(t, win) }) : t('sg.flag', { team: teamLabel(t, win) })) : t('tm.draw')}</div>
        <div className="s-final-teams">
          {teams.map((tm) => (
            <div key={tm.id} className={`s-final-team c${tm.idx}${win?.id === tm.id ? ' win' : ''}`}>
              <div className={`s-flag c${tm.idx}`}><Crest team={tm} /></div>
              <b>{teamLabel(t, tm)}</b><span>{tm.points} {t('tm.pts')} · {t('tm.locks', { n: tm.letter_count })}</span>
            </div>
          ))}
        </div>
        <div className="s-bar">
          <div className="s-plate">{iLost ? t('sg.again_q') : t('tm.final')}</div>
          <div className="s-foot center">
            {isHost && token
              ? <button className="s-fire" onClick={() => void act(() => rpc.playAgain(token))}>{iLost ? t('sg.retake') : t('sg.again')}</button>
              : <span className="s-status">{t('fn.wait')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
