'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAOS_INFO, CLASSES, CLASS_ORDER } from '@/lib/classes';
import { getLang, localeOf, t, type Key } from '@/lib/i18n';
import { Rich, useT } from '@/lib/i18n/react';
import { getPrefs } from '@/lib/prefs';
import { CardIcon, ClassIcon, Icon } from './icons';

/**
 * Narrated, animated "how to play" video, built from the real game pieces so it never drifts from the rules.
 * Each scene waits for its narration to finish (or its own timer when the voice is off).
 */

interface Scene { say: Key; caption: Key; min: number; render: () => React.ReactNode }

const pop = (delay = 0) => ({ initial: { scale: 0, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 420, damping: 20, delay } });
const drop = (delay = 0) => ({ initial: { y: -90, rotate: -16, opacity: 0 }, animate: { y: 0, rotate: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 520, damping: 22, delay } });

function T({ c, state = '', delay = 0, lock = false }: { c: string; state?: '' | 'bad' | 'good' | 'glitch'; delay?: number; lock?: boolean }) {
  return (
    <motion.span className={`tile rv-tile ${state}`} {...drop(delay)}>
      {c}
      {lock && <span className="tile-lock"><Icon name="lock" size={12} strokeWidth={2.6} /></span>}
    </motion.span>
  );
}

