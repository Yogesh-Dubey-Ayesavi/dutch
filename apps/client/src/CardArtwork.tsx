import {useId} from 'react';
import type {Card,CardBack} from '../../../packages/engine/src/index';

function Suit({suit,...props}:{suit:Card['suit'];x?:number;y?:number;width?:number;height?:number}){
 return <svg viewBox="0 0 24 24" fill="currentColor" {...props}>{suit==='hearts'?<path d="M12 21C9 18 1 12 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-8 11-11 14Z"/>:suit==='diamonds'?<path d="m12 1 10 11-10 11L2 12Z"/>:suit==='spades'?<path d="M12 1C9 5 1 10 1 15a5.5 5.5 0 0 0 9 4c0 2-1 3-3 4h10c-2-1-3-2-3-4a5.5 5.5 0 0 0 9-4C23 10 15 5 12 1Z"/>:<><circle cx="12" cy="6" r="5.2"/><circle cx="6" cy="14" r="5.2"/><circle cx="18" cy="14" r="5.2"/><path d="M10 14c1 5-1 7-4 9h12c-3-2-5-4-4-9Z"/></>}</svg>;
}
const two=[[50,31],[50,113]],four=[[31,31],[69,31],[31,113],[69,113]],six=[...four,[31,72],[69,72]],eightEdges=[25,56,88,119].flatMap(y=>[[31,y],[69,y]]);
const PIPS:Record<number,number[][]>={2:two,3:[...two,[50,72]],4:four,5:[...four,[50,72]],6:six,7:[...six,[50,51]],8:[...six,[50,51],[50,93]],9:[...eightEdges,[50,72]],10:[...eightEdges,[50,41],[50,103]]};

/** Fixed print coordinates keep every pip and index legible at every card size. */
export function CardFace({card}:{card:Card}){
 const rank=({1:'A',11:'J',12:'Q',13:'K'}[card.rank]??String(card.rank));
 const index=<g><text x="12" y="21" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="400" fontSize={card.rank===10?18:22} letterSpacing={card.rank===10?-2:-.8} fill="currentColor">{rank}</text><Suit suit={card.suit} x={6} y={24} width={12} height={13}/></g>;
 return <svg className="card-face-art" viewBox="0 0 100 144" aria-hidden="true">{index}<g transform="translate(100 144) rotate(180)">{index}</g>{card.rank>10?<Royal rank={card.rank} suit={card.suit}/>:card.rank===1?<><Suit suit={card.suit} x={31} y={49} width={38} height={44}/><text x="50" y="104" textAnchor="middle" fill="currentColor" fontFamily="Georgia,serif" fontSize="4.5" letterSpacing="1.5">DUTCH</text></>:PIPS[card.rank]?.map(([x,y],i)=><g key={i} transform={`translate(${x} ${y})${y>72?' rotate(180)':''}`}><Suit suit={card.suit} x={-8} y={-9} width={16} height={18}/></g>)}</svg>;
}

