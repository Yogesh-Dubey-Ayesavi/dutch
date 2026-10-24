import {useEffect,useState} from 'react';

/** Revalidate static HTML on tab focus; never reload an active player's turn automatically. */
export function useClientUpdate(){
 const [available,setAvailable]=useState(false);
 useEffect(()=>{
  const running=document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  if(!running)return;
  let stopped=false,checking=false,lastCheck=0;
  const check=async()=>{
   if(document.visibilityState!=='visible'||checking||Date.now()-lastCheck<15000)return;
   checking=true;lastCheck=Date.now();
   try{const response=await fetch(`/?_controls_check=${lastCheck}`,{cache:'no-store'});if(!response.ok)return;const html=await response.text();const latest=html.match(/<script\b[^>]*\bsrc="([^"]*\/assets\/[^"<>]+\.js)"/i)?.[1];if(!stopped&&latest&&latest!==running)setAvailable(true);}catch{/* Reconnection UI handles network interruptions. */}finally{checking=false;}
  };
  void check();window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{stopped=true;window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[]);
 return available;
}
