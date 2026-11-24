import type { GameView } from '@engine';
import type { ChatLine, SoundName } from './protocol';
import type { Cosmetics, ItemType, ShopItem } from './catalog';

export interface Profile {
  userId: string; username: string; rating: number; lastDelta: number | null; chips: number;
  ratedGames: number; wins: number; rank: number | null; dailyBonusReady: boolean;
  owned: string[]; equipped: Record<ItemType, string>; cosmetics: Cosmetics; seenTutorial: boolean;
  /** The last tutorial chapter reached ('' = not started), so How to play resumes there. */
  tutorialAt: string;
  /** The player's Reddit avatar (snoovatar) image URL, when they have one. */
  avatar?: string;
}
export interface ActiveMatchSummary { matchId: string; opponent: string; round: number; you: number; them: number; botMsLeft: number | null }
export interface SessionResponse {
  profile: Profile; active: ActiveMatchSummary | null; subreddit: string;
  /** Reddit's version of this upload (what `devvit playtest` / `devvit upload` prints, e.g. 0.0.1.90). */
  appVersion?: string | null;
}

export type QueueStatus =
  | { status: 'waiting'; waitedMs: number; offerBot: boolean }
  | { status: 'matched'; matchId: string; opponent: Seat }
  | { status: 'idle' };

export interface Seat { userId: string; username: string; rating: number; cosmetics: Cosmetics; bot: boolean; avatar?: string }
export interface ChipLine { k: string; v: number }
export interface MatchResult {
  winner: string | null; forfeitBy: string | null; scores: Record<string, number>; rounds: number;
  rating: Record<string, { from: number; to: number }> | null; chips: Record<string, ChipLine[]> | null;
  autoDutchRounds: Record<string, number[]>; cancelled: boolean;
}
export interface MatchEnvelope {
  matchId: string; mode: 'ranked' | 'bot'; now: number; view: GameView; seats: Seat[];
  /** This viewer's private realtime channel: the server pushes their whole table there after every change. */
  live?: string | null;
  /** Server time the client should call /tick at, if something is scheduled. */
  nextTickAt: number | null;
  /** When the round-end screen gives way to the next deal. */
  /** Earliest time the next round may start (round end stays up at least until here). */
  resultsUntil: number | null;
  /** Latest time the round-end screen stays, whatever the players do. */
  resultsMaxUntil: number | null;
  /** Players who pressed Next round. */
  nextReady: string[];
  opponentStatus: 'connected' | 'disconnected' | 'bot';
  /** Server time a disconnected opponent forfeits at. */
  forfeitAt: number | null;
  result: MatchResult | null;
  shared: boolean;
  sound: { name: SoundName; id: string } | null;
  chat: ChatLine[];
}
export interface LeaderRow { rank: number; userId: string; username: string; rating: number; duels: number; avatar?: string }
export interface LeaderboardResponse { rows: LeaderRow[]; me: LeaderRow | null; cutoff: number | null }
export interface ShopResponse { items: (ShopItem & { owned: boolean; equipped: boolean })[]; chips: number }
export interface SharePreview { text: string; already: boolean; sharedAt: number | null; permalink: string | null }
export type ClientAction = Record<string, unknown> & { type: string };
