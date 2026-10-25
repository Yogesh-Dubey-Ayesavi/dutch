import {describe,it,expect} from 'vitest';
import {addPlayer,applyAction,CHOOSE_SECONDS,deck,DEFAULT_RULES,expireTurn,newGame,value,viewFor,validateRules,powerOwnerId,canCallDutch,jokerRankForRound,roundLabelFor,REACTION_WINDOW_MS,type Game,type Action} from './index';
function setup(n=2,rules={}){let s=newGame('p0',rules);for(let i=0;i<n;i++){s=addPlayer(s,`p${i}`,`Player ${i}`,i);s=applyAction(s,`p${i}`,{type:'ready',ready:true},0);}return s;}
/** Fixture: the moderator sits in the last seat so p0 opens round 1, as the older tests assume. */
function start(n=2,rules={}){const s=applyAction(setup(n,rules),'p0',{type:'start'},0,deck());s.moderator=s.players.at(-1)!.id;s.turn=0;return applyAction(s,s.moderator,{type:'peekCount',count:2},0);}
function playing(n=2,rules={}){let s=start(n,rules);for(const p of s.players)s=applyAction(s,p.id,{type:'finishPeek'},1);return s;}
function action(s:Game,a:Action,id=s.players[s.turn].id){return applyAction(s,id,a,100);}
/** Calls Dutch and lets its short undo window elapse, matching the pre-undo-window call semantics. */
function dutch(s:Game,id=s.players[s.turn].id,now=100){const called=applyAction(s,id,{type:'call'},now);return expireTurn(called,called.pendingCall!.deadline);}
function drawRank(s:Game,rank:number){const index=s.deck.findIndex(c=>c.rank===rank);[s.deck[index],s.deck[s.deck.length-1]]=[s.deck[s.deck.length-1],s.deck[index]];return action(s,{type:'draw',source:'deck'});}
function withDrawRank(rank:number){return drawRank(playing(),rank);}
function handPower(s=playing()){const p=s.players[s.turn];const ix=s.deck.findIndex(c=>c.rank===12);[p.hand[3],s.deck[ix]]=[s.deck[ix],p.hand[3]];s=drawRank(s,2);return action(s,{type:'swap',index:3});}
function conservation(s:Game){const cards=[...s.deck,...s.discard,...s.players.flatMap(p=>p.hand),...(s.drawn?[s.drawn.card]:[])];expect(cards.length).toBe(104);expect(new Set(cards.map(c=>c.id)).size).toBe(104);}
describe('deck and values',()=>{
 it('has exactly 104 distinct cards across two full decks',()=>{expect(deck()).toHaveLength(104);expect(new Set(deck().map(c=>c.id)).size).toBe(104);});
 it('has uniform rank, suit, and back counts across the two decks',()=>{const cards=deck();for(let rank=1;rank<=13;rank++)expect(cards.filter(c=>c.rank===rank)).toHaveLength(8);for(const suit of ['spades','hearts','diamonds','clubs'])expect(cards.filter(c=>c.suit===suit)).toHaveLength(26);expect(cards.filter(c=>c.back==='red')).toHaveLength(52);expect(cards.filter(c=>c.back==='black')).toHaveLength(52);for(let rank=1;rank<=13;rank++)for(const suit of ['spades','hearts','diamonds','clubs'])expect(cards.filter(c=>c.rank===rank&&c.suit===suit)).toHaveLength(2);});
 it('scores red kings as zero and black kings as thirteen',()=>{for(const c of deck())expect(value(c)).toBe(c.rank===13&&['hearts','diamonds'].includes(c.suit)?0:c.rank);});
 it('rejects invalid house rules',()=>{for(const r of [{rounds:0},{rounds:1},{rounds:12},{rounds:14},{turnSeconds:3},{burning:'anything'},{callPenalty:-1},{powers:'true'},{maxTurns:999}])expect(()=>validateRules(r as Partial<typeof DEFAULT_RULES>)).toThrow();});
});
describe('lobby and initial peek',()=>{
 it('requires the host and two players, not readiness',()=>{const s=setup();expect(()=>applyAction(s,'p1',{type:'start'},0,deck())).toThrow();s.players[1].ready=false;expect(applyAction(s,'p0',{type:'start'},0,deck()).phase).toBe('choosing');expect(()=>applyAction(setup(1),'p0',{type:'start'},0,deck())).toThrow();});
 it('supports 2 through 8 players',()=>{for(let n=2;n<=8;n++){const s=start(n);expect(s.players.every(p=>p.hand.length===4)).toBe(true);conservation(s);}});
 it('rejects the ninth player and joining an active match',()=>{expect(()=>addPlayer(setup(8),'p8','Nine',0)).toThrow();expect(()=>addPlayer(start(),'p2','Late',0)).toThrow();});
 it('resets readiness after rules change',()=>{const s=applyAction(setup(),'p0',{type:'rules',rules:{turnSeconds:45}},0);expect(s.players.every(p=>!p.ready)).toBe(true);});
 it('privately reveals at most two different cards',()=>{let s=start();s=action(s,{type:'initialPeek',index:0},'p0');expect(viewFor(s,'p0').players[0].hand[0]).not.toBeNull();expect(viewFor(s,'p1').players[0].hand.every(c=>c===null)).toBe(true);expect(()=>action(s,{type:'initialPeek',index:0},'p0')).toThrow();s=action(s,{type:'initialPeek',index:1},'p0');expect(()=>action(s,{type:'initialPeek',index:2},'p0')).toThrow();});
 it('hides initial peeks after confirmation',()=>{let s=start();s=action(s,{type:'initialPeek',index:0},'p0');s=action(s,{type:'finishPeek'},'p0');expect(viewFor(s,'p0').players[0].hand.every(c=>c===null)).toBe(true);expect(s.phase).toBe('peeking');s=action(s,{type:'finishPeek'},'p1');expect(s.phase).toBe('playing');});
 it('expires peeking without revealing cards',()=>{const s=expireTurn(start(),30000);expect(s.phase).toBe('playing');expect(s.reveals).toEqual({});});
});
describe('turns and confidentiality',()=>{
 it('reorders a hand without changing turn and moves one card into a new position for others',()=>{let s=playing();const before=s.players[0].hand.map(c=>c.id);const revision=s.players[0].handRevision;s=applyAction(s,'p0',{type:'reorder',from:0,to:3,handRevision:revision},100);expect(s.players[0].hand.map(c=>c.id)).toEqual([before[1],before[2],before[3],before[0]]);expect(s.players[0].handRevision).toBe(revision+1);expect(s.turn).toBe(0);expect(s.swapEvent?.highlightSlots?.map(slot=>slot.index)).toEqual([3]);expect(s.swapEvent?.move).toEqual({playerId:'p0',from:0,to:3});expect(viewFor(s,'p1').players[0].hand).toEqual([null,null,null,null]);expect(viewFor(s,'p1').players[0].handBacks).toEqual(s.players[0].hand.map(c=>c.back));conservation(s);});
 it('moves a card backwards and keeps remembered peeks attached to their cards',()=>{let s=start();const p=s.players[0];s=applyAction(s,'p0',{type:'initialPeek',index:3},1);const peekedId=p.hand[3].id;const before=s.players[0].hand.map(c=>c.id);s=applyAction(s,'p0',{type:'reorder',from:3,to:1,handRevision:s.players[0].handRevision},2);expect(s.players[0].hand.map(c=>c.id)).toEqual([before[0],before[3],before[1],before[2]]);expect(s.players[0].peeked).toEqual([1]);expect(s.reveals.p0[0]).toMatchObject({index:1});expect(s.reveals.p0[0].card.id).toBe(peekedId);conservation(s);});
 it('is immutable and deterministic',()=>{const s=playing();const copy=JSON.stringify(s);expect(action(s,{type:'draw',source:'deck'})).toEqual(action(s,{type:'draw',source:'deck'}));expect(JSON.stringify(s)).toBe(copy);});
 it('rejects out-of-turn actions and invalid card indices',()=>{const s=playing();expect(()=>action(s,{type:'draw',source:'deck'},'p1')).toThrow();expect(()=>action(s,{type:'swap',index:0})).toThrow();const drawn=action(s,{type:'draw',source:'deck'});for(const index of [-1,4,NaN,1.1])expect(()=>action(drawn,{type:'swap',index})).toThrow();});
 it('reveals a drawn card only to its owner',()=>{const s=action(playing(),{type:'draw',source:'deck'});expect(viewFor(s,'p0').drawn?.card).not.toBeNull();expect(viewFor(s,'p1').drawn?.card).toBeNull();expect('deck' in viewFor(s,'p0')).toBe(false);expect(viewFor(s,'p0').players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);conservation(s);});
 it('allows swapping and advances the turn',()=>{const s=action(playing(),{type:'draw',source:'deck'});const old=s.players[0].hand[3];const after=action(s,{type:'swap',index:3});expect(after.players[0].hand[3]).toEqual(s.drawn!.card);expect(after.discard.at(-1)).toEqual(old);expect(after.turn).toBe(1);conservation(after);});
 it('requires swapping a taken discard',()=>{const s=action(playing(),{type:'draw',source:'discard'});expect(()=>action(s,{type:'discard'})).toThrow();conservation(action(s,{type:'swap',index:0}));});
 it('gives no power to drawn 7, 8, 9, or 10',()=>{for(const rank of [7,8,9,10]){const s=withDrawRank(rank);const after=action(s,{type:'discard',usePower:true});expect(after.phase).toBe('playing');expect(after.power).toBeNull();expect(after.turn).toBe(1);conservation(after);}});
 it('disabled powers never trigger',()=>{const s=withDrawRank(12);s.rules.powers=false;expect(action(s,{type:'discard',usePower:true}).phase).toBe('playing');});
 it('expires a held card, preserving the deck',()=>{const s=action(playing(),{type:'draw',source:'deck'});const expired=expireTurn(s,50000);expect(expired.turn).toBe(1);expect(expired.drawn).toBeNull();conservation(expired);});
 it('does not expire before the deadline',()=>{const s=playing();expect(expireTurn(s,10)).toBe(s);});
 it('recycles only discards below the visible top card',()=>{let s=playing();while(s.deck.length){s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});}const top=s.discard.at(-1);s=action(s,{type:'draw',source:'deck'});expect(s.discard).toEqual([top]);conservation(s);});
});
describe('powers and matching',()=>{
 it('supports a private own-card peek from a discarded hand Jack, without blocking the table',()=>{let s=playing();const ix=s.deck.findIndex(c=>c.rank===11);[s.players[0].hand[0],s.deck[ix]]=[s.deck[ix],s.players[0].hand[0]];s=drawRank(s,2);s=action(s,{type:'swap',index:0});expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.peeks.p0).toBe(1);expect(()=>action(s,{type:'powerPeek',playerId:'p0',index:0},'p1')).toThrow();s=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');expect(s.turn).toBe(1);expect(viewFor(s,'p0').reveals).toHaveLength(1);expect(viewFor(s,'p1').reveals).toHaveLength(0);});
 it('lets a queen swap any two cards, including two opponents',()=>{let s=handPower(playing(3));const a=s.players[1].hand[0],b=s.players[2].hand[1];s=action(s,{type:'blindSwap',firstPlayerId:'p1',firstIndex:0,secondPlayerId:'p2',secondIndex:1});expect(s.players[1].hand[0]).toEqual(b);expect(s.players[2].hand[1]).toEqual(a);expect(viewFor(s,'p0').players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);conservation(s);});
 it('rejects swapping a card with itself',()=>{const s=handPower();expect(()=>action(s,{type:'blindSwap',firstPlayerId:'p0',firstIndex:0,secondPlayerId:'p0',secondIndex:0})).toThrow();});
 it('allows skipping or timing out a power',()=>{const s=handPower();expect(action(s,{type:'skipPower'}).turn).toBe(1);expect(expireTurn(s,50000).turn).toBe(1);});
 it('penalizes mismatches and keeps the same turn',()=>{const s=playing(2,{burning:'rank'});const i=s.players[0].hand.findIndex(c=>c.rank!==s.discard.at(-1)!.rank);const after=action(s,{type:'burn',index:i});expect(after.players[0].hand).toHaveLength(5);expect(after.turn).toBe(0);expect(after.message).toContain('penalty');conservation(after);});
 it('burns a matching card without revealing other cards',()=>{const s=playing(2,{burning:'rank'});const index=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);[s.players[0].hand[0],s.deck[index]]=[s.deck[index],s.players[0].hand[0]];const after=action(s,{type:'burn',index:0});expect(after.players[0].hand).toHaveLength(3);conservation(after);});
 it('rejects disabled free throws and allows reactions regardless of old turn-window settings',()=>{expect(()=>action(playing(2,{burning:'off'}),{type:'burn',index:0})).toThrow();expect(()=>action(playing(2,{burning:'rank',burnAnytime:false}),{type:'burn',index:0},'p1')).not.toThrow();});
});
describe('Dutch, scores, rounds, and recovery',()=>{
 it('gives every opponent exactly one final turn',()=>{let s=dutch(playing(4));expect(s.finalTurns).toBe(3);for(let i=1;i<=3;i++){expect(s.players[s.turn].id).toBe(`p${i}`);s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});}expect(s.phase).toBe('results');expect(s.history).toHaveLength(1);conservation(s);});
 it('rejects Dutch after drawing or a second Dutch call',()=>{expect(()=>action(action(playing(),{type:'draw',source:'deck'}),{type:'call'})).toThrow();expect(()=>action(action(playing(),{type:'call'}),{type:'call'})).toThrow();});
 it('calculates score breakdowns and gives a failed caller a flat points penalty',()=>{
  let s=playing(4);setHandRanks(s,'p0',[5,5,5,5]);setHandRanks(s,'p1',[1,1,2,2]);setHandRanks(s,'p2',[6,6,6,6]);setHandRanks(s,'p3',[2,2,2,2]);
  s=dutch(s);for(const id of ['p1','p2','p3']){s=action(s,{type:'draw',source:'deck'},id);s=action(s,{type:'discard'},id);}
  const result=s.history[0];expect(result.base).toEqual({p0:20,p1:6,p2:24,p3:8});
  // The caller's 20 isn't the lowest (p1's 6 and p3's 8 both beat it): a flat points penalty, no extra cards.
  expect(result.penalty.p0).toBe(s.rules.callPenalty);expect(result.hands.p0).toHaveLength(4);
  for(const p of s.players)expect(result.scores[p.id]).toBe(result.base[p.id]+result.penalty[p.id]);
  expect(viewFor(s,'p1').players.every(p=>p.hand.every(Boolean))).toBe(true);conservation(s);
 });
 it('gives a successful caller no penalty',()=>{
  let s=playing();setHandRanks(s,'p0',[1,1,2,2]);setHandRanks(s,'p1',[9,9,9,9]);s=dutch(s);s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});
  expect(s.history[0].penalty.p0).toBe(0);expect(s.history[0].hands.p0).toHaveLength(4);
 });
 it('plays exactly 13 rounds with two players, rotates starters, and resets on rematch',()=>{let s=playing();expect(s.rules.rounds).toBe(13);for(let n=1;n<=13;n++){expect(s.round).toBe(n);expect(s.turn).toBe((n-1)%2);s=dutch(s);s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});expect(s.history).toHaveLength(n);conservation(s);expect(s.phase).toBe(n===13?'finished':'results');if(n<13){expect(()=>applyAction(s,'p0',{type:'rematch'},200,deck())).toThrow();s=applyAction(s,'p0',{type:'nextRound'},200,deck());s=applyAction(s,s.moderator!,{type:'peekCount',count:2},200);for(const p of s.players)s=action(s,{type:'finishPeek'},p.id);}}expect(()=>applyAction(s,'p0',{type:'nextRound'},300,deck())).toThrow();s=applyAction(s,'p0',{type:'rematch'},300,deck());expect(s.history).toEqual([]);expect(s.round).toBe(1);expect(s.rules.rounds).toBe(13);});
 it('restores exact deterministic state from JSON snapshots',()=>{const s=handPower();const restored=JSON.parse(JSON.stringify(s));expect(action(restored,{type:'skipPower'})).toEqual(action(s,{type:'skipPower'}));});
 it('caps unattended rounds with deterministic timer transitions',()=>{let s=playing(2,{maxTurns:10});for(let i=0;i<10;i++)s=expireTurn(s,100000*(i+1));expect(s.phase).toBe('results');expect(s.history).toHaveLength(1);});
 it('holds a Dutch call for a short undo window before it locks in',()=>{
  let s=playing();
  s=applyAction(s,'p0',{type:'call'},100);
  expect(s.caller).toBeNull();expect(s.pendingCall).toMatchObject({actor:'p0',onOwnTurn:true});
  expect(()=>applyAction(s,'p1',{type:'draw',source:'deck'},150)).toThrow('wait a moment');
  expect(()=>applyAction(s,'p1',{type:'undoCall'},150)).toThrow('There is no Dutch call to undo.');
  const undone=applyAction(s,'p0',{type:'undoCall'},150);
  expect(undone.pendingCall).toBeNull();expect(undone.caller).toBeNull();
  expect(canCallDutch(undone,'p0')).toBe(true);conservation(undone);
 });
 it('locks a Dutch call in once its undo window has passed',()=>{
  const s=applyAction(playing(),'p0',{type:'call'},100);
  const finalized=expireTurn(s,s.pendingCall!.deadline);
  expect(finalized.pendingCall).toBeNull();expect(finalized.caller).toBe('p0');
  expect(()=>applyAction(finalized,'p0',{type:'undoCall'},finalized.deadline!)).toThrow('There is no Dutch call to undo.');
  conservation(finalized);
 });
 it('does not carry any extra cards into a failed caller’s next round',()=>{
  let s=playing(4);setHandRanks(s,'p0',[5,5,5,5]);setHandRanks(s,'p1',[1,1,2,2]);setHandRanks(s,'p2',[6,6,6,6]);setHandRanks(s,'p3',[2,2,2,2]);
  s=dutch(s);for(const id of ['p1','p2','p3']){s=action(s,{type:'draw',source:'deck'},id);s=action(s,{type:'discard'},id);}
  expect(s.history[0].penalty.p0).toBe(s.rules.callPenalty);
  s=applyAction(s,'p0',{type:'nextRound'},200,deck());
  for(const p of s.players)expect(p.hand).toHaveLength(4);
  conservation(s);
 });
});