function Typed({ word, bad = '', delay = 0 }: { word: string; bad?: string; delay?: number }) {
  return (
    <div className="rv-typed">
      {word.split('').map((c, i) => (
        <motion.span key={i} className={`ch${bad.includes(c) ? ' bad' : ''}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + i * 0.18 }}>{c}</motion.span>
      ))}
    </div>
  );
}

const SCENES: Scene[] = [
  {
    say: 'rv.s1.say',
    caption: 'rv.s1.cap',
    min: 4200,
    render: () => (
      <div className="rv-center">
        <div className="rv-row">{'LETTER'.split('').map((c, i) => <T key={i} c={c} delay={i * 0.08} />)}</div>
        <div className="rv-row">{'LOCK'.split('').map((c, i) => <T key={i} c={c} state="bad" delay={0.5 + i * 0.08} lock />)}</div>
        <motion.p className="rv-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>{t('rv.s1.sub')}</motion.p>
      </div>
    ),
  },
  {
    say: 'rv.s2.say',
    caption: 'rv.s2.cap',
    min: 4500,
    render: () => (
      <div className="rv-center">
        <motion.div className="rv-rack" {...pop(0.1)}>
          <span className="rv-rack-label">{t('rv.locks')}</span>
          <T c="R" lock delay={0.4} />
        </motion.div>
        <motion.div className="rv-peek" initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}>
          <Icon name="eye" size={20} /> <Rich k="rv.s2.peek" />
        </motion.div>
      </div>
    ),
  },
  {
    say: 'rv.s3.say',
    caption: 'rv.s3.cap',
    min: 7000,
    render: () => (
      <div className="rv-center">
        <motion.div className="rv-prompt" {...pop(0)}>{t('rv.s3.prompt')}</motion.div>
        <div className="rv-two">
          <div className="rv-col"><Typed word={t('rv.s3.good')} delay={0.6} /><motion.span className="rv-verdict good" {...pop(1.6)}><Icon name="check" size={16} /> +{t('rv.s3.good').length}</motion.span></div>
          <div className="rv-col"><Typed word={t('rv.s3.bad')} bad="R" delay={2.2} /><motion.span className="rv-verdict bad" {...pop(3.4)}><Icon name="x" size={16} /> {t('rv.strike')}</motion.span></div>
        </div>
      </div>
    ),
  },
  {
    say: 'rv.s4.say',
    caption: 'rv.s4.cap',
    min: 5500,
    render: () => (
      <div className="rv-center">
        <div className="rv-rack">
          <span className="rv-rack-label">{t('rv.locks')}</span>
          <T c="R" lock /><T c="T" lock delay={0.9} /><T c="M" lock delay={1.6} />
        </div>
        <motion.p className="rv-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>{t('rv.s4.out')}</motion.p>
      </div>
    ),
  },
  {
    say: 'rv.s5.say',
    caption: 'rv.s5.cap',
    min: 5800,
    render: () => (
      <div className="rv-center">
        <div className="rv-two">
          <motion.div className="rv-col" {...pop(0)}><ClassIcon cls="villain" size={84} /><span>Ava</span></motion.div>
          <motion.div className="rv-guess" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.8 }}>“K”</motion.div>
          <motion.div className="rv-col" {...pop(0.2)}><ClassIcon cls="ninja" size={84} /><span>Ben</span></motion.div>
        </div>
        <motion.div className="rv-crack" {...pop(1.8)}><Icon name="target" size={18} /> {t('rv.s5.cracked', { name: 'Ben', l: 'K' })}</motion.div>
        <motion.div className="minicard attack rv-card" initial={{ rotateY: 180, opacity: 0, y: 30 }} animate={{ rotateY: 0, opacity: 1, y: 0 }} transition={{ delay: 2.6 }}>
          <span className="art"><CardIcon kind="attack" size={22} /></span><span>{t('cd.attack')}<small>{t('cd.attack_t')}</small></span>
        </motion.div>
      </div>
    ),
  },
  {
    say: 'rv.s6.say',
    caption: 'rv.s6.cap',
    min: 7200,
    render: () => (
      <div className="rv-center">
        <div className="rv-cards">
          {(['attack', 'shield', 'cleanse'] as const).map((k, i) => (
            <motion.div key={k} className={`rv-bigcard ${k}`} initial={{ y: 80, rotate: (i - 1) * 14, opacity: 0 }}
              animate={{ y: 0, rotate: (i - 1) * 6, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.3 + i * 0.9 }}>
              <CardIcon kind={k} size={40} />
              <div>
                <b>{t(`cd.${k}`)}</b>
                <small>{t(`rv.s6.${k}`)}</small>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    say: 'rv.s7.say',
    caption: 'rv.s7.cap',
    min: 8500,
    render: () => (
      <div className="rv-center">
        <div className="rv-classes">
          {CLASS_ORDER.map((c, i) => (
            <motion.div key={c} className="rv-class" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.22 }}>
              <ClassIcon cls={c} size={78} />
              <b>{CLASSES[c].name}</b>
              <small>{CLASSES[c].tagline}</small>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    say: 'rv.s8.say',
    caption: 'rv.s8.cap',
    min: 9000,
    render: () => (
      <div className="rv-center">
        <div className="rv-rack hacked">
          <span className="rv-rack-label">{t('rv.locks')}</span>
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="tile rv-tile glitch" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.4, 1], x: [0, -3, 3, 0] }}
              transition={{ delay: 0.4 + i * 0.2, duration: 0.6, repeat: 3 }}>?</motion.span>
          ))}
        </div>
        <motion.div className="rv-trace" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.2 }}>
          <Icon name="terminal" size={18} /> {t('rv.s8.trace')} <ClassIcon cls="hacker" size={40} />
          <motion.span className="rv-verdict good" {...pop(4.6)}>{t('rv.s8.caught')}</motion.span>
        </motion.div>
      </div>
    ),
  },
  {
    say: 'rv.s9.say',
    caption: 'rv.s9.cap',
    min: 8000,
    render: () => (
      <div className="rv-center">
        <motion.div className="rv-wheel" animate={{ rotate: 1440 }} transition={{ duration: 2.4, ease: [0.2, 0.8, 0.3, 1] }}>
          <Icon name="dice" size={56} />
        </motion.div>
        <div className="rv-chaos">
          {(['swap', 'no_e', 'shuffle', 'double', 'amnesty', 'speed'] as const).map((k, i) => (
            <motion.span key={k} className="chaos-chip" style={{ margin: 0 }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 2.4 + i * 0.25, type: 'spring', stiffness: 500, damping: 18 }}>{CHAOS_INFO[k].name}</motion.span>
          ))}
        </div>
      </div>
    ),
  },
  {
    say: 'rv.s10.say',
    caption: 'rv.s10.cap',
    min: 5500,
    render: () => (
      <div className="rv-center rv-duel">
        <div className="rv-two row">
          <motion.div initial={{ x: -140, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}><ClassIcon cls="hero" size={100} /></motion.div>
          <motion.span className="rv-vs" initial={{ scale: 4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 600, damping: 16 }}>VS</motion.span>
          <motion.div initial={{ x: 140, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}><ClassIcon cls="hacker" size={100} /></motion.div>
        </div>
      </div>
    ),
  },
  {
    say: 'rv.s11.say',
    caption: 'rv.s11.cap',
    min: 5500,
    render: () => (
      <div className="rv-center">
        <motion.div className="rv-trophy" {...pop(0.1)}><Icon name="trophy" size={64} /></motion.div>
        <motion.div className="action-banner chicken" style={{ position: 'relative' }} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 2.2 }}>
          <div className="who"><motion.span className="chicken" animate={{ rotate: [0, -18, 14, 0] }} transition={{ repeat: Infinity, duration: 0.7 }}><Icon name="feather" size={28} /></motion.span></div>
          <div className="txt"><Rich k="rv.s11.chicken" vars={{ name: 'Dave' }} /><em>{t('rv.s11.rage')}</em></div>
        </motion.div>
      </div>
    ),
  },
];

export function RulesVideo() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<number[]>([]);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  const clear = useCallback(() => {
    timers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    timers.current = [];
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const tr = useT();
  const lang = getLang();

  // pick a narrator voice in the current interface language (re-picked when the language changes)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
      voice.current = (lang === 'en' ? vs.find((v) => /Google UK English Male|Daniel|Guy|Ryan|Alex|Male/i.test(v.name)) : undefined) ?? vs[0] ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener?.('voiceschanged', pick);
    return () => { window.speechSynthesis.removeEventListener?.('voiceschanged', pick); };
  }, [lang]);

  useEffect(() => clear, [clear]);

  // run the current scene: narrate + wait for both the narration and the scene's minimum length
  useEffect(() => {
    if (!playing) return;
    const scene = SCENES[idx];
    let spoke = true; // no browser TTS: Gideon is the only voice
    let waited = false;
    const t0 = performance.now();
    const next = () => {
      if (!spoke || !waited) return;
      if (idx < SCENES.length - 1) setIdx(idx + 1);
      else { setPlaying(false); setProgress(1); }
    };
    if (!spoke) {
      const u = new SpeechSynthesisUtterance(t(scene.say));
      u.lang = localeOf();
      if (voice.current) u.voice = voice.current;
      u.rate = 1.0; u.pitch = 0.8;
      u.onend = () => { spoke = true; next(); };
      u.onerror = () => { spoke = true; next(); };
      window.speechSynthesis.speak(u);
      timers.current.push(window.setTimeout(() => { spoke = true; next(); }, scene.min + 9000)); // never hang
    }
    timers.current.push(window.setTimeout(() => { waited = true; next(); }, scene.min));
    timers.current.push(window.setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / scene.min);
      setProgress((idx + f) / SCENES.length);
    }, 100) as unknown as number);
    return clear;
  }, [idx, playing, clear]);

  function play() { setStarted(true); if (idx === SCENES.length - 1 && progress >= 1) { setIdx(0); setProgress(0); } setPlaying(true); }
  function pause() { clear(); setPlaying(false); }
  function jump(i: number) { clear(); setStarted(true); setIdx(i); setProgress(i / SCENES.length); setPlaying(true); }

  const scene = SCENES[idx];
  const done = !playing && progress >= 1;

  return (
    <div className="rv">
      <div className="rv-screen" onClick={() => (playing ? pause() : play())}>
        <AnimatePresence mode="wait">
          <motion.div key={started ? idx : 'poster'} className="rv-scene"
            initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
            {started ? scene.render() : SCENES[0].render()}
          </motion.div>
        </AnimatePresence>
        {started && <div className="rv-caption">{tr(scene.caption)}</div>}
        {(!playing) && (
          <motion.button className="rv-bigplay" aria-label={done ? tr('rv.replay') : tr('rv.play')} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => { e.stopPropagation(); play(); }}>
            <Icon name={done ? 'replay' : 'play'} size={34} />
          </motion.button>
        )}
      </div>
      <div className="rv-controls">
        <button className="iconbtn" aria-label={playing ? tr('rv.pause') : tr('rv.play')} onClick={() => (playing ? pause() : play())}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <div className="rv-bar" role="slider" aria-label={tr('rv.progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="rv-fill" style={{ width: `${progress * 100}%` }} />
          {SCENES.map((_, i) => (
            <button key={i} className={`rv-tick${i <= idx && started ? ' on' : ''}`} style={{ left: `${(i / SCENES.length) * 100}%` }}
              aria-label={tr('rv.chapter', { n: i + 1 })} onClick={() => jump(i)} />
          ))}
        </div>
        <span className="muted small">{idx + 1}/{SCENES.length}</span>
      </div>
    </div>
  );
}
