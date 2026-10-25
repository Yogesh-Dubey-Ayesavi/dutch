/** Pure, transport-independent Dutch rules. Randomness and time are supplied by the authority. */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardBack = 'red' | 'black';
export interface Card { id: string; rank: number; suit: Suit; back: CardBack }
export interface Rules { rounds: number; turnSeconds: number; peekSeconds: number; powers: boolean; burning: 'off' | 'rank' | 'value'; burnAnytime: boolean; callPenalty: number; callerMustBeLowest: boolean; maxTurns: number }
export const MATCH_ROUNDS = 13;
export const PEEK_CHOICES = [0, 1, 2] as const;
export const DEFAULT_PEEK_COUNT = 2;
export const CHOOSE_SECONDS = 15;
export const DUTCH_UNDO_MS = 3000;
/** How long a newly-discarded card stays matchable by anyone, even after someone else already reacted to it. */
export const REACTION_WINDOW_MS = 5500;
export const DEFAULT_RULES: Rules = {rounds:MATCH_ROUNDS,turnSeconds:30,peekSeconds:25,powers:true,burning:'rank',burnAnytime:true,callPenalty:10,callerMustBeLowest:true,maxTurns:200};
export interface Player { id:string; name:string; avatar:number; hand:Card[]; handRevision:number; ready:boolean; peeked:number[]; peekDone:boolean }
export interface RoundScore { round:number; jokerRank:number|null; caller:string|null; autoDutch?:string|null; scores:Record<string,number>; base:Record<string,number>; penalty:Record<string,number>; hands:Record<string,Card[]>; winners:string[] }
export interface HandPower {kind:'blindSwap'|'ownPeek';ownerId:string;remaining:number;resume:'advance'|'continue';remainingTurnMs:number}
export interface SwapPair {firstPlayerId:string;firstIndex:number;secondPlayerId:string;secondIndex:number}
export interface SwapEvent {version:number;actorId:string;pairs:(SwapPair & {firstBack:CardBack;secondBack:CardBack})[];highlightSlots?:{playerId:string;index:number;back:CardBack}[];discardChanged?:boolean;move?:{playerId:string;from:number;to:number};label?:string;
 /** How many cards `actorId` just threw onto the discard pile, for the flight animation. */ thrown?:{count:number}}
export interface Game { phase:'lobby'|'choosing'|'peeking'|'playing'|'power'|'results'|'finished'|'interrupted'; players:Player[]; hostId:string; rules:Rules; round:number; deck:Card[]; discard:Card[]; turn:number; turns:number; drawn:{card:Card;fromDeck:boolean}|null; handPower:HandPower|null;handPowerQueue:HandPower[];swapEvent:SwapEvent|null; power:'ownPeek'|'otherPeek'|'blindSwap'|null; reveals:Record<string,{owner:string;index:number;card:Card}[]>; caller:string|null; dutchWindowFor:string|null; finalTurns:number;
 /** Picks how many cards everyone may see; moves one seat clockwise each round. */ moderator?:string|null; peekCount?:number;
 /** First player to empty their hand off-turn; the round ends when the moderator's turn ends. */ autoDutch?:string|null;
 /** A just-made Dutch call, held briefly so the caller can undo a mis-tap before it locks in. */ pendingCall?:{actor:string;onOwnTurn:boolean;deadline:number}|null;
 /** Pending hand-Jack peeks a player has earned but not yet used. Unlike a Queen's blind swap, these never block play — the owner can use one any time. */ peeks:Record<string,number>;
 /** Card ids a hand Jack lets its owner see, until that card leaves their hand. Independent of `reveals` so an unrelated player's action never clears it early. */ jackReveals:Record<string,string[]>;
 /** The last draw, for the pickup animation — public, since a deck draw never carries a card and a discard draw only ever reveals what was already the public top card. */ drawEvent:{version:number;playerId:string;fromDeck:boolean;back:CardBack;card:Card|null}|null;
 /** What's still matchable for a free throw, and until when — opened by the card that triggered it, kept open through everyone else's reactions to the same rank. */ reactionWindow:{rank:number;value:number;deadline:number}|null;
 deadline:number|null; version:number; history:RoundScore[]; message:string }
