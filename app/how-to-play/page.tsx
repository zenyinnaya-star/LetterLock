import Link from 'next/link';
import { CardIcon, ClassIcon, Icon } from '@/components/icons';
import { RulesVideo } from '@/components/RulesVideo';
import { Wordmark } from '@/components/ui';
import { CARD_INFO, CLASSES, CLASS_ORDER } from '@/lib/classes';
import type { CardKind } from '@/lib/types';

export const metadata = { title: 'How to play — Letterlock' };

export default function HowToPlay() {
  return (
    <main className="shell narrow rules">
      <header className="topbar">
        <Wordmark />
        <Link href="/" className="btn sm">Play</Link>
      </header>
      <h1>How to play</h1>
      <RulesVideo />
      <p className="big">Answer the prompt with a real word — without using any of <b>your banned letters</b>. Survive a round and you get another one. Last player standing wins.</p>

      <h2>The basics</h2>
      <ul>
        <li>2–12 players, each on their own device. One person creates a room and shares the 4-letter code. The host can tune timers, strikes, cards and perks with the gear in the lobby.</li>
        <li>Everyone starts with <b>1 secret banned letter</b> (always a consonant). Only you can see yours.</li>
        <li>Each round shows a prompt, like “Something cold”. Type a word that fits and doesn&apos;t contain any of your banned letters.</li>
        <li>Your word has to <b>fit the prompt</b> — &ldquo;A type of food&rdquo; takes <i>pizza</i>, not <i>car</i>. Off-topic words count as a strike.</li>
        <li>Words must be real (dictionary-checked), <b>3+ letters</b>, and you can&apos;t reuse your own earlier words. Other players can use the same word.</li>
        <li>The clock always runs to zero — you can change your answer until then. Answers reveal together.</li>
      </ul>

      <h2>Rounds &amp; timers</h2>
      <ol>
        <li><b>Answer</b> — 60s in round 1, 10s less each round, never below 20s (host can change this).</li>
        <li><b>Reveal</b> — see everyone&apos;s word and who slipped up.</li>
        <li><b>Guess</b> (20s) — guess one letter another player can&apos;t use. Hit = you draw a card.</li>
        <li><b>Cards</b> (8s) — play cards, block attacks, then new letters land.</li>
      </ol>
      <p>Everyone who gave a clean answer gains <b>1 new random banned letter</b>. The better you do, the harder it gets. (Nobody gets more than 2 banned vowels.)</p>

      <h2>Strikes</h2>
      <ul>
        <li>A banned letter, a non-word, a repeat, or no answer = <b>1 strike</b>.</li>
        <li>A clean round wipes your strikes.</li>
        <li><b>2 strikes and you&apos;re out</b> (the host can set 1–3) — you become a spectator and can see everyone&apos;s letters.</li>
        <li>Rage quit mid-game and the whole room hears you <b>chickened out</b>.</li>
      </ul>

      <h2>Cards (hold up to 2)</h2>
      {(Object.keys(CARD_INFO) as CardKind[]).map((k) => (
        <div key={k} className="line">
          <CardIcon kind={k} size={24} />
          <span><b>{CARD_INFO[k].name}</b> — {CARD_INFO[k].text}.
            {k === 'shield' ? ' Only when something is aimed at you.' : k === 'cleanse' ? ' Never below 1 letter.' : ''}</span>
        </div>
      ))}

      <h2>Classes</h2>
      <p>In classic mode <b>your class is secret</b>. Everyone sees your avatar (the default one or a photo you upload), and the action banners only name the class — <i>“The Ninja attacked Ava”</i> — so part of the game is working out who&apos;s who. All classes are revealed at the end. In 1v1 mode classes are open.</p>
      {CLASS_ORDER.map((c) => (
        <div key={c} className="line">
          <ClassIcon cls={c} size={36} />
          <span><b>{CLASSES[c].name}</b> — {CLASSES[c].perk} <i className="muted">Catch:</i> {CLASSES[c].cost}</span>
        </div>
      ))}

      <h2>The final duel</h2>
      <p>When two players remain: VS screen, <b>+1 letter each</b>, 20-second rounds (host setting), and <b>strikes never reset</b>. Last one standing wins.</p>
      <h2>1v1 mode</h2>
      <p>Hit <b>1v1 Duel</b> on the home page (or pick it in the lobby gear) for a two-player room that opens straight on the VS screen with a 3-2-1 countdown, the duel music and a fighting-game health bar for strikes. Duel rules from round one.</p>
      <h2>Wildcard chaos</h2>
      <p>While a Wildcard is alive, every round from round 2 opens with a random twist: <b>lock swap</b>, <b>no-E round</b>, <b>card shuffle</b>, <b>double points</b>, <b>amnesty</b> (everyone drops a lock) or a <b>speed round</b> (half time).</p>

      <h2>Titles</h2>
      <div className="line"><span style={{ color: '#ffcf4a' }}><Icon name="trophy" size={24} /></span><span><b>Champion</b> — last one standing.</span></div>
      <div className="line"><span style={{ color: '#b69cff' }}><Icon name="bulb" size={24} /></span><span><b>Albert Einstein</b> — most total letters in valid words.</span></div>
      <div className="line"><span style={{ color: '#ff7a90' }}><Icon name="horns" size={24} /></span><span><b>The Villain</b> — stacked the most letters on other players.</span></div>
      <p className="muted small">Points: word length, plus 2 bonus per letter beyond 6. If everyone left is knocked out in the same round, the one with the most points wins.</p>
      <p style={{ marginTop: 30 }}><Link href="/" className="btn lg">Start playing</Link></p>
    </main>
  );
}