describe('Jack, Queen, and Dutch cancellation',()=>{
 it('Jack privately reveals exactly one own card, never blocks play, and cannot blind swap',()=>{let s=jackPower();expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.peeks.p0).toBe(1);expect(()=>action(s,{type:'powerPeek',playerId:'p0',index:0},'p1')).toThrow();expect(()=>action(s,{type:'blindSwap',firstPlayerId:'p0',firstIndex:0,secondPlayerId:'p1',secondIndex:0},'p0')).toThrow();s=action(s,{type:'powerPeek',playerId:'p0',index:2},'p0');expect(viewFor(s,'p0').reveals).toHaveLength(1);expect(viewFor(s,'p0').reveals[0].card).toEqual(s.players[0].hand[2]);expect(viewFor(s,'p1').players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);expect(s.turn).toBe(1);expect(()=>action(s,{type:'powerPeek',playerId:'p0',index:3},'p0')).toThrow();conservation(s);});
 it('Queen grants only a blind swap, never a peek',()=>{const s=handPower();expect(s.power).toBe('blindSwap');expect(()=>action(s,{type:'powerPeek',playerId:'p0',index:0})).toThrow();});
 for(const callerPosition of ['first','second','both'] as const){
  it(`cancels Dutch when the caller supplies the ${callerPosition} swapped card, even on the last final turn`,()=>{let s=dutch(playing());s=handPower(s);expect(s.finalTurns).toBe(1);const first=callerPosition==='second'?'p1':'p0';const second=callerPosition==='first'?'p1':'p0';s=action(s,{type:'blindSwap',firstPlayerId:first,firstIndex:0,secondPlayerId:second,secondIndex:1});expect(s.caller).toBeNull();expect(s.finalTurns).toBe(0);expect(s.phase).toBe('playing');expect(s.history).toHaveLength(0);expect(s.message).toContain('Dutch cancelled');expect(s.turn).toBe(0);expect(viewFor(s,'p1').players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);conservation(s);s=dutch(s);expect(s.caller).toBe('p0');expect(s.finalTurns).toBe(1);s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});expect(s.history).toHaveLength(1);expect(s.history[0].caller).toBe('p0');});
 }
 it('keeps Dutch active when only other players’ cards are swapped',()=>{let s=dutch(playing(3));s=handPower(s);s=action(s,{type:'blindSwap',firstPlayerId:'p1',firstIndex:0,secondPlayerId:'p2',secondIndex:0});expect(s.caller).toBe('p0');expect(s.finalTurns).toBe(1);expect(s.phase).toBe('playing');s=action(s,{type:'draw',source:'deck'});s=action(s,{type:'discard'});expect(s.phase).toBe('results');expect(s.history[0].caller).toBe('p0');conservation(s);});
 it('skipping the Queen power preserves Dutch and scores the last final turn',()=>{let s=dutch(playing());s=handPower(s);s=action(s,{type:'skipPower'});expect(s.phase).toBe('results');expect(s.history[0].caller).toBe('p0');});
});