/** Original two-headed French-style court illustrations in traditional print inks. */
function Royal({rank,suit}:{rank:number;suit:Card['suit']}){
 const uid=useId().replace(/:/g,'');const half=`court${uid}`,weave=`weave${uid}`;const queen=rank===12,jack=rank===11;
 const navy='#1d3555',red='#b52b35',gold='#d7af43',paper='#fff7e2',ink='#212a37';
 return <svg x="23" y="12" width="54" height="120" viewBox="0 0 100 156" fill="none">
  <defs><pattern id={weave} width="12" height="12" patternUnits="userSpaceOnUse"><path d="m6 1 5 5-5 5-5-5Z" fill={gold}/><path d="M6 3v6M3 6h6" stroke={navy} strokeWidth=".8"/></pattern>
   <g id={half} stroke={ink} strokeWidth="1.05" strokeLinejoin="round">
    <path d="M2 78V60l16-20 22-4 13 7 14-8 19 9 12 19v15Z" fill={navy}/>
    <path d="M2 78V62l19-16 20 9L29 78Z" fill={red}/><path d="m98 78-4-19-19-14-18 13 10 20Z" fill={red}/>
    <path d="m11 78 13-31 13 8-6 23m32 0-5-23 15-10 17 33" fill={`url(#${weave})`}/>
    <path d="M37 45 49 57 62 44l-2 34H37Z" fill={paper}/><path d="m39 50 11 8 10-10M39 57l10 9 11-9M40 65l10 9 9-9" stroke={gold} strokeWidth="3"/>
    <path d="m43 34-2 11 9 9 10-10-3-12" fill={paper}/>
    {queen?<path d="M32 18c-7 12-8 27-1 35l9-7 2-25m18-1c9 8 14 21 7 32l-8-8Z" fill={gold}/>:<path d="M34 18c-5 8-6 19 0 28l8-4 16 3 8-10-3-17Z" fill={ink}/>}
    <path d={queen?'M39 18c-5 6-4 16-1 20l9 7 10-6 5-9-4-12Z':'M38 17c-3 7-2 17 2 23l11 5 10-11 1-15Z'} fill={paper}/>
    <path d="m40 25 6-1m6 0 6 1M49 26l-2 7 5 1m-7 4 8-1" strokeWidth="1.15"/><path d="M42 27h1m11 0h1" strokeWidth="1.8"/>
    {!queen&&!jack&&<><path d="m42 35 7-2 8 2-7 1Z" fill={ink}/><path d="m41 39 9 5 9-6-3 11-7 5-6-7Z" fill={gold}/><path d="m45 43 4 7m4-9-1 9" stroke={ink} strokeWidth=".8"/></>}
    {jack?<><path d="m31 17 3-10 11-4 18 5 6 11-17-2-8 5Z" fill={red}/><path d="m33 15 30 1 4 5-33 1Z" fill={gold}/><path d="M56 8 69 2l7 5-13 7" fill={navy}/><path d="m62 8 10-2" stroke={paper}/></>:<><path d="m30 8 9 5 3-11 9 10L61 2l1 12 10-7-6 16H35Z" fill={gold}/><path d="M35 19h30m-28-3h26" stroke={red} strokeWidth="2"/><circle cx="50" cy="15" r="2" fill={red}/><circle cx="40" cy="15" r="1.5" fill={navy}/><circle cx="61" cy="15" r="1.5" fill={navy}/></>}
    {queen?<><path d="M20 75 14 39" stroke={navy} strokeWidth="2"/><path d="m15 55 8-8-2 9-5 2" fill={gold}/><path d="m14 44-7-6 9-1" fill={gold}/><g fill={red}><circle cx="14" cy="30" r="4"/><circle cx="9" cy="34" r="4"/><circle cx="19" cy="34" r="4"/><circle cx="11" cy="39" r="4"/><circle cx="18" cy="39" r="4"/></g><circle cx="14" cy="35" r="3" fill={gold}/><path d="m18 65 9-4 2 5-9 5Z" fill={paper}/></>:<><path d={jack?'M78 75 84 7l-5 5-5 63Z':'m17 72-7-57 7 6 6 49Z'} fill={paper}/><path d={jack?'m84 7 2-5 2 6-5 9':'m10 15 2-9 5 15'} fill={gold}/><path d={jack?'m69 63 19 3-1 5-19-3':'m9 61 19-3 1 5-19 3'} fill={gold}/><path d={jack?'m74 70 7 1-1 8h-7Z':'m16 65 6-1 1 14h-6Z'} fill={red}/><path d={jack?'m67 62 6-6 6 3-2 8-8 2Z':'m23 58 6 1 2 6-7 5-4-6Z'} fill={paper}/></>}
    <path d="M3 76h94M5 72h26m39 0h25" stroke={gold} strokeWidth="2"/>
    <g color={suit==='hearts'||suit==='diamonds'?red:navy} stroke="none"><Suit suit={suit} x={73} y={24} width={18} height={20}/></g>
   </g>
  </defs>
  <rect x=".8" y=".8" width="98.4" height="154.4" fill={paper} stroke={navy} strokeWidth="1.6"/>
  <use href={`#${half}`}/><use href={`#${half}`} transform="translate(100 156) rotate(180)"/>
  <path d="M1 78h98" stroke={gold} strokeWidth="2"/>
 </svg>;
}

export function CardBackArtwork({design}:{design:CardBack}){
 return <svg className={`card-back-art back-art-${design}`} viewBox="0 0 100 144" fill="none" aria-hidden="true">
  <rect x="5" y="5" width="90" height="134" rx="3" stroke="currentColor" strokeWidth="1.3"/>
  <rect x="8" y="8" width="84" height="128" rx="2" stroke="currentColor" strokeWidth=".55"/>
  {[36,108].map((cy,i)=><g key={cy} transform={`translate(50 ${cy})`}>
   {Array.from({length:12},(_,n)=><ellipse key={n} rx={design==='red'?24:21} ry="8" stroke="currentColor" strokeWidth=".5" transform={`rotate(${n*15})`}/>)}
   <circle r="13" stroke="currentColor" strokeWidth="1"/><circle r="10" stroke="currentColor" strokeWidth=".5"/>
   <path d={i===0?'m0-8 6 8-6 8-6-8Z':'M0-8C-9-2-9 5-2 4l-2 4h8L2 4C9 5 9-2 0-8Z'} fill="currentColor"/>
  </g>)}
  {[false,true].map(reverse=><g key={String(reverse)} transform={reverse?'translate(100 144) rotate(180)':undefined} stroke="currentColor" strokeWidth=".65">
   <path d="M12 12c18 0 9 20 25 20M12 12c0 18 20 9 20 25M88 12c-18 0-9 20-25 20M88 12c0 18-20 9-20 25"/>
   <path d="M12 12c12 2 5 11 13 13m63-13c-12 2-5 11-13 13M11 61c20-15 22 13 39 2 17 11 19-17 39-2"/>
   <path d="m15 16 4 3-4 3-4-3Zm70 0 4 3-4 3-4-3Z" fill="currentColor"/>
  </g>)}
  <path d="m27 68 23-6 23 6v8l-23 6-23-6Z" fill={design==='red'?'#8f182c':'#202631'} stroke="currentColor" strokeWidth=".7"/>
  <text x="50" y="74.5" textAnchor="middle" fill="currentColor" fontFamily="Georgia,serif" fontSize="6" letterSpacing="2">DUTCH</text>
 </svg>;
}
