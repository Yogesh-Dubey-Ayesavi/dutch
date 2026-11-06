import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {Action,GameView} from '../../../packages/engine/src/index';
import type {ActionMessage,ChatLine,IceSignal,ServerMessage,SeatResponse} from '../../../packages/protocol/src/index';
import {CHAT_HISTORY} from '../../../packages/protocol/src/index';
import {emoteSound,noteWrongFreeThrow,playSound} from './sound';
interface Preferences {name:string;avatar:number;sound:boolean;ambience:boolean;volume:number;effects:boolean;/** Loop the Dutch alarm through the last lap. */dutchAlarm:boolean;alarmVolume:number;/** Overspeed clacker, cockpit chime, and "pull up" for penalty streaks and Dutch results. */flightSounds:boolean;set:(p:Partial<Omit<Preferences,'set'>>)=>void}
export const usePrefs=create<Preferences>()(persist(set=>({name:'',avatar:0,sound:true,ambience:false,volume:0.65,effects:true,dutchAlarm:true,alarmVolume:0.3,flightSounds:true,set:p=>set(p)}),{name:'dutch-preferences'}));

/** A reaction or chat line floating over a seat for a moment. */
export interface Burst {id:string;playerId:string;emoji?:string;text?:string}
interface RoomStore {
 state:GameView|null;code:string;status:'offline'|'connecting'|'connected'|'reconnecting'|'closed';error:string;
 /** Id of the action awaiting the server. Reorders never set this: they're optimistic and keep the hand live. */
 pending:string|null;
 /** Something (an action or a reorder) is on its way to the server. Drives the network indicator. */
 syncing:boolean;
 /** Round-trip time of the latest heartbeat, in ms. */
 latency:number|null;
 bursts:Burst[];chat:ChatLine[];unread:number;chatOpen:boolean;
 set:(v:Partial<RoomStore>)=>void}
export const useRoom=create<RoomStore>(set=>({state:null,code:'',status:'offline',error:'',pending:null,syncing:false,latency:null,bursts:[],chat:[],unread:0,chatOpen:false,set:v=>set(v)}));

let seatToken='';let socket:WebSocket|null=null;let retry:ReturnType<typeof setTimeout>|undefined;let heartbeat:ReturnType<typeof setInterval>|undefined;let stopped=true;let attempt=0;let pendingMessage:ActionMessage|null=null;let lastPong=0;let pingSent=0;const heard=new Set<string>();
const signalListeners=new Set<(from:string,signal:IceSignal)=>void>();
const PING_MS=5000,SILENT_MS=16000;

/* ---------- optimistic hand reordering ----------
 * A reorder shows immediately and is replayed on top of every server snapshot until the server
 * confirms it. Several quick drags queue up and are sent one at a time, each against the hand
 * revision the previous one produced, so a burst of rearranging can never fall back to an older
 * order mid-way. */
let serverState:GameView|null=null;
let reorders:{from:number;to:number}[]=[];
let reorderFlight:ActionMessage|null=null;
/** The hand revision the in-flight reorder expects; any other revision means the hand changed under us. */
let reorderBase=-1;
/** One ordinary action made while reorders were still settling; sent once they have. */
let deferred:Action|null=null;