describe('two-deck backs and public metadata',()=>{
 it('contains one complete 52-card set per back design',()=>{
  for(const back of ['red','black']){const cards=deck().filter(c=>c.back===back);expect(cards).toHaveLength(52);expect(new Set(cards.map(c=>`${c.rank}-${c.suit}`)).size).toBe(52);for(const suit of ['hearts','diamonds','clubs','spades'])expect(cards.filter(c=>c.suit===suit)).toHaveLength(13);}
 });
 it('rejects a single deck, duplicate card, or incorrect back metadata at deal',()=>{
  expect(()=>applyAction(setup(),'p0',{type:'start'},0,deck().slice(0,52))).toThrow('104');
  const cards=deck();cards[0]=cards[1];expect(()=>applyAction(setup(),'p0',{type:'start'},0,cards)).toThrow('104');
  const wrong=deck();wrong[0].back='black';expect(()=>applyAction(setup(),'p0',{type:'start'},0,wrong)).toThrow('104');
 });
 it('publishes only back designs of hidden hands and the top deck card',()=>{
  const s=playing();const view=viewFor(s,'p0');
  for(const [i,p] of view.players.entries()){expect(p.hand.every(c=>c===null)).toBe(true);expect(p.handBacks).toEqual(s.players[i].hand.map(c=>c.back));}
  expect(view.deckBack).toBe(s.deck.at(-1)!.back);expect(view.deckCount).toBe(95);expect('deck' in view).toBe(false);
  expect(JSON.stringify(view.players)).not.toContain('rank');expect(JSON.stringify(view.players)).not.toContain('suit');
 });
 it('keeps back designs attached to cards through draws and swaps',()=>{
  let s=action(playing(),{type:'draw',source:'deck'});const held=s.drawn!.card;const old=s.players[0].hand[0];
  expect(viewFor(s,'p1').drawn).toEqual({card:null,fromDeck:true,back:held.back});
  s=action(s,{type:'swap',index:0});expect(viewFor(s,'p1').players[0].handBacks[0]).toBe(held.back);expect(s.discard.at(-1)).toEqual(old);conservation(s);
 });
 it('moves public back designs during blind swaps without revealing identities',()=>{
  let s=handPower();
  const other=s.deck.findIndex(c=>c.back!==s.players[0].hand[0].back);
  [s.players[1].hand[0],s.deck[other]]=[s.deck[other],s.players[1].hand[0]];
  const first=s.players[0].hand[0].back,second=s.players[1].hand[0].back;
  s=action(s,{type:'blindSwap',firstPlayerId:'p0',firstIndex:0,secondPlayerId:'p1',secondIndex:0});
  const view=viewFor(s,'p0');expect(view.players[0].handBacks[0]).toBe(second);expect(view.players[1].handBacks[0]).toBe(first);expect(view.players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);conservation(s);
 });
});

describe('free throws',()=>{
 it('throws a hand pair on the last Dutch turn while retaining an unrelated deck draw',()=>{
  let s=playing();
  for(const [index,rank] of [6,6,3,4].entries()){
   const deckIndex=s.deck.findIndex(c=>c.rank===rank);
   [s.players[1].hand[index],s.deck[deckIndex]]=[s.deck[deckIndex],s.players[1].hand[index]];
  }
  s=dutch(s);
  s=drawRank(s,2);
  const held=s.drawn!.card;
  s=action(s,{type:'burn',indices:[0,1],match:'pair',targetId:held.id,handRevision:s.players[1].handRevision});
  expect(s.players[1].hand.map(c=>c.rank)).toEqual([3,4]);
  expect(s.drawn?.card).toEqual(held);
  expect(s.turn).toBe(1);
  expect(s.caller).toBe('p0');
  s=action(s,{type:'discard'});
  expect(s.phase).toBe('results');
  expect(s.history[0].hands.p1.map(c=>c.rank)).toEqual([3,4]);
  conservation(s);
 });
 it('throws a same-rank hand set on your own turn without needing a deck draw, but not off-turn or with one card',()=>{
  let s=playing();
  expect(()=>action(s,{type:'burn',indices:[0],match:'pair',handRevision:s.players[0].handRevision})).toThrow('at least two');
  expect(()=>action(s,{type:'burn',indices:[0,1],match:'pair',handRevision:s.players[1].handRevision},'p1')).toThrow('own turn');
  s=setHandRanks(s,'p0',[6,6,3,4]);
  const after=action(s,{type:'burn',indices:[0,1],match:'pair',handRevision:s.players[0].handRevision});
  expect(after.players[0].hand.map(c=>c.rank)).toEqual([3,4]);
  expect(after.drawn).toBeNull();
  conservation(after);
 });
 it('enables same-number free throws on anyone’s turn by default',()=>{
  expect(DEFAULT_RULES.burning).toBe('rank');expect(DEFAULT_RULES.burnAnytime).toBe(true);
 });
 it('discards a deck draw and a matching hand card, reducing the hand and ending the turn',()=>{
  let s=playing();const old=s.players[0].hand[0];s=drawRank(s,old.rank);const drawn=s.drawn!.card;
  const after=action(s,{type:'burn',index:0});expect(after.players[0].hand).toHaveLength(3);
  expect(after.discard.slice(-2)).toEqual([drawn,old]);expect(after.drawn).toBeNull();expect(after.turn).toBe(1);expect(after.power).toBeNull();conservation(after);
 });
 it('allows an opponent to throw onto a discard without consuming the active turn',()=>{
  const s=playing();const ix=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);
  [s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];
  const deadline=s.deadline;const after=action(s,{type:'burn',index:0},'p1');
  expect(after.players[1].hand).toHaveLength(3);expect(after.turn).toBe(s.turn);expect(after.deadline).toBe(deadline);expect(after.turns).toBe(s.turns);conservation(after);
 });
 it('adds a hidden penalty card on a wrong drawn-card match while preserving the draw',()=>{
  let s=playing();s=drawRank(s,s.players[0].hand[0].rank===2?3:2);
  const held=s.drawn;const after=action(s,{type:'burn',index:0});expect(after.players[0].hand).toHaveLength(5);expect(after.drawn).toEqual(held);expect(after.turn).toBe(0);
  expect(after.message).toContain('Wrong free throw');expect(viewFor(after,'p1').players[0].hand.every(c=>c===null)).toBe(true);conservation(after);
 });
 it('does not let a taken discard bypass the required swap',()=>{
  const s=action(playing(),{type:'draw',source:'discard'});expect(()=>action(s,{type:'burn',index:0})).toThrow('taken discard');
 });
 it('allows discard reactions during another player’s draw and hand powers',()=>{
  const held=withDrawRank(12);const ix=held.deck.findIndex(c=>c.rank===held.discard.at(-1)!.rank);[held.players[1].hand[0],held.deck[ix]]=[held.deck[ix],held.players[1].hand[0]];const after=action(held,{type:'burn',index:0},'p1');expect(after.drawn).toEqual(held.drawn);expect(after.players[1].hand).toHaveLength(3);expect(after.turn).toBe(held.turn);conservation(after);
  const power=handPower();expect(()=>action(power,{type:'burn',index:0},'p1')).not.toThrow();
 });
 it('activates a Queen power for a Queen thrown from the hand',()=>{
  const s=playing();const queen=s.deck.findIndex(c=>c.rank===12);[s.players[0].hand[0],s.deck[queen]]=[s.deck[queen],s.players[0].hand[0]];
  const after=action(drawRank(s,12),{type:'burn',index:0});expect(after.phase).toBe('power');expect(after.power).toBe('blindSwap');expect(after.handPower?.remaining).toBe(1);expect(after.turn).toBe(0);conservation(after);
 });
 it('immediately scores an empty hand and keeps both matched cards in the discard',()=>{
  let s=playing();s.deck.push(...s.players[0].hand.splice(1));s=drawRank(s,s.players[0].hand[0].rank);
  const held=s.drawn!.card;const after=action(s,{type:'burn',index:0});expect(after.phase).toBe('results');expect(after.history[0].base.p0).toBe(0);expect(after.discard).toContainEqual(held);expect(after.history[0].hands.p0).toEqual([]);conservation(after);
 });
 it('clears private positional reveals after removing a hand slot',()=>{
  const s=playing();s.reveals.p0=[{owner:'p1',index:0,card:s.players[1].hand[0]}];
  const ix=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);[s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];
  const after=action(s,{type:'burn',index:0},'p1');expect(after.reveals).toEqual({});conservation(after);
 });
 it('counts a successful drawn-card free throw as the last Dutch turn',()=>{
  let s=dutch(playing());s=drawRank(s,s.players[1].hand[0].rank);const after=action(s,{type:'burn',index:0});
  expect(after.phase).toBe('results');expect(after.history[0].caller).toBe('p0');conservation(after);
 });
 it('preserves the Dutch countdown for an out-of-turn discard free throw',()=>{
  const s=dutch(playing(3));const ix=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);
  [s.players[2].hand[0],s.deck[ix]]=[s.deck[ix],s.players[2].hand[0]];
  const after=action(s,{type:'burn',index:0},'p2');expect(after.finalTurns).toBe(s.finalTurns);expect(after.caller).toBe('p0');expect(after.turn).toBe(1);conservation(after);
 });
});