export type Action = {type:'ready';ready:boolean}|{type:'rules';rules:Partial<Rules>}|{type:'start'}|{type:'peekCount';count:number}|{type:'initialPeek';index:number}|{type:'finishPeek'}|{type:'draw';source:'deck'|'discard'}|{type:'swap';index?:number;indices?:number[];handRevision?:number}|{type:'reorder';from:number;to:number;handRevision:number}|{type:'discard';usePower?:boolean}|{type:'powerPeek';playerId:string;index:number}|{type:'blindSwap';firstPlayerId:string;firstIndex:number;secondPlayerId:string;secondIndex:number}|{type:'blindSwapBatch';pairs:SwapPair[];revisions?:Record<string,number>}|{type:'skipPower'}|{type:'burn';index?:number;indices?:number[];handRevision?:number;targetId?:string;match?:'drawn'|'discard'|'pair'}|{type:'call'}|{type:'undoCall'}|{type:'nextRound'}|{type:'rematch'};
export class GameError extends Error {}
const assert:(condition:unknown,message:string)=>asserts condition = (condition,message)=>{if(!condition)throw new GameError(message)};
export const DECK_SIZE=104;
export function deck():Card[] {return (['red','black'] as CardBack[]).flatMap(back=>(['spades','hearts','diamonds','clubs'] as Suit[]).flatMap(suit=>Array.from({length:13},(_,i)=>({id:`${back}-${suit}-${i+1}`,rank:i+1,suit,back}))));}
export function jokerRankForRound(round:number):number|null {return Number.isInteger(round)&&round>=1&&round<=MATCH_ROUNDS?MATCH_ROUNDS+1-round:null;}
export function roundLabelFor(round:number):number {return jokerRankForRound(round)??MATCH_ROUNDS;}
export function value(c:Card,jokerRank:number|null=null):number {if(c.rank===jokerRank)return 0;return c.rank===13&&(c.suit==='hearts'||c.suit==='diamonds')?0:c.rank;}
export function validateRules(input:Partial<Rules>):Rules {
 const r={...DEFAULT_RULES,...input};
 assert(r.rounds===MATCH_ROUNDS,'Every match has 13 rounds.');
 assert(Number.isInteger(r.turnSeconds)&&r.turnSeconds>=10&&r.turnSeconds<=120,'Turn time must be 10–120 seconds.');
 assert(Number.isInteger(r.peekSeconds)&&r.peekSeconds>=10&&r.peekSeconds<=60,'Peek time must be 10–60 seconds.');
 assert(['off','rank','value'].includes(r.burning),'Invalid matching rule.');
 assert(typeof r.powers==='boolean'&&typeof r.burnAnytime==='boolean'&&typeof r.callerMustBeLowest==='boolean','Invalid house rule.');r.burnAnytime=true;
 assert(Number.isInteger(r.callPenalty)&&r.callPenalty>=0&&r.callPenalty<=50,'Calling penalty must be 0–50.');
 assert(Number.isInteger(r.maxTurns)&&r.maxTurns>=10&&r.maxTurns<=500,'Turn cap must be 10–500.');return r;
}
export function newGame(hostId:string,rules:Partial<Rules>={}):Game {return {phase:'lobby',players:[],hostId,rules:validateRules(rules),round:0,deck:[],discard:[],turn:0,turns:0,drawn:null,handPower:null,handPowerQueue:[],swapEvent:null,power:null,reveals:{},caller:null,dutchWindowFor:null,finalTurns:0,pendingCall:null,peeks:{},jackReveals:{},drawEvent:null,reactionWindow:null,deadline:null,version:0,history:[],message:'The table is yours. Invite your people.'};}
export function addPlayer(g:Game,id:string,name:string,avatar:number):Game {assert(g.phase==='lobby','This game has already started.');assert(g.players.length<8,'This table is full.');assert(!g.players.some(p=>p.id===id),'Already seated.');const s=structuredClone(g);s.players.push({id,name,avatar,hand:[],handRevision:0,ready:false,peeked:[],peekDone:false});s.version++;return s;}
function round(s:Game,cards:Card[],now:number) {const expected=new Map(deck().map(c=>[c.id,c]));assert(cards.length===DECK_SIZE&&new Set(cards.map(c=>c.id)).size===DECK_SIZE&&cards.every(c=>{const ref=expected.get(c.id);return ref&&ref.rank===c.rank&&ref.suit===c.suit&&ref.back===c.back;}),'Two complete shuffled decks (104 cards) are required.');s.round++;s.swapEvent=null;s.deck=structuredClone(cards);s.discard=[];const previous=s.players.findIndex(p=>p.id===s.moderator);const host=s.players.findIndex(p=>p.id===s.hostId);const modIndex=s.round===1||previous<0?Math.max(0,host):(previous+1)%s.players.length;s.moderator=s.players[modIndex].id;s.peekCount=DEFAULT_PEEK_COUNT;s.autoDutch=null;s.turn=(modIndex+1)%s.players.length;s.turns=0;s.drawn=null;s.handPower=null;s.handPowerQueue=[];s.power=null;s.caller=null;s.dutchWindowFor=null;s.finalTurns=0;s.pendingCall=null;s.reveals={};s.peeks={};s.jackReveals={};s.drawEvent=null;s.reactionWindow=null;for(const p of s.players){p.hand=[];p.peeked=[];p.peekDone=false;for(let i=0;i<4;i++)p.hand.push(s.deck.pop()!);}
 s.discard.push(s.deck.pop()!);s.phase='choosing';s.deadline=now+CHOOSE_SECONDS*1000;s.message=`${s.players[modIndex].name} decides how many cards everyone sees.`;}
