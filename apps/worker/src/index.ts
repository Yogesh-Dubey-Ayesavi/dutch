import { DurableObject } from 'cloudflare:workers';
import {restoreSnapshot,SNAPSHOT_SCHEMA} from './snapshot';
import { addPlayer, applyAction, deck, expireTurn, newGame, viewFor, type Game, type Action } from '../../../packages/engine/src/index';
import { EMOTES, type ServerMessage, type SoundName } from '../../../packages/protocol/src/index';
interface Env {ROOMS:DurableObjectNamespace<GameRoom>;ASSETS:Fetcher;API_LIMITER:RateLimit;TURN_LIMITER:RateLimit;TURN_KEY_ID:string;TURN_KEY_API_TOKEN?:string;ROOM_TTL_HOURS:string;RECONNECT_GRACE_SECONDS:string;ALLOWED_ORIGIN?:string}
interface Session {id:string;hash:string;disconnected:number|null}
interface Attachment {id:string;window:number;count:number}
const json=(body:unknown,status=200,headers:HeadersInit={})=>Response.json(body,{status,headers});
async function digest(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
function shuffled(){const cards=deck();for(let i=cards.length-1;i>0;i--){const limit=Math.floor(0x100000000/(i+1))*(i+1);let n:number;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
function validOrigin(request:Request,env:Env){const origin=request.headers.get('Origin');if(!origin)return true;const url=new URL(request.url);return origin===url.origin||origin===env.ALLOWED_ORIGIN||(['localhost','127.0.0.1'].includes(url.hostname)&&/^http:\/\/(localhost|127\.0\.0\.1):(5050|8787)$/.test(origin));}
function profile(body:Record<string,unknown>){if(typeof body.name!=='string'||body.name.trim().length<1||body.name.trim().length>20||/[\u0000-\u001f\u007f]/.test(body.name))throw new Error('Choose a display name with 1–20 characters.');return {name:body.name.trim(),avatar:Number.isInteger(body.avatar)&&Number(body.avatar)>=0&&Number(body.avatar)<8?Number(body.avatar):0};}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(!validOrigin(request,env))return json({error:'Origin not allowed.'},403);
  if(request.method!=='GET'&&Number(request.headers.get('Content-Length')??0)>4096)return json({error:'Request too large.'},413);
  const rate=await env.API_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'local'});if(!rate.success)return json({error:'Please slow down and try again shortly.'},429);
  try{
   if(url.pathname==='/api/rooms'&&request.method==='POST'){
    if((await request.clone().text()).length>4096)return json({error:'Request too large.'},413);
    const body=await request.json() as Record<string,unknown>;profile(body);
    for(let attempt=0;attempt<4;attempt++){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>alphabet[v%alphabet.length]).join('');const result=await env.ROOMS.getByName(code).fetch(new Request(`${url.origin}/api/rooms/${code}/create`,{method:'POST',headers:request.headers,body:JSON.stringify(body)}));if(result.status!==409)return result;}return json({error:'Could not create a room. Please retry.'},503);
   }
   const match=url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|socket|leave|turn-credentials))?$/);
   if(match){if(match[2]==='turn-credentials'){const turnRate=await env.TURN_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'local'});if(!turnRate.success)return json({error:'Please wait before requesting TURN credentials again.'},429);}return env.ROOMS.getByName(match[1]).fetch(request);}
   return json({error:'That room could not be found. Check your invite code.'},404);
  }catch(e){return json({error:e instanceof Error?e.message:'Unable to process request.'},400);}
 }
} satisfies ExportedHandler<Env>;
export class GameRoom extends DurableObject<Env>{
 private game:Game|null=null;private sessions:Session[]=[];private code='';private expires=0;
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK(id=1), code TEXT NOT NULL, state TEXT NOT NULL, sessions TEXT NOT NULL, expires INTEGER NOT NULL)');ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS actions (player TEXT NOT NULL, action_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(player,action_id))');const row=ctx.storage.sql.exec<{code:string;state:string;sessions:string;expires:number}>('SELECT * FROM room WHERE id=1').toArray()[0];if(row){this.code=row.code;const snapshot=JSON.parse(row.state);this.game=restoreSnapshot(snapshot);this.sessions=JSON.parse(row.sessions);this.expires=row.expires;if(snapshot.schema!==SNAPSHOT_SCHEMA)this.persist();}
 ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 private connected(){return [...new Set(this.ctx.getWebSockets().map(s=>(s.deserializeAttachment() as Attachment)?.id).filter(Boolean))];}
 private persist(){if(!this.game)return;this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room (id,code,state,sessions,expires) VALUES (1,?,?,?,?)',this.code,JSON.stringify({schema:SNAPSHOT_SCHEMA,game:this.game}),JSON.stringify(this.sessions),this.expires);}
 private async schedule(){const grace=Number(this.env.RECONNECT_GRACE_SECONDS||120)*1000;const dates=[this.expires,...this.sessions.filter(s=>s.disconnected!==null).map(s=>s.disconnected!+grace)];if(this.game?.deadline)dates.push(this.game.deadline);await this.ctx.storage.setAlarm(Math.max(Date.now()+100,Math.min(...dates)));}
 private send(socket:WebSocket,message:ServerMessage){try{socket.send(JSON.stringify(message));}catch{/* Close callbacks update presence. */}}
 private broadcast(ack?:string,actor?:string){if(!this.game)return;const connected=this.connected();for(const socket of this.ctx.getWebSockets()){const {id}=socket.deserializeAttachment() as Attachment;this.send(socket,{v:1,type:'state',state:viewFor(this.game,id,connected),...(id===actor?{ack}:{})});}}
 private effect(name:SoundName,eventId:string){for(const socket of this.ctx.getWebSockets())this.send(socket,{v:1,type:'sound',name,eventId});}
 private async auth(request:Request){const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')??request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(p=>p.trim()).find(p=>p.startsWith('seat.'))?.slice(5);if(!token)return;const hash=await digest(token);return this.sessions.find(s=>s.hash===hash);}
 async fetch(request:Request):Promise<Response>{return this.ctx.blockConcurrencyWhile(async()=>{
  try{
   const url=new URL(request.url);const operation=url.pathname.split('/').at(-1);const code=url.pathname.split('/')[3];
   if(operation==='create'||operation==='join'){
    if(request.method!=='POST')return json({error:'POST required.'},405);
    if((await request.clone().text()).length>4096)return json({error:'Request too large.'},413);
    const body=await request.json() as Record<string,unknown>;const {name,avatar}=profile(body);
    if(operation==='create'){if(this.game)return json({error:'Room code collision.'},409);this.code=code;}
    else if(!this.game||Date.now()>this.expires)return json({error:'That table has closed. Create a new one.'},404);
    
    const token=crypto.randomUUID()+crypto.randomUUID();const id=crypto.randomUUID();const hash=await digest(token);
    const base=this.game??newGame(id,(body.rules??{}) as Parameters<typeof newGame>[1]);this.game=addPlayer(base,id,name,avatar);this.sessions.push({id,hash,disconnected:Date.now()});this.expires=Date.now()+Number(this.env.ROOM_TTL_HOURS||24)*3600000;this.persist();await this.schedule();this.broadcast();
    return json({code:this.code,playerId:id,token},200,{'Cache-Control':'no-store'});
   }
   if(!this.game||Date.now()>this.expires)return json({error:'This table has expired.'},404);
   const session=await this.auth(request);if(!session)return json({error:'Your seat could not be restored. Join the table again.'},401);
   if(operation==='turn-credentials'){
    if(request.method!=='POST')return json({error:'POST required.'},405);
    const keyId=this.env.TURN_KEY_ID;const key=this.env.TURN_KEY_API_TOKEN;
    if(!key||!/^[a-f0-9]{32}$/i.test(keyId))return json({error:'TURN credentials are not configured.'},503,{'Cache-Control':'no-store'});
    try{
     const ttl=21600;
     const upstream=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({ttl}),signal:AbortSignal.timeout(8000)});
     if(!upstream.ok)return json({error:'Could not issue TURN credentials.'},502,{'Cache-Control':'no-store'});
     const credentials=await upstream.json() as {iceServers?:unknown[]};
     if(!Array.isArray(credentials.iceServers)||credentials.iceServers.length===0)return json({error:'Cloudflare returned no TURN servers.'},502,{'Cache-Control':'no-store'});
     return json({iceServers:credentials.iceServers,expiresAt:Date.now()+ttl*1000},200,{'Cache-Control':'no-store'});
    }catch{return json({error:'TURN credential service is temporarily unavailable.'},502,{'Cache-Control':'no-store'});}
   }
   if(operation==='socket'){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket upgrade required.'},426);
    for(const socket of this.ctx.getWebSockets()){if((socket.deserializeAttachment() as Attachment).id===session.id)socket.close(4001,'Seat opened in another tab.');}
    const pair=new WebSocketPair();this.ctx.acceptWebSocket(pair[1]);pair[1].serializeAttachment({id:session.id,window:Date.now(),count:0} satisfies Attachment);session.disconnected=null;this.game=expireTurn(this.game,Date.now());this.persist();await this.schedule();this.broadcast();return new Response(null,{status:101,webSocket:pair[0],headers:{'Sec-WebSocket-Protocol':'dutch-v1'}});
   }
   if(operation==='leave'&&request.method==='POST'){
    for(const socket of this.ctx.getWebSockets()){if((socket.deserializeAttachment() as Attachment).id===session.id)socket.close(1000,'Left the table.');}
    if(this.game.phase==='lobby'){this.game.players=this.game.players.filter(p=>p.id!==session.id);this.sessions=this.sessions.filter(s=>s.id!==session.id);if(this.game.hostId===session.id)this.game.hostId=this.game.players[0]?.id??'';}else {session.disconnected=Date.now();}this.game.version++;this.persist();await this.schedule();this.broadcast();return json({ok:true});
   }
   return json({state:viewFor(this.game,session.id,this.connected())});
  }catch(e){return json({error:e instanceof Error?e.message:'Could not join table.'},400);}
 });}
 async webSocketMessage(socket:WebSocket,raw:string|ArrayBuffer){return this.ctx.blockConcurrencyWhile(async()=>{
  let actionId:string|undefined;
  try{
   if(typeof raw!=='string'||raw.length>16000)throw new Error('Invalid message.');
   const connection=socket.deserializeAttachment() as Attachment;const now=Date.now();if(now-connection.window>10000){connection.window=now;connection.count=0;}connection.count++;socket.serializeAttachment(connection);if(connection.count>40)throw new Error('Too many moves. Take a breath.');
   const msg=JSON.parse(raw);if(msg.v!==1)throw new Error('Please refresh to update the game.');if(!this.game)throw new Error('This table has closed.');
   if(msg.type==='sync'){this.send(socket,{v:1,type:'state',state:viewFor(this.game,connection.id,this.connected())});return;}
   if(msg.type==='emote'){if(!EMOTES.includes(msg.emoji))throw new Error('Unknown reaction.');for(const peer of this.ctx.getWebSockets())this.send(peer,{v:1,type:'emote',playerId:connection.id,emoji:msg.emoji});return;}
   if(msg.type==='signal'){
    if(typeof msg.to!=='string'||msg.to===connection.id||!this.game.players.some(p=>p.id===msg.to))throw new Error('Choose another player at this table.');
    const signal=msg.signal;
    if(!signal||typeof signal!=='object'||!['offer','answer','candidate'].includes(signal.type))throw new Error('Invalid connection signal.');
    if((signal.type==='offer'||signal.type==='answer')&&(typeof signal.sdp!=='string'||signal.sdp.length>12000||!signal.sdp.startsWith('v=0')))throw new Error('Invalid connection description.');
    if(signal.type==='candidate'&&signal.candidate!==null&&(!signal.candidate||typeof signal.candidate.candidate!=='string'||signal.candidate.candidate.length>2000||(signal.candidate.sdpMid!==undefined&&signal.candidate.sdpMid!==null&&typeof signal.candidate.sdpMid!=='string')||(signal.candidate.sdpMLineIndex!==undefined&&signal.candidate.sdpMLineIndex!==null&&!Number.isInteger(signal.candidate.sdpMLineIndex))))throw new Error('Invalid ICE candidate.');
    const target=this.ctx.getWebSockets().find(peer=>(peer.deserializeAttachment() as Attachment).id===msg.to);
    if(!target)throw new Error('That player is not connected right now.');
    this.send(target,{v:1,type:'signal',from:connection.id,signal});return;
   }
   if(raw.length>4096)throw new Error('Action message is too large.');
   if(msg.type!=='action'||typeof msg.id!=='string'||msg.id.length>80||!msg.id.length||!msg.action||typeof msg.action.type!=='string'||!Number.isInteger(msg.expectedVersion)||msg.expectedVersion<0)throw new Error('Invalid action.');
   actionId=msg.id;
   const duplicate=this.ctx.storage.sql.exec('SELECT version FROM actions WHERE player=? AND action_id=?',connection.id,msg.id).toArray().length>0;
   if(duplicate){this.send(socket,{v:1,type:'state',state:viewFor(this.game,connection.id,this.connected()),ack:msg.id});return;}
   const expired=expireTurn(this.game,now);if(expired!==this.game){this.game=expired;this.persist();this.broadcast();}
   const concurrentThrow=msg.action.type==='burn'&&msg.expectedVersion<this.game.version&&msg.expectedVersion>=this.game.version-1000&&typeof msg.action.targetId==='string'&&Number.isInteger(msg.action.handRevision);
   if(msg.expectedVersion!==this.game.version&&!concurrentThrow){this.send(socket,{v:1,type:'state',state:viewFor(this.game,connection.id,this.connected())});throw new Error('The table moved on. Please try your move again.');}
   const action=msg.action as Action;if(['start','nextRound','rematch'].includes(action.type)&&this.game.players.some(p=>!this.connected().includes(p.id)))throw new Error('Wait for everyone to connect before dealing.');const before=this.game;const next=applyAction(before,connection.id,action,now,['start','nextRound','rematch'].includes(action.type)?shuffled():undefined);
   this.ctx.storage.transactionSync(()=>{this.game=next;this.expires=now+Number(this.env.ROOM_TTL_HOURS||24)*3600000;this.persist();this.ctx.storage.sql.exec('INSERT INTO actions(player,action_id,version) VALUES (?,?,?)',connection.id,msg.id,next.version);this.ctx.storage.sql.exec('DELETE FROM actions WHERE version < ?',next.version-1000);});
   await this.schedule();this.broadcast(msg.id,connection.id);
   let sound:SoundName='snap';if(['start','nextRound','rematch'].includes(action.type))sound='shuffle';else if(action.type==='draw')sound='draw';else if(action.type==='initialPeek'||action.type==='powerPeek'||action.type==='reorder')sound='flip';else if(action.type==='burn')sound=next.players.find(p=>p.id===connection.id)!.hand.length<before.players.find(p=>p.id===connection.id)!.hand.length?'burn':'penalty';else if(['blindSwap','blindSwapBatch'].includes(action.type)||next.phase==='power')sound='power';else if(action.type==='call')sound='dutch';
   if(action.type==='swap'&&next.message.startsWith('Automatic match'))sound='burn';
   if(next.handPower&&!before.handPower)sound='power';
   if(['finished','results'].includes(next.phase)&&!['finished','results'].includes(before.phase))sound=next.phase==='finished'?'victory':'dutch';
   if(!['ready','rules','finishPeek'].includes(action.type))this.effect(sound,msg.id);
  }catch(e){this.send(socket,{v:1,type:'error',message:e instanceof Error?e.message:'That move is unavailable.',actionId});}
 });}
 async webSocketClose(socket:WebSocket,code:number,reason:string){try{socket.close(code,reason);}catch{/* Already closed. */}await this.disconnect(socket);}
 async webSocketError(socket:WebSocket){await this.disconnect(socket);}
 private async disconnect(socket:WebSocket){return this.ctx.blockConcurrencyWhile(async()=>{const id=(socket.deserializeAttachment() as Attachment)?.id;const other=this.ctx.getWebSockets().some(s=>s!==socket&&(s.deserializeAttachment() as Attachment).id===id);if(other)return;const session=this.sessions.find(s=>s.id===id);if(session){session.disconnected=Date.now();this.persist();await this.schedule();this.broadcast();}});}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{
  if(!this.game)return;const now=Date.now();if(now>=this.expires){for(const socket of this.ctx.getWebSockets())socket.close(4004,'This table has closed.');await this.ctx.storage.deleteAll();this.game=null;this.sessions=[];return;}
  this.game=expireTurn(this.game,now);const grace=Number(this.env.RECONNECT_GRACE_SECONDS||120)*1000;const gone=this.sessions.filter(s=>s.disconnected!==null&&now>=s.disconnected+grace);
  if(gone.length){if(this.game.phase==='lobby'){const ids=new Set(gone.map(s=>s.id));this.game.players=this.game.players.filter(p=>!ids.has(p.id));this.sessions=this.sessions.filter(s=>!ids.has(s.id));if(ids.has(this.game.hostId))this.game.hostId=this.game.players[0]?.id??'';this.game.version++;}else if(['peeking','playing','power'].includes(this.game.phase)){this.game.phase='interrupted';this.game.deadline=null;this.game.reveals={};this.game.drawn=null;this.game.handPower=null;this.game.handPowerQueue=[];this.game.power=null;this.game.message='A player could not reconnect. This round is unscored. Reunite for a rematch.';this.game.version++;}for(const s of gone)s.disconnected=null;}
  this.persist();await this.schedule();this.broadcast();
 });}
}