describe('free throw during an opponent draw',()=>{
 it('lets an off-turn empty hand finish the lap, then discards the held card when scoring',()=>{
  const s=withDrawRank(5);s.deck.push(...s.players[1].hand.splice(1));const ix=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);
  [s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];const held=s.drawn!.card;
  const thrown=action(s,{type:'burn',index:0},'p1');expect(thrown.phase).toBe('playing');expect(thrown.autoDutch).toBe('p1');expect(thrown.drawn?.card).toEqual(held);
  // p1 is the moderator, so the lap closes once p0 finishes; p1 has nothing left to play.
  const after=action(thrown,{type:'discard'},'p0');expect(after.phase).toBe('results');expect(after.drawn).toBeNull();expect(after.discard).toContainEqual(held);expect(after.history[0].base.p1).toBe(0);expect(after.history[0].autoDutch).toBe('p1');conservation(after);
 });
});

describe('explicit free throw drop targets',()=>{
 it('matches the discard while holding a different drawn number, preserving the draw',()=>{
  const s=withDrawRank(5);const rank=s.discard.at(-1)!.rank;const i=s.deck.findIndex(c=>c.rank===rank);
  [s.players[0].hand[0],s.deck[i]]=[s.deck[i],s.players[0].hand[0]];
  const after=action(s,{type:'burn',index:0,match:'discard'});expect(after.players[0].hand).toHaveLength(3);expect(after.drawn).toEqual(s.drawn);expect(after.turn).toBe(0);conservation(after);
 });
 it('matches an explicitly targeted deck draw and ends the turn',()=>{
  let s=playing();s=drawRank(s,s.players[0].hand[0].rank);
  const after=action(s,{type:'burn',index:0,match:'drawn'});expect(after.players[0].hand).toHaveLength(3);expect(after.drawn).toBeNull();expect(after.turn).toBe(1);conservation(after);
 });
 it('rejects trying to match another player’s hidden draw',()=>{
  const s=withDrawRank(5);expect(()=>action(s,{type:'burn',index:0,match:'drawn'},'p1')).toThrow('own deck draw');
 });
 it('validates target names instead of trusting the client',()=>{
  expect(()=>action(playing(),{type:'burn',index:0,match:'invalid'} as unknown as Action)).toThrow('valid free throw target');
 });
});

function matchingHand(rank:number,count:number,n=2){const s=playing(n);for(let i=0;i<count;i++){const ix=s.deck.findIndex(c=>c.rank===rank);[s.players[0].hand[i],s.deck[ix]]=[s.deck[ix],s.players[0].hand[i]];}return s;}
function swapOnce(s:Game,owner='p0'){return action(s,{type:'blindSwap',firstPlayerId:'p0',firstIndex:0,secondPlayerId:'p1',secondIndex:0},owner);}
describe('multiple free throws and hand Queen powers',()=>{
 it('discards the drawn Queen plus three selected hand Queens and earns three swaps',()=>{
  let s=drawRank(matchingHand(12,3),12);const held=s.drawn!.card;
  s=action(s,{type:'burn',indices:[0,1,2],match:'drawn'});
  expect(s.players[0].hand).toHaveLength(1);expect(s.discard.slice(-4).every(c=>c.rank===12)).toBe(true);expect(s.discard).toContainEqual(held);
  expect(s.handPower).toMatchObject({ownerId:'p0',remaining:3,resume:'advance'});expect(s.drawn).toBeNull();expect(s.turn).toBe(0);conservation(s);
  for(const remaining of [2,1,0]){s=swapOnce(s);expect(s.handPower?.remaining??0).toBe(remaining);expect(s.turn).toBe(remaining?0:1);conservation(s);}
 });
 it('does not grant any power for a Queen discarded directly from the deck',()=>{
  for(const usePower of [true,false]){const s=action(withDrawRank(12),{type:'discard',usePower});expect(s.phase).toBe('playing');expect(s.handPower).toBeNull();expect(s.power).toBeNull();expect(s.turn).toBe(1);conservation(s);}
 });
 it('automatically grants a swap when replacing a Queen from the hand',()=>{
  const s=handPower();expect(s.handPower).toMatchObject({ownerId:'p0',remaining:1,resume:'advance'});expect(s.phase).toBe('power');expect(swapOnce(s).turn).toBe(1);conservation(s);
 });
 it('allows a three-card number match without Queen powers',()=>{
  const s=action(drawRank(matchingHand(6,3),6),{type:'burn',indices:[2,0,1],match:'drawn'});
  expect(s.players[0].hand).toHaveLength(1);expect(s.discard.slice(-4).every(c=>c.rank===6)).toBe(true);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);conservation(s);
 });
 it('validates a whole batch before removing any cards and penalizes a wrong attempt once',()=>{
  let s=matchingHand(6,2);s=drawRank(s,6);const before=structuredClone(s);const wrong=s.players[0].hand.findIndex(c=>c.rank!==6);
  const after=action(s,{type:'burn',indices:[0,wrong],match:'drawn'});
  expect(after.players[0].hand.slice(0,4)).toEqual(before.players[0].hand);expect(after.players[0].hand).toHaveLength(5);expect(after.discard).toEqual(before.discard);expect(after.drawn).toEqual(before.drawn);expect(after.handPower).toBeNull();expect(s).toEqual(before);conservation(after);
 });
 it('rejects empty, repeated, noninteger, and out-of-range batch selections',()=>{
  const s=drawRank(matchingHand(6,3),6);for(const indices of [[],[0,0],[-1],[4],[1.5],[0,99]])expect(()=>action(s,{type:'burn',indices,match:'drawn'})).toThrow();conservation(s);
 });
 it('allows the free throw owner to use powers out of turn and resumes the original held draw',()=>{
  let s=matchingHand(12,3);const ix=s.deck.findIndex(c=>c.rank===12);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];s.turn=1;s=drawRank(s,5);const held=s.drawn;const remaining=s.deadline!-100;
  s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');expect(s.turn).toBe(1);expect(s.handPower?.ownerId).toBe('p0');expect(s.drawn).toEqual(held);
  expect(viewFor(s,'p0').drawn?.card).toBeNull();expect(viewFor(s,'p1').drawn?.card).toEqual(held!.card);
  expect(()=>swapOnce(s,'p1')).toThrow('your power');
  for(let i=0;i<3;i++)s=applyAction(s,'p0',{type:'skipPower'},1000+i);
  expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.drawn).toEqual(held);expect(s.deadline).toBe(1002+remaining);conservation(s);
 });
 it('skips only one earned swap at a time',()=>{
  let s=action(drawRank(matchingHand(12,3),12),{type:'burn',indices:[0,1,2],match:'drawn'});
  s=action(s,{type:'skipPower'});expect(s.handPower?.remaining).toBe(2);expect(s.phase).toBe('power');s=swapOnce(s);expect(s.handPower?.remaining).toBe(1);s=action(s,{type:'skipPower'});expect(s.handPower).toBeNull();expect(s.turn).toBe(1);conservation(s);
 });
 it('resolves earned swaps before scoring when the final hand cards are Queens',()=>{
  let s=matchingHand(12,3);s.deck.push(...s.players[0].hand.splice(3));s=drawRank(s,12);s=action(s,{type:'burn',indices:[0,1,2],match:'drawn'});
  expect(s.players[0].hand).toHaveLength(0);expect(s.phase).toBe('power');expect(s.history).toHaveLength(0);
  for(let i=0;i<3;i++)s=action(s,{type:'skipPower'});
  expect(s.phase).toBe('results');expect(s.history[0].base.p0).toBe(0);conservation(s);
 });
 it('expires outstanding Queen swaps and safely resumes a held draw',()=>{
  let s=matchingHand(12,3);const ix=s.deck.findIndex(c=>c.rank===12);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];s.turn=1;s=drawRank(s,5);const held=s.drawn;
  s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=expireTurn(s,s.deadline!);
  expect(s.handPower).toBeNull();expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.drawn).toEqual(held);conservation(s);
 });
 it('preserves multiple remaining swaps through JSON recovery',()=>{
  let s=action(drawRank(matchingHand(12,3),12),{type:'burn',indices:[0,1,2],match:'drawn'});s=swapOnce(s);const restored=JSON.parse(JSON.stringify(s));expect(swapOnce(restored)).toEqual(swapOnce(s));expect(restored.handPower.remaining).toBe(2);
 });
 it('disables hand Queen powers when house powers are disabled',()=>{
  const s=matchingHand(12,3);s.rules.powers=false;const after=action(drawRank(s,12),{type:'burn',indices:[0,1,2],match:'drawn'});expect(after.handPower).toBeNull();expect(after.turn).toBe(1);conservation(after);
 });
 it('cancels Dutch on the first affected swap while retaining the remaining earned swaps',()=>{
  let s=matchingHand(12,3,3);s.turn=2;s=dutch(s);s=drawRank(s,12);s=action(s,{type:'burn',indices:[0,1,2],match:'drawn'});
  expect(s.caller).toBe('p2');s=action(s,{type:'blindSwap',firstPlayerId:'p2',firstIndex:0,secondPlayerId:'p1',secondIndex:0});expect(s.caller).toBeNull();expect(s.finalTurns).toBe(0);expect(s.handPower?.remaining).toBe(2);
  s=action(s,{type:'skipPower'});s=action(s,{type:'skipPower'});expect(s.phase).toBe('playing');expect(s.history).toHaveLength(0);conservation(s);
 });
});

function jackPower(s=matchingHand(11,1)){return action(drawRank(s,2),{type:'swap',index:0});}

