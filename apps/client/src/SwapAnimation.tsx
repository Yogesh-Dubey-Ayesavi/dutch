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
  setCaption(`${event.pairs.length} card swap${event.pairs.length===1?'':'s'} applied`);
  const host=overlay.current;if(!host)return;
  const reduced=!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shadows=new Map<HTMLElement,string>();const nodes:HTMLElement[]=[];const animations:gsap.core.Tween[]=[];
  const slot=(id:string,index:number)=>Array.from(document.querySelectorAll<HTMLElement>('[data-player-slot]')).find(el=>el.dataset.playerSlot===`${id}:${index}`);
  event.pairs.forEach((pair,i)=>{
   const first=slot(pair.firstPlayerId,pair.firstIndex),second=slot(pair.secondPlayerId,pair.secondIndex);
   const a=first?.getBoundingClientRect()??rects.current.get(`${pair.firstPlayerId}:${pair.firstIndex}`),b=second?.getBoundingClientRect()??rects.current.get(`${pair.secondPlayerId}:${pair.secondIndex}`);if(!a||!b)return;
   for(const el of [first,second]){if(!el)continue;if(!shadows.has(el))shadows.set(el,el.style.boxShadow);animations.push(gsap.fromTo(el,{boxShadow:'0 0 0 4px #ffda87'},{boxShadow:'0 0 0 0px transparent',duration:reduced?.8:1.6,delay:reduced?0:i*.06,onComplete:()=>{el.style.boxShadow=shadows.get(el)??'';}}));}
   if(reduced)return;
   for(const [from,to,back] of [[a,b,pair.firstBack],[b,a,pair.secondBack]] as const){
    const ghost=document.createElement('div');ghost.className=`swap-ghost ${back==='red'?'red-ghost':'black-ghost'}`;ghost.textContent='D';Object.assign(ghost.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});host.appendChild(ghost);nodes.push(ghost);
    animations.push(gsap.to(ghost,{x:to.left-from.left,y:to.top-from.top,width:to.width,height:to.height,rotation:12,duration:.65,delay:i*.06,ease:'power2.inOut',onComplete:()=>ghost.remove()}));
   }
  });
  const timeout=setTimeout(()=>setCaption(''),2200);
  return()=>{clearTimeout(timeout);animations.forEach(a=>a.kill());nodes.forEach(n=>n.remove());shadows.forEach((shadow,el)=>{el.style.boxShadow=shadow;});};
 },[event?.version,enabled]);
 return createPortal(<div className="swap-animation-layer" ref={overlay} aria-live="polite">{caption&&<div className="swap-caption">{caption}</div>}</div>,document.body);
}