/** The moderator's choice opens the peek, or play itself when nobody may look. */
function startPeek(s:Game,count:number,now:number){s.peekCount=count;s.reveals={};if(count===0){s.players.forEach(p=>p.peekDone=true);s.phase='playing';s.deadline=now+s.rules.turnSeconds*1000;s.message=`No peeking this round. ${s.players[s.turn].name} starts.`;}else{s.phase='peeking';s.deadline=now+s.rules.peekSeconds*1000;s.message=`Peek at ${count} card${count===1?'':'s'}.`;}}
/** An emptied hand is an automatic Dutch: on your own turn the round ends now, otherwise when the moderator's turn ends. */
function handEmptied(s:Game,p:Player):boolean {if(s.players[s.turn]?.id===p.id){score(s);return true;}s.autoDutch??=p.id;s.message=`${p.name} is out of cards. The round ends with ${s.players.find(q=>q.id===s.moderator)?.name??'the moderator'}’s turn.`;return false;}
function score(s:Game) {const jokerRank=jokerRankForRound(s.round);s.dutchWindowFor=null;if(s.drawn){s.discard.push(s.drawn.card);s.drawn=null;}const base:Record<string,number>={},penalty:Record<string,number>={},hands:Record<string,Card[]>={};for(const p of s.players){base[p.id]=p.hand.reduce((v,c)=>v+value(c,jokerRank),0);penalty[p.id]=0;hands[p.id]=structuredClone(p.hand);}
 if(s.caller){const others=s.players.filter(p=>p.id!==s.caller).map(p=>base[p.id]);const success=s.rules.callerMustBeLowest?base[s.caller]<Math.min(...others):base[s.caller]<=Math.min(...others);
  // A failed call costs the caller a flat points penalty. No cards are drawn or carried into the next round.
  if(!success)penalty[s.caller]=s.rules.callPenalty;}const scores=Object.fromEntries(s.players.map(p=>[p.id,base[p.id]+penalty[p.id]]));const min=Math.min(...Object.values(scores));s.history.push({round:s.round,jokerRank,caller:s.caller,autoDutch:s.autoDutch??null,scores,base,penalty,hands,winners:s.players.filter(p=>scores[p.id]===min).map(p=>p.id)});s.phase=s.round>=s.rules.rounds?'finished':'results';s.drawn=null;s.reveals={};s.power=null;s.handPower=null;s.handPowerQueue=[];s.peeks={};s.jackReveals={};s.reactionWindow=null;s.deadline=null;s.message=s.phase==='finished'?'Good company. Great game.':'Cards on the table. Lowest score takes the round.';}
function advance(s:Game,now:number){s.dutchWindowFor=s.players[s.turn]?.id??null;s.reveals={};s.drawn=null;s.handPower=null;s.handPowerQueue=[];s.power=null;s.turns++;if(s.caller){s.finalTurns--;if(s.finalTurns<=0){score(s);return;}}if(s.turns>=s.rules.maxTurns){score(s);return;}
 // After an off-turn empty hand the lap closes with the moderator; empty hands sit the rest out.
 if(s.autoDutch&&s.players[s.turn]?.id===s.moderator){score(s);return;}
 s.turn=(s.turn+1)%s.players.length;
 for(let skipped=0;!s.players[s.turn].hand.length&&skipped<s.players.length;skipped++){if(s.autoDutch&&s.players[s.turn].id===s.moderator){score(s);return;}s.turn=(s.turn+1)%s.players.length;}
 s.phase='playing';s.deadline=now+s.rules.turnSeconds*1000;s.message=s.caller||s.autoDutch?'The last lap. Make your turn count.':`${s.players[s.turn].name}, trust your instinct.`;}
