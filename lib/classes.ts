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
};

export const CLASS_ORDER: PlayerClass[] = ['ninja', 'mastermind', 'hero', 'villain'];

export const CARD_INFO: Record<CardKind, { name: string; text: string }> = {
  attack: { name: 'Attack', text: 'Add a letter to someone' },
  shield: { name: 'Shield', text: 'Block a letter aimed at you' },
  cleanse: { name: 'Cleanse', text: 'Remove one of your letters' },
};
