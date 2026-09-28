import type { CardKind, PlayerClass } from './types';

export const CLASSES: Record<PlayerClass, { name: string; tagline: string; perk: string; cost: string }> = {
  ninja: {
    name: 'Ninja', tagline: 'Sees in the dark',
    perk: 'Once, from round 3: see every banned letter in play (not who owns them).',
    cost: 'If anyone cracks one of your letters, you take +3 letters (max once a round).',
  },
  mastermind: {
    name: 'Mastermind', tagline: 'Knows too much',
    perk: "Once: peek at one player's full letter list.",
    cost: 'One peeked letter leaks to the room as a hint. If nobody else guesses right that round, you take a strike.',
  },
  hero: {
    name: 'Hero', tagline: 'Takes the hit',
    perk: 'Once: absorb a letter aimed at someone else for +5 points.',
    cost: 'Comeback class — if you reach the final duel, you arrive with only 1 letter.',
  },
  villain: {
    name: 'Villain', tagline: 'Glass cannon',
    perk: 'Your Attack cards add 2 letters instead of 1.',
    cost: "You can't use Shield cards.",
  },
  hacker: {
    name: 'Hacker', tagline: 'Ghost in the machine',
    perk: 'Your Attack cards are anonymous hacks: the victim plays next round without seeing their own locks.',
    cost: 'A hacked player gets one trace. If they name you, you are exposed and your own locks go dark for a round.',
  },
  mimic: {
    name: 'Mimic', tagline: 'Wears your face',
    perk: "Once: become another player's class for the rest of the game — with a fresh perk.",
    cost: 'You inherit their downside too. No going back.',
  },
  gambler: {
    name: 'Gambler', tagline: 'All in, every round',
    perk: 'Each answer phase you may bet on your word: valid = double points.',
    cost: 'Bust and you lose 10 points on top of the strike — and everyone sees you betting.',
  },
  thief: {
    name: 'Thief', tagline: 'Sticky fingers',
    perk: "Crack someone's lock and you steal a card from their hand instead of drawing.",
    cost: 'Miss a guess and you drop one of your cards into their hand.',
  },
  parasite: {
    name: 'Parasite', tagline: 'Feeds on the strong',
    perk: 'Each round, latch onto a player: for every lock they gain, you shed one of yours.',
    cost: 'If your host gets knocked out that round, you take a strike. The latch is public.',
  },
  oracle: {
    name: 'Oracle', tagline: 'Saw it coming',
    perk: "Once: see next round's prompt a whole round early.",
    cost: 'Next round, your word is shown to everyone the moment you lock it in.',
  },
  wildcard: {
    name: 'Wildcard', tagline: 'Pure chaos',
    perk: 'While you live, every round opens with a random twist: lock swap, no-E round, card shuffle, double points, amnesty or speed round.',
    cost: 'The chaos hits you exactly as hard as everyone else.',
  },
  jester: {
    name: 'Jester', tagline: 'Switcheroo',
    perk: 'Once: swap your entire lock rack with another player.',
    cost: 'Every lock you receive is revealed to the whole room.',
  },
};

export const CLASS_ORDER: PlayerClass[] = [
  'ninja', 'mastermind', 'hero', 'villain', 'hacker', 'mimic',
  'gambler', 'thief', 'parasite', 'oracle', 'wildcard', 'jester',
];

export const CHAOS_INFO: Record<string, { name: string; text: string }> = {
  swap: { name: 'Lock swap', text: 'Everyone passed one lock to the player on their left.' },
  no_e: { name: 'No-E round', text: 'Nobody may use the letter E this round.' },
  shuffle: { name: 'Card shuffle', text: 'Every card in play was dealt out again.' },
  double: { name: 'Double points', text: 'Every valid word scores double this round.' },
  amnesty: { name: 'Amnesty', text: 'Everyone lost one lock.' },
  speed: { name: 'Speed round', text: 'Half the answer time. Go!' },
};

export const CARD_INFO: Record<CardKind, { name: string; text: string }> = {
  attack: { name: 'Attack', text: 'Add a letter to someone' },
  shield: { name: 'Shield', text: 'Block a letter aimed at you' },
  cleanse: { name: 'Cleanse', text: 'Remove one of your letters' },
};
