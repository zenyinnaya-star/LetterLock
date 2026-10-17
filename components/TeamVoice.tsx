'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTeamExtra } from '@/hooks/useTeamExtra';
import { useT } from '@/lib/i18n/react';
import { supabase } from '@/lib/supabase';
import type { RoomState } from '@/lib/types';
import { Icon } from './icons';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * Push-to-talk voice for teammates only.
 * - Audio flows peer-to-peer (WebRTC mesh: 2-3 people), never through our servers.
 * - Signaling uses a Supabase Realtime channel named after the team's secret voice_key, which the server only
 *   ever hands to that team's members, and we only accept peers who are on our team in the room state.
 * - TURN relay (for networks that block direct connections) comes from env:
 *   NEXT_PUBLIC_TURN_URLS (comma-separated), NEXT_PUBLIC_TURN_USERNAME, NEXT_PUBLIC_TURN_CREDENTIAL.
 */
function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = process.env.NEXT_PUBLIC_TURN_URLS;
  if (urls) list.push({ urls: urls.split(',').map((u) => u.trim()).filter(Boolean), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL });
  return list;
}

type Sig = { from: string; to: string; kind: 'offer' | 'answer' | 'ice'; data: unknown };
type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; sender: RTCRtpSender | null };

export function TeamVoice({ state, token }: { state: RoomState; token: string | null }) {
  const t = useT();
  const me = state.me;
  const teamMode = state.room.settings?.mode === 'team';
  const tx = useTeamExtra(token, teamMode && !!me?.team_id);
  const [joined, setJoined] = useState(false);
  const [talking, setTalking] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inVoice, setInVoice] = useState<Record<string, boolean>>({});
  const [speakers, setSpeakers] = useState<Record<string, boolean>>({});
  const [linked, setLinked] = useState<Record<string, string>>({});
  const peers = useRef(new Map<string, Peer>());
  const mic = useRef<MediaStreamTrack | null>(null);
  const chan = useRef<ReturnType<ReturnType<typeof supabase>['channel']> | null>(null);
  const deafRef = useRef(false);
  deafRef.current = deaf;

  const myId = me?.id ?? '';
  const teammates = state.players.filter((p) => p.team_id && p.team_id === me?.team_id && p.id !== myId && !p.quit);
  const mateIds = teammates.map((p) => p.id).sort().join(',');
  const allowed = useRef(new Set<string>());
  allowed.current = new Set(teammates.map((p) => p.id));

  const send = useCallback((s: Omit<Sig, 'from'>) => {
    void chan.current?.send({ type: 'broadcast', event: 'sig', payload: { ...s, from: myId } });
  }, [myId]);

  const peerFor = useCallback((id: string, initiator = false): Peer => {
    let p = peers.current.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = deafRef.current;
    // only the caller creates the audio transceiver; the answerer adopts the one the offer creates
    const tr = initiator ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null;
    if (tr && mic.current) void tr.sender.replaceTrack(mic.current);
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] ?? new MediaStream([e.track]); void audio.play().catch(() => undefined); };
    pc.onicecandidate = (e) => { if (e.candidate) send({ to: id, kind: 'ice', data: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      setLinked((v) => ({ ...v, [id]: pc.connectionState }));
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { drop(id); }
    };
    p = { pc, audio, sender: tr?.sender ?? null };
    peers.current.set(id, p);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  function drop(id: string) {
    const p = peers.current.get(id);
    if (!p) return;
    try { p.pc.close(); } catch { /* ignore */ }
    p.audio.srcObject = null;
    peers.current.delete(id);
    setLinked((v) => { const n = { ...v }; delete n[id]; return n; });
  }

  async function call(id: string) {
    const p = peerFor(id, true);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    send({ to: id, kind: 'offer', data: offer });
  }

  // join / leave the private channel
  useEffect(() => {
    if (!joined || !tx?.voice_key || !myId) return;
    const sb = supabase();
    const ch = sb.channel(`tv-${tx.voice_key}`, { config: { broadcast: { self: false }, presence: { key: myId } } });
    chan.current = ch;
    ch.on('broadcast', { event: 'sig' }, async ({ payload }) => {
      const s = payload as Sig;
      if (s.to !== myId || !allowed.current.has(s.from)) return; // only my teammates, only messages for me
      const p = peerFor(s.from);
      try {
        if (s.kind === 'offer') {
          await p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
          const tr = p.pc.getTransceivers()[0];
          if (tr) { tr.direction = 'sendrecv'; p.sender = tr.sender; if (mic.current) await tr.sender.replaceTrack(mic.current); }
          const ans = await p.pc.createAnswer();
          await p.pc.setLocalDescription(ans);
          send({ to: s.from, kind: 'answer', data: ans });
        } else if (s.kind === 'answer') {
          await p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        } else if (s.kind === 'ice') {
          await p.pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => undefined);
        }
      } catch { /* a racing renegotiation; the next presence sync retries */ }
    });
    ch.on('broadcast', { event: 'talk' }, ({ payload }) => {
      const { id, on } = payload as { id: string; on: boolean };
      if (allowed.current.has(id)) setSpeakers((v) => ({ ...v, [id]: on }));
    });
    ch.on('presence', { event: 'sync' }, () => {
      const present = Object.keys(ch.presenceState()).filter((id) => allowed.current.has(id));
      setInVoice(Object.fromEntries(present.map((id) => [id, true])));
      // the lower id makes the offer, so two peers never both call each other
      for (const id of present) if (myId < id && !peers.current.has(id)) void call(id);
      for (const id of [...peers.current.keys()]) if (!present.includes(id)) drop(id);
    });
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') void ch.track({ id: myId }); });
    return () => {
      for (const id of [...peers.current.keys()]) drop(id);
      void sb.removeChannel(ch);
      chan.current = null;
      setInVoice({}); setSpeakers({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, tx?.voice_key, myId, mateIds]);

  // stop the mic when leaving
  useEffect(() => () => { mic.current?.stop(); mic.current = null; }, []);

  async function join() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const track = stream.getAudioTracks()[0];
      track.enabled = false; // push-to-talk: silent until held
      mic.current = track;
      for (const p of peers.current.values()) void p.sender?.replaceTrack(track);
      setJoined(true);
    } catch {
      setErr(t('tv.denied'));
    }
  }
  function leave() {
    setJoined(false); setTalking(false);
    mic.current?.stop(); mic.current = null;
  }

  const ptt = useCallback((on: boolean) => {
    if (!mic.current || deafRef.current) on = false;
    if (mic.current) mic.current.enabled = on;
    setTalking(on);
    void chan.current?.send({ type: 'broadcast', event: 'talk', payload: { id: myId, on } });
  }, [myId]);

  // hold V to talk (ignored while typing)
  useEffect(() => {
    if (!joined) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== 'v' && e.key !== 'V')) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      ptt(true);
    };
    const up = (e: KeyboardEvent) => { if (e.key === 'v' || e.key === 'V') ptt(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [joined, ptt]);

  useEffect(() => { for (const p of peers.current.values()) p.audio.muted = deaf; if (deaf) ptt(false); }, [deaf, ptt]);

  if (!teamMode || !me?.team_id || !tx?.voice_key) return null;

  return (
    <div className={`tv-dock${joined ? ' on' : ''}`} role="region" aria-label={t('tv.title')}>
      <div className="tv-head">
        <Icon name="users" size={14} /> {t('tv.title')}
        <span className="tv-lock" title={t('tv.private')}><Icon name="lock" size={11} /></span>
      </div>
      <div className="tv-mates">
        {teammates.map((p) => (
          <div key={p.id} className={`tv-mate${inVoice[p.id] ? ' in' : ''}${speakers[p.id] ? ' speaking' : ''}`} title={p.name}>
            <PlayerAvatar p={p} size={26} />
            <span>{p.name}</span>
            <em>{speakers[p.id] ? t('tv.talking') : inVoice[p.id] ? (linked[p.id] === 'connected' ? t('tv.in') : t('tv.connecting')) : ''}</em>
          </div>
        ))}
      </div>
      {!joined ? (
        <button className="btn sm" onClick={() => void join()}><Icon name="users" size={14} /> {t('tv.join')}</button>
      ) : (
        <div className="tv-ctrl">
          <motion.button className={`tv-ptt${talking ? ' live' : ''}`} disabled={deaf}
            onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); ptt(true); }}
            onPointerUp={() => ptt(false)} onPointerCancel={() => ptt(false)} onContextMenu={(e) => e.preventDefault()}
            animate={talking ? { scale: [1, 1.06, 1] } : { scale: 1 }} transition={talking ? { repeat: Infinity, duration: 0.9 } : {}}>
            {talking ? t('tv.talking') : t('tv.hold')}
          </motion.button>
          <button className={`btn sm ghost${deaf ? ' on' : ''}`} onClick={() => setDeaf((v) => !v)} aria-pressed={deaf}>{deaf ? t('tv.unmute') : t('tv.mute')}</button>
          <button className="btn sm ghost" onClick={leave} aria-label={t('tv.leave')}><Icon name="x" size={13} /></button>
        </div>
      )}
      <AnimatePresence>{joined && <motion.div className="tv-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{t('tv.key')} · {t('tv.private')}</motion.div>}</AnimatePresence>
      {err && <div className="tv-err">{err}</div>}
    </div>
  );
}
