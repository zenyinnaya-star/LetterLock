'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { uploadAvatar } from '@/lib/avatar';
import { useT } from '@/lib/i18n/react';
import { rpc } from '@/lib/rpc';
import type { PublicPlayer, RoomState, Team } from '@/lib/types';
import { CLASSES } from '@/lib/classes';
import { Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';
import type { Act } from './phases';
import { softSpring, spring } from './ui';

type Tr = ReturnType<typeof useT>;

/** Default server names ("Team A"/"Team B") show in the player's own language. */
export function teamLabel(t: Tr, team: Team | undefined): string {
  if (!team) return '—';
  if (team.name === 'Team A') return t('tm.team_a');
  if (team.name === 'Team B') return t('tm.team_b');
  return team.name;
}

export function teamOf(state: RoomState, playerId: string | null | undefined): Team | undefined {
  const p = state.players.find((x) => x.id === playerId);
  return state.teams?.find((tm) => tm.id === p?.team_id);
}

export function TeamImage({ team, size = 56 }: { team: Team; size?: number }) {
  const [broken, setBroken] = useState(false);
  const hue = team.idx === 0 ? 'a' : 'b';
  return (
    <span className={`team-img ${hue}`} style={{ width: size, height: size, borderRadius: size * 0.28 }}>
      {team.image_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.image_url} alt="" width={size} height={size} onError={() => setBroken(true)} draggable={false} />
      ) : (
        <Icon name="users" size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

/* ───────── scoreboard ───────── */
export function TeamHud({ state }: { state: RoomState }) {
  const t = useT();
  const teams = state.teams ?? [];
  const total = state.room.settings.rounds ?? 5;
  const myTeam = state.me?.team_id;
  const lead = teams.length === 2 && teams[0].points !== teams[1].points ? (teams[0].points > teams[1].points ? 0 : 1) : -1;
  if (teams.length < 2) return null;
  return (
    <div className="team-hud" role="list" aria-label={t('hu.scoreboard')}>
      {teams.map((tm, i) => (
        <div key={tm.id} style={{ display: 'contents' }}>
          {i === 1 && (
            <div className="th-mid">
              <span className="th-round">{t('tm.round_of', { n: Math.max(1, state.room.round), m: total })}</span>
              <span className="th-vs">{t('tm.vs')}</span>
            </div>
          )}
          <motion.div role="listitem" layout className={`th-team ${tm.idx === 0 ? 'a' : 'b'}${tm.id === myTeam ? ' mine' : ''}${lead === i ? ' lead' : ''}`}
            transition={softSpring}>
            <TeamImage team={tm} size={44} />
            <div className="th-who">
              <b>{teamLabel(t, tm)}</b>
              <span className="th-sub"><Icon name="lock" size={12} /> {t('tm.locks', { n: tm.letter_count })}</span>
            </div>
            <motion.span key={tm.points} className="th-pts" initial={{ scale: 1.5, color: '#ffcf4a' }} animate={{ scale: 1, color: '#f1efe6' }} transition={{ duration: 0.5 }}>
              {tm.points}
            </motion.span>
          </motion.div>
        </div>
      ))}
    </div>
  );
}

/* ───────── lobby: two team cards ───────── */
export function TeamLobby({ state, token, act }: { state: RoomState; token: string | null; act: Act }) {
  const t = useT();
  const me = state.me;
  const size = state.room.settings.team_size ?? 2;
  const teams = state.teams ?? [];
  return (
    <div className="team-lobby">
      {teams.map((tm, i) => (
        <div key={tm.id} style={{ display: 'contents' }}>
          {i === 1 && (
            <motion.span className="dl-vs tl-vs" initial={{ scale: 3, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.2 }}>{t('tm.vs')}</motion.span>
          )}
          <TeamCard team={tm} members={state.players.filter((p) => p.team_id === tm.id)} size={size} state={state} token={token} act={act} meId={me?.id} />
        </div>
      ))}
    </div>
  );
}

function TeamCard({ team, members, size, state, token, act, meId }: {
  team: Team; members: PublicPlayer[]; size: number; state: RoomState; token: string | null; act: Act; meId?: string;
}) {
  const t = useT();
  const isLeader = !!meId && team.leader_id === meId;
  const mine = members.some((p) => p.id === meId);
  const [name, setName] = useState(teamLabel(t, team));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = teamLabel(t, team);
  const dirty = name.trim() !== shown && name.trim().length > 0;
  const [prevShown, setPrevShown] = useState(shown);
  if (prevShown !== shown) { setPrevShown(shown); setName(shown); }

  async function pick(file?: File) {
    if (!file || !token) return;
    setBusy(true);
    try {
      const url = await uploadAvatar(file);
      await act(() => rpc.teamUpdate(token, null, url, false));
    } catch { /* toast comes from act / upload error ignored */ }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <motion.div className={`team-card ${team.idx === 0 ? 'a' : 'b'}${mine ? ' mine' : ''}`}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="tc-head">
        <TeamImage team={team} size={72} />
        {isLeader ? (
          <div className="tc-edit">
            <input className="input" maxLength={20} value={name} aria-label={t('tm.name_ph')} placeholder={t('tm.name_ph')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && dirty && token) void act(() => rpc.teamUpdate(token, name.trim(), null, false)); }} />
            <div className="row" style={{ gap: 6 }}>
              {dirty && <button className="btn sm" onClick={() => token && void act(() => rpc.teamUpdate(token, name.trim(), null, false))}>{t('tm.rename')}</button>}
              <button className="btn sm ghost" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? t('av.uploading') : team.image_url ? t('tm.change_img') : t('tm.upload')}
              </button>
              {team.image_url && <button className="btn sm ghost" onClick={() => token && void act(() => rpc.teamUpdate(token, null, null, true))}>{t('tm.remove_img')}</button>}
            </div>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="tc-name"><b>{shown}</b>{mine && <span className="muted small">{t('tm.only_leader')}</span>}</div>
        )}
      </div>

      <div className="tc-members">
        <AnimatePresence initial={false}>
          {members.map((p) => (
            <motion.div key={p.id} layout className={`tc-member${p.id === meId ? ' me' : ''}`}
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={spring}>
              <PlayerAvatar p={p} size={40} />
              <div className="col" style={{ gap: 1, minWidth: 0 }}>
                <b className="tc-pn">
                  {p.name}
                  {team.leader_id === p.id && <span className="tc-crown" title={t('tm.leader')}><Icon name="crown" size={14} /></span>}
                  {p.is_host && <span className="muted small">· {t('lb.host')}</span>}
                </b>
                {p.class && <span className="muted small">{CLASSES[p.class].name}</span>}
              </div>
              {isLeader && p.id !== meId && (
                <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => token && void act(() => rpc.teamLeader(token, p.id))}>
                  {t('tm.make_leader')}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {Array.from({ length: Math.max(0, size - members.length) }, (_, i) => (
          <div key={`e${i}`} className="tc-member empty">{t('tm.open_slot')}</div>
        ))}
      </div>

      {!!meId && !mine && (
        <button className="btn block" disabled={members.length >= size}
          onClick={() => token && void act(() => rpc.teamJoin(token, team.idx))}>
          {members.length >= size ? t('tm.team_full') : t('tm.join')}
        </button>
      )}
      {mine && <span className="tc-you">{t('tm.your_team')}</span>}
    </motion.div>
  );
}
