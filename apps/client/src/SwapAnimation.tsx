import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {gsap} from 'gsap';
import type {SwapEvent} from '../../../packages/engine/src/index';

/** Public slot movements only. Ghost cards always show backs, never hidden faces. */
export function SwapAnimation({event,enabled}:{event:SwapEvent|null;enabled:boolean}){
 const last=useRef<number|undefined>(event?.version);const overlay=useRef<HTMLDivElement>(null);
 const [caption,setCaption]=useState('');const rects=useRef(new Map<string,DOMRect>());
 useLayoutEffect(()=>{for(const el of document.querySelectorAll<HTMLElement>('[data-player-slot]'))rects.current.set(el.dataset.playerSlot!,el.getBoundingClientRect());});
 useLayoutEffect(()=>{
  if(!event||event.version===last.current)return;last.current=event.version;
  // Blind swaps are the only change a glow alone cannot explain.
  setCaption(event.pairs.length?`${event.pairs.length} blind swap${event.pairs.length===1?'':'s'}`:'');
  const host=overlay.current;if(!host)return;
  const reduced=!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shadows=new Map<HTMLElement,string>();const filters=new Map<HTMLElement,string>();const nodes:HTMLElement[]=[];const animations:gsap.core.Tween[]=[];
  const slot=(id:string,index:number)=>Array.from(document.querySelectorAll<HTMLElement>('[data-player-slot]')).find(el=>el.dataset.playerSlot===`${id}:${index}`);
  const highlight=(el:HTMLElement,delay=0)=>{
   if(!shadows.has(el)){shadows.set(el,el.style.boxShadow);filters.set(el,el.style.filter);}
   animations.push(gsap.fromTo(el,{boxShadow:'0 0 0 4px #ffd36b, 0 0 24px 7px #ffb52d99',filter:'brightness(1.3) saturate(1.35)'},{boxShadow:shadows.get(el)||'0 0 0 0 transparent',filter:filters.get(el)||'brightness(1)',duration:reduced?.8:3,delay,ease:'power1.out',onComplete:()=>{el.style.boxShadow=shadows.get(el)??'';el.style.filter=filters.get(el)??'';}}));
  };
  event.pairs.forEach((pair,i)=>{
   const first=slot(pair.firstPlayerId,pair.firstIndex),second=slot(pair.secondPlayerId,pair.secondIndex);
   const a=first?.getBoundingClientRect()??rects.current.get(`${pair.firstPlayerId}:${pair.firstIndex}`),b=second?.getBoundingClientRect()??rects.current.get(`${pair.secondPlayerId}:${pair.secondIndex}`);if(!a||!b)return;
   for(const el of [first,second])if(el)highlight(el,reduced?0:i*.06);
   if(reduced)return;
   for(const [from,to,back] of [[a,b,pair.firstBack],[b,a,pair.secondBack]] as const){
    const ghost=document.createElement('div');ghost.className=`swap-ghost ${back==='red'?'red-ghost':'black-ghost'}`;ghost.textContent='D';Object.assign(ghost.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});host.appendChild(ghost);nodes.push(ghost);
    animations.push(gsap.to(ghost,{x:to.left-from.left,y:to.top-from.top,width:to.width,height:to.height,rotation:12,duration:.65,delay:i*.06,ease:'power2.inOut',onComplete:()=>ghost.remove()}));
   }
  });
  for(const changed of event.highlightSlots??[]){const el=slot(changed.playerId,changed.index);if(el)highlight(el);}
  if(event.discardChanged){const discard=document.querySelector<HTMLElement>('[data-card-target="discard"] .playing-card');if(discard)highlight(discard);}
  const timeout=setTimeout(()=>setCaption(''),3000);
  return()=>{clearTimeout(timeout);animations.forEach(a=>a.kill());nodes.forEach(n=>n.remove());shadows.forEach((shadow,el)=>{el.style.boxShadow=shadow;el.style.filter=filters.get(el)??'';});};
 },[event?.version,enabled]);
 return createPortal(<div className="swap-animation-layer" ref={overlay} aria-live="polite">{caption&&<div className="swap-caption">{caption}</div>}</div>,document.body);
}
