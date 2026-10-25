import {describe,it,expect} from 'vitest';
import {addPlayer,applyAction,deck,newGame,viewFor} from '../../../packages/engine/src/index';
import {restoreSnapshot,SNAPSHOT_SCHEMA} from './snapshot';
function dealt(){let game=newGame('a');for(const id of ['a','b']){game=addPlayer(game,id,id,0);game=applyAction(game,id,{type:'ready',ready:true},0);}game=applyAction(game,'a',{type:'start'},1,deck());game.moderator='b';game.turn=0;return applyAction(game,'b',{type:'peekCount',count:2},1);}
describe('room snapshot migrations',()=>{
  it('restores schema 7 without changing card identities or public backs',()=>{
    const game=dealt();const restored=restoreSnapshot({schema:SNAPSHOT_SCHEMA,game});
    expect(restored).toEqual(game);expect(viewFor(restored,'a')).toEqual(viewFor(game,'a'));
  });
  it('adds missing back metadata to legacy cards without redealing a live round',()=>{
    const game=dealt();const legacy=JSON.parse(JSON.stringify({schema:1,game}),(_key,v)=>{if(v&&typeof v==='object'&&'rank' in v&&'suit' in v)delete v.back;return v;});
    const before=JSON.stringify(legacy);const restored=restoreSnapshot(legacy);
    expect(restored.players.flatMap(p=>p.hand).every(c=>c.back==='red')).toBe(true);
    expect(restored.deck.map(c=>c.id)).toEqual(game.deck.map(c=>c.id));
    expect(restored.phase).toBe(game.phase);expect(restored.version).toBe(game.version);
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('finishes a legacy 52-card round and uses 104 cards for the next deal',()=>{
    const old=dealt();old.deck=old.deck.filter(c=>c.back==='black');
    const legacy=JSON.parse(JSON.stringify({schema:1,game:old}),(_key,v)=>{if(v&&typeof v==='object'&&'rank' in v&&'suit' in v){delete v.back;v.id=v.id.replace(/^black-/, '');}return v;});
    let game=restoreSnapshot(legacy);expect(game.deck.length+game.discard.length+game.players.flatMap(p=>p.hand).length).toBe(52);
    for(const p of game.players)game=applyAction(game,p.id,{type:'finishPeek'},10);
    game=applyAction(game,'a',{type:'call'},20);game=applyAction(game,'b',{type:'draw',source:'deck'},30);game=applyAction(game,'b',{type:'discard'},40);
    expect(game.phase).toBe('results');game=applyAction(game,'a',{type:'nextRound'},50,deck());
    expect(game.deck.length+game.discard.length+game.players.flatMap(p=>p.hand).length).toBe(104);
    expect(game.deck.filter(c=>c.back==='red')).toHaveLength(52);
  });
  it('migrates schema 2 without an earned Queen queue',()=>{const game=dealt();const old=JSON.parse(JSON.stringify({schema:2,game}));delete old.game.handPower;const restored=restoreSnapshot(old);expect(restored.handPower).toBeNull();expect(restored.players).toEqual(game.players);});
  it('rejects unknown schema versions',()=>{expect(()=>restoreSnapshot({schema:99,game:dealt()})).toThrow('Unsupported');});
});

it('migrates a schema 3 Queen queue into a typed hand power',()=>{
 const game=dealt();const old=JSON.parse(JSON.stringify({schema:3,game}));delete old.game.handPower;old.game.queenPower={ownerId:'a',remaining:3,resume:'continue',remainingTurnMs:12000};old.game.phase='power';old.game.power='blindSwap';
 const restored=restoreSnapshot(old);expect(restored.handPower).toEqual({...old.game.queenPower,kind:'blindSwap'});expect('queenPower' in restored).toBe(false);expect(restored.players).toEqual(game.players);
});

it('adds queue, revisions, and animation defaults to schema 4 rooms',()=>{const old=JSON.parse(JSON.stringify({schema:4,game:dealt()}));delete old.game.handPowerQueue;delete old.game.swapEvent;old.game.players.forEach((p:{handRevision?:number})=>{delete p.handRevision;});const restored=restoreSnapshot(old);expect(restored.handPowerQueue).toEqual([]);expect(restored.swapEvent).toBeNull();expect(restored.players.every(p=>p.handRevision===0)).toBe(true);});
it('preserves competing queued owners through schema 5 recovery',()=>{const game=dealt();game.phase='power';game.power='blindSwap';game.handPower={kind:'blindSwap',ownerId:'a',remaining:3,resume:'advance',remainingTurnMs:15000};game.handPowerQueue=[{kind:'blindSwap',ownerId:'b',remaining:2,resume:'continue',remainingTurnMs:0}];const restored=restoreSnapshot(JSON.parse(JSON.stringify({schema:SNAPSHOT_SCHEMA,game})));expect(restored).toEqual(game);expect(restored.handPowerQueue[0].remaining).toBe(2);});
it('upgrades legacy own-turn-only matching windows for existing rooms',()=>{const game=dealt();game.rules.burnAnytime=false;const restored=restoreSnapshot({schema:SNAPSHOT_SCHEMA,game});expect(restored.rules.burnAnytime).toBe(true);expect(restored.players).toEqual(game.players);expect(restored.turn).toBe(game.turn);});
it('preserves historical scores without retroactively applying a new joker',()=>{const game=dealt();const old=JSON.parse(JSON.stringify({schema:6,game}));old.game.history=[{round:1,caller:null,base:{a:30,b:20},scores:{a:30,b:20},penalty:{a:0,b:0},hands:{a:[],b:[]},winners:['b']}];const restored=restoreSnapshot(old);expect(restored.history[0].jokerRank).toBeNull();expect(restored.history[0].scores).toEqual({a:30,b:20});});