describe('hand Jack powers never block the table',()=>{
 it('grants one private own-card peek per hand Jack, excluding the matching drawn Jack, and lets play continue immediately',()=>{
  let s=action(drawRank(matchingHand(11,3),11),{type:'burn',indices:[0,1,2],match:'drawn'});
  expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.peeks.p0).toBe(3);expect(s.players[0].hand).toHaveLength(1);expect(s.discard.slice(-4).every(c=>c.rank===11)).toBe(true);conservation(s);
  for(const remaining of [2,1,0]){s=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');expect(s.peeks.p0??0).toBe(remaining);expect(viewFor(s,'p1').players[0].hand.every(c=>c===null)).toBe(true);conservation(s);}
  expect(s.turn).toBe(1);expect(viewFor(s,'p0').players[0].hand[0]).toEqual(s.players[0].hand[0]);
 });
 it('never grants a power for a Jack discarded directly from the draw pile',()=>{
  for(const usePower of [true,false]){const s=action(withDrawRank(11),{type:'discard',usePower});expect(s.handPower).toBeNull();expect(s.power).toBeNull();expect(s.peeks.p0).toBeUndefined();expect(s.turn).toBe(1);conservation(s);}
 });
 it('automatically earns a peek when a Jack leaves the hand during a normal replacement, without blocking the table',()=>{
  const s=jackPower();expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.peeks.p0).toBe(1);
  const after=action(s,{type:'powerPeek',playerId:'p0',index:2},'p0');expect(after.turn).toBe(1);expect(viewFor(after,'p0').players[0].hand[2]).not.toBeNull();expect(viewFor(after,'p1').players[0].hand[2]).toBeNull();conservation(after);
 });
 it('supports three distinct private peeks without losing previously revealed choices',()=>{
  let s=matchingHand(11,3);s.players[0].hand.push(s.deck.pop()!,s.deck.pop()!);s=drawRank(s,11);s=action(s,{type:'burn',indices:[0,1,2],match:'drawn'});
  for(const index of [0,1,2]){s=action(s,{type:'powerPeek',playerId:'p0',index},'p0');expect(viewFor(s,'p0').reveals).toHaveLength(index+1);expect(viewFor(s,'p1').reveals).toHaveLength(0);}
  expect(viewFor(s,'p0').players[0].hand.every(Boolean)).toBe(true);expect(viewFor(s,'p1').players[0].hand.every(c=>c===null)).toBe(true);conservation(s);
 });
 it('lets an out-of-turn thrower use earned Jack peeks while preserving the active draw and without pausing play',()=>{
  let s=matchingHand(11,2);const ix=s.deck.findIndex(c=>c.rank===11);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];s.turn=1;s=drawRank(s,5);const held=s.drawn;
  s=action(s,{type:'burn',indices:[0,1],match:'discard'},'p0');expect(s.peeks.p0).toBe(2);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.drawn).toEqual(held);
  expect(()=>action(s,{type:'powerPeek',playerId:'p1',index:0},'p1')).toThrow('no pending peek');expect(()=>action(s,{type:'powerPeek',playerId:'p1',index:0},'p0')).toThrow('own card');
  s=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');s=action(s,{type:'powerPeek',playerId:'p0',index:1},'p0');
  expect(s.turn).toBe(1);expect(s.phase).toBe('playing');expect(s.drawn).toEqual(held);expect(viewFor(s,'p0').drawn?.card).toBeNull();expect(viewFor(s,'p1').reveals).toHaveLength(0);conservation(s);
 });
 it('resolves peeks one at a time and persists partial progress through snapshot recovery',()=>{
  let s=action(drawRank(matchingHand(11,3),11),{type:'burn',indices:[0,1,2],match:'drawn'});s=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');expect(s.peeks.p0).toBe(2);
  s=JSON.parse(JSON.stringify(s));expect(viewFor(s,'p0').reveals).toHaveLength(1);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);conservation(s);
 });
 it('keeps unused Jack peeks available through ordinary turn timeouts',()=>{
  const s=action(drawRank(matchingHand(11,3),11),{type:'burn',indices:[0,1,2],match:'drawn'});expect(s.peeks.p0).toBe(3);expect(s.phase).toBe('playing');
  const after=expireTurn(s,s.deadline!);expect(after.peeks.p0).toBe(3);expect(after.phase).toBe('playing');conservation(after);
 });
 it('grants no Jack power for wrong throws or when powers are disabled',()=>{
  let s=matchingHand(11,2);s=drawRank(s,5);const wrong=action(s,{type:'burn',indices:[0,1],match:'drawn'});expect(wrong.handPower).toBeNull();expect(wrong.peeks.p0).toBeUndefined();expect(wrong.players[0].hand).toHaveLength(5);
  const disabled=matchingHand(11,2);disabled.rules.powers=false;const after=action(drawRank(disabled,11),{type:'burn',indices:[0,1],match:'drawn'});expect(after.handPower).toBeNull();expect(after.peeks.p0).toBeUndefined();expect(after.turn).toBe(1);conservation(after);
 });
});

function competingQueens(){const s=matchingHand(12,3,3);const p=s.players[1];let ix=s.deck.findIndex(c=>c.rank===12);[p.hand[0],s.deck[ix]]=[s.deck[ix],p.hand[0]];ix=s.deck.findIndex(c=>c.rank===12);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];return s;}
const pair01={firstPlayerId:'p0',firstIndex:0,secondPlayerId:'p1',secondIndex:0};
const pair12={firstPlayerId:'p1',firstIndex:0,secondPlayerId:'p2',secondIndex:0};
describe('concurrent Queen throws and atomic swap plans',()=>{
 it('accepts another player’s free throw while three swaps are pending and queues their power',()=>{
  let s=competingQueens();s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=action(s,{type:'burn',indices:[0],match:'discard'},'p1');
  expect(s.players[0].hand).toHaveLength(1);expect(s.players[1].hand).toHaveLength(3);expect(s.handPower).toMatchObject({ownerId:'p0',remaining:3});expect(s.handPowerQueue).toHaveLength(1);expect(s.handPowerQueue[0]).toMatchObject({ownerId:'p1',remaining:1});conservation(s);
  s=action(s,{type:'blindSwapBatch',pairs:[pair01,pair12,pair01]},'p0');expect(s.handPower).toMatchObject({ownerId:'p1',remaining:1});expect(s.handPowerQueue).toEqual([]);expect(s.phase).toBe('power');
  s=action(s,{type:'blindSwapBatch',pairs:[pair12]},'p1');expect(s.phase).toBe('playing');expect(s.turn).toBe(0);conservation(s);
 });
 it('applies three planned swaps in a single versioned action',()=>{
  let s=action(drawRank(matchingHand(12,3,3),12),{type:'burn',indices:[0,1,2],match:'drawn'});const before=structuredClone(s);const pairs=[pair01,pair12,pair01];
  const expected=structuredClone(s);for(const pair of pairs){const a=expected.players.find(p=>p.id===pair.firstPlayerId)!,b=expected.players.find(p=>p.id===pair.secondPlayerId)!;[a.hand[pair.firstIndex],b.hand[pair.secondIndex]]=[b.hand[pair.secondIndex],a.hand[pair.firstIndex]];}
  s=action(s,{type:'blindSwapBatch',pairs});expect(s.version).toBe(before.version+1);expect(s.players.map(p=>p.hand)).toEqual(expected.players.map(p=>p.hand));expect(s.handPower).toBeNull();expect(s.turn).toBe(1);expect(s.swapEvent?.pairs).toHaveLength(3);conservation(s);
 });
 it('validates the entire plan before exchanging any card',()=>{
  const s=action(drawRank(matchingHand(12,3),12),{type:'burn',indices:[0,1,2],match:'drawn'});const before=JSON.stringify(s);
  expect(()=>action(s,{type:'blindSwapBatch',pairs:[pair01,{...pair01,secondIndex:99}]})).toThrow('valid card');expect(JSON.stringify(s)).toBe(before);
  expect(()=>action(s,{type:'blindSwapBatch',pairs:[pair01,pair01,pair01,pair01]})).toThrow('earned');expect(()=>action(s,{type:'blindSwapBatch',pairs:[]})).toThrow('earned');
 });
 it('does not let a queued owner execute before the current owner',()=>{
  let s=competingQueens();s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=action(s,{type:'burn',index:0,match:'discard'},'p1');expect(()=>action(s,{type:'blindSwapBatch',pairs:[pair12]},'p1')).toThrow('your power');
 });
 it('accepts a concurrently prepared throw if its hand revision and matching number still agree',()=>{
  let s=competingQueens();const targetId=s.discard.at(-1)!.id,handRevision=s.players[1].handRevision;
  s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');expect(s.discard.at(-1)!.id).not.toBe(targetId);
  s=action(s,{type:'burn',index:0,match:'discard',targetId,handRevision},'p1');expect(s.handPowerQueue[0].ownerId).toBe('p1');expect(s.players[1].hand).toHaveLength(3);conservation(s);
 });
 it('rejects stale throws if the selected hand or target number changed',()=>{
  let s=competingQueens();const targetId=s.discard.at(-1)!.id,handRevision=s.players[1].handRevision;
  s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=action(s,{type:'blindSwap',...pair01},'p0');
  expect(()=>action(s,{type:'burn',index:0,match:'discard',targetId,handRevision},'p1')).toThrow('hand has changed');
  const changed=competingQueens();const old=changed.discard.at(-1)!.id;const ix=changed.deck.findIndex(c=>c.rank===3);changed.discard.push(...changed.deck.splice(ix,1));expect(()=>action(changed,{type:'burn',index:0,match:'discard',targetId:old,handRevision:changed.players[1].handRevision},'p1')).toThrow('matching card has changed');
 });
 it('rejects a plan made against hands that have since changed',()=>{
  let s=competingQueens();s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');const revisions=Object.fromEntries(s.players.map(p=>[p.id,p.handRevision]));s=action(s,{type:'burn',index:0,match:'discard'},'p1');expect(()=>action(s,{type:'blindSwapBatch',pairs:[pair01],revisions},'p0')).toThrow('hand changed');
 });
 it('publishes only public slot and back information for animation',()=>{
  let s=action(drawRank(matchingHand(12,3,3),12),{type:'burn',indices:[0,1,2],match:'drawn'});s=action(s,{type:'blindSwapBatch',pairs:[pair01,pair12,pair01]});const event=viewFor(s,'p2').swapEvent!;
  expect(event.version).toBe(s.version);expect(event.actorId).toBe('p0');expect(Object.keys(event.pairs[0]).sort()).toEqual(['firstBack','firstIndex','firstPlayerId','secondBack','secondIndex','secondPlayerId'].sort());expect(JSON.stringify(event)).not.toContain('rank');expect(JSON.stringify(event)).not.toContain('suit');expect(viewFor(s,'p2').players.flatMap(p=>p.hand).every(c=>c===null)).toBe(true);
 });
 it('recovers queued owners and remaining counts without losing the original turn',()=>{
  let s=competingQueens();s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=action(s,{type:'burn',index:0,match:'discard'},'p1');const restored=JSON.parse(JSON.stringify(s));expect(action(restored,{type:'blindSwapBatch',pairs:[pair01,pair12,pair01]},'p0')).toEqual(action(s,{type:'blindSwapBatch',pairs:[pair01,pair12,pair01]},'p0'));
 });
 it('expiring one owner hands control to the next queued owner',()=>{
  let s=competingQueens();s=action(s,{type:'burn',indices:[0,1,2],match:'discard'},'p0');s=action(s,{type:'burn',index:0,match:'discard'},'p1');s=expireTurn(s,s.deadline!);expect(s.handPower?.ownerId).toBe('p1');expect(s.handPower?.remaining).toBe(1);expect(s.phase).toBe('power');s=expireTurn(s,s.deadline!);expect(s.handPower).toBeNull();expect(s.phase).toBe('playing');expect(s.turn).toBe(0);conservation(s);
 });
});

