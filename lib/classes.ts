import { t, type Key } from './i18n';
import type { CardKind, PlayerClass } from './types';

export const CLASS_ORDER: PlayerClass[] = [
  'ninja', 'mastermind', 'hero', 'villain', 'hacker', 'mimic',
  'gambler', 'thief', 'parasite', 'oracle', 'wildcard', 'jester',
];

type Info = { name: string; tagline: string; perk: string; cost: string };

// Getters so every read is in the player's current interface language.
export const CLASSES = Object.fromEntries(CLASS_ORDER.map((c) => [c, {
  get name() { return t(`cl.${c}` as Key); },
  get tagline() { return t(`cl.${c}.tag` as Key); },
  get perk() { return t(`cl.${c}.perk` as Key); },
  get cost() { return t(`cl.${c}.cost` as Key); },
}])) as Record<PlayerClass, Info>;

const CHAOS_KEYS = ['swap', 'no_e', 'shuffle', 'double', 'amnesty', 'speed'] as const;
export const CHAOS_INFO: Record<string, { name: string; text: string }> = Object.fromEntries(CHAOS_KEYS.map((k) => [k, {
  get name() { return t(`cx.${k}` as Key); },
  get text() { return t(`cx.${k}_t` as Key); },
}]));

const CARD_KEYS: CardKind[] = ['attack', 'shield', 'cleanse'];
export const CARD_INFO = Object.fromEntries(CARD_KEYS.map((k) => [k, {
  get name() { return t(`cd.${k}` as Key); },
  get text() { return t(`cd.${k}_t` as Key); },
}])) as Record<CardKind, { name: string; text: string }>;
