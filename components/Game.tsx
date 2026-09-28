'use client';

import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { announcer } from '@/lib/announcer';
import { CLASSES } from '@/lib/classes';
import { audio } from '@/lib/audio';
import { music } from '@/lib/music';
import { friendlyError } from '@/lib/errors';
import { rpc } from '@/lib/rpc';
import { clearSession } from '@/lib/session';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { Icon } from './icons';
import { Lobby } from './Lobby';
import { Reactions } from './Reactions';
import { AnswerPhase, DuelIntro, Finished, GuessPhase, Rack, ReactPhase, RevealPhase, type Act } from './phases';
import { Header, Hud, TimeBar, Toast } from './ui';

const PHASE_TOTAL: Record<string, number> = { reveal: 6, guess: 20, react: 8, duel_intro: 6 };

/** Announcer name for a player: "the Ninja", or "Ninja Ava" when two players share a class. */
function classCall(p: PublicPlayer, all: PublicPlayer[], capital = false): string {
  const cls = CLASSES[p.class].name;
  if (all.filter((x) => x.class === p.class).length > 1) return `${cls} ${p.name}`;
  return `${capital ? 'The' : 'the'} ${cls}`;
}

export function Game({ state, token, offset, refresh }: {
  state: RoomState; token: string | null; offset: number; refresh: () => Promise<void>;
}) {
  const [toast, setToast] = useState<{ msg: string; good?: boolean } | null>(null);
  const msLeft = useCountdown(state.room.phase_ends_at, offset);
  const phase = state.room.phase;
  const me = state.me;

  const act: Act = useCallback(async (fn, okMsg) => {
    audio.unlock();
    try {
      const r = await fn();
      if (okMsg) setToast({ msg: okMsg, good: true });
      void refresh();
      return r;
    } catch (e) {
      setToast({ msg: friendlyError(e) });
      void refresh();
      return undefined;
    }
  }, [refresh]);
  const clearToast = useCallback(() => setToast(null), []);

  // sound cues
  const prev = useRef<{ phase: string; strikes: number; letters: number; eliminated: boolean; answerKey: string; guessKey: string } | null>(null);
  useEffect(() => {
    const cur = {
      phase,
      strikes: me?.strikes ?? 0,
      letters: me?.letters.length ?? 0,
      eliminated: me?.eliminated ?? false,
      answerKey: me?.answer ? `${me.answer.word}-${me.answer.valid}` : '',
      guessKey: me?.guess ? `${me.guess.letter}-${me.guess.correct}` : '',
    };
    const p = prev.current;
    if (p) {
      if (cur.phase !== p.phase) {
        if (cur.phase === 'duel_intro') audio.fight();
        if (cur.phase === 'finished') audio.fanfare();
      }
      if (cur.strikes > p.strikes || (cur.eliminated && !p.eliminated)) audio.buzzer();
      else if (cur.answerKey && cur.answerKey !== p.answerKey) {
        if (me?.answer?.valid) audio.success(); else audio.buzzer();
      }
      if (cur.guessKey && cur.guessKey !== p.guessKey) {
        if (me?.guess?.correct) audio.chime(); else audio.tick(false);
      }
      if (cur.phase === 'answer' && p.phase !== 'answer' && cur.letters > p.letters) audio.attack();
    }
    prev.current = cur;
  }, [phase, me]);

  // music: site theme in the lobby, quieter under gameplay, the duel track for a 1v1
  const duel = state.room.duel;
  useEffect(() => {
    if (phase === 'duel_intro' || (duel && phase !== 'lobby' && phase !== 'finished')) { music.play('duel'); return; }
    if (phase === 'finished') {
      music.play('none'); // let the fanfare + announcer land, then bring the theme back
      const id = window.setTimeout(() => music.play('theme'), 4000);
      return () => window.clearTimeout(id);
    }
    music.play('theme', { quiet: phase !== 'lobby' });
  }, [phase, duel]);
  useEffect(() => () => music.play('theme'), []);

  // announcer voice
  useEffect(() => {
    const unlock = () => announcer.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); announcer.stop(); };
  }, []);

  const round = state.room.round;
  const lastCall = useRef<string | null>(null);
  const knownOut = useRef<Set<string> | null>(null);
  useEffect(() => {
    const key = `${phase}-${round}`;
    const first = lastCall.current === null;
    if (key === lastCall.current) return;
    lastCall.current = key;
    if (first) return; // don't shout on page load / reconnect
    const alive = state.players.filter((p) => !p.eliminated);
    switch (phase) {
      case 'answer':
        if (state.room.duel) announcer.say(`Duel round! ${state.prompt ?? ''}`, { hype: true, delay: 150 });
        else announcer.say(`Round ${round}! ${state.prompt ?? ''}`, { delay: 150 });
        break;
      case 'reveal': announcer.say("Time's up! Let's see those words.", { urgent: true }); break;
      case 'guess': announcer.say('Crack their locks!'); break;
      case 'react': announcer.say('Play your cards!'); break;
      case 'duel_intro':
        if (alive.length === 2) announcer.say(`${classCall(alive[0], state.players, true)}, versus, ${classCall(alive[1], state.players)}! Fight!`, { hype: true, delay: 900, urgent: true });
        break;
      case 'finished': {
        const w = state.players.find((p) => p.id === state.room.winner_id);
        announcer.say(w ? `${classCall(w, state.players, true)} wins! Your champion!` : 'Game over!', { hype: true, delay: 700, urgent: true });
        break;
      }
      case 'lobby': announcer.say('Rematch! Back to the lobby.'); break;
    }
  }, [phase, round, state.players, state.prompt, state.room.duel, state.room.winner_id]);

  // eliminations: call out anyone newly knocked out
  useEffect(() => {
    const out = new Set(state.players.filter((p) => p.eliminated).map((p) => p.id));
    const before = knownOut.current;
    knownOut.current = out;
    if (!before || phase === 'lobby' || phase === 'finished') return;
    const fresh = state.players.filter((p) => out.has(p.id) && !before.has(p.id));
    if (fresh.length === 0) return;
    const names = fresh.map((p, i) => (p.id === me?.id ? 'You' : classCall(p, state.players, i === 0)));
    announcer.say(`${names.join(' and ')} ${names.length === 1 && names[0] !== 'You' ? 'is' : 'are'} out!`, { delay: 1600 });
  }, [state.players, phase, me?.id]);

  // five-second warning in the answer phase
  const warned = useRef('');
  useEffect(() => {
    const secsLeft = Math.ceil(msLeft / 1000);
    if (phase === 'answer' && secsLeft === 5 && warned.current !== `${round}`) {
      warned.current = `${round}`;
      announcer.say('Five seconds!', { hype: true });
    }
  }, [msLeft, phase, round]);

  const secs = Math.ceil(msLeft / 1000);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!(phase === 'answer' || phase === 'guess') || msLeft <= 0) return;
    if (secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs <= 10) {
      audio.tick(true);
      const id = window.setTimeout(() => audio.tick(true), 500);
      return () => window.clearTimeout(id);
    }
    if (secs % 2 === 0) audio.tick(false);
  }, [secs, phase, msLeft]);

  async function leave() {
    if (token) { try { await rpc.leave(token); } catch { /* ignore */ } }
    clearSession(state.room.code);
    window.location.href = '/';
  }

  const props = { state, token, msLeft, act };
  let main: React.ReactNode;
  switch (phase) {
    case 'lobby': main = <Lobby state={state} token={token} act={act} />; break;
    case 'answer': main = <AnswerPhase {...props} />; break;
    case 'reveal': main = <RevealPhase {...props} />; break;
    case 'guess': main = <GuessPhase {...props} />; break;
    case 'react': main = <ReactPhase {...props} />; break;
    case 'duel_intro': main = <DuelIntro {...props} />; break;
    case 'finished': main = <Finished {...props} />; break;
  }
  const total = phase === 'answer' ? state.room.answer_seconds : PHASE_TOTAL[phase] ?? 0;
  const timed = !!state.room.phase_ends_at && phase !== 'lobby' && phase !== 'finished';

  return (
    <MotionConfig reducedMotion="user">
      <div className="shell">
        <Header right={
          <>
            <span className="room-chip">{state.room.code}</span>
            {me ? <button className="textbtn" onClick={leave}>Leave</button> : <Link className="textbtn" href="/">Home</Link>}
          </>
        } />
        {phase !== 'lobby' && <Hud state={state} meId={me?.id ?? null} />}
        <AnimatePresence>
          {me?.eliminated && phase !== 'finished' && (
            <motion.div className="banner out" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <Icon name="skull" size={18} /> You&apos;re out — spectating. Everyone&apos;s letters are visible to you now.
            </motion.div>
          )}
        </AnimatePresence>
        {!me && phase !== 'lobby' && (
          <div className="banner info"><Icon name="eye" size={18} /> Game in progress — you&apos;re watching as a spectator.</div>
        )}
        <section className="stage" aria-live="polite">
          {timed ? <TimeBar msLeft={msLeft} total={total} /> : <div className="timebar" />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${phase}-${state.room.round}`}
              className={phase === 'duel_intro' ? 'stage-body duel-wrap' : 'stage-body'}
              style={phase === 'duel_intro' ? { padding: 0 } : undefined}
              initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -18, filter: 'blur(6px)' }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
              {main}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      <Rack state={state} token={token} act={act} />
      <Reactions state={state} token={token} />
      <Toast msg={toast?.msg ?? null} good={toast?.good} onDone={clearToast} />
    </MotionConfig>
  );
}
