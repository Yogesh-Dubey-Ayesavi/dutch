import {MATCH_ROUNDS,type Card,type Game,type HandPower} from '../../../packages/engine/src/index';
export const SNAPSHOT_SCHEMA=11;
export interface RoomSnapshot {schema:number;game:Game}

/** Preserve in-flight legacy rounds. Their next deal uses the new 104-card shoe. */
export function restoreSnapshot(snapshot:RoomSnapshot):Game {
  if(![1,2,3,4,5,6,7,8,9,10,SNAPSHOT_SCHEMA].includes(snapshot.schema))throw new Error('Unsupported room snapshot schema.');
  const game=structuredClone(snapshot.game);
  game.history.forEach(r=>r.jokerRank??=null);game.rules.rounds=MATCH_ROUNDS;game.rules.burnAnytime=true;
  const legacy=game as Game & {queenPower?:Omit<NonNullable<Game['handPower']>,'kind'>|null;carryPenalty?:unknown};
  game.handPower??=legacy.queenPower?{...legacy.queenPower,kind:'blindSwap'}:null;
  delete legacy.queenPower;delete legacy.carryPenalty;game.dutchWindowFor??=null;game.handPowerQueue??=[];game.swapEvent??=null;game.players.forEach(p=>p.handRevision??=0);game.moderator??=null;game.peekCount??=2;game.autoDutch??=null;game.pendingCall??=null;game.drawEvent??=null;
  // A hand Jack's peek no longer blocks the table. Fold any grant persisted from before that change into the new non-blocking model.
  game.peeks??={};game.jackReveals??={};
  const foldOwnPeek=(q:HandPower)=>{game.peeks[q.ownerId]=(game.peeks[q.ownerId]??0)+q.remaining;};
  if(game.handPower?.kind==='ownPeek'){
    foldOwnPeek(game.handPower);
    const next=game.handPowerQueue.find(q=>q.kind==='blindSwap');
    if(next){game.handPowerQueue=game.handPowerQueue.filter(q=>q!==next);game.handPower=next;game.power=next.kind;}
    else{game.handPower=null;game.power=null;if(game.phase==='power'){game.phase='playing';game.deadline=Date.now()+game.rules.turnSeconds*1000;}}
  }
  game.handPowerQueue=game.handPowerQueue.filter(q=>{if(q.kind==='ownPeek'){foldOwnPeek(q);return false;}return true;});
  if(snapshot.schema===1){
    const migrate=(card:Card)=>{card.back??='red';};
    game.deck.forEach(migrate);
    game.discard.forEach(migrate);
    game.players.forEach(p=>p.hand.forEach(migrate));
    if(game.drawn)migrate(game.drawn.card);
    Object.values(game.reveals).forEach(reveals=>reveals.forEach(r=>migrate(r.card)));
    game.history.forEach(round=>Object.values(round.hands).forEach(hand=>hand.forEach(migrate)));
  }
  return game;
}
