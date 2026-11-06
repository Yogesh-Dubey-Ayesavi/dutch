import type { Action, GameView } from '../../engine/src/index';
export const PROTOCOL_VERSION=1 as const;
export interface ActionMessage {v:1;type:'action';id:string;expectedVersion:number;action:Action}
export type IceSignal={type:'offer'|'answer';sdp:string}|{type:'candidate';candidate:{candidate:string;sdpMid?:string|null;sdpMLineIndex?:number|null;usernameFragment?:string|null}|null};
export type ClientMessage=ActionMessage|{v:1;type:'sync'}|{v:1;type:'emote';emoji:string}|{v:1;type:'chat';text:string}|{v:1;type:'signal';to:string;signal:IceSignal};
export type SoundName='shuffle'|'deal'|'draw'|'snap'|'flip'|'power'|'penalty'|'dutch'|'victory'|'burn'|'whoop'|'tick';
export type ServerMessage={v:1;type:'sound';name:SoundName;eventId:string}|{v:1;type:'state';state:GameView;ack?:string}|{v:1;type:'error';message:string;actionId?:string}|{v:1;type:'emote';playerId:string;emoji:string;id?:string}|{v:1;type:'chat';line:ChatLine}|{v:1;type:'chatHistory';lines:ChatLine[]}|{v:1;type:'signal';from:string;signal:IceSignal};
export interface SeatResponse {code:string;playerId:string;token:string}
/** Each reaction has its own sound at every seat (see client sound.ts). */
export const EMOTES=['😂','👏','🥂','😱','😏','👋','💚'];
export interface ChatLine {id:string;playerId:string;text:string;at:number}
export const CHAT_MAX=140;
export const CHAT_HISTORY=40;
