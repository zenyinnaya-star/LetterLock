'use client';

import { TutorialCoach } from './TutorialCoach';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { announcer } from '@/lib/announcer';
import { narrator } from '@/lib/narrator';
import { CLASSES } from '@/lib/classes';
import { audio } from '@/lib/audio';
import { music } from '@/lib/music';
import { friendlyError } from '@/lib/errors';
import { t as tr } from '@/lib/i18n';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import { clearSession } from '@/lib/session';
import type { PublicPlayer, RoomState } from '@/lib/types';
import { Icon } from './icons';
import { Lobby } from './Lobby';
import { Battle } from './Battle';
import { Reactions } from './Reactions';
import { ActionFeed } from './ActionFeed';
import { DuelHud } from './DuelHud';
import { TeamVoice } from './TeamVoice';
import { Spectate } from './Spectate';
import { DuelWest, WestFinale } from './DuelWest';
import { westArtVars } from '@/lib/westArt';
import '@/app/west.css';
import '@/app/team.css';
import '@/app/siege.css';
import { SiegeFinale, TeamSiege } from './TeamSiege';
import { siegeArtVars } from '@/lib/siegeArt';
import '@/app/vault.css';
import { VaultFinale, VaultHeist, VaultShowdown } from './VaultHeist';
import { vaultArtVars } from '@/lib/vaultArt';
import { TeamHud, teamLabel } from './team';
import { SettingsButton } from './SettingsPanel';
import { AnswerPhase, DuelIntro, Finished, GuessPhase, Rack, ReactPhase, RevealPhase, type Act } from './phases';
import { Header, Hud, TimeBar, Toast } from './ui';

const PHASE_TOTAL: Record<string, number> = { reveal: 6, guess: 20, react: 8, duel_intro: 6 };

/** Announcer name for a player: "the Ninja", or "Ninja Ava" when two players share a class. */
function classCall(p: PublicPlayer, all: PublicPlayer[], capital = false): string {
  if (!p.class) return p.name;
  const cls = CLASSES[p.class].name;
  if (all.filter((x) => x.class === p.class).length > 1) return tr('an.cls_name', { cls, name: p.name });
  return tr(capital ? 'an.The' : 'an.the', { cls });
}

