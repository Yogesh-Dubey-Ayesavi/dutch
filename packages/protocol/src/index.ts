import type { Action, GameView } from '../../engine/src/index';
export const PROTOCOL_VERSION=1 as const;
export interface ActionMessage {v:1;type:'action';id:string;expectedVersion:number;action:Action}
export type ClientMessage=ActionMessage|{v:1;type:'sync'}|{v:1;type:'emote';emoji:string};
export type SoundName='deal'|'draw'|'snap'|'flip'|'power'|'penalty'|'dutch'|'victory'|'burn';
export type ServerMessage={v:1;type:'sound';name:SoundName;eventId:string}|{v:1;type:'state';state:GameView;ack?:string}|{v:1;type:'error';message:string;actionId?:string}|{v:1;type:'emote';playerId:string;emoji:string};
export interface SeatResponse {code:string;playerId:string;token:string}
export const EMOTES=['👋','🥂','😏','👏','😱','💚'];