describe('Jack peeks are private and never block the table',()=>{
 it('keeps an out-of-turn thrower’s peek exclusive to them, usable immediately',()=>{
  let s=matchingHand(11,1,3);const ix=s.deck.findIndex(c=>c.rank===11);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];s.turn=1;
  s=action(s,{type:'burn',index:0,match:'discard'},'p0');expect(s.peeks.p0).toBe(1);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);
  for(const other of ['p1','p2'])expect(()=>action(s,{type:'powerPeek',playerId:'p0',index:0},other)).toThrow('own card');
  const after=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');expect(viewFor(after,'p0').players[0].hand[0]).not.toBeNull();for(const other of ['p1','p2']){expect(viewFor(after,other).reveals).toEqual([]);expect(viewFor(after,other).players[0].hand.every(c=>c===null)).toBe(true);}
 });
 it('lets two players hold and use independent Jack peeks at the same time, in any order',()=>{
  let s=matchingHand(11,2,3);const ix=s.deck.findIndex(c=>c.rank===11);[s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];
  s=action(drawRank(s,11),{type:'burn',indices:[0,1],match:'drawn'},'p0');s=action(s,{type:'burn',index:0,match:'discard'},'p1');
  expect(s.peeks.p0).toBe(2);expect(s.peeks.p1).toBe(1);expect(s.phase).toBe('playing');
  // p1 can use their peek before p0 touches theirs — independent owners never wait on each other.
  s=action(s,{type:'powerPeek',playerId:'p1',index:0},'p1');expect(s.peeks.p1).toBeUndefined();
  s=action(s,{type:'powerPeek',playerId:'p0',index:0},'p0');expect(s.peeks.p0).toBe(1);
  expect(viewFor(s,'p0').players[1].hand[0]).toBeNull();expect(viewFor(s,'p1').players[1].hand[0]).not.toBeNull();
 });
});

describe('keep a draw and exchange multiple matching hand cards',()=>{
 it('keeps the drawn card and discards three matching hand cards in one action',()=>{
  const s=drawRank(matchingHand(9,3),5);const held=s.drawn!.card;const outgoing=s.players[0].hand.slice(0,3);const version=s.version;
  const after=action(s,{type:'swap',indices:[0,1,2],handRevision:s.players[0].handRevision});
  expect(after.players[0].hand).toHaveLength(2);expect(after.players[0].hand[0]).toEqual(held);expect(after.discard.slice(-3)).toEqual(outgoing);expect(after.drawn).toBeNull();expect(after.turn).toBe(1);expect(after.version).toBe(version+1);conservation(after);
 });
 it('can replace all four matching hand cards with one drawn card',()=>{
  const s=drawRank(matchingHand(6,4),2);const held=s.drawn!.card;const after=action(s,{type:'swap',indices:[3,1,0,2]});expect(after.players[0].hand).toEqual([held]);expect(after.discard.slice(-4).every(c=>c.rank===6)).toBe(true);expect(after.phase).toBe('playing');conservation(after);
 });
 it('allows a taken discard to be exchanged for multiple matching hand cards',()=>{
  const s=action(matchingHand(9,3),{type:'draw',source:'discard'});const held=s.drawn!.card;const after=action(s,{type:'swap',indices:[0,1,2]});expect(after.players[0].hand).toHaveLength(2);expect(after.players[0].hand).toContainEqual(held);expect(after.drawn).toBeNull();conservation(after);
 });
 it('does not require the hand group to match the drawn card',()=>{
  const s=drawRank(matchingHand(9,2),4);expect(s.drawn!.card.rank).toBe(4);const after=action(s,{type:'swap',indices:[1,0]});expect(after.players[0].hand).toHaveLength(3);expect(after.players[0].hand).toContainEqual(s.drawn!.card);expect(after.discard.slice(-2).every(c=>c.rank===9)).toBe(true);conservation(after);
 });
 it('rejects mixed ranks, duplicate indices, and stale hands without changing the game',()=>{
  const s=drawRank(matchingHand(9,2),4);const before=JSON.stringify(s);const wrong=s.players[0].hand.findIndex(c=>c.rank!==9);
  for(const indices of [[0,wrong],[0,0],[],[-1],[9]])expect(()=>action(s,{type:'swap',indices})).toThrow();expect(()=>action(s,{type:'swap',indices:[0,1],handRevision:s.players[0].handRevision-1})).toThrow('hand changed');expect(JSON.stringify(s)).toBe(before);
 });
 it('grants all powers for Queens or Jacks discarded in a batch exchange',()=>{
  const queen=drawRank(matchingHand(12,3),5);const afterQueen=action(queen,{type:'swap',indices:[0,1,2]});expect(afterQueen.players[0].hand).toHaveLength(2);expect(afterQueen.players[0].hand).toContainEqual(queen.drawn!.card);expect(afterQueen.handPower).toMatchObject({ownerId:'p0',remaining:3,kind:'blindSwap',resume:'advance'});expect(afterQueen.turn).toBe(0);conservation(afterQueen);
  // A hand Jack never blocks: the swap grants three peeks and the turn moves on immediately.
  const jack=drawRank(matchingHand(11,3),5);const afterJack=action(jack,{type:'swap',indices:[0,1,2]});expect(afterJack.players[0].hand).toHaveLength(2);expect(afterJack.players[0].hand).toContainEqual(jack.drawn!.card);expect(afterJack.handPower).toBeNull();expect(afterJack.peeks.p0).toBe(3);expect(afterJack.phase).toBe('playing');expect(afterJack.turn).toBe(1);conservation(afterJack);
 });
 it('still allows a remaining match to free throw after a single exchange ends the turn',()=>{
  const s=drawRank(matchingHand(9,2),5);const next=action(s,{type:'swap',index:0});expect(next.turn).toBe(1);const after=action(next,{type:'burn',indices:[1],match:'discard'},'p0');expect(after.players[0].hand).toHaveLength(3);expect(after.turn).toBe(1);expect(after.message).toContain('free throw');conservation(after);
 });
 it('automatically gives a same-rank exchange the same removal result as a free throw',()=>{
  const s=drawRank(matchingHand(6,3),6);const kept=action(s,{type:'swap',indices:[0,1,2]});const thrown=action(s,{type:'burn',indices:[0,1,2],match:'drawn'});expect(kept.players[0].hand).toHaveLength(1);expect(thrown.players[0].hand).toHaveLength(1);expect(kept.discard).toContainEqual(s.drawn!.card);expect(thrown.discard).toContainEqual(s.drawn!.card);conservation(kept);conservation(thrown);
 });
});

describe('automatic matching replacements',()=>{
 it('automatically discards both matching cards and passes the turn',()=>{
  const s=drawRank(matchingHand(6,1),6);const held=s.drawn!.card,old=s.players[0].hand[0];const after=action(s,{type:'swap',index:0});
  expect(after.players[0].hand).toHaveLength(3);expect(after.discard.slice(-2)).toEqual([held,old]);expect(after.players[0].hand).not.toContainEqual(held);expect(after.drawn).toBeNull();expect(after.turn).toBe(1);expect(after.message).toContain('Automatic match');expect(after.version).toBe(s.version+1);conservation(after);
 });
 it('discards the entire selected matching group plus the draw automatically',()=>{
  const s=drawRank(matchingHand(4,3),4);const after=action(s,{type:'swap',indices:[2,0,1]});expect(after.players[0].hand).toHaveLength(1);expect(after.discard.slice(-4).every(c=>c.rank===4)).toBe(true);expect(after.turn).toBe(1);conservation(after);
 });
 it('works when taking a matching top discard as well as drawing from the deck',()=>{
  const s=matchingHand(6,1);const ix=s.deck.findIndex(c=>c.rank===6);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];const drawn=action(s,{type:'draw',source:'discard'});const after=action(drawn,{type:'swap',index:0});expect(after.players[0].hand).toHaveLength(3);expect(after.discard.slice(-2).every(c=>c.rank===6)).toBe(true);expect(after.turn).toBe(1);conservation(after);
 });
 it('scores immediately when the last hand card matches the draw',()=>{
  const s=matchingHand(4,1);s.deck.push(...s.players[0].hand.splice(1));const after=action(drawRank(s,4),{type:'swap',index:0});expect(after.players[0].hand).toEqual([]);expect(after.phase).toBe('results');expect(after.history[0].base.p0).toBe(0);conservation(after);
 });
 it('counts only hand Jacks or Queens for automatically earned powers',()=>{
  let queen=drawRank(matchingHand(12,2),12);queen=action(queen,{type:'swap',indices:[0,1]});expect(queen.players[0].hand).toHaveLength(2);expect(queen.discard.slice(-3).every(c=>c.rank===12)).toBe(true);expect(queen.handPower).toMatchObject({remaining:2,ownerId:'p0',resume:'advance',kind:'blindSwap'});queen=action(queen,{type:'skipPower'});queen=action(queen,{type:'skipPower'});expect(queen.turn).toBe(1);conservation(queen);
  // A hand Jack grants its peeks and lets the turn move on right away — nothing left to skip.
  let jack=drawRank(matchingHand(11,2),11);jack=action(jack,{type:'swap',indices:[0,1]});expect(jack.players[0].hand).toHaveLength(2);expect(jack.discard.slice(-3).every(c=>c.rank===11)).toBe(true);expect(jack.handPower).toBeNull();expect(jack.peeks.p0).toBe(2);expect(jack.phase).toBe('playing');expect(jack.turn).toBe(1);conservation(jack);
 });
 it('still replaces normally when the drawn rank differs',()=>{
  const s=drawRank(matchingHand(6,1),5);const after=action(s,{type:'swap',index:0});expect(after.players[0].hand).toHaveLength(4);expect(after.players[0].hand[0]).toEqual(s.drawn!.card);expect(after.discard.at(-1)!.rank).toBe(6);expect(after.turn).toBe(1);conservation(after);
 });
 it('compares rank even when suits or king point values differ',()=>{
  const s=matchingHand(13,1);const ix=s.deck.findIndex(c=>c.rank===13&&value(c)!==value(s.players[0].hand[0]));[s.deck[ix],s.deck[s.deck.length-1]]=[s.deck[s.deck.length-1],s.deck[ix]];const drawn=action(s,{type:'draw',source:'deck'});expect(value(drawn.drawn!.card)).not.toBe(value(s.players[0].hand[0]));const after=action(drawn,{type:'swap',index:0});expect(after.players[0].hand).toHaveLength(3);expect(after.discard.slice(-2).every(c=>c.rank===13)).toBe(true);conservation(after);
 });
 it('finishes the last Dutch turn after an automatic match',()=>{
  const s=playing();const ix=s.deck.findIndex(c=>c.rank===6);[s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];let called=dutch(s);called=drawRank(called,6);const after=action(called,{type:'swap',index:0});expect(after.phase).toBe('results');expect(after.players[1].hand).toHaveLength(3);expect(after.history[0].caller).toBe('p0');conservation(after);
 });
});

