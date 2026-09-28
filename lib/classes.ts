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
};

export const CLASS_ORDER: PlayerClass[] = ['ninja', 'mastermind', 'hero', 'villain', 'hacker'];

export const CARD_INFO: Record<CardKind, { name: string; text: string }> = {
  attack: { name: 'Attack', text: 'Add a letter to someone' },
  shield: { name: 'Shield', text: 'Block a letter aimed at you' },
  cleanse: { name: 'Cleanse', text: 'Remove one of your letters' },
};
