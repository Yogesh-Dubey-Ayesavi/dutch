import {describe,expect,it} from 'vitest';
import {planGesture,type GestureContext} from './controls';
const ready:GestureContext={canDraw:true,hasDiscard:true,canSwap:false,canDiscard:false,canBurn:false,handSize:4};
describe('table gestures',()=>{
  it.each(['deck','discard'])('draws %s directly into the intended hand slot',source=>{
    expect(planGesture(source,'hand-2',0,ready)).toEqual({type:'draw',source,swapIndex:2});
  });
  it('allows a downward swipe to draw without a drop target',()=>{
    expect(planGesture('deck',null,80,ready)).toEqual({type:'draw',source:'deck'});
    expect(planGesture('deck',null,9,ready)).toBeNull();
  });
  it('does not draw out of turn or from an empty discard pile',()=>{
    expect(planGesture('deck','hand-1',80,{...ready,canDraw:false})).toBeNull();
    expect(planGesture('discard','hand-1',80,{...ready,hasDiscard:false})).toBeNull();
  });
  it('replaces a selected hand card after drawing',()=>{
    const context={...ready,canDraw:false,canSwap:true,canDiscard:true};
    expect(planGesture('drawn','hand-3',0,context)).toEqual({type:'swap',index:3});
    expect(planGesture('hand-1','discard',0,context)).toEqual({type:'swap',index:1});
    expect(planGesture('hand-0',null,-100,context)).toEqual({type:'swap',index:0});
  });
  it('requires a deck draw to discard the held card',()=>{
    expect(planGesture('drawn','discard',0,{...ready,canDiscard:true})).toEqual({type:'discard'});
    expect(planGesture('drawn',null,-100,{...ready,canDiscard:true})).toEqual({type:'discard'});
    expect(planGesture('drawn','discard',-100,{...ready,canSwap:true})).toBeNull();
  });
  it('only free throws when permitted by table rules',()=>{
    expect(planGesture('hand-2','discard',0,ready)).toEqual({type:'hint'});
    expect(planGesture('hand-2','discard',0,{...ready,canBurn:true})).toEqual({type:'burn',index:2,match:'discard'});
  });
  it('ignores invalid or non-card drop targets and cancelled short gestures',()=>{
    expect(planGesture('deck','hand-5',0,ready)).toBeNull();
    expect(planGesture('hand-8','discard',0,ready)).toBeNull();
    expect(planGesture('hand-1',null,5,ready)).toBeNull();
    expect(planGesture('drawn','deck',0,{...ready,canSwap:true})).toBeNull();
  });
});

describe('free-throw gesture intent',()=>{
 it('exchanges a hand card onto discard when holding a draw',()=>{
  expect(planGesture('hand-1','discard',-80,{...ready,canBurn:true,canSwap:true})).toEqual({type:'swap',index:1});
 });
 it('keeps drawn-card-to-hand gestures as swaps while free throwing is available',()=>{
  expect(planGesture('drawn','hand-2',0,{...ready,canBurn:true,canSwap:true})).toEqual({type:'swap',index:2});
 });
});

describe('direct hand-to-pile free throws',()=>{
 it('works out of turn without enabling a selection mode',()=>{
  const opponentTurn={...ready,canDraw:false,canSwap:false,canDiscard:false,canBurn:true};
  expect(planGesture('hand-0','discard',0,opponentTurn)).toEqual({type:'burn',index:0,match:'discard'});
  expect(planGesture('hand-2',null,-90,opponentTurn)).toEqual({type:'burn',index:2,match:'discard'});
 });
 it('matches the actual drop target while holding a deck draw',()=>{
  const holding={...ready,canDraw:false,canSwap:true,canDiscard:true,canBurn:true};
  expect(planGesture('hand-1','discard',0,holding)).toEqual({type:'swap',index:1});
  expect(planGesture('hand-1','drawn',0,holding)).toEqual({type:'burn',index:1,match:'drawn'});
  expect(planGesture('hand-1',null,-90,holding)).toEqual({type:'burn',index:1,match:'drawn'});
 });
 it('does not match an opponent’s hidden draw or an empty discard',()=>{
  expect(planGesture('hand-1','drawn',0,{...ready,canDraw:false,canBurn:true})).toEqual({type:'hint'});
  expect(planGesture('hand-1','discard',0,{...ready,hasDiscard:false,canBurn:true})).toEqual({type:'hint'});
 });
});