describe('free throws immediately after exchanging a card',()=>{
 it('allows both remembered 7s after taking a 9 and exposing an unseen 7',()=>{
  let s=matchingHand(7,3);const ix=s.deck.findIndex(c=>c.rank===9);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];
  s=action(s,{type:'draw',source:'discard'});s=action(s,{type:'swap',index:0});expect(s.turn).toBe(1);expect(s.discard.at(-1)!.rank).toBe(7);
  const deadline=s.deadline;s=action(s,{type:'burn',indices:[1,2],match:'discard'},'p0');expect(s.players[0].hand).toHaveLength(2);expect(s.turn).toBe(1);expect(s.deadline).toBe(deadline);expect(s.discard.slice(-3).every(c=>c.rank===7)).toBe(true);conservation(s);
 });
 it('allows the same reaction while the next player holds a new draw',()=>{
  let s=drawRank(matchingHand(7,3),9);s=action(s,{type:'swap',index:0});s=drawRank(s,5);const held=s.drawn;
  s=action(s,{type:'burn',indices:[1,2],match:'discard'},'p0');expect(s.players[0].hand).toHaveLength(2);expect(s.drawn).toEqual(held);expect(s.turn).toBe(1);conservation(s);
 });
 it('does not reject old rooms that persisted an own-turn-only flag',()=>{
  let s=drawRank(matchingHand(7,3),9);s=action(s,{type:'swap',index:0});s.rules.burnAnytime=false;
  s=action(s,{type:'burn',indices:[1,2],match:'discard'},'p0');expect(s.players[0].hand).toHaveLength(2);expect(s.rules.burnAnytime).toBe(true);expect(s.turn).toBe(1);conservation(s);
 });
 it('normalizes house rules to allow free throws on every turn',()=>{
  expect(validateRules({burnAnytime:false}).burnAnytime).toBe(true);
 });
});

describe('Dutch after completing a turn',()=>{
 it('opens the window after a replacement and keeps the next opponent’s turn when called',()=>{
  let s=action(drawRank(matchingHand(7,1,3),9),{type:'swap',index:0});expect(s.turn).toBe(1);expect(s.dutchWindowFor).toBe('p0');expect(canCallDutch(viewFor(s,'p0'),'p0')).toBe(true);const deadline=s.deadline;
  s=dutch(s,'p0');expect(s.turn).toBe(1);expect(s.deadline).toBe(deadline);expect(s.caller).toBe('p0');expect(s.finalTurns).toBe(2);
  for(const actor of ['p1','p2']){s=action(s,{type:'draw',source:'deck'},actor);s=action(s,{type:'discard'},actor);}expect(s.phase).toBe('results');expect(s.history[0].caller).toBe('p0');conservation(s);
 });
 it('also allows Dutch after directly discarding a drawn card',()=>{
  const s=action(withDrawRank(5),{type:'discard'});expect(s.turn).toBe(1);expect(canCallDutch(s,'p0')).toBe(true);const after=dutch(s,'p0');expect(after.turn).toBe(1);expect(after.finalTurns).toBe(1);
 });
 it('closes immediately once the next player draws from either pile',()=>{
  for(const source of ['deck','discard'] as const){let s=action(withDrawRank(5),{type:'discard'});s=action(s,{type:'draw',source});expect(s.dutchWindowFor).toBeNull();expect(canCallDutch(s,'p0')).toBe(false);expect(()=>action(s,{type:'call'},'p0')).toThrow('window is closed');}
 });
 it('does not allow an unrelated player to use the previous player’s window',()=>{
  const s=action(drawRank(playing(3),5),{type:'discard'});expect(canCallDutch(s,'p2')).toBe(false);expect(()=>action(s,{type:'call'},'p2')).toThrow('just after your turn');expect(canCallDutch(s,'p1')).toBe(true);
 });
 it('opens the window after earned hand powers finish, not while they are pending',()=>{
  let s=handPower();expect(canCallDutch(s,'p0')).toBe(false);s=action(s,{type:'skipPower'});expect(s.turn).toBe(1);expect(canCallDutch(s,'p0')).toBe(true);s=dutch(s,'p0');expect(s.caller).toBe('p0');
 });
 it('preserves the call window across a private snapshot restore',()=>{
  const s=action(withDrawRank(5),{type:'discard'});const restored=JSON.parse(JSON.stringify(s));expect(action(restored,{type:'call'},'p0')).toEqual(action(s,{type:'call'},'p0'));
 });
});

describe('joker-aware card values',()=>{
 it('scores three joker Kings and an Ace as one point',()=>{
  const cards=deck();const kings=cards.filter(c=>c.rank===13).slice(0,3);const ace=cards.find(c=>c.rank===1)!;expect([...kings,ace].reduce((sum,c)=>sum+value(c,13),0)).toBe(1);
 });
 it('scores two joker sevens, a three and a five as eight points',()=>{
  const cards=deck();const sevens=cards.filter(c=>c.rank===7).slice(0,2);const three=cards.find(c=>c.rank===3)!,five=cards.find(c=>c.rank===5)!;expect([...sevens,three,five].reduce((sum,c)=>sum+value(c,7),0)).toBe(8);
 });
 it('treats both back designs and all suits of the joker rank as zero',()=>{
  for(const rank of [13,12,11,7,1])expect(deck().filter(c=>c.rank===rank).every(c=>value(c,rank)===0)).toBe(true);
 });
});

function setHandRanks(s:Game,playerId:string,ranks:number[]){const p=s.players.find(p=>p.id===playerId)!;s.deck.push(...p.hand);p.hand=[];for(const rank of ranks){const ix=s.deck.findIndex(c=>c.rank===rank);p.hand.push(...s.deck.splice(ix,1));}return s;}
function scoreByTimer(s:Game){s.rules.maxTurns=1;return expireTurn(s,s.deadline!);}
describe('descending rounds and authoritative joker scoring',()=>{
 it('maps exactly thirteen round ordinals to K, Q, J, 10 through A',()=>{
  expect(Array.from({length:13},(_,i)=>jokerRankForRound(i+1))).toEqual([13,12,11,10,9,8,7,6,5,4,3,2,1]);expect(Array.from({length:13},(_,i)=>roundLabelFor(i+1))).toEqual([13,12,11,10,9,8,7,6,5,4,3,2,1]);for(const n of [0,14,-1,1.5])expect(jokerRankForRound(n)).toBeNull();
 });
 it('scores three Kings and an Ace as one in the first round and persists the joker',()=>{
  const s=setHandRanks(playing(),'p0',[13,13,13,1]);const after=scoreByTimer(s);expect(after.history[0].base.p0).toBe(1);expect(after.history[0].jokerRank).toBe(13);expect(viewFor(after,'p1').roundLabel).toBe(13);expect(viewFor(after,'p1').jokerRank).toBe(13);conservation(after);
 });
 it('scores two sevens, a three and a five as eight in the seventh played round',()=>{
  const s=setHandRanks(playing(),'p0',[7,7,3,5]);s.round=7;const after=scoreByTimer(s);expect(after.history[0].base.p0).toBe(8);expect(after.history[0].jokerRank).toBe(7);expect(viewFor(after,'p0').roundLabel).toBe(7);conservation(after);
 });
 it('uses joker totals when deciding whether a Dutch call succeeds',()=>{
  let s=setHandRanks(playing(),'p0',[13,13,13,1]);s=setHandRanks(s,'p1',[2,2,2,2]);s=dutch(s);s=expireTurn(s,s.deadline!);expect(s.history[0].base.p0).toBe(1);expect(s.history[0].base.p1).toBe(8);expect(s.history[0].penalty.p0).toBe(0);expect(s.history[0].winners).toContain('p0');conservation(s);
 });
 it('changes the joker each deal while leaving earlier scores and joker metadata intact',()=>{
  let s=scoreByTimer(setHandRanks(playing(),'p0',[13,13,13,1]));const previous=structuredClone(s.history[0]);s=applyAction(s,'p0',{type:'nextRound'},999999,deck());expect(viewFor(s,'p0').roundLabel).toBe(12);expect(viewFor(s,'p0').jokerRank).toBe(12);expect(s.history[0]).toEqual(previous);expect(s.history[0].base.p0).toBe(1);conservation(s);
 });
 it('scores every joker rank as zero over a complete thirteen-round match',()=>{
  let s=playing();for(let n=1;n<=13;n++){const joker=14-n;setHandRanks(s,'p0',[joker,joker,joker,joker]);s=scoreByTimer(s);expect(s.history.at(-1)!.jokerRank).toBe(joker);expect(s.history.at(-1)!.base.p0).toBe(0);expect(viewFor(s,'p0').roundLabel).toBe(joker);conservation(s);if(n<13){s=applyAction(s,'p0',{type:'nextRound'},1000000*n,deck());s=applyAction(s,s.moderator!,{type:'peekCount',count:2},1000000*n);for(const p of s.players)s=action(s,{type:'finishPeek'},p.id);}}expect(s.phase).toBe('finished');expect(s.history).toHaveLength(13);
 });
 it('retains default rank matching even when cards share the joker’s zero point value',()=>{
  const s=playing();s.round=7;setHandRanks(s,'p0',[13,5,4,3]);const redKing=s.players[0].hand.findIndex(c=>c.rank===13);if(value(s.players[0].hand[redKing])!==0){const red=s.deck.findIndex(c=>c.rank===13&&value(c)===0);[s.players[0].hand[redKing],s.deck[red]]=[s.deck[red],s.players[0].hand[redKing]];}expect(value(s.players[0].hand[redKing],7)).toBe(0);const ix=s.deck.findIndex(c=>c.rank===7);[s.discard[0],s.deck[ix]]=[s.deck[ix],s.discard[0]];const after=action(s,{type:'burn',index:redKing,match:'discard'});expect(after.players[0].hand).toHaveLength(5);expect(after.message).toContain('Wrong');conservation(after);
 });
 it('supports joker point-value matching without granting powers for non-face-card discards',()=>{
  const s=playing(2,{burning:'value'});s.round=2;setHandRanks(s,'p0',[12,13,5,4]);let red=s.deck.findIndex(c=>c.rank===13&&value(c)===0);if(value(s.players[0].hand[1])!==0)[s.players[0].hand[1],s.deck[red]]=[s.deck[red],s.players[0].hand[1]];red=s.deck.findIndex(c=>c.rank===13&&value(c)===0);[s.discard[0],s.deck[red]]=[s.deck[red],s.discard[0]];
  const after=action(s,{type:'burn',indices:[1,0],match:'discard'});expect(after.players[0].hand).toHaveLength(2);expect(after.handPower).toMatchObject({kind:'blindSwap',remaining:1});conservation(after);
 });
});