function moveCard(view:GameView,from:number,to:number):GameView{
 const players=view.players.map(p=>{
  if(p.id!==view.you)return p;
  const hand=[...p.hand],backs=[...p.handBacks];
  const [card]=hand.splice(from,1);hand.splice(to,0,card);
  const [back]=backs.splice(from,1);backs.splice(to,0,back);
  return {...p,hand,handBacks:backs};
 });
 const remap=(i:number)=>i===from?to:from<to&&i>from&&i<=to?i-1:to<from&&i>=to&&i<from?i+1:i;
 return {...view,players,reveals:view.reveals.map(r=>r.owner===view.you?{...r,index:remap(r.index)}:r)};
}
const myRevision=(v:GameView|null)=>v?.players.find(p=>p.id===v.you)?.handRevision??-1;
function display(){if(!serverState)return null;return reorders.reduce((v,m)=>moveCard(v,m.from,m.to),serverState);}
function refreshSyncing(){useRoom.getState().set({syncing:!!pendingMessage||!!reorderFlight});}
function dropReorders(){reorders=[];reorderFlight=null;reorderBase=-1;deferred=null;}
function sendRaw(message:ActionMessage){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function pump(){
 if(!serverState||reorderFlight||pendingMessage)return;
 const next=reorders[0];
 const size=serverState.players.find(p=>p.id===serverState!.you)?.hand.length??0;
 if(next&&(next.from>=size||next.to>=size)){dropReorders();useRoom.getState().set({state:display()});return;}
 if(next){
  reorderBase=myRevision(serverState);
  reorderFlight={v:1,type:'action',id:crypto.randomUUID(),expectedVersion:serverState.version,action:{type:'reorder',from:next.from,to:next.to,handRevision:reorderBase}};
  sendRaw(reorderFlight);refreshSyncing();return;
 }
 if(deferred){const a=deferred;deferred=null;act(a);}
}
/** Moves one of your own cards. Returns false when the move can't be made right now. */
export function reorderHand(from:number,to:number){
 const {state,status}=useRoom.getState();
 if(!state||!serverState||status!=='connected'||from===to)return false;
 const me=state.players.find(p=>p.id===state.you);
 if(!me||from<0||to<0||from>=me.hand.length||to>=me.hand.length)return false;
 reorders.push({from,to});
 useRoom.getState().set({state:display()});
 pump();return true;
}

export async function seat(mode:'create'|'join',name:string,avatar:number,code?:string,rules?:unknown){const response=await fetch(mode==='create'?'/api/rooms':`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,avatar,rules})});const result=await response.json() as SeatResponse & {error?:string};if(!response.ok)throw new Error(result.error||'The table is unavailable. Try again.');sessionStorage.setItem('dutch-seat',JSON.stringify(result));history.replaceState(null,'',`?room=${result.code}`);connect(result.code,result.token);return result;}
export function connect(code:string,token?:string){if(token)seatToken=token;else if(!seatToken){try{seatToken=JSON.parse(sessionStorage.getItem('dutch-seat')??'{}').token??'';}catch{/* Missing seat will be rejected. */}}stopped=false;attempt=0;useRoom.getState().set({code,status:'connecting',error:''});open(code);}

function addBurst(b:Burst,ms:number){
 useRoom.getState().set({bursts:[...useRoom.getState().bursts.filter(x=>!(x.playerId===b.playerId&&!!x.text===!!b.text)),b]});
 setTimeout(()=>useRoom.getState().set({bursts:useRoom.getState().bursts.filter(x=>x.id!==b.id)}),ms);
}

function open(code:string){if(stopped)return;clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close();}const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/rooms/${code}/socket`,['dutch-v1',`seat.${seatToken}`]);socket=ws;
 const ping=()=>{if(ws.readyState!==WebSocket.OPEN)return;if(Date.now()-lastPong>SILENT_MS){ws.close();return;}pingSent=Date.now();ws.send('ping');};
 ws.onopen=()=>{
  // A reorder that was in the air is resent with its original id; the server deduplicates it.
  if(pendingMessage)ws.send(JSON.stringify(pendingMessage));else if(reorderFlight)ws.send(JSON.stringify(reorderFlight));
  attempt=0;lastPong=Date.now();useRoom.getState().set({status:'connected',error:''});ping();heartbeat=setInterval(ping,PING_MS);
 };
 ws.onmessage=e=>{
  if(e.data==='pong'){lastPong=Date.now();if(pingSent)useRoom.getState().set({latency:lastPong-pingSent});pingSent=0;return;}
  let msg:ServerMessage;
  try{msg=JSON.parse(e.data);}catch{return;}
  if(msg.v!==1)return;
  lastPong=Date.now();
  const store=useRoom.getState();
  if(msg.type==='state'){
   if(!serverState||msg.state.version>=serverState.version||msg.state.you!==serverState.you)serverState=msg.state;
   if(reorderFlight&&msg.ack===reorderFlight.id){reorders.shift();reorderFlight=null;reorderBase=-1;}
   else if(reorderFlight&&myRevision(serverState)!==reorderBase){dropReorders();}
   const acked=!!msg.ack&&msg.ack===pendingMessage?.id;if(acked)pendingMessage=null;
   // One update, so no frame ever shows the action settled with the old table still on screen.
   store.set(acked?{state:display(),pending:null}:{state:display()});
   pump();refreshSyncing();
  }else if(msg.type==='error'){
   if(reorderFlight&&msg.actionId===reorderFlight.id){
    // The hand changed under the queued moves (a swap, a penalty card…). Show the server's truth quietly.
    dropReorders();store.set({state:display()});refreshSyncing();return;
   }
   pendingMessage=null;store.set({error:msg.message,pending:null});refreshSyncing();
   // A rejected move is a gentle tick, not the wrong-free-throw penalty sound.
   playSound('tick');pump();
  }else if(msg.type==='sound'){
   if(!heard.has(msg.eventId)){heard.add(msg.eventId);if(heard.size>100)heard.delete(heard.values().next().value!);playSound(msg.name);if(msg.name==='penalty')noteWrongFreeThrow();}
  }else if(msg.type==='emote'){
   addBurst({id:msg.id??crypto.randomUUID(),playerId:msg.playerId,emoji:msg.emoji},2600);
   emoteSound(msg.emoji);
  }else if(msg.type==='chat'){
   const chat=[...store.chat.filter(l=>l.id!==msg.line.id),msg.line].slice(-CHAT_HISTORY);
   const mine=msg.line.playerId===serverState?.you;
   store.set({chat,unread:store.chatOpen||mine?store.unread:store.unread+1});
   if(!mine)playSound('tick');
  }else if(msg.type==='chatHistory'){
   const known=new Set(store.chat.map(l=>l.id));
   store.set({chat:[...store.chat,...msg.lines.filter(l=>!known.has(l.id))].sort((a,b)=>a.at-b.at).slice(-CHAT_HISTORY)});
  }else if(msg.type==='signal'){
   for(const listener of signalListeners)listener(msg.from,msg.signal);
  }
 };
 ws.onclose=e=>{clearInterval(heartbeat);if(stopped)return;if([4001,4004].includes(e.code)){stopped=true;useRoom.getState().set({status:'closed',error:e.reason,latency:null});return;}attempt++;useRoom.getState().set({status:'reconnecting',latency:null});if(attempt>10){useRoom.getState().set({status:'closed',error:'Your connection could not be restored. Reconnect to try again.'});return;}retry=setTimeout(()=>open(code),Math.min(8000,700*2**Math.min(attempt,4)));};
 ws.onerror=()=>{useRoom.getState().set({error:'Connection interrupted. We’re finding your seat again.'});};
}
export function act(action:Action){
 const {state,status}=useRoom.getState();
 if(!state||!serverState||status!=='connected'||pendingMessage||socket?.readyState!==WebSocket.OPEN)return;
 // Indices in `action` refer to the hand as shown, which includes reorders still settling: wait for them.
 if(reorders.length){deferred=action;return;}
 if(action.type==='burn'){const me=state.players.find(p=>p.id===state.you);const drawn=action.match==='drawn'||(action.match===undefined&&state.players[state.turn]?.id===state.you&&state.drawn);action={...action,handRevision:action.handRevision??me?.handRevision,targetId:action.targetId??(drawn?state.drawn?.card?.id:state.discard.at(-1)?.id)};}
 pendingMessage={v:1,type:'action',id:crypto.randomUUID(),expectedVersion:serverState.version,action};
 useRoom.getState().set({pending:pendingMessage.id,error:''});refreshSyncing();
 socket.send(JSON.stringify(pendingMessage));
}
export function emote(emoji:string){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({v:1,type:'emote',emoji}));}
export function sendChat(text:string){const t=text.trim();if(!t||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({v:1,type:'chat',text:t}));return true;}
export function sendSignal(to:string,signal:IceSignal){if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({v:1,type:'signal',to,signal}));return true;}
export function onSignal(listener:(from:string,signal:IceSignal)=>void){signalListeners.add(listener);return()=>signalListeners.delete(listener);}
export async function getTurnCredentials(){const {code}=useRoom.getState();if(!code||!seatToken)throw new Error('Join a table before requesting TURN credentials.');const response=await fetch(`/api/rooms/${code}/turn-credentials`,{method:'POST',headers:{Authorization:`Bearer ${seatToken}`}});const result=await response.json() as {iceServers?:RTCIceServer[];expiresAt?:number;error?:string};if(!response.ok||!result.iceServers||!result.expiresAt)throw new Error(result.error||'TURN credentials are unavailable.');return {iceServers:result.iceServers,expiresAt:result.expiresAt};}
export async function leave(){const code=useRoom.getState().code;const token=seatToken;seatToken='';stopped=true;clearTimeout(retry);clearInterval(heartbeat);pendingMessage=null;serverState=null;dropReorders();socket?.close();socket=null;sessionStorage.removeItem('dutch-seat');history.replaceState(null,'',location.pathname);useRoom.getState().set({state:null,code:'',status:'offline',error:'',pending:null,syncing:false,latency:null,bursts:[],chat:[],unread:0,chatOpen:false});try{await fetch(`/api/rooms/${code}/leave`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});}catch{/* The server applies the reconnection deadline. */}}