export function Game({ state: fullState, token, offset, refresh, bots = [], botInfo, pingBots }: {
  state: RoomState; token: string | null; offset: number; refresh: () => Promise<void>;
  bots?: string[]; botInfo?: Record<string, { l: number; s: number }>; pingBots?: () => Promise<void>;
}) {
  const t = useT();
  // spectators (incl. a host who sat out) are not part of the match: hide them from every in-game view
  const state = useMemo(() => ({ ...fullState, players: fullState.players.filter((p) => !p.is_spectator) }), [fullState]);
  const [toast, setToast] = useState<{ msg: string; good?: boolean } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const msLeft = useCountdown(state.room.phase_ends_at, offset);
  const phase = state.room.phase;
  const me = state.me;
  // host can step out mid-game (kept in the Quit sheet so nothing floats over the play area)
  const canSitOut = !!me && !me.is_spectator && me.id === state.room.host_id && state.room.settings?.mode !== 'team' && phase !== 'answer' && phase !== 'finished' && phase !== 'lobby' && !me.eliminated;
  // 1v1 duels play out on the full-screen western street
  const west = state.room.settings?.mode === 'duel' && state.room.duel && state.players.filter((p) => !p.eliminated).length === 2
    && ['duel_intro', 'answer', 'reveal', 'guess', 'react'].includes(phase);
  const westLobby = phase === 'lobby' && state.room.settings?.mode === 'duel';
  const westEnd = phase === 'finished' && state.room.settings?.mode === 'duel' && state.players.length === 2 && !!state.room.winner_id;
  // team mode is a siege: two castles across a field at dusk
  const teamOn = state.room.settings?.mode === 'team' && (state.teams ?? []).length === 2;
  const siege = teamOn && ['answer', 'reveal', 'guess', 'react'].includes(phase);
  const siegeLobby = phase === 'lobby' && state.room.settings?.mode === 'team';
  const siegeEnd = teamOn && phase === 'finished';
  // classic mode is a vault heist: every player a safe, every lock a tumbler
  const classic = (state.room.settings?.mode ?? 'classic') === 'classic';
  const [storyLobby, setStoryLobby] = useState(false);
  const vault = classic && !west && ['duel_intro', 'answer', 'reveal', 'guess', 'react'].includes(phase);
  const vaultLobby = classic && phase === 'lobby' && !storyLobby;
  const vaultEnd = classic && phase === 'finished' && !westEnd;

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
        if (cur.phase === 'duel_intro') { if (!west) audio.fight(); }
        else if (cur.phase === 'answer') {
          if (west) audio.bell(true); else if (!siege && !vault) audio.gong();
          const tw = state.room.settings?.twist;
          const last = state.room.round >= (state.room.settings?.rounds ?? 99) && state.room.settings?.mode !== 'classic';
          if (state.room.round === 1) narrator.say(tw === 'reverse' ? 'reverse' : tw === 'memory' ? 'memory' : 'round', { delay: 500 });
          else if (last) narrator.say('final', { delay: 500 });
          else narrator.say('round', { delay: 500 });
        }
        if (cur.phase === 'finished') {
          const teamWin = state.room.settings?.mode === 'team'
            ? (me && state.room.winner_team != null ? (state.teams?.find((x) => x.idx === state.room.winner_team)?.id === me.team_id ? 'won' : 'lost') : null)
            : (me && state.room.winner_id ? (state.room.winner_id === me.id ? 'won' : 'lost') : null);
          if (teamWin === 'won') { if (!westEnd && !siegeEnd && !vaultEnd) audio.file('victory'); narrator.say('victory', { delay: 700 }); }
          else if (teamWin === 'lost') { if (!westEnd && !siegeEnd && !vaultEnd) audio.file('defeat'); narrator.say('defeat', { delay: 700 }); }
          else audio.fanfare();
        }
      }
      if (cur.eliminated && !p.eliminated && !me?.is_spectator) { audio.elimination(); narrator.say('eliminated', { delay: 400 }); }
      else if (cur.strikes > p.strikes) { if (west) audio.hammer(); else if (!vault) audio.buzzer(); }
      else if (cur.answerKey && cur.answerKey !== p.answerKey) {
        if (me?.answer?.valid) audio.success(); else if (!audio.file('nope')) audio.buzzer();
      }
      if (cur.guessKey && cur.guessKey !== p.guessKey && !west) {
        if (me?.guess?.correct) { if (!audio.file('correct')) audio.chime(); } else audio.tick(false);
      }
      if (cur.phase === 'answer' && p.phase !== 'answer' && cur.letters > p.letters && !west) audio.attack();
    }
    prev.current = cur;
  }, [phase, me, west, westEnd, siege, siegeEnd, vault]);

  // music: site theme in the lobby, quieter under gameplay, the duel track for a 1v1
  const duel = state.room.duel;
  const duelMode = state.room.settings?.mode === 'duel';
  useEffect(() => {
    if (duelMode && (phase === 'duel_intro' || (duel && phase !== 'lobby' && phase !== 'finished') || phase === 'lobby')) { music.play('duel'); return; }
    if (phase === 'battle') { music.play('battle'); return; }
    if (phase === 'finished') {
      music.play('none'); // let the fanfare + announcer land, then bring the theme back
      const id = window.setTimeout(() => music.play(classic ? 'vault' : 'theme'), 4000);
      return () => window.clearTimeout(id);
    }
    music.play(classic ? 'vault' : 'theme', { quiet: phase !== 'lobby' });
  }, [phase, duel, duelMode, classic]);
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
    // every new phase starts at the top (lobby scroll position used to carry into the game)
    if (typeof window !== 'undefined' && lastCall.current !== null && lastCall.current !== `${phase}-${round}`) window.scrollTo({ top: 0 });
    const key = `${phase}-${round}`;
    const first = lastCall.current === null;
    if (key === lastCall.current) return;
    lastCall.current = key;
    if (first) return; // don't shout on page load / reconnect
    const alive = state.players.filter((p) => !p.eliminated);
    switch (phase) {
      case 'answer':
        if (state.room.duel) announcer.say(tr('an.duel_round', { prompt: state.prompt ?? '' }), { hype: true, delay: 150 });
        else announcer.say(tr('an.round', { n: round, prompt: state.prompt ?? '' }), { delay: 150 });
        break;
      case 'reveal': announcer.say(tr('an.times_up'), { urgent: true }); break;
      case 'guess': announcer.say(tr('an.crack')); break;
      case 'react': announcer.say(tr('an.cards')); break;
      case 'duel_intro':
        if (alive.length === 2) announcer.say(tr('an.vs', { a: classCall(alive[0], state.players, true), b: classCall(alive[1], state.players) }), { hype: true, delay: 900, urgent: true });
        break;
      case 'finished': {
        if (state.room.settings?.mode === 'team') {
          const wt = state.teams?.find((x) => x.idx === state.room.winner_team);
          announcer.say(wt ? tr('tm.win', { team: teamLabel(tr as never, wt) }) : tr('tm.draw'), { hype: true, delay: 700, urgent: true });
          break;
        }
        const w = state.players.find((p) => p.id === state.room.winner_id);
        announcer.say(w ? tr('an.wins', { name: classCall(w, state.players, true) }) : tr('an.over'), { hype: true, delay: 700, urgent: true });
        break;
      }
      case 'lobby': announcer.say(tr('an.rematch')); break;
    }
  }, [phase, round, state.players, state.prompt, state.room.duel, state.room.winner_id]);

  // eliminations: call out anyone newly knocked out
  useEffect(() => {
    const out = new Set(state.players.filter((p) => p.eliminated).map((p) => p.id));
    const before = knownOut.current;
    knownOut.current = out;
    if (!before || phase === 'lobby' || phase === 'finished') return;
    const fresh = state.players.filter((p) => out.has(p.id) && !before.has(p.id) && !p.quit && !p.is_spectator);
    if (fresh.length === 0) return;
    if (fresh.length === 1 && fresh[0].id === me?.id) { announcer.say(tr('an.you_out'), { delay: 1600 }); return; }
    const names = fresh.map((p, i) => (p.id === me?.id ? tr('fd.you') : classCall(p, state.players, i === 0)));
    announcer.say(tr(names.length === 1 ? 'an.out_one' : 'an.out_many', { names: names.join(tr('an.and')) }), { delay: 1600 });
  }, [state.players, phase, me?.id]);

  // five-second warning in the answer phase
  const warned = useRef('');
  useEffect(() => {
    const secsLeft = Math.ceil(msLeft / 1000);
    if (phase === 'answer' && secsLeft === 5 && warned.current !== `${round}`) {
      warned.current = `${round}`;
      announcer.say(tr('an.five'), { hype: true });
    }
  }, [msLeft, phase, round]);

  const secs = Math.ceil(msLeft / 1000);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!(phase === 'answer' || phase === 'guess') || msLeft <= 0) return;
    if (secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs === 10 && phase === 'answer') narrator.say('ten', { interrupt: false });
    if (secs <= 10) { audio.tenSec(west ? 'duel' : siege ? 'team' : vault ? 'vault' : 'classic', secs); return; }
    if (secs % 2 === 0) audio.tick(false);
  }, [secs, phase, msLeft, west, siege, vault]);

  async function leave(delayMs = 0) {
    if (token) { try { await rpc.leave(token); } catch { /* ignore */ } }
    clearSession(state.room.code);
    window.setTimeout(() => { window.location.href = '/'; }, delayMs);
  }

  const midGame = phase !== 'lobby' && phase !== 'finished' && !!me && !me.eliminated;
  const props = { state, token, msLeft, act, offset };
  let main: React.ReactNode;
  switch (phase) {
    case 'lobby': main = <Lobby state={fullState} token={token} act={act} onLeave={() => void leave()} bots={bots} botInfo={botInfo} pingBots={pingBots} vault={vaultLobby} onStory={setStoryLobby} />; break;
    case 'answer': main = <AnswerPhase {...props} />; break;
    case 'reveal': main = <RevealPhase {...props} />; break;
    case 'guess': main = <GuessPhase {...props} />; break;
    case 'react': main = <ReactPhase {...props} />; break;
    case 'duel_intro': main = vault ? <VaultShowdown state={state} msLeft={msLeft} /> : <DuelIntro {...props} />; break;
    case 'finished': main = <Battle {...props} fallback={<Finished {...props} />} />; break;
    case 'battle': main = <Battle {...props} />; break;
  }
  const total = phase === 'answer' ? state.room.answer_seconds : PHASE_TOTAL[phase] ?? 0;
  const stageName = state.room.stage;
  useEffect(() => {
    const el = document.documentElement;
    if (stageName && stageName !== 'none') el.dataset.stage = stageName; else delete el.dataset.stage;
    return () => { delete el.dataset.stage; };
  }, [stageName]);
  const timed = !!state.room.phase_ends_at && phase !== 'lobby' && phase !== 'finished';

  return (
    <MotionConfig reducedMotion="user">
      <TutorialCoach state={state} />
      {stageName && stageName !== 'none' && <div className={`stage-fx stage-${stageName}`} aria-hidden />}
      {phase === 'battle' ? (
        <div className="shell rpg" role="main">
          {main}
          <div className="rpg-menu">
            <SettingsButton state={state} token={token} act={act} />
            {me && midGame && <button className="textbtn danger" title={t('gm.quit')} aria-label={t('gm.quit')} onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /></button>}
          </div>
        </div>
      ) : westLobby ? (
        <div className="shell west-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={<><span className="room-chip">{state.room.code}</span><button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button></>} />
          <div className="west p-lobby" style={westArtVars}>
            <div className="w-dust" aria-hidden>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
            <div className="w-lobby">
              <Lobby state={fullState} token={token} act={act} onLeave={() => void leave()} bots={bots} botInfo={botInfo} pingBots={pingBots} west />
            </div>
          </div>
        </div>
      ) : siegeLobby ? (
        <div className="shell siege-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={<><span className="room-chip">{state.room.code}</span><button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button></>} />
          <div className="siege p-lobby" style={siegeArtVars}>
            <div className="s-embers" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
            <div className="s-vignette" aria-hidden />
            <div className="s-lobby">
              <Lobby state={fullState} token={token} act={act} onLeave={() => void leave()} bots={bots} botInfo={botInfo} pingBots={pingBots} siege />
            </div>
          </div>
        </div>
      ) : siege || siegeEnd ? (
        <div className="shell siege-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={
              <>
                <span className="room-chip">{state.room.code}</span>
                {!me ? <Link className="textbtn" href="/">{t('gm.home')}</Link>
                  : midGame ? <button className="textbtn danger" onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /> {t('gm.quit')}</button>
                  : <button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button>}
              </>
            } />
          {siegeEnd ? <SiegeFinale state={state} token={token} act={act} /> : <TeamSiege {...props} />}
        </div>
      ) : vaultLobby ? (
        <div className="shell vault-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={
              <>
                <span className="room-chip">{state.room.code}</span>
                {!me ? <Link className="textbtn" href="/">{t('gm.home')}</Link>
                  : midGame ? <button className="textbtn danger" onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /> {t('gm.quit')}</button>
                  : <button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button>}
              </>
            } />
          <div className="vault p-lobby" style={vaultArtVars}>
            <div className="v-shade" aria-hidden />
            <div className="v-lobby">{main}</div>
          </div>
        </div>
      ) : vault || vaultEnd ? (
        <div className="shell vault-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={
              <>
                <span className="room-chip">{state.room.code}</span>
                {!me ? <Link className="textbtn" href="/">{t('gm.home')}</Link>
                  : midGame ? <button className="textbtn danger" onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /> {t('gm.quit')}</button>
                  : <button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button>}
              </>
            } />
          {vaultEnd ? <VaultFinale state={state}>{main}</VaultFinale> : (
            <VaultHeist state={state} msLeft={msLeft}>
              {me?.eliminated && !me.is_spectator && <div className="banner out"><Icon name="skull" size={18} /> {t('gm.out')}</div>}
              {!me && <div className="banner info"><Icon name="eye" size={18} /> {t('gm.spectator')}</div>}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={`${phase}-${state.room.round}`} className="stage-body"
                  initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                  {main}
                </motion.div>
              </AnimatePresence>
            </VaultHeist>
          )}
        </div>
      ) : west || westEnd ? (
        <div className="shell west-shell">
          <Header
            settings={<SettingsButton state={state} token={token} act={act} />}
            right={
              <>
                <span className="room-chip">{state.room.code}</span>
                {!me ? <Link className="textbtn" href="/">{t('gm.home')}</Link>
                  : midGame ? <button className="textbtn danger" onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /> {t('gm.quit')}</button>
                  : <button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button>}
              </>
            } />
          {westEnd ? <WestFinale state={state} token={token} act={act} /> : <DuelWest {...props} />}
        </div>
      ) : (
      <div className="shell">
        <Header
          settings={<SettingsButton state={state} token={token} act={act} />}
          right={
            <>
              <span className="room-chip">{state.room.code}</span>
              {!me ? <Link className="textbtn" href="/">{t('gm.home')}</Link>
                : midGame ? <button className="textbtn danger" onClick={() => setConfirmQuit(true)}><Icon name="logout" size={15} /> {t('gm.quit')}</button>
                : <button className="textbtn" onClick={() => void leave()}><Icon name="logout" size={15} /> {t('gm.leave')}</button>}
            </>
          } />
        {phase !== 'lobby' && (state.room.settings?.mode === 'team' ? <TeamHud state={state} /> : state.room.settings?.mode === 'duel' && state.room.duel && phase !== 'finished' && state.players.filter((p) => !p.eliminated).length === 2
          ? <DuelHud state={state} />
          : <Hud state={state} meId={me?.id ?? null} />)}
        <AnimatePresence>
          {me?.eliminated && !me.is_spectator && phase !== 'finished' && (
            <motion.div className="banner out" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <Icon name="skull" size={18} /> {t('gm.out')}
            </motion.div>
          )}
        </AnimatePresence>
        {!me && phase !== 'lobby' && (
          <div className="banner info"><Icon name="eye" size={18} /> {t('gm.spectator')}</div>
        )}
        <section className="stage" aria-live="polite">
          {timed ? <TimeBar msLeft={msLeft} total={total} /> : <div className="timebar" />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${phase}-${state.room.round}`}
              className={phase === 'duel_intro' ? 'stage-body duel-wrap' : 'stage-body'}
              style={phase === 'duel_intro' ? { padding: 0 } : undefined}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
              {main}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      )}
      {phase !== 'battle' && !me?.is_spectator && <div className={west ? 'west-rack' : siege ? 'siege-rack' : vault || vaultEnd ? 'vault-rack' : undefined}><Rack state={state} token={token} act={act} /></div>}
      <Spectate state={fullState} token={token} act={act} />
      <Reactions state={state} token={token} />
      {state.room.settings?.mode === 'team' && <TeamVoice state={state} token={token} />}
      <ActionFeed state={state} token={token} />
      <AnimatePresence>
        {confirmQuit && (
          <motion.div className="sheet-backdrop" onClick={() => setConfirmQuit(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="msheet quit-sheet" role="dialog" aria-modal="true" aria-label={t('gm.quit_title')} onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 28 }}>
              <motion.div className="quit-art" animate={{ rotate: [0, -12, 10, -6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                <Icon name="feather" size={44} />
              </motion.div>
              <h2>{t('gm.quit_title')}</h2>
              <p className="muted">{t('gm.quit_body')}</p>
              <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                <button className="btn ghost" onClick={() => setConfirmQuit(false)}>{t('gm.keep')}</button>
                <button className="btn danger" onClick={() => { audio.chicken(); setConfirmQuit(false); void leave(2400); }}>{t('gm.quit_anyway')}</button>
              </div>
              {canSitOut && (
                <button className="btn sm ghost" style={{ marginTop: 12 }} onClick={() => { setConfirmQuit(false); if (token) void act(() => rpc.setHostMode(token, false)); }}>
                  <Icon name="eye" size={14} /> Sit out and keep hosting
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Toast msg={toast?.msg ?? null} good={toast?.good} onDone={clearToast} />
    </MotionConfig>
  );
}