export function canCallDutch(s:{phase:Game['phase'];caller:string|null;autoDutch?:string|null;pendingCall?:unknown;drawn:unknown;dutchWindowFor:string|null;players:{id:string}[];turn:number},id:string):boolean {return s.phase==='playing'&&!s.caller&&!s.pendingCall&&!s.autoDutch&&!s.drawn&&(s.players[s.turn]?.id===id||s.dutchWindowFor===id);}
export function powerOwnerId(s:{phase:Game['phase'];handPower:Game['handPower'];players:{id:string}[];turn:number}):string|null {return s.phase==='power'?(s.handPower?.ownerId??s.players[s.turn]?.id??null):null;}
export function powerForRank(rank:number):Game['power'] {return rank===11?'ownPeek':rank===12?'blindSwap':null;}
function startHandPower(s:Game,ownerId:string,rank:number,count:number,resume:HandPower['resume'],now:number){
 if(!s.rules.powers||count===0||(rank!==11&&rank!==12))return false;
 const kind=rank===12?'blindSwap':'ownPeek';
 if(kind==='ownPeek'){
  // A Jack's peek never blocks the table: the owner can spend it whenever, play continues for everyone else.
  s.peeks[ownerId]=(s.peeks[ownerId]??0)+count;
  s.message=`${s.players.find(p=>p.id===ownerId)!.name} earned ${count} private peek${count===1?'':'s'}.`;
  return false;
 }
 if(s.handPower){const existing=[s.handPower,...s.handPowerQueue].find(q=>q.ownerId===ownerId&&q.kind===kind);if(existing)existing.remaining+=count;else s.handPowerQueue.push({kind,ownerId,remaining:count,resume:'continue',remainingTurnMs:0});if(resume==='advance')s.handPower.resume='advance';s.message=`${s.players.find(p=>p.id===ownerId)!.name} earned ${count} more swaps.`;return true;}
 s.handPower={kind,ownerId,remaining:count,resume,remainingTurnMs:Math.max(0,(s.deadline??now)-now)};
 s.phase='power';s.power=kind;s.deadline=now+s.rules.turnSeconds*1000;s.reveals={};
 s.message=`${s.players.find(p=>p.id===ownerId)!.name} discarded ${count} hand Queen${count===1?'':'s'}: ${count} blind swap${count===1?'':'s'}.`;return true;
}
function finishHandPower(s:Game,now:number,all=false){
 const q=s.handPower!;q.remaining=all?0:q.remaining-1;
 if(q.remaining>0){s.message=`${q.remaining} ${q.kind==='blindSwap'?'blind swap':'private peek'}${q.remaining===1?'':'s'} remaining.`;return;}
 const next=s.handPowerQueue.shift();if(next){next.resume=q.resume;next.remainingTurnMs=q.remainingTurnMs;s.handPower=next;s.power=next.kind;s.phase='power';s.deadline=now+s.rules.turnSeconds*1000;s.reveals={};s.message=`${s.players.find(p=>p.id===next.ownerId)!.name} has ${next.remaining} ${next.kind==='blindSwap'?'swaps':'peeks'} ready.`;return;}
 s.handPower=null;s.power=null;
 const turnHolder=s.players[s.turn];if(turnHolder&&!turnHolder.hand.length){score(s);return;}for(const p of s.players)if(!p.hand.length)s.autoDutch??=p.id;
 if(q.resume==='advance')advance(s,now);
 else{s.phase='playing';s.deadline=now+q.remainingTurnMs;s.message='Free throw complete. The interrupted turn continues.';}
}
function cancelDutchIfSwapped(s:Game,playerIds:string[]):boolean {if(!s.caller||!playerIds.includes(s.caller))return false;s.caller=null;s.finalTurns=0;return true;}
/** Locks in a grace-period Dutch call once its undo window has passed. */
function finalizeCall(s:Game,now:number){
 const call=s.pendingCall;if(!call)return;
 const p=s.players.find(pl=>pl.id===call.actor)!;
 s.pendingCall=null;s.caller=call.actor;s.dutchWindowFor=null;s.finalTurns=call.onOwnTurn?s.players.length:s.players.length-1;
 if(call.onOwnTurn)advance(s,now);
 s.message=`${p.name} called DUTCH. One last turn for everyone else.`;
}
function take(s:Game):Card|null {if(!s.deck.length&&s.discard.length>1){const top=s.discard.pop()!;s.deck=s.discard.reverse();s.discard=[top];}return s.deck.pop()??null;}
function indexOf(p:Player,i:number){assert(Number.isInteger(i)&&i>=0&&i<p.hand.length,'Choose a valid card.');}
/** Opens (or keeps open) the free-throw reaction window for whatever just landed on top of the discard pile.
 * If this very discard is itself a reaction to the window that's already open, the window is left alone —
 * its deadline and target don't reset every time someone else lands a match. */
