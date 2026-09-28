export type Phase = 'lobby' | 'answer' | 'reveal' | 'guess' | 'react' | 'duel_intro' | 'finished';
export type PlayerClass = 'ninja' | 'mastermind' | 'hero' | 'villain';
export type CardKind = 'attack' | 'shield' | 'cleanse';

export interface PublicPlayer {
  id: string;
  name: string;
  class: PlayerClass;
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
}

export interface IntelNinja { kind: 'ninja'; round: number; letters: string[] }
export interface IntelMastermind {
  kind: 'mastermind'; round: number; target_id: string; target_name: string; letters: string[]; leaked: string;
}
export type Intel = IntelNinja | IntelMastermind;

export interface Me {
  id: string;
  name: string;
  class: PlayerClass;
  strikes: number;
  points: number;
  eliminated: boolean;
  perk_used: boolean;
  letters: { letter: string; revealed: boolean }[];
  cards: { id: number; kind: CardKind }[];
  answer: { word: string; valid: boolean; reason: string | null; points: number } | null;
  guess: { target_id: string; letter: string; correct: boolean } | null;
  intel: Intel[];
  used_words: string[];
}

export interface RevealRow { player_id: string; word: string; valid: boolean; reason: string | null; points: number }
export interface GuessResult { guesser_id: string; target_id: string; correct: boolean; letter: string | null }
export interface Pending {
  id: number; target_id: string; source_id: string | null; kind: 'attack' | 'ninja';
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
    phase_ends_at: string | null;
    answer_seconds: number;
  };
  prompt: string | null;
  me: Me | null;
  players: PublicPlayer[];
  hints: { round: number; text: string }[];
  reveal: RevealRow[];
  guess_results: GuessResult[];
  pending: Pending[];
  titles: { champion: string | null; einstein: string | null; villain: string | null } | null;
}

export interface Session { token: string; playerId: string }