describe('moderator',()=>{
 const begin=(n=4)=>applyAction(setup(n),'p0',{type:'start'},0,deck());
 it('starts with the host moderating and the next seat clockwise playing first',()=>{const s=begin();expect(s.phase).toBe('choosing');expect(s.moderator).toBe('p0');expect(s.turn).toBe(1);});
 it('only lets the moderator choose 0, 1 or 2 cards',()=>{const s=begin();expect(()=>applyAction(s,'p1',{type:'peekCount',count:1},1)).toThrow();expect(()=>applyAction(s,'p0',{type:'peekCount',count:3},1)).toThrow();expect(applyAction(s,'p0',{type:'peekCount',count:1},1).peekCount).toBe(1);});
 it('limits each player to the chosen number of peeks',()=>{let s=applyAction(begin(),'p0',{type:'peekCount',count:1},1);s=applyAction(s,'p2',{type:'initialPeek',index:0},2);expect(()=>applyAction(s,'p2',{type:'initialPeek',index:1},3)).toThrow();});
 it('skips peeking entirely when the moderator chooses 0',()=>{const s=applyAction(begin(),'p0',{type:'peekCount',count:0},1);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);expect(s.players.every(p=>p.peekDone)).toBe(true);});
 it('falls back to 2 cards when the moderator does not choose in time',()=>{const s=expireTurn(begin(),CHOOSE_SECONDS*1000);expect(s.phase).toBe('peeking');expect(s.peekCount).toBe(2);});
 it('passes the moderator one seat clockwise each round',()=>{let s=begin(3);const seen:string[]=[];for(let n=0;n<4;n++){seen.push(s.moderator!);expect(s.turn).toBe((s.players.findIndex(p=>p.id===s.moderator)+1)%3);s=applyAction(s,s.moderator!,{type:'peekCount',count:0},1);s=dutch(s,s.players[s.turn].id,2);while(s.phase==='playing'){const id=s.players[s.turn].id;s=applyAction(s,id,{type:'draw',source:'deck'},3);s=applyAction(s,id,{type:'discard'},3);}s=applyAction(s,'p0',{type:'nextRound'},4,deck());}expect(seen).toEqual(['p0','p1','p2','p0']);});
});

describe('automatic Dutch from an empty hand',()=>{
 it('ends the lap with the moderator after an off-turn empty hand, skipping empty seats and closing Dutch',()=>{
  // Four players; p3 moderates, so p0 opens. p1 throws their last card during p0's turn.
  let s=playing(4);s=action(s,{type:'draw',source:'deck'},'p0');s.deck.push(...s.players[1].hand.splice(1));const ix=s.deck.findIndex(c=>c.rank===s.discard.at(-1)!.rank);[s.players[1].hand[0],s.deck[ix]]=[s.deck[ix],s.players[1].hand[0]];
  s=action(s,{type:'burn',index:0,match:'discard'},'p1');expect(s.autoDutch).toBe('p1');expect(s.phase).toBe('playing');
  s=action(s,{type:'discard'},'p0');expect(s.players[s.turn].id).toBe('p2');expect(canCallDutch(s,'p2')).toBe(false);expect(()=>action(s,{type:'call'},'p2')).toThrow();
  s=action(s,{type:'draw',source:'deck'},'p2');s=action(s,{type:'discard'},'p2');expect(s.players[s.turn].id).toBe('p3');expect(s.phase).toBe('playing');
  s=action(s,{type:'draw',source:'deck'},'p3');s=action(s,{type:'discard'},'p3');expect(s.phase).toBe('results');expect(s.history[0].autoDutch).toBe('p1');expect(s.history[0].base.p1).toBe(0);conservation(s);
 });
});

describe('free-throw reaction window',()=>{
 it('opens a window naming the discarded rank when a normal swap puts a new card on the pile',()=>{
  let s=playing(2);s=setHandRanks(s,'p0',[9,1,2,3]);
  s=drawRank(s,5);
  s=action(s,{type:'swap',index:0},'p0');
  expect(s.reactionWindow).toMatchObject({rank:9,value:9});
  expect(s.reactionWindow!.deadline).toBeGreaterThanOrEqual(100+REACTION_WINDOW_MS);
  expect(s.discard.at(-1)!.rank).toBe(9);conservation(s);
 });
 it('lets a second player match the same window after a first reaction already changed the physical top, without resetting its deadline',()=>{
  let s=playing(3);
  s=setHandRanks(s,'p0',[9,1,2,3]);s=setHandRanks(s,'p1',[9,4,5,6]);s=setHandRanks(s,'p2',[9,7,8,10]);
  s=drawRank(s,5);s=action(s,{type:'swap',index:0},'p0');
  const deadline=s.reactionWindow!.deadline;
  s=applyAction(s,'p1',{type:'burn',index:0,match:'discard'},deadline-4000);
  expect(s.players[1].hand).toHaveLength(3);
  expect(s.discard.at(-1)!.rank).toBe(9);
  // The window is unchanged by p1's reaction — same rank, same deadline.
  expect(s.reactionWindow).toMatchObject({rank:9,deadline});
  s=applyAction(s,'p2',{type:'burn',index:0,match:'discard'},deadline-2000);
  expect(s.players[2].hand).toHaveLength(3);
  expect(s.reactionWindow).toMatchObject({rank:9,deadline});
  conservation(s);
 });
 it('replaces the window once a genuinely different rank is discarded, closing the door on the old one',()=>{
  let s=playing(3);
  s=setHandRanks(s,'p0',[9,9,1,2]);s=setHandRanks(s,'p1',[9,3,4,5]);s=setHandRanks(s,'p2',[6,7,8,10]);
  s=drawRank(s,5);s=action(s,{type:'swap',index:0},'p0');
  expect(s.reactionWindow).toMatchObject({rank:9});
  expect(s.players[0].hand.map(c=>c.rank)).toContain(9); // p0 kept their second 9
  // p1's own turn: they discard an unrelated rank (3), which should take over the window.
  s=drawRank(s,8);s=action(s,{type:'swap',index:1},'p1');
  expect(s.reactionWindow).toMatchObject({rank:3});
  expect(s.discard.at(-1)!.rank).toBe(3);
  // p0's leftover 9 (now at index 1, since their own earlier swap put the drawn 5 at index 0)
  // no longer matches anything live — it's a wrong free throw now.
  const before=s.players[0].hand.length;
  s=applyAction(s,'p0',{type:'burn',index:1,match:'discard'},300);
  expect(s.message).toContain('Wrong free throw');
  expect(s.players[0].hand.length).toBeGreaterThanOrEqual(before); // no card removed; a penalty card may have been added
  conservation(s);
 });
 it('clears an expired window on its own schedule, independent of the turn clock',()=>{
  let s=playing(2);s=setHandRanks(s,'p0',[9,1,2,3]);
  s=drawRank(s,5);s=action(s,{type:'swap',index:0},'p0');
  const deadline=s.reactionWindow!.deadline;
  expect(s.deadline).toBeGreaterThan(deadline); // the turn clock outlives the much shorter reaction window
  const expired=expireTurn(s,deadline+1);
  expect(expired.reactionWindow).toBeNull();
  expect(expired.phase).toBe('playing'); // the turn itself was untouched
  conservation(expired);
 });
 it('is published in the public game view',()=>{
  let s=playing(2);s=setHandRanks(s,'p0',[9,1,2,3]);
  s=drawRank(s,5);s=action(s,{type:'swap',index:0},'p0');
  expect(viewFor(s,'p0').reactionWindow).toMatchObject({rank:9});
  expect(viewFor(s,'p1').reactionWindow).toMatchObject({rank:9});
 });
});
