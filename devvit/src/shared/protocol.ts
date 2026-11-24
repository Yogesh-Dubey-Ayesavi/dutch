/** The few wire types the original Dutch client shares with its server (ported from packages/protocol). */
export type SoundName = 'shuffle' | 'deal' | 'draw' | 'snap' | 'flip' | 'power' | 'penalty' | 'dutch' | 'victory' | 'burn' | 'whoop' | 'tick';
/** Each reaction has its own sound at every seat (see client sound.ts). */
export const EMOTES = ['😂', '👏', '🥂', '😱', '😏', '👋', '💚'];
export type ChatLine = { id: string; playerId: string; text: string; at: number };
export const CHAT_MAX = 140;
/** Table talk is quick replies only: no free text ever travels between players. */
export const CHAT_PRESETS = ['Good game', 'Nice one', 'Unlucky', 'Your move', 'Well played', 'Oops', 'Hurry up', 'Ha, got you'];
export const CHAT_HISTORY = 40;