function openReaction(s:Game,card:Card,now:number){
 if(s.rules.burning==='off')return;
 const jokerRank=jokerRankForRound(s.round);
 const key=(rank:number,val:number)=>s.rules.burning==='rank'?rank:val;
 const thisKey=key(card.rank,value(card,jokerRank));
 const live=s.reactionWindow&&now<s.reactionWindow.deadline?s.reactionWindow:null;
 if(live&&key(live.rank,live.value)===thisKey)return;
 s.reactionWindow={rank:card.rank,value:value(card,jokerRank),deadline:now+REACTION_WINDOW_MS};
}
export function applyAction(g:Game,actor:string,a:Action,now:number,cards?:Card[]):Game {
 const s=structuredClone(g);const p=s.players.find(p=>p.id===actor);assert(p,'You are not seated at this table.');
 const host=()=>assert(actor===s.hostId,'Only the table owner can do that.');
 const turn=()=>assert(s.players[s.turn]?.id===actor,'It is not your turn.');
 const powerTurn=()=>assert(powerOwnerId(s)===actor,'It is not your power. Only the player who earned it can use it.');
 const playing=()=>assert(s.phase==='playing','That action is not available right now.');
 assert(!s.pendingCall||a.type==='undoCall','Dutch was just called — wait a moment or undo it.');
 switch(a.type){
 case 'reorder':assert(['choosing','peeking','playing','power'].includes(s.phase),'Cards can only be reordered during a round.');assert(Number.isInteger(a.from)&&Number.isInteger(a.to)&&a.from!==a.to,'Choose two different card positions.');indexOf(p,a.from);indexOf(p,a.to);assert(a.handRevision===p.handRevision,'Your hand changed. Choose your cards again.');{const remap=(index:number)=>index===a.from?a.to:a.from<a.to&&index>a.from&&index<=a.to?index-1:a.to<a.from&&index>=a.to&&index<a.from?index+1:index;const [moved]=p.hand.splice(a.from,1);p.hand.splice(a.to,0,moved);p.peeked=p.peeked.map(remap);for(const [owner,reveals]of Object.entries(s.reveals))for(const reveal of reveals)if(owner===actor&&reveal.owner===actor)reveal.index=remap(reveal.index);s.swapEvent={version:s.version+1,actorId:actor,pairs:[],highlightSlots:[{playerId:p.id,index:a.to,back:moved.back}],move:{playerId:p.id,from:a.from,to:a.to},label:`${p.name} moved a card.`};}break;
 case 'ready':assert(s.phase==='lobby','The game has already started.');assert(typeof a.ready==='boolean','Invalid ready status.');p.ready=a.ready;break;
 case 'rules':host();assert(s.phase==='lobby','House rules are locked during a match.');s.rules=validateRules({...s.rules,...a.rules});s.players.forEach(p=>p.ready=false);break;
 case 'start':host();assert(s.phase==='lobby','The match has already started.');assert(s.players.length>=2,'Invite at least one other player.');assert(cards,'A shuffled deck is required.');round(s,cards,now);break;
 case 'peekCount':assert(s.phase==='choosing','The moderator has already chosen.');assert(actor===s.moderator,'Only the moderator chooses how many cards to see.');assert((PEEK_CHOICES as readonly number[]).includes(a.count),'Choose 0, 1 or 2 cards.');startPeek(s,a.count,now);break;
 case 'initialPeek':assert(s.phase==='peeking'&&!p.peekDone,'The initial peek is over.');indexOf(p,a.index);assert(p.peeked.length<(s.peekCount??DEFAULT_PEEK_COUNT)&&!p.peeked.includes(a.index),`You can inspect ${s.peekCount??DEFAULT_PEEK_COUNT} different cards.`);p.peeked.push(a.index);(s.reveals[actor]??=[]).push({owner:actor,index:a.index,card:p.hand[a.index]});break;
 case 'finishPeek':assert(s.phase==='peeking','The initial peek is over.');p.peekDone=true;delete s.reveals[actor];if(s.players.every(p=>p.peekDone)){s.phase='playing';s.deadline=now+s.rules.turnSeconds*1000;s.message=`${s.players[s.turn].name}, the first move is yours.`;}break;
 case 'draw':playing();turn();assert(!s.drawn,'Swap or discard the card you drew first.');assert(a.source==='deck'||a.source==='discard','Choose a pile.');{const fromDeck=a.source==='deck';const card=fromDeck?take(s):s.discard.pop();assert(card,'That pile is empty.');s.dutchWindowFor=null;s.drawn={card,fromDeck};delete s.reveals[actor];s.drawEvent={version:s.version+1,playerId:actor,fromDeck,back:card.back,card:fromDeck?null:card};s.message=`${p.name} drew a card.`;}break;
 case 'swap':playing();turn();assert(s.drawn,'Draw a card first.');{
  const indices=a.indices??(a.index===undefined?[]:[a.index]);assert(Array.isArray(indices)&&indices.length>0&&indices.length<=p.hand.length,'Select one or more hand cards to exchange.');assert(new Set(indices).size===indices.length,'Choose each hand card only once.');indices.forEach(i=>indexOf(p,i));
  if(a.handRevision!==undefined)assert(a.handRevision===p.handRevision,'Your hand changed. Select your cards again.');
  const outgoing=indices.map(i=>p.hand[i]);assert(outgoing.every(card=>card.rank===outgoing[0].rank),'Cards exchanged together must have the same number.');
  const kept=s.drawn.card;const automaticMatch=kept.rank===outgoing[0].rank;const replaceAt=indices[0];if(automaticMatch)s.discard.push(kept);s.discard.push(...outgoing);p.hand=p.hand.flatMap((card,i)=>indices.includes(i)?(!automaticMatch&&i===replaceAt?[kept]:[]):[card]);s.drawn=null;s.reveals={};openReaction(s,outgoing.at(-1)!,now);s.swapEvent={version:s.version+1,actorId:actor,pairs:[],highlightSlots:automaticMatch?[]:[{playerId:p.id,index:replaceAt,back:kept.back}],discardChanged:automaticMatch,thrown:automaticMatch?{count:outgoing.length}:undefined,label:automaticMatch?'Matching cards discarded':'Card exchanged'};
  const cancelled=cancelDutchIfSwapped(s,[p.id]);if(!startHandPower(s,actor,outgoing[0].rank,outgoing.length,'advance',now)){if(!p.hand.length)score(s);else advance(s,now);if(automaticMatch)s.message=`Automatic match — ${p.name} discarded the draw and ${outgoing.length} matching hand card${outgoing.length===1?'':'s'}.`;}if(cancelled)s.message='Dutch cancelled — the caller’s hand was swapped. Play continues.';
 }break;
 case 'discard':playing();turn();assert(s.drawn,'Draw a card first.');assert(s.drawn.fromDeck,'A card from the discard pile must be swapped.');{const card=s.drawn.card;s.discard.push(card);s.drawn=null;openReaction(s,card,now);advance(s,now);}break;
 // A hand Jack's peek: spend one earned peek on your own card, any time — it never waits on a phase or a turn.
 case 'powerPeek':assert(a.playerId===actor,'A hand Jack only lets you peek your own card.');assert((s.peeks[actor]??0)>0,'You have no pending peek to use.');indexOf(p,a.index);{s.peeks[actor]--;if(s.peeks[actor]<=0)delete s.peeks[actor];(s.jackReveals[actor]??=[]).push(p.hand[a.index].id);}break;
 case 'blindSwap':case 'blindSwapBatch':powerTurn();assert(s.phase==='power'&&s.power==='blindSwap','There is no swap power to use.');{
  const pairs=a.type==='blindSwap'?[a]:a.pairs;
  assert(Array.isArray(pairs)&&pairs.length>0&&pairs.length<=(s.handPower?.remaining??1),'Choose no more swaps than you earned.');
  for(const pair of pairs){if(a.type==='blindSwapBatch'&&a.revisions){for(const id of [pair.firstPlayerId,pair.secondPlayerId])assert(a.revisions[id]===s.players.find(p=>p.id===id)?.handRevision,'A selected hand changed. Plan your swaps again.');}const first=s.players.find(p=>p.id===pair.firstPlayerId),second=s.players.find(p=>p.id===pair.secondPlayerId);assert(first&&second,'Choose two players’ cards.');indexOf(first,pair.firstIndex);indexOf(second,pair.secondIndex);assert(first.id!==second.id||pair.firstIndex!==pair.secondIndex,'Choose two different cards.');}
  const movements:SwapEvent['pairs']=[];let cancelled=false;
  for(const pair of pairs){const first=s.players.find(p=>p.id===pair.firstPlayerId)!,second=s.players.find(p=>p.id===pair.secondPlayerId)!;movements.push({firstPlayerId:first.id,firstIndex:pair.firstIndex,secondPlayerId:second.id,secondIndex:pair.secondIndex,firstBack:first.hand[pair.firstIndex].back,secondBack:second.hand[pair.secondIndex].back});[first.hand[pair.firstIndex],second.hand[pair.secondIndex]]=[second.hand[pair.secondIndex],first.hand[pair.firstIndex]];cancelled=cancelDutchIfSwapped(s,[first.id,second.id])||cancelled;}
  s.reveals={};s.swapEvent={version:s.version+1,actorId:actor,pairs:movements};
  if(s.handPower){s.handPower.remaining-=pairs.length-1;finishHandPower(s,now);}else advance(s,now);
  if(cancelled)s.message='Dutch cancelled — the caller’s hand was swapped. Play continues.';
 }break;
 case 'skipPower':powerTurn();assert(s.phase==='power','No power is pending.');if(s.handPower)finishHandPower(s,now);else advance(s,now);break;
 case 'burn':assert(s.phase==='playing'||(s.phase==='power'&&!!s.handPower),'Free throws are not available right now.');assert(s.rules.burning!=='off','Free throws are disabled at this table.');s.rules.burnAnytime=true;{
  const wasPower=s.phase==='power';
  const indices=a.indices??(a.index===undefined?[]:[a.index]);assert(Array.isArray(indices)&&indices.length>0&&indices.length<=p.hand.length,'Select one or more hand cards.');assert(new Set(indices).size===indices.length,'Choose each hand card only once.');indices.forEach(i=>indexOf(p,i));
  assert(a.match===undefined||a.match==='drawn'||a.match==='discard'||a.match==='pair','Choose a valid free throw target.');
  if(a.match==='pair'){
   assert(s.phase==='playing'&&s.players[s.turn].id===actor,'Throw a matching set on your own turn.');
   assert(indices.length>=2,'Select at least two matching hand cards.');
   if(s.drawn&&a.targetId!==undefined)assert(a.targetId===s.drawn.card.id,'The drawn card has changed. Try again.');
   assert(a.handRevision===p.handRevision,'Your hand has changed. Select your cards again.');
   const selected=indices.map(i=>p.hand[i]);
   const matches=selected.every(card=>s.rules.burning==='rank'?card.rank===selected[0].rank:value(card,jokerRankForRound(s.round))===value(selected[0],jokerRankForRound(s.round)));
   if(matches){
    s.discard.push(...selected);p.hand=p.hand.filter((_,i)=>!indices.includes(i));s.reveals={};openReaction(s,selected.at(-1)!,now);s.swapEvent={version:s.version+1,actorId:actor,pairs:[],discardChanged:true,thrown:{count:selected.length},label:'Matching set discarded'};
    const powerRank=selected.find(c=>c.rank===11||c.rank===12)?.rank??0;const powerCount=selected.filter(c=>c.rank===powerRank).length;
    if(!p.hand.length&&s.drawn){s.discard.push(s.drawn.card);s.drawn=null;}
    if(!startHandPower(s,actor,powerRank,powerCount,'continue',now)){
     if(!p.hand.length){if(!handEmptied(s,p))break;}
     else s.message=s.drawn?`${p.name} threw ${selected.length} matching hand cards. The drawn card is still held.`:`${p.name} threw ${selected.length} matching hand cards.`;
    }
   }else{const penalty=take(s);if(penalty)p.hand.push(penalty);s.message=penalty?`Wrong free throw. ${p.name} takes a penalty card.`:'Wrong free throw. No penalty card is available.';}
   break;
  }
  const ownDraw=!!s.drawn&&s.players[s.turn].id===actor&&a.match!=='discard';
  if(a.match==='drawn')assert(ownDraw,'You can only match your own deck draw.');
  if(ownDraw)assert(s.drawn!.fromDeck,'A taken discard must be swapped; it cannot be used for a free throw.');
  const jokerRank=jokerRankForRound(s.round);
  // The still-open reaction window (if any) is what you're actually allowed to match against for a
  // discard throw — not necessarily the literal current top, which may have moved on because someone
  // else already landed their own reaction to the same card.
  const windowLive=!ownDraw&&s.reactionWindow&&now<s.reactionWindow.deadline?s.reactionWindow:null;
  const top=ownDraw?s.drawn!.card:s.discard.at(-1);
  assert(top||windowLive,'There is no card to match.');
  const matchRank=ownDraw?top!.rank:(windowLive?windowLive.rank:top!.rank);
  const matchValue=ownDraw?value(top!,jokerRank):(windowLive?windowLive.value:value(top!,jokerRank));
  if(a.targetId!==undefined){
   if(ownDraw)assert(a.targetId===top!.id,'The drawn card has changed. Try again.');
   else{
    const previous=s.discard.find(c=>c.id===a.targetId);
    const previousKey=previous&&(s.rules.burning==='rank'?previous.rank:value(previous,jokerRank));
    const currentKey=s.rules.burning==='rank'?matchRank:matchValue;
    assert(previous&&previousKey===currentKey,'The matching card has changed. Try again.');
   }
  }
  if(a.handRevision!==undefined)assert(a.handRevision===p.handRevision,'Your hand has changed. Select your cards again.');
  const selected=indices.map(i=>p.hand[i]);const matches=selected.every(card=>s.rules.burning==='rank'?matchRank===card.rank:matchValue===value(card,jokerRank));
  if(matches){
   if(ownDraw){s.discard.push(s.drawn!.card);s.drawn=null;}
   s.discard.push(...selected);p.hand=p.hand.filter((_,i)=>!indices.includes(i));s.reveals={};openReaction(s,selected.at(-1)!,now);s.swapEvent={version:s.version+1,actorId:actor,pairs:[],discardChanged:true,thrown:{count:selected.length},label:ownDraw?'Draw matched · cards discarded':'Free throw'};
   const powerRank=selected.find(c=>c.rank===11||c.rank===12)?.rank??0;const powerCount=selected.filter(c=>c.rank===powerRank).length;
   if(!startHandPower(s,actor,powerRank,powerCount,ownDraw?'advance':'continue',now)){if(wasPower){if(ownDraw&&s.handPower)s.handPower.resume='advance';}else if(!p.hand.length){if(!handEmptied(s,p))break;}else if(ownDraw)advance(s,now);s.message=`${p.name} made a free throw! ${selected.length} fewer card${selected.length===1?'':'s'}.`;}
  }else {const penalty=take(s);if(penalty)p.hand.push(penalty);s.message=penalty?`Wrong free throw. ${p.name} takes a penalty card.`:`Wrong free throw. No penalty card is available.`;}
 }break;
 case 'call':playing();assert(!s.drawn,'The next draw has started; the Dutch window is closed.');assert(!s.caller,'Dutch has already been called.');assert(canCallDutch(s,actor),'Call Dutch before your draw, or just after your turn before the next player draws.');{const onOwnTurn=s.players[s.turn].id===actor;s.pendingCall={actor,onOwnTurn,deadline:now+DUTCH_UNDO_MS};}s.message=`${p.name} called DUTCH — undo if that was a mistake.`;break;
 case 'undoCall':assert(s.pendingCall&&s.pendingCall.actor===actor,'There is no Dutch call to undo.');s.pendingCall=null;s.message='Dutch call undone. Play continues.';break;
 case 'nextRound':host();assert(s.phase==='results','Finish the round first.');assert(cards,'A shuffled deck is required.');round(s,cards,now);break;
 case 'rematch':host();assert(s.phase==='finished'||s.phase==='interrupted','Finish the match first.');s.round=0;s.history=[];assert(cards,'A shuffled deck is required.');round(s,cards,now);break;
 default:throw new GameError('Unknown action.');
 }for(const player of s.players){const before=g.players.find(p=>p.id===player.id);if(before&&before.hand.map(c=>c.id).join('|')!==player.hand.map(c=>c.id).join('|'))player.handRevision=(before.handRevision??0)+1;}s.version++;return s;
}
export function expireTurn(g:Game,now:number):Game {
 if(g.pendingCall&&now>=g.pendingCall.deadline){const s=structuredClone(g);finalizeCall(s,now);s.version++;return s;}
 // The reaction window runs on its own clock, independent of whose turn it is or that turn's deadline.
 const windowExpired=!!g.reactionWindow&&now>=g.reactionWindow.deadline;
 if(g.deadline===null||now<g.deadline){
  if(!windowExpired)return g;
  const s=structuredClone(g);s.reactionWindow=null;s.version++;return s;
 }
 const s=structuredClone(g);if(windowExpired)s.reactionWindow=null;
 if(s.phase==='choosing'){startPeek(s,DEFAULT_PEEK_COUNT,now);}else if(s.phase==='peeking'){s.players.forEach(p=>p.peekDone=true);s.reveals={};s.phase='playing';s.deadline=now+s.rules.turnSeconds*1000;s.message='The table is open. Let’s play.';}else if(s.phase==='power'&&s.handPower){finishHandPower(s,now,true);}else if(s.phase==='playing'||s.phase==='power'){if(s.drawn){s.discard.push(s.drawn.card);}advance(s,now);s.message='Time’s up. The turn passes.';}s.version++;return s;}
