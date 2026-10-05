'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CARD_INFO, CHAOS_INFO, CLASSES } from '@/lib/classes';
import { REASONS } from '@/lib/errors';
import { prepareAnswer } from '@/lib/answer';
import { Rich, useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import type { RoomState } from '@/lib/types';
import { CLASS_COLORS, CardIcon, ClassIcon, Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';
import { TeamImage, teamLabel, teamOf } from './team';
import { GameSummary } from './GameSummary';
import { Avatar, Clock, nameOf, softSpring, spring, TileRow } from './ui';

export type Act = <T>(fn: () => Promise<T>, okMsg?: string) => Promise<T | undefined>;

export interface PhaseProps {
  state: RoomState;
  token: string | null;
  msLeft: number;
  act: Act;
}

/** Target label: the team's name in team mode (attacks and guesses land on the whole team), else the player's name. */
function tn(state: RoomState, t: ReturnType<typeof useT>, id: string | null | undefined): string {
  if (state.room.settings.mode === 'team') { const tm = teamOf(state, id); if (tm) return teamLabel(t, tm); }
  return nameOf(state, id);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const stagger = (i: number, step = 0.08) => ({ ...softSpring, delay: i * step });

function StageHead({ state, label, msLeft, showClock = true }: { state: RoomState; label: string; msLeft: number; showClock?: boolean }) {
  const t = useT();
  return (
    <div className="stage-head">
      <span className={`phase-tag${state.room.duel ? ' duel' : ''}`}>
        {state.room.duel && <Icon name="swords" size={14} />}
        {state.room.duel ? `${state.room.settings.mode === 'duel' ? t('ph.1v1') : t('ph.final_duel')} · ` : ''}{state.room.settings.mode === 'team' ? t('tm.round_of', { n: state.room.round, m: state.room.settings.rounds ?? 5 }) : t('ph.round', { n: state.room.round })} · {label}
      </span>
      {state.room.chaos && (
        <motion.span className="chaos-chip" title={CHAOS_INFO[state.room.chaos]?.text}
          initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
          <Icon name="dice" size={14} /> {CHAOS_INFO[state.room.chaos]?.name}
        </motion.span>
      )}
      {showClock && <Clock msLeft={msLeft} />}
    </div>
  );
}

function Hints({ state }: { state: RoomState }) {
  const t = useT();
  if (state.hints.length === 0) return null;
  return (
    <div className="col" style={{ gap: 6, width: '100%', maxWidth: 620, margin: '0 auto' }}>
      {state.hints.map((h, i) => (
        <motion.div key={i} className="hint" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i)}>
          <Icon name="eye" size={16} /> {t('ph.hint', { n: h.round, text: /locked out of "(.)"/.exec(h.text) ? t('ph.leak', { l: /locked out of "(.)"/.exec(h.text)![1] }) : h.text })}
        </motion.div>
      ))}
    </div>
  );
}

function Spectating({ text }: { text: string }) {
  return <div className="note info" style={{ justifyContent: 'center' }}><Icon name="eye" size={18} /> {text}</div>;
}

/* ───────────── ANSWER ───────────── */
export function AnswerPhase({ state, token, msLeft, act }: PhaseProps) {
  const t = useT();
  const me = state.me;
  const [word, setWord] = useState('');
  const lang = state.room.settings.lang ?? 'en';
  const [busy, setBusy] = useState(false);
  const [bonus, setBonus] = useState<{ word: string; speed: number; streak: number; run: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const banned = useMemo(() => new Set(me?.letters.map((l) => l.letter) ?? []), [me?.letters]);

  useEffect(() => { setWord(''); inputRef.current?.focus(); }, [state.room.round]);

  const prepared = prepareAnswer(word, lang);
  const clean = prepared.letters;
  const noE = state.room.chaos === 'no_e';
  const twist = state.room.settings.twist ?? 'none';
  const reverse = twist === 'reverse';
  const memory = twist === 'memory';
  const letters = clean.toUpperCase().split('');
  const isBad = (c: string) => (!me?.hacked && !reverse && !memory && banned.has(c)) || (noE && c === 'E');
  const needLock = reverse && !me?.hacked && banned.size > 0 && letters.length > 0 && !letters.some((c) => banned.has(c));
  const hasBanned = letters.some(isBad);
  const canPlay = !!me && !me.eliminated && !!token;

  async function submit() {
    if (!token || !prepared.send || busy) return;
    setBusy(true);
    const r = await act(() => rpc.answer(token, prepared.send));
    setBonus(r?.valid ? { word: r.word, speed: r.speed_bonus ?? 0, streak: r.streak_bonus ?? 0, run: r.streak ?? 0 } : null);
    setBusy(false);
  }

  return (
    <>
      <StageHead state={state} label={t('ph.answer')} msLeft={msLeft} />
      {state.room.settings.mode === 'team' && state.room.round === 1 && (
        <div className="note info" style={{ justifyContent: 'center' }}><Icon name="users" size={16} /> {t('tm.hint')}</div>
      )}
      <div className="prompt-kicker label">{t('ph.prompt')}</div>
      <motion.h1 className="prompt" initial={{ opacity: 0, scale: 0.85, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={softSpring}>
        {state.prompt}
      </motion.h1>
      {(reverse || memory) && state.room.round >= 1 && (
        <div className="note info" style={{ maxWidth: 620, margin: '0 auto', width: '100%', justifyContent: 'center' }}>
          <Icon name={reverse ? 'lock' : 'eye'} size={16} /> {reverse ? t('tw.reverse_note') : t('tw.memory_note')}
        </div>
      )}
      {state.room.chaos && ['no_e', 'double', 'speed'].includes(state.room.chaos) && (
        <motion.div className="note chaos" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Icon name="dice" size={16} /> <span><b>{CHAOS_INFO[state.room.chaos]?.name}:</b> {CHAOS_INFO[state.room.chaos]?.text}</span>
        </motion.div>
      )}
      {state.players.filter((p) => p.oracle_word && p.id !== me?.id).map((p) => (
        <div key={p.id} className="note oracle" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}>
          <Icon name="orb" size={16} /> <span><Rich k="ph.oracle_locked" vars={{ name: p.name, word: p.oracle_word!.toUpperCase() }} /></span>
        </div>
      ))}
      {canPlay && me.hacked && (
        <motion.div className="note hack" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1, x: [0, -3, 3, 0] }} transition={{ x: { repeat: 3, duration: 0.2 } }}>
          <Icon name="terminal" size={16} /> {me.can_trace ? t('ph.hacked_trace') : t('ph.hacked')}
        </motion.div>
      )}
      {canPlay ? (
        <div className="narrow-col">
          <form className="col" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input ref={inputRef} className="input word" value={word} maxLength={30} autoCapitalize="off" autoComplete="off"
              autoCorrect="off" spellCheck={false} placeholder={t('ph.type')} lang={lang}
              onChange={(e) => setWord(e.target.value)} aria-label={t('ph.your_answer')} />
            {(lang === 'ja' || lang === 'zh' || lang === 'es' || lang === 'fr' || lang === 'de') && (
              <div className="muted small input-hint">{lang === 'ja' ? t('ph.input_ja') : lang === 'zh' ? t('ph.input_zh') : t('ph.input_accents')}</div>
            )}
            <div className="word-preview" aria-hidden>
              <AnimatePresence initial={false} mode="popLayout">
                {clean.toUpperCase().split('').map((c, i) => (
                  <motion.span key={`${i}-${c}`} layout className={`ch${isBad(c) ? ' bad' : reverse && banned.has(c) ? ' must' : ''}`}
                    initial={{ y: -10, opacity: 0, scale: 0.6 }}
                    animate={isBad(c) ? { y: 0, opacity: 1, scale: 1, x: [0, -4, 4, -3, 0] } : { y: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: 0.22 }}>
                    {c}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {(hasBanned || needLock) && (
                <motion.div className="note bad" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Icon name="alert" size={16} /> {needLock ? t('ph.need_lock') : t('ph.banned')}
                </motion.div>
              )}
            </AnimatePresence>
            <button className="btn lg block" disabled={!prepared.send || busy}>{me.answer ? t('ph.change') : t('ph.lock')}</button>
            {me.class === 'gambler' && state.room.settings.perks && (
              <motion.button type="button" className={`btn block gamble${me.bet_active ? ' on' : ''}`} disabled={me.bet_active}
                whileTap={{ scale: 0.96 }} animate={me.bet_active ? { rotate: [0, -2, 2, 0] } : {}}
                onClick={() => token && void act(() => rpc.usePerk(token, null), t('ph.allin_ok'))}>
                <Icon name="coin" size={18} /> {me.bet_active ? t('ph.allin_on') : t('ph.allin')}
              </motion.button>
            )}
          </form>
          <AnimatePresence mode="wait">
            {me.answer && (
              <motion.div key={`${me.answer.word}-${me.answer.valid}`} className={`note ${me.answer.valid ? 'ok' : 'bad'}`}
                initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
                <Icon name={me.answer.valid ? 'check' : 'x'} size={16} />
                <span>{me.answer.valid
                  ? <Rich k="ph.locked_in" vars={{ word: me.answer.word.toUpperCase(), n: me.answer.points }} />
                  : <Rich k="ph.rejected" vars={{ word: me.answer.word ? me.answer.word.toUpperCase() : t('ph.that'), reason: REASONS[me.answer.reason ?? ''] ?? me.answer.reason }} />}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {me.answer?.valid && bonus && bonus.word === me.answer.word && (bonus.speed > 0 || bonus.streak > 0) && (
            <div className="bonus-chips">
              {bonus.speed > 0 && <span className="bchip speed"><Icon name="bolt" size={13} /> {t('ph.bonus_speed', { n: bonus.speed })}</span>}
              {bonus.streak > 0 && <span className="bchip streak"><Icon name="burst" size={13} /> {t('ph.bonus_streak', { s: bonus.run, n: bonus.streak })}</span>}
            </div>
          )}
          {me.used_words.length > 0 && <div className="muted small center">{t('ph.used', { list: me.used_words.join(', ') })}</div>}
        </div>
      ) : (
        <Spectating text={t('ph.spec_answer')} />
      )}
      <Hints state={state} />
    </>
  );
}

/* ───────────── REVEAL ───────────── */
export function RevealPhase({ state, msLeft }: PhaseProps) {
  const t = useT();
  return (
    <>
      <StageHead state={state} label={t('ph.reveal')} msLeft={msLeft} />
      <h2 className="stage-title">“{state.prompt}”</h2>
      <div className="reveal-list">
        {state.reveal.map((r, i) => {
          const p = state.players.find((x) => x.id === r.player_id);
          return (
            <motion.div key={r.player_id} className={`reveal-row${r.valid ? '' : ' bad'}`}
              initial={{ opacity: 0, rotateX: -90, y: 10 }} animate={{ opacity: 1, rotateX: 0, y: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.35 }} style={{ transformPerspective: 600 }}>
              <Avatar state={state} id={r.player_id} size={36} />
              <div>
                <div className="small muted">{p?.name}</div>
                <div className="word">{r.word ? r.word.toUpperCase() : '— — —'}</div>
                {!r.valid && (
                  <div className="why"><Icon name="x" size={13} strokeWidth={3} /> {REASONS[r.reason ?? ''] ?? r.reason} · {t('ph.strike')}{p?.eliminated ? ` · ${t('ph.eliminated')}` : ''}</div>
                )}
              </div>
              <motion.div className="score" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.35 + i * 0.35 }}
                style={{ color: r.valid ? 'var(--ok)' : 'var(--lock)' }}>
                {r.valid ? `+${r.points}` : <Icon name={p?.eliminated ? 'skull' : 'x'} size={24} strokeWidth={2.6} />}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

/* ───────────── GUESS ───────────── */
export function GuessPhase({ state, token, msLeft, act }: PhaseProps) {
  const t = useT();
  const me = state.me;
  const [target, setTarget] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const targets = state.players.filter((p) => !p.eliminated && p.id !== me?.id && !(state.room.settings.mode === 'team' && p.team_id === me?.team_id));
  const tp = targets.find((p) => p.id === target);
  const canPlay = !!me && !me.eliminated && !!token;

  useEffect(() => { setTarget(null); setLetter(null); }, [state.room.round]);

  return (
    <>
      <StageHead state={state} label={t('ph.guess')} msLeft={msLeft} />
      <h2 className="stage-title">{t('ph.crack')}</h2>
      <p className="muted center" style={{ margin: 0 }}>{t('ph.crack_sub')}</p>
      <Hints state={state} />
      {!canPlay ? (
        <Spectating text={t('ph.spec_guess')} />
      ) : me.guess ? (
        <motion.div className={`note ${me.guess.correct ? 'ok' : 'bad'}`} style={{ maxWidth: 560, margin: '0 auto' }}
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <Icon name={me.guess.correct ? 'target' : 'miss'} size={18} />
          <span>{me.guess.correct
            ? <Rich k="ph.cracked" vars={{ name: tn(state, t, me.guess.target_id), l: me.guess.letter }} />
            : t('ph.miss', { name: tn(state, t, me.guess.target_id), l: me.guess.letter })}</span>
        </motion.div>
      ) : (
        <div className="narrow-col">
          <div className="targets">
            {targets.map((p, i) => (
              <motion.button key={p.id} className={`target${target === p.id ? ' sel' : ''}`} onClick={() => setTarget(p.id)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i, 0.05)} whileTap={{ scale: 0.95 }}>
                <PlayerAvatar p={p} size={28} /> {p.name}
                <span className="muted small" style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Icon name="lock" size={12} />{p.letter_count}</span>
              </motion.button>
            ))}
          </div>
          <div className="kbd">
            {ALPHABET.map((l, i) => (
              <motion.button key={l} className={`key${letter === l ? ' sel' : ''}`} disabled={!tp || tp.revealed.includes(l)}
                onClick={() => setLetter(l)} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: letter === l ? 1.08 : 1 }}
                transition={{ ...spring, delay: i * 0.012 }} whileTap={{ scale: 0.9 }}>{l}</motion.button>
            ))}
          </div>
          <button className="btn lg block" disabled={!target || !letter}
            onClick={() => target && letter && token && void act(() => rpc.guess(token, target, letter))}>
            <Icon name="target" size={20} /> {tp && letter ? t('ph.guess_btn', { l: letter, name: tp.name }) : t('ph.pick')}
          </button>
        </div>
      )}
    </>
  );
}

/* ───────────── REACT ───────────── */
export function ReactPhase({ state, token, msLeft, act }: PhaseProps) {
  const t = useT();
  const me = state.me;
  const canPlay = !!me && !me.eliminated && !!token;
  const myReady = state.players.find((p) => p.id === me?.id)?.react_ready;
  const teamMode = state.room.settings.mode === 'team';
  const aimedAtMe = state.pending.some((p) => p.status === 'pending' && (teamMode ? state.players.find((x) => x.id === p.target_id)?.team_id === me?.team_id : p.target_id === me?.id));
  let i = 0;

  return (
    <>
      <StageHead state={state} label={t('ph.cards')} msLeft={msLeft} />
      <h2 className="stage-title">{t('ph.play_cards')}</h2>
      <div className="feed">
        {state.guess_results.length === 0 && state.pending.length === 0 && (
          <div className="feed-item muted"><span className="glyph miss"><Icon name="miss" size={16} /></span><span className="txt">{t('ph.quiet')}</span></div>
        )}
        {state.guess_results.map((g) => (
          <motion.div key={`g-${g.guesser_id}`} className="feed-item" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i++)}>
            <span className={`glyph ${g.correct ? 'good' : 'miss'}`}><Icon name={g.correct ? 'target' : 'miss'} size={16} /></span>
            <span className="txt">{g.correct
              ? <Rich k="ph.feed_cracked" vars={{ a: nameOf(state, g.guesser_id), b: tn(state, t, g.target_id), l: g.letter ?? '' }} />
              : <Rich k="ph.feed_missed" vars={{ a: nameOf(state, g.guesser_id), b: tn(state, t, g.target_id) }} />}</span>
          </motion.div>
        ))}
        <AnimatePresence initial={false}>
          {state.pending.map((p) => (
            <motion.div key={`p-${p.id}`} layout className={`feed-item${p.status === 'blocked' ? ' blocked' : ''}`}
              initial={{ opacity: 0, x: 30, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={stagger(i++)}>
              <span className={`glyph ${p.status === 'blocked' ? 'block' : 'hit'}`}>
                <Icon name={p.status === 'blocked' ? 'shield' : p.kind === 'ninja' ? 'eye' : p.kind === 'hack' ? 'terminal' : 'burst'} size={16} />
              </span>
              <span className="txt">
                {p.kind === 'ninja'
                  ? <Rich k="ph.ninja_pen" vars={{ name: tn(state, t, p.target_id), n: p.amount }} />
                  : p.kind === 'hack'
                  ? <Rich k="ph.hacks" vars={{ a: p.source_id ? nameOf(state, p.source_id) : t('ph.someone'), b: tn(state, t, p.target_id), n: p.amount }} />
                  : <Rich k="ph.attacks" vars={{ a: p.source_id ? nameOf(state, p.source_id) : p.source_class ? t('ph.the_cls', { cls: CLASSES[p.source_class].name }) : t('ph.someone'), b: tn(state, t, p.target_id), n: p.amount }} />}
                {p.absorbed_by && t('ph.absorbed_by', { name: nameOf(state, p.absorbed_by) })}
                {p.status === 'blocked' && t('ph.blocked')}
              </span>
              {canPlay && me.class === 'hero' && !me.perk_used && state.room.settings.perks && p.status === 'pending' && (state.room.settings.mode === 'team' ? state.players.find((x) => x.id === p.target_id)?.team_id === me.team_id : p.target_id !== me.id) && (
                <button className="btn sm ok" onClick={() => token && void act(() => rpc.usePerk(token, p.target_id), t('ph.absorbed_ok'))}>
                  {t('ph.take_hit')}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {canPlay && aimedAtMe && me.cards.some((c) => c.kind === 'shield') && me.class !== 'villain' && (
          <motion.div className="note bad" style={{ maxWidth: 620, margin: '0 auto', width: '100%' }}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: [1, 1.03, 1] }} exit={{ opacity: 0 }}
            transition={{ scale: { repeat: Infinity, duration: 1.2 } }}>
            <Icon name="alert" size={16} /> {t('ph.under_attack')}
          </motion.div>
        )}
      </AnimatePresence>
      {canPlay && (
        <div className="narrow-col">
          <button className="btn ghost block" disabled={!!myReady} onClick={() => token && void act(() => rpc.reactReady(token))}>
            {myReady ? t('ph.waiting') : t('ph.skip')}
          </button>
        </div>
      )}
      <p className="muted small center" style={{ margin: 0 }}>{t('ph.cards_note')}</p>
    </>
  );
}

/* ───────────── DUEL INTRO ───────────── */
export function DuelIntro({ state, msLeft }: PhaseProps) {
  const t = useT();
  const [a, b] = state.players.filter((p) => !p.eliminated);
  if (!a || !b) return null;
  const oneVone = state.room.settings.mode === 'duel';
  const count = Math.ceil(msLeft / 1000);
  return (
    <div className="duel-stage">
      <motion.div className="phase-tag duel" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Icon name="swords" size={14} /> {oneVone ? t('du.1v1') : t('du.final')}
      </motion.div>
      <AnimatePresence>
        {count <= 3 && count >= 1 && (
          <motion.div key={count} className="duel-count" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 20 }}>{count}</motion.div>
        )}
        {count <= 0 && (
          <motion.div key="fight" className="duel-count fight" initial={{ scale: 4, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}>{t('du.fight')}</motion.div>
        )}
      </AnimatePresence>
      <div className="fighters">
        <motion.div className="fighter" initial={{ x: -160, opacity: 0, rotate: -12 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: 0.1 }}>
          <PlayerAvatar p={a} size={110} /><b>{a.name}</b><span className="muted">{t('du.pts', { n: a.points })}</span>
        </motion.div>
        <motion.div className="vs" initial={{ scale: 4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 700, damping: 18, delay: 0.55 }}>VS</motion.div>
        <motion.div className="fighter" initial={{ x: 160, opacity: 0, rotate: 12 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ ...spring, delay: 0.25 }}>
          <PlayerAvatar p={b} size={110} /><b>{b.name}</b><span className="muted">{t('du.pts', { n: b.points })}</span>
        </motion.div>
      </div>
      <motion.div className="center muted" style={{ maxWidth: 440 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
        {t('du.rules', { n: state.room.settings.duel_seconds })}
        {[a, b].some((p) => p.class === 'hero') && <><br />{t('du.hero')}</>}
      </motion.div>
    </div>
  );
}

/* ───────────── FINISHED ───────────── */
export function Finished({ state, token, act }: PhaseProps) {
  const tt = state.titles;
  const t = useT();
  const isHost = state.me?.id === state.room.host_id;
  const winner = state.players.find((p) => p.id === state.room.winner_id);
  const teamMode = state.room.settings.mode === 'team' && (state.teams?.length ?? 0) === 2;
  const wt = teamMode ? state.teams!.find((x) => x.idx === state.room.winner_team) : undefined;
  const tie = teamMode && !wt;
  const awards = [
    { key: 'champ', icon: 'trophy' as const, color: '#ffcf4a', title: t('fn.champ'), who: tt?.champion, sub: t('fn.champ_sub') },
    { key: 'ein', icon: 'bulb' as const, color: '#b69cff', title: t('fn.ein'), who: tt?.einstein, sub: t('fn.ein_sub') },
    { key: 'vil', icon: 'horns' as const, color: '#ff7a90', title: t('fn.vil'), who: tt?.villain, sub: t('fn.vil_sub') },
  ];
  return (
    <>
      <div className="winner victory-stage">
        {teamMode && wt && (
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <TeamImage team={wt} size={120} />
          </motion.div>
        )}
        {!teamMode && winner && (
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <PlayerAvatar p={winner} size={120} badge />
          </motion.div>
        )}
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.2 }}>
          {teamMode ? (tie ? t('tm.draw') : t('tm.win', { team: teamLabel(t, wt) })) : t('fn.wins', { name: nameOf(state, state.room.winner_id) })}
        </motion.h1>
        {teamMode && (
          <div className="team-final">
            <span className="label">{t('tm.final')}</span>
            <div className="tf-row">
              {state.teams!.map((tm) => (
                <span key={tm.id} className={`tf-team${wt?.id === tm.id ? ' win' : ''}`}><TeamImage team={tm} size={28} /> {teamLabel(t, tm)} <b>{tm.points}</b> <span className="muted small">· {t('tm.locks', { n: tm.letter_count })}</span></span>
              ))}
            </div>
            {!tie && state.teams![0].points === state.teams![1].points && <span className="muted small">{t('tm.tiebreak')}</span>}
          </div>
        )}
      </div>
      <div className="podium">
        {awards.map((a, i) => (
          <motion.div key={a.key} className="award" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.45 + i * 0.15 }}>
            <div className="medal" style={{ background: `${a.color}22`, color: a.color }}><Icon name={a.icon} size={28} /></div>
            <div className="title">{a.title}</div>
            <div className="who">{a.who ? nameOf(state, a.who) : t('fn.nobody')}</div>
            <div className="muted small">{a.sub}</div>
          </motion.div>
        ))}
      </div>
      <GameSummary state={state} />
      <div className="locks-table">
        <div className="label">{t('fn.locks')}</div>
        {state.players.map((p) => (
          <div key={p.id} className="locks-row">
            <span className="row" style={{ gap: 8 }}><PlayerAvatar p={p} size={26} /><b>{p.name}</b>{p.class && <span className="muted small"> · {CLASSES[p.class].name}{p.orig_class ? ` (${t('fn.was', { cls: CLASSES[p.orig_class].name })})` : ''}</span>}{p.quit && <span className="tagchip chicken">{t('hu.chicken')}</span>}</span>
            <TileRow small letters={(p.letters ?? []).map((l) => ({ letter: l, revealed: p.revealed.includes(l) }))} />
            <span className="muted small">{t('du.pts', { n: p.points })}</span>
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {isHost && token
          ? <button className="btn lg" onClick={() => void act(() => rpc.playAgain(token))}>{t('fn.again')}</button>
          : <span className="muted">{t('fn.wait')}</span>}
      </div>
    </>
  );
}

/* ───────────── RACK: my letters, cards, perk ───────────── */
export function Rack({ state, token, act }: Omit<PhaseProps, 'msLeft'>) {
  const t = useT();
  const me = state.me;
  const [open, setOpen] = useState<null | { kind: 'card'; id: number } | { kind: 'perk' } | { kind: 'trace' }>(null);
  const phase = state.room.phase;
  useEffect(() => setOpen(null), [phase]);
  // Memory twist: my locks fade out a few seconds into each answer phase, so I have to remember them
  const memoryTwist = state.room.settings.twist === 'memory';
  const [memHidden, setMemHidden] = useState(false);
  useEffect(() => {
    setMemHidden(false);
    if (!memoryTwist || phase !== 'answer') return;
    const id = window.setTimeout(() => setMemHidden(true), 3500);
    return () => window.clearTimeout(id);
  }, [memoryTwist, phase, state.room.round]);
  if (!me || !token || phase === 'lobby' || phase === 'finished') return null;

  const info = CLASSES[me.class];
  const cfg = state.room.settings;
  const teamMode = cfg.mode === 'team';
  const others = state.players.filter((p) => !p.eliminated && p.id !== me.id && !(teamMode && p.team_id === me.team_id));
  const anyOthers = state.players.filter((p) => !p.eliminated && p.id !== me.id);
  const suspects = state.players.filter((p) => p.id !== me.id && !p.quit);
  const alive = !me.eliminated && cfg.perks;
  const PERK: Partial<Record<string, { usable: boolean; label: string; target?: string; ok: string }>> = {
    ninja: { usable: alive && !me.perk_used && state.room.round >= 3, label: me.perk_used ? t('pk.used') : state.room.round < 3 ? t('pk.unlock3') : t('pk.ninja'), ok: t('pk.ninja_ok') },
    mastermind: { usable: alive && !me.perk_used && ['answer', 'reveal', 'guess'].includes(phase), label: me.perk_used ? t('pk.used') : t('pk.mm'), target: t('pk.mm_t'), ok: t('pk.mm_ok') },
    mimic: { usable: alive && !me.perk_used && phase !== 'duel_intro', label: me.perk_used ? t('pk.used') : t('pk.mimic'), target: t('pk.mimic_t'), ok: t('pk.mimic_ok') },
    gambler: { usable: alive && phase === 'answer' && !me.bet_active, label: me.bet_active ? t('pk.bet_on') : phase === 'answer' ? t('pk.bet') : t('pk.bet_later'), ok: t('ph.allin_ok') },
    parasite: { usable: alive && ['answer', 'reveal', 'guess'].includes(phase) && !me.latched_to, label: me.latched_to ? t('pk.latched', { name: nameOf(state, me.latched_to) }) : t('pk.latch'), target: t('pk.latch_t'), ok: t('pk.latch_ok') },
    oracle: { usable: alive && !me.perk_used && ['reveal', 'guess', 'react'].includes(phase), label: me.perk_used ? t('pk.used') : t('pk.oracle'), ok: t('pk.oracle_ok') },
    jester: { usable: alive && !me.perk_used && ['guess', 'react'].includes(phase), label: me.perk_used ? t('pk.used') : t('pk.jester'), target: t('pk.jester_t'), ok: t('pk.jester_ok') },
  };
  const perk = PERK[me.class];
  const perkUsable = !!perk?.usable;
  const perkTargets = me.class === 'mimic' ? anyOthers.filter((p) => p.class !== 'mimic') : others;

  function cardUsable(kind: string): boolean {
    if (me!.eliminated) return false;
    if (kind === 'attack' || kind === 'cleanse') return phase === 'guess' || phase === 'react';
    if (kind === 'shield') return phase === 'react' && me!.class !== 'villain'
      && state.pending.some((p) => p.target_id === me!.id && p.status === 'pending');
    return false;
  }

  const perkLabel = !cfg.perks ? t('pk.off')
    : perk ? perk.label
    : me.class === 'villain' ? t('pk.villain')
    : me.class === 'hacker' ? t('pk.hacker')
    : me.class === 'thief' ? t('pk.thief')
    : me.class === 'wildcard' ? t('pk.wildcard')
    : me.class === 'hero' ? (me.perk_used ? t('pk.used') : t('pk.hero'))
    : '';

  return (
    <motion.div className="rack" initial={{ y: 120 }} animate={{ y: 0 }} transition={softSpring}>
      <div className="rack-inner">
        <div className="sect" style={{ position: 'relative' }}>
          <span className="sect-label">{t('rk.locks')}</span>
          {me.hacked ? (
            <div className="tiles hacked-tiles" title={t('rk.hacked_title')}>
              {me.letters.map((_, i) => (
                <motion.span key={i} className="tile glitch" animate={{ opacity: [1, 0.4, 1, 0.7, 1], x: [0, -2, 2, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9 + i * 0.13 }}>?</motion.span>
              ))}
            </div>
          ) : memHidden ? (
            <div className="tiles hacked-tiles" title={t('tw.memory_note')}>
              {me.letters.map((_, i) => <span key={i} className="tile mem">?</span>)}
            </div>
          ) : <TileRow letters={me.letters} />}
          {me.can_trace && (
            <motion.button className="btn sm hackbtn" onClick={() => setOpen(open?.kind === 'trace' ? null : { kind: 'trace' })}
              animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
              <Icon name="terminal" size={15} /> {t('rk.trace')}
            </motion.button>
          )}
          <AnimatePresence>
            {open?.kind === 'trace' && (
              <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                <span className="label">{t('rk.who_hacked')}</span>
                {suspects.map((p) => (
                  <button key={p.id} className="btn sm ghost" onClick={() => {
                    setOpen(null);
                    void act(() => rpc.trace(token, p.id));
                  }}><PlayerAvatar p={p} size={18} /> {p.name}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="sep" />
        <div className="sect" style={{ position: 'relative' }}>
          <span className="sect-label">{t('rk.cards')}</span>
          {me.cards.length === 0 && <span className="small" style={{ color: '#e8cfa6' }}>{cfg.cards ? t('rk.draw') : t('rk.cards_off')}</span>}
          <AnimatePresence initial={false}>
            {me.cards.map((c) => (
              <motion.div key={c.id} style={{ position: 'relative' }} layout
                initial={{ rotateY: 180, scale: 0.5, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                exit={{ y: -80, opacity: 0, scale: 1.2 }} transition={spring}>
                <motion.button className={`minicard ${c.kind}`} disabled={!cardUsable(c.kind)} whileHover={{ y: -4 }} whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (c.kind === 'attack') setOpen(open?.kind === 'card' && open.id === c.id ? null : { kind: 'card', id: c.id });
                    else void act(() => rpc.playCard(token, c.id, null), c.kind === 'shield' ? t('rk.blocked') : t('rk.cleansed'));
                  }}>
                  <span className="art"><CardIcon kind={c.kind} size={22} /></span>
                  <span>{CARD_INFO[c.kind].name}<small>{c.kind === 'attack' && me.class === 'villain' ? t('rk.attack2') : c.kind === 'attack' && me.class === 'hacker' ? t('rk.anon') : CARD_INFO[c.kind].text}</small></span>
                </motion.button>
                <AnimatePresence>
                  {open?.kind === 'card' && open.id === c.id && (
                    <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                      <span className="label">{me.class === 'hacker' ? t('rk.hack_who') : t('rk.attack_who')}</span>
                      {others.map((p) => (
                        <button key={p.id} className="btn sm danger" onClick={() => {
                          setOpen(null);
                          void act(() => rpc.playCard(token, c.id, p.id), me.class === 'hacker' ? t('rk.hack_q', { name: p.name }) : t('rk.attack_q', { name: p.name }));
                        }}><PlayerAvatar p={p} size={18} /> {p.name}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <span className="sep" />
        <div className="sect" style={{ position: 'relative' }}>
          <motion.button className="perkbtn" disabled={!perkUsable} whileTap={{ scale: 0.96 }}
            animate={perkUsable ? { boxShadow: [`0 0 0 0 ${CLASS_COLORS[me.class][0]}00`, `0 0 0 4px ${CLASS_COLORS[me.class][0]}66`, `0 0 0 0 ${CLASS_COLORS[me.class][0]}00`] } : {}}
            transition={{ repeat: Infinity, duration: 1.8 }}
            onClick={() => {
              if (!perk) return;
              if (perk.target) setOpen(open?.kind === 'perk' ? null : { kind: 'perk' });
              else void act(() => rpc.usePerk(token, null), perk.ok);
            }}>
            <ClassIcon cls={me.class} size={32} />
            <span>{info.name}<small>{perkLabel}</small></span>
          </motion.button>
          <AnimatePresence>
            {open?.kind === 'perk' && (
              <motion.div className="popover" initial={{ opacity: 0, y: 8, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
                <span className="label">{perk?.target}</span>
                {perkTargets.map((p) => (
                  <button key={p.id} className="btn sm ghost" onClick={() => {
                    setOpen(null);
                    void act(() => rpc.usePerk(token, p.id), perk?.ok);
                  }}><PlayerAvatar p={p} size={18} /> {p.name}{me.class === 'mimic' && p.class && <span className="muted small"> · {CLASSES[p.class].name}</span>}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {me.intel.length > 0 && (
          <>
            <span className="sep" />
            <div className="sect">
              <span className="sect-label">{t('rk.intel')}</span>
              <div className="col" style={{ gap: 4 }}>
                {me.intel.map((x, idx) => (
                  x.kind === 'oracle' ? (
                    <div key={idx} className="row small" style={{ gap: 6, color: '#cfe9ff' }}>
                      <Icon name="orb" size={14} /> {t('rk.round', { n: x.round })} <b>“{x.prompt}”</b>
                    </div>
                  ) : (
                    <div key={idx} className="row small" style={{ gap: 6, color: '#fff4dc' }}>
                      <Icon name="eye" size={14} /> {x.kind === 'ninja' ? t('rk.in_play') : x.target_name}
                      <TileRow small letters={x.letters.map((l) => ({ letter: l }))} />
                    </div>
                  )
                ))}
              </div>
            </div>
          </>
        )}
        <span className="grow" />
        <div className="rack-pts">
          <motion.span key={me.points} initial={{ scale: 1.4 }} animate={{ scale: 1 }} style={{ display: 'inline-block' }}>{me.points}</motion.span>
          <small>{t('rk.points')}</small>
        </div>
      </div>
    </motion.div>
  );
}
