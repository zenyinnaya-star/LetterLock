import { getLang, type UiLang } from './i18n';
import gDe from './i18n/guide/de';
import gEs from './i18n/guide/es';
import gFr from './i18n/guide/fr';
import gHi from './i18n/guide/hi';
import gJa from './i18n/guide/ja';
import gZh from './i18n/guide/zh';
import type { PlayerClass } from './types';

export interface ClassGuide {
  style: string;               // one-word playstyle
  difficulty: 1 | 2 | 3;       // 1 easy · 3 hard
  how: string;                 // how the class actually plays, in plain words
  tips: string[];              // tips & tricks
  counter: string;             // how to beat it
}

export type GuideText = Omit<ClassGuide, 'difficulty'>;

const EN_GUIDE: Record<PlayerClass, ClassGuide> = {
  ninja: {
    style: 'Scout', difficulty: 2,
    how: 'You play quiet for two rounds, then from round 3 you flip on Ninja vision once and see every banned letter on the table. You don\'t learn who owns which, so you have to piece it together from how people answer.',
    tips: [
      'Hold vision until the table has 8+ locks — more letters means more info for one use.',
      'Cross-check vision with the reveal: a player who keeps dodging a letter probably owns it.',
      'Your own locks are a liability (+3 if cracked). Cleanse early rather than late.',
      'Answer with long, varied words so nobody can tell which letters you avoid.',
    ],
    counter: 'Guess the Ninja\'s letters hard — one crack costs them three.',
  },
  mastermind: {
    style: 'Intel', difficulty: 2,
    how: 'Once per game you read one player\'s whole lock rack. One of those letters leaks to the room as a hint, and if nobody else cracks a lock that round, you take a strike.',
    tips: [
      'Peek at the leader — cracking their locks swings the whole game.',
      'Use it in a round where other players are already guessing well, so the strike never lands.',
      'The leaked hint helps everyone; guess the letters that did NOT leak.',
      'Save attacks until after your peek so you know who\'s closest to going out.',
    ],
    counter: 'Sit on your guesses the round they peek — make them eat the strike.',
  },
  hero: {
    style: 'Support', difficulty: 1,
    how: 'When someone gets attacked, you can dive in and take the letter yourself for +5 points. It\'s a points engine with a catch: reach the final duel and you only bring one lock.',
    tips: [
      'Absorb when the attack would knock a strong rival\'s target out — you pick who survives.',
      'Take hits early while you have room; late game every lock hurts.',
      'Stack Cleanse cards to wash off the letters you soak.',
      'One lock in the duel is a weakness — keep your points lead so the duel doesn\'t matter.',
    ],
    counter: 'Attack the Hero directly — absorbing doesn\'t protect themselves.',
  },
  villain: {
    style: 'Aggro', difficulty: 1,
    how: 'Every Attack card you play adds two letters instead of one. You can\'t use Shields, so you live by pressure: keep enemies busy dodging.',
    tips: [
      'Hoard Attacks and drop them on whoever is one lock from trouble.',
      'Trade your Shields away mentally — they\'re dead cards, so play Cleanse instead.',
      'Short answers are fine; your damage is in the cards, not the score.',
      'Two-letter hits force weird words. Go after the players with the most locks already.',
    ],
    counter: 'Keep a Shield for the Villain — blocking one hit stops two letters.',
  },
  hacker: {
    style: 'Stealth', difficulty: 3,
    how: 'Your attacks are anonymous hacks. The victim plays the next round blind, unable to see their own locks. They get one trace — name you and you\'re exposed, and your locks go dark instead.',
    tips: [
      'Hack someone you\'ve never attacked before. Patterns get traced.',
      'Hack players with many locks — playing blind with 5 locks is brutal.',
      'Act normal in chat and reactions. The feed never shows your name.',
      'Spread hacks across players so no one has a clear motive.',
    ],
    counter: 'Trace whoever gained most from your bad round — hackers love the leader.',
  },
  mimic: {
    style: 'Flex', difficulty: 3,
    how: 'Once per game you copy another player\'s class for good, with a fresh perk. You get their downside too, and there\'s no going back.',
    tips: [
      'Watch the feed first. Banners reveal classes — copy the one that\'s winning.',
      'Copying a used perk gives you a fresh one — nab a Mastermind peek after they spent theirs.',
      'Villain is a strong late copy: instant double-damage attacks.',
      'Don\'t wait too long; a perk you copy on the last round is wasted.',
    ],
    counter: 'Hide your class — don\'t give the Mimic a target worth copying.',
  },
  gambler: {
    style: 'Risk', difficulty: 2,
    how: 'Every answer phase you can go all in on your word. If it\'s valid you score double; if it busts you lose 10 points on top of the strike. Everyone sees you betting.',
    tips: [
      'Only bet on words you\'re sure are real, in the category, and clear of your locks.',
      'Bet big on easy prompts, sit out on weird ones.',
      'Betting tells the room you\'re confident. Use that to bluff when you don\'t bet.',
      'When you\'re behind late, betting is your comeback button.',
    ],
    counter: 'Attack the Gambler right before they bet — extra locks cause busts.',
  },
  thief: {
    style: 'Economy', difficulty: 2,
    how: 'When you crack someone\'s lock you steal a card from their hand instead of drawing. If you miss a guess you drop one of your cards into their hand.',
    tips: [
      'Guess the players holding the most cards — bigger hands, better loot.',
      'Only guess when you\'re fairly sure; misses feed your enemies.',
      'Stolen Shields cut off the target\'s defence and give you one.',
      'Use common letters (E, A, R, S, T) early when odds are best.',
    ],
    counter: 'Spend your cards fast — an empty hand is nothing to steal.',
  },
  parasite: {
    style: 'Leech', difficulty: 3,
    how: 'Each round you latch onto one player. For every lock they gain that round, you shed one of yours. If your host gets knocked out that round, you take a strike, and the latch is public.',
    tips: [
      'Latch onto whoever is about to get attacked — the leader, the Villain\'s target.',
      'Never latch onto someone on their last strike.',
      'Latching is public: it can make others attack your host for you.',
      'Pair it with your own Attack cards on your host for guaranteed drains.',
    ],
    counter: 'Don\'t attack the Parasite\'s host — or knock the host out to give them a strike.',
  },
  oracle: {
    style: 'Prep', difficulty: 1,
    how: 'Once per game you see next round\'s prompt a full round early. The price is that your next word is shown to everyone the moment you lock it in.',
    tips: [
      'Use the extra time to find a long, high-scoring word that dodges your locks.',
      'Your word goes public, so avoid giving away which letters you\'re dodging.',
      'Lock in late in the round so others can\'t react to your word.',
      'Save it for rounds where you have lots of locks — that\'s when prep matters most.',
    ],
    counter: 'Read the Oracle\'s public word — the missing letters are a guessing hint.',
  },
  wildcard: {
    style: 'Chaos', difficulty: 1,
    how: 'While you\'re alive every round starts with a random twist: lock swap, no-E round, card shuffle, double points, amnesty or speed round. It hits you as hard as anyone.',
    tips: [
      'Chaos is fair — but you know it\'s coming. Stay flexible and keep E-free words ready.',
      'Double-points rounds are your time to answer long.',
      'Lock swaps help you when you have more locks than your neighbour.',
      'Stay alive: the twists stop the moment you\'re out.',
    ],
    counter: 'Knock the Wildcard out early to stop the chaos.',
  },
  jester: {
    style: 'Trickster', difficulty: 2,
    how: 'Once per game you swap your whole lock rack with another player. Every lock you get is revealed to the whole room.',
    tips: [
      'Let locks pile up on you, then swap with whoever has the fewest.',
      'Swap onto someone about to be attacked for maximum pain.',
      'Your revealed locks are public, so answer carefully after a swap.',
      'The swap resets your danger; use it the round before you\'d go out.',
    ],
    counter: 'Keep your rack small until the Jester has used their swap.',
  },
};

const TR: Partial<Record<UiLang, Partial<Record<PlayerClass, GuideText>>>> = { es: gEs, fr: gFr, de: gDe, ja: gJa, zh: gZh, hi: gHi };

/** Guide for a class in the player's current interface language (English fallback). */
export const CLASS_GUIDE = new Proxy(EN_GUIDE, {
  get(target, cls: string) {
    const base = target[cls as PlayerClass];
    const tr = TR[getLang()]?.[cls as PlayerClass];
    return base && tr ? { ...base, ...tr } : base;
  },
}) as Record<PlayerClass, ClassGuide>;