export interface PlayerView extends Omit<Player,'hand'|'peeked'> {hand:(Card|null)[];handBacks:CardBack[];connected:boolean}
export interface GameView extends Omit<Game,'players'|'deck'|'drawn'|'reveals'|'peeks'|'jackReveals'> {players:PlayerView[];roundLabel:number;jokerRank:number|null;deckCount:number;deckBack:CardBack|null;drawn:{card:Card|null;back:CardBack;fromDeck:boolean}|null;reveals:{owner:string;index:number;card:Card}[];peeks:number;you:string}
export function viewFor(s:Game,id:string,connected:string[]=[]):GameView {
 const {deck:_deck,drawn:_drawn,reveals:_reveals,players:_players,peeks:_peeks,jackReveals:_jackReveals,...safe}=s;const open=s.phase==='results'||s.phase==='finished';
 // A hand Jack's peek survives unrelated players' actions: it's keyed to the card's id, not cleared by the shared `reveals` map, and simply stops matching once the card leaves its owner's hand.
 const myJackCardIds=new Set(s.jackReveals[id]??[]);
 const jackRevealed=(ownerId:string,card:Card)=>ownerId===id&&myJackCardIds.has(card.id);
 const jackRevealEntries=s.players.find(pl=>pl.id===id)?.hand
  .map((card,index)=>({owner:id,index,card}))
  .filter(r=>myJackCardIds.has(r.card.id)) ?? [];
 return {...safe,roundLabel:roundLabelFor(s.round),jokerRank:jokerRankForRound(s.round),discard:s.discard,players:s.players.map(({hand,peeked:_peeked,...p})=>({...p,connected:connected.includes(p.id),handBacks:hand.map(c=>c.back),hand:hand.map((card,index)=>open?card:(s.reveals[id]?.find(r=>r.owner===p.id&&r.index===index)?.card??(jackRevealed(p.id,card)?card:null)))})),deckCount:s.deck.length,deckBack:s.deck.at(-1)?.back??null,drawn:s.drawn?{back:s.drawn.card.back,fromDeck:s.drawn.fromDeck,card:s.players[s.turn]?.id===id?s.drawn.card:null}:null,reveals:[...(s.reveals[id]??[]),...jackRevealEntries],peeks:s.peeks[id]??0,you:id};
}
