export type Phase = 'lobby' | 'answer' | 'reveal' | 'guess' | 'react' | 'duel_intro' | 'finished';
export type PlayerClass = 'ninja' | 'mastermind' | 'hero' | 'villain' | 'hacker'
  | 'mimic' | 'gambler' | 'thief' | 'parasite' | 'oracle' | 'wildcard' | 'jester';
export type ChaosKind = 'swap' | 'no_e' | 'shuffle' | 'double' | 'amnesty' | 'speed';
export type CardKind = 'attack' | 'shield' | 'cleanse';

export interface PublicPlayer {
  id: string;
  name: string;
  avatar_url: string | null;
  /** null = hidden (classic mode keeps other players' classes secret until the game ends) */
  class: PlayerClass | null;
  strikes: number;
  points: number;
  eliminated: boolean;
  perk_used: boolean;
  is_host: boolean;
  connected: boolean;
  react_ready: boolean;
  letters_stacked: number;
  letter_count: number;
  revealed: string[];
  letters: string[] | null; // only for spectators / game over
  answered: boolean;
  guessed: boolean;
  quit: boolean;
  exposed: boolean;
  hacked: boolean;
  orig_class: PlayerClass | null;
  betting: boolean;
  latched_to: string | null;
  oracle_word: string | null;
  team_id?: string | null;
}

export interface IntelNinja { kind: 'ninja'; round: number; letters: string[] }
export interface IntelMastermind {
  kind: 'mastermind'; round: number; target_id: string; target_name: string; letters: string[]; leaked: string;
}
export interface IntelOracle { kind: 'oracle'; round: number; prompt: string }
export type Intel = IntelNinja | IntelMastermind | IntelOracle;

export interface Me {
  id: string;
  name: string;
  class: PlayerClass;
  strikes: number;
  points: number;
  eliminated: boolean;
  perk_used: boolean;
  charge?: number;
  hacked: boolean;
  can_trace: boolean;
  bet_active: boolean;
  latched_to: string | null;
  letters: { letter: string; revealed: boolean; hidden?: boolean }[];
  cards: { id: number; kind: CardKind }[];
  answer: { word: string; valid: boolean; reason: string | null; points: number } | null;
  guess: { target_id: string; letter: string; correct: boolean } | null;
  intel: Intel[];
  used_words: string[];
  team_id?: string | null;
}

export interface RevealRow { player_id: string; word: string; valid: boolean; reason: string | null; points: number }
export interface GuessResult { guesser_id: string; target_id: string; correct: boolean; letter: string | null }
export interface Pending {
  id: number; target_id: string; source_id: string | null; source_class: PlayerClass | null; kind: 'attack' | 'ninja' | 'hack';
  amount: number; status: 'pending' | 'blocked' | 'applied'; absorbed_by: string | null;
}

export interface RoomState {
  server_time: string;
  room: {
    code: string;
    phase: Phase;
    round: number;
    duel: boolean;
    state_version: number;
    host_id: string | null;
    winner_id: string | null;
    winner_team?: number | null;
    phase_ends_at: string | null;
    answer_seconds: number;
    settings: RoomSettings;
    chaos: ChaosKind | null;
  };
  prompt: string | null;
  me: Me | null;
  players: PublicPlayer[];
  teams?: Team[];
  hints: { round: number; text: string }[];
  reveal: RevealRow[];
  guess_results: GuessResult[];
  pending: Pending[];
  feed: FeedItem[];
  titles: { champion: string | null; einstein: string | null; villain: string | null } | null;
}

export interface Team {
  id: string;
  idx: 0 | 1;
  name: string;
  image_url: string | null;
  leader_id: string | null;
  points: number;
  letter_count: number;
}

export interface Session { token: string; playerId: string }

export interface RoomSettings {
  mode: 'classic' | 'duel' | 'team';
  team_size?: 2 | 3;
  rounds?: number;
  lang?: 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';
  max_players: number;
  answer_seconds: number;
  shrink: boolean;
  guess_seconds: number;
  react_seconds: number;
  duel_seconds: number;
  cards: boolean;
  perks: boolean;
  strikes: number;
  twist?: 'none' | 'reverse' | 'chaos' | 'memory';
  ultimates?: boolean;
}

export type FeedType = 'attack' | 'hack' | 'block' | 'cleanse' | 'absorb' | 'caught' | 'trace_miss' | 'chicken'
  | 'bet' | 'bet_win' | 'bet_lose' | 'steal' | 'drop' | 'latch' | 'drain' | 'host_down' | 'mimic' | 'oracle' | 'swap' | 'chaos' | 'ult';
export interface FeedItem {
  id: number;
  round: number;
  type: FeedType;
  from: string | null;
  from_class?: PlayerClass | null;
  to?: string | null;
  amount?: number;
  what?: string;
  name?: string;
}
