import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {Action,GameView} from '../../../packages/engine/src/index';
import type {ActionMessage,IceSignal,ServerMessage,SeatResponse} from '../../../packages/protocol/src/index';
import {playSound} from './sound';
interface Preferences {name:string;avatar:number;sound:boolean;ambience:boolean;volume:number;effects:boolean;/** Loop the Dutch alarm through the last lap. */dutchAlarm:boolean;alarmVolume:number;set:(p:Partial<Omit<Preferences,'set'>>)=>void}
export const usePrefs=create<Preferences>()(persist(set=>({name:'',avatar:0,sound:true,ambience:false,volume:0.65,effects:true,dutchAlarm:true,alarmVolume:0.3,set:p=>set(p)}),{name:'dutch-preferences'}));
interface RoomStore {state:GameView|null;code:string;status:'offline'|'connecting'|'connected'|'reconnecting'|'closed';error:string;pending:string|null;reactions:Record<string,string>;set:(v:Partial<RoomStore>)=>void}
export const useRoom=create<RoomStore>(set=>({state:null,code:'',status:'offline',error:'',pending:null,reactions:{},set:v=>set(v)}));
let seatToken='';let socket:WebSocket|null=null;let retry:ReturnType<typeof setTimeout>|undefined;let heartbeat:ReturnType<typeof setInterval>|undefined;let stopped=true;let attempt=0;let pendingMessage:ActionMessage|null=null;let lastPong=0;const heard=new Set<string>();
const signalListeners=new Set<(from:string,signal:IceSignal)=>void>();
export async function seat(mode:'create'|'join',name:string,avatar:number,code?:string,rules?:unknown){const response=await fetch(mode==='create'?'/api/rooms':`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,avatar,rules})});const result=await response.json() as SeatResponse & {error?:string};if(!response.ok)throw new Error(result.error||'The table is unavailable. Try again.');sessionStorage.setItem('dutch-seat',JSON.stringify(result));history.replaceState(null,'',`?room=${result.code}`);connect(result.code,result.token);return result;}
export function connect(code:string,token?:string){if(token)seatToken=token;else if(!seatToken){try{seatToken=JSON.parse(sessionStorage.getItem('dutch-seat')??'{}').token??'';}catch{/* Missing seat will be rejected. */}}stopped=false;attempt=0;useRoom.getState().set({code,status:'connecting',error:''});open(code);}
function open(code:string){if(stopped)return;clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close();}const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/rooms/${code}/socket`,['dutch-v1',`seat.${seatToken}`]);socket=ws;
 ws.onopen=()=>{if(pendingMessage)ws.send(JSON.stringify(pendingMessage));attempt=0;lastPong=Date.now();useRoom.getState().set({status:'connected',error:''});heartbeat=setInterval(()=>{if(Date.now()-lastPong>55000){ws.close();return;}if(ws.readyState===WebSocket.OPEN)ws.send('ping');},25000);};
 ws.onmessage=e=>{
  if(e.data==='pong'){lastPong=Date.now();return;}
  let msg:ServerMessage;
  try{msg=JSON.parse(e.data);}catch{return;}
  if(msg.v!==1)return;
  lastPong=Date.now();
  if(msg.type==='state'){
   const old=useRoom.getState().state;
   if(!old||msg.state.version>=old.version)useRoom.getState().set({state:msg.state});
   if(msg.ack===pendingMessage?.id){pendingMessage=null;useRoom.getState().set({pending:null});}
  }else if(msg.type==='error'){
   pendingMessage=null;useRoom.getState().set({error:msg.message,pending:null});playSound('penalty');
  }else if(msg.type==='sound'){
   if(!heard.has(msg.eventId)){heard.add(msg.eventId);if(heard.size>100)heard.delete(heard.values().next().value!);playSound(msg.name);}
  }else if(msg.type==='emote'){
   useRoom.getState().set({reactions:{...useRoom.getState().reactions,[msg.playerId]:msg.emoji}});
   setTimeout(()=>{const reactions={...useRoom.getState().reactions};delete reactions[msg.playerId];useRoom.getState().set({reactions});},2500);
  }else if(msg.type==='signal'){
   for(const listener of signalListeners)listener(msg.from,msg.signal);
  }
 };
 ws.onclose=e=>{clearInterval(heartbeat);if(stopped)return;if([4001,4004].includes(e.code)){stopped=true;useRoom.getState().set({status:'closed',error:e.reason});return;}attempt++;useRoom.getState().set({status:'reconnecting'});if(attempt>10){useRoom.getState().set({status:'closed',error:'Your connection could not be restored. Reconnect to try again.'});return;}retry=setTimeout(()=>open(code),Math.min(8000,700*2**Math.min(attempt,4)));};
 ws.onerror=()=>{useRoom.getState().set({error:'Connection interrupted. We’re finding your seat again.'});};
}
export function act(action:Action){const {state,status,pending}=useRoom.getState();if(!state||status!=='connected'||pending||socket?.readyState!==WebSocket.OPEN)return;if(action.type==='burn'){const me=state.players.find(p=>p.id===state.you);const drawn=action.match==='drawn'||(action.match===undefined&&state.players[state.turn]?.id===state.you&&state.drawn);action={...action,handRevision:action.handRevision??me?.handRevision,targetId:action.targetId??(drawn?state.drawn?.card?.id:state.discard.at(-1)?.id)};}pendingMessage={v:1,type:'action',id:crypto.randomUUID(),expectedVersion:state.version,action};useRoom.getState().set({pending:pendingMessage.id,error:''});socket.send(JSON.stringify(pendingMessage));}
export function emote(emoji:string){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({v:1,type:'emote',emoji}));}
export function sendSignal(to:string,signal:IceSignal){if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({v:1,type:'signal',to,signal}));return true;}
export function onSignal(listener:(from:string,signal:IceSignal)=>void){signalListeners.add(listener);return()=>signalListeners.delete(listener);}
export async function getTurnCredentials(){const {code}=useRoom.getState();if(!code||!seatToken)throw new Error('Join a table before requesting TURN credentials.');const response=await fetch(`/api/rooms/${code}/turn-credentials`,{method:'POST',headers:{Authorization:`Bearer ${seatToken}`}});const result=await response.json() as {iceServers?:RTCIceServer[];expiresAt?:number;error?:string};if(!response.ok||!result.iceServers||!result.expiresAt)throw new Error(result.error||'TURN credentials are unavailable.');return {iceServers:result.iceServers,expiresAt:result.expiresAt};}
export async function leave(){const code=useRoom.getState().code;const token=seatToken;seatToken='';stopped=true;clearTimeout(retry);clearInterval(heartbeat);pendingMessage=null;socket?.close();socket=null;sessionStorage.removeItem('dutch-seat');history.replaceState(null,'',location.pathname);useRoom.getState().set({state:null,code:'',status:'offline',error:'',pending:null});try{await fetch(`/api/rooms/${code}/leave`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});}catch{/* The server applies the reconnection deadline. */}}
