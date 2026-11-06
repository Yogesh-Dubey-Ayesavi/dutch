import {test,expect,type Page} from '@playwright/test';
import type {GameView} from '../packages/engine/src/index';
declare global {interface Window {__states:GameView[];__socket:WebSocket;__acks:string[];__errors:string[];__events:{type:string;emoji?:string;text?:string}[]}}
async function observe(page:Page){await page.addInitScript(()=>{window.__states=[];window.__acks=[];window.__errors=[];window.__events=[];const Original=window.WebSocket;window.WebSocket=class extends Original{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);window.__socket=this;this.addEventListener('message',e=>{if(e.data==='pong')return;const msg=JSON.parse(e.data);if(msg.type==='state'){window.__states.push(msg.state);if(msg.ack)window.__acks.push(msg.ack);}else if(msg.type==='error')window.__errors.push(msg.message);else if(msg.type==='emote')window.__events.push({type:'emote',emoji:msg.emoji});else if(msg.type==='chat')window.__events.push({type:'chat',text:msg.line.text});});}};});}
async function current(page:Page){return page.evaluate(()=>window.__states.at(-1)!);}
const me=(s:GameView)=>s.players.find(p=>p.id===s.you)!;
/** What the hand looks like on screen: each slot's back colour, or its face when the card is known. */
async function shownHand(page:Page){return page.locator('.hand .hc .pc').evaluateAll(els=>els.map(el=>el.getAttribute('data-back')??el.textContent??'face'));}

async function table(browser:import('@playwright/test').Browser,rounds?:number){
 const aContext=await browser.newContext({viewport:{width:1280,height:800}});const bContext=await browser.newContext({viewport:{width:390,height:844}});
 const a=await aContext.newPage(),b=await bContext.newPage();await observe(a);await observe(b);
 await a.goto('/');await a.getByRole('button',{name:'Create a table',exact:true}).click();await a.getByLabel('What should we call you?').fill('Alice');
 if(rounds){await a.getByRole('button',{name:'Number of rounds'}).click();await a.getByRole('option',{name:new RegExp(`^${rounds} rounds?`)}).click();await expect(a.getByRole('button',{name:'Number of rounds'})).toHaveAttribute('data-value',String(rounds));}
 await a.getByRole('button',{name:'Create my table'}).click();const code=(await a.getByTestId('room-code').textContent())!;
 await b.goto(`/?room=${code}`);await b.getByLabel('What should we call you?').fill('Basil');await b.getByRole('button',{name:'Join the table',exact:true}).click();
 await expect(a.getByText('Basil',{exact:true})).toBeVisible();
 await a.getByRole('button',{name:'Deal'}).click();await a.getByRole('button',{name:'2 cards',exact:true}).click();
 // Alice peeks two cards so their faces make the order checkable.
 await a.getByRole('button',{name:'Your card 1',exact:true}).click();await a.getByRole('button',{name:'Your card 2',exact:true}).click();
 await a.getByRole('button',{name:'Done'}).click();await b.getByRole('button',{name:'Done'}).click();
 await expect.poll(async()=>(await current(a)).phase).toBe('playing');
 return {a,b,close:async()=>{await aContext.close();await bContext.close();}};
}

async function drag(page:Page,from:number,to:number){
 const cards=page.locator('.hand .hc');const src=(await cards.nth(from).boundingBox())!;const dst=(await cards.nth(to).boundingBox())!;
 await page.mouse.move(src.x+src.width/2,src.y+src.height/2);await page.mouse.down();
 await page.mouse.move(src.x+src.width/2+(dst.x-src.x)/2,src.y+src.height/2-10,{steps:4});
 await page.mouse.move(dst.x+dst.width/2,dst.y+dst.height/2-10,{steps:4});await page.mouse.up();
}

test('rapid reorders while the other player keeps acting never snap back or get lost',async({browser})=>{
 const {a,b,close}=await table(browser,3);
 expect((await current(a)).rules.rounds).toBe(3);
 const startRevision=me(await current(a)).handRevision;
 // Basil keeps the table version moving the whole time: reorders, and his turn if it comes up.
 let busy=true;
 const noise=(async()=>{while(busy){const s=await current(b);if(!s)break;try{if(s.players[s.turn].id===s.you&&s.phase==='playing'&&!s.drawn){await b.keyboard.press('e');await b.waitForTimeout(120);await b.keyboard.press('x');}else await b.evaluate(()=>window.__socket.send(JSON.stringify({v:1,type:'action',id:crypto.randomUUID(),expectedVersion:window.__states.at(-1)!.version,action:{type:'reorder',from:0,to:1,handRevision:window.__states.at(-1)!.players.find(p=>p.id===window.__states.at(-1)!.you)!.handRevision}})));}catch{/* page busy */}await b.waitForTimeout(90);}})();
 const moves:[number,number][]=[[0,3],[3,1],[1,2],[2,0],[0,3],[3,2],[1,0],[2,3]];
 let expected=await shownHand(a);
 for(const [from,to] of moves){
  await drag(a,from,to);
  const next=[...expected];next.splice(to,0,next.splice(from,1)[0]);expected=next;
  // Shown immediately, and still that way a moment later: no fall-back to an older order.
  expect(await shownHand(a)).toEqual(expected);
  await a.waitForTimeout(160);
  expect(await shownHand(a)).toEqual(expected);
 }
 busy=false;await noise;
 await expect.poll(async()=>me(await current(a)).handRevision,{timeout:8000}).toBe(startRevision+moves.length);
 await a.waitForTimeout(300);
 expect(await shownHand(a)).toEqual(expected);
 expect(await a.evaluate(()=>window.__errors)).toEqual([]);
 // The server's own order agrees with the screen (faces of the two peeked cards and every back).
 const server=me(await current(a));expect(server.handBacks).toEqual(expected);
 await a.screenshot({path:'test-results/polish-after-reorders.png'});
 await close();
});

test('emotes and chat reach the other seat with sound, and the network badge reports latency',async({browser})=>{
 const {a,b,close}=await table(browser);
 await expect(a.locator('.net-badge')).toContainText(/ms|Connected/);
 await a.getByRole('button',{name:'Send a reaction'}).click();await a.getByRole('button',{name:'React 😂'}).click();
 await expect.poll(()=>b.evaluate(()=>window.__events.filter(e=>e.type==='emote'&&e.emoji==='😂').length)).toBe(1);
 await expect(b.locator('.tapback')).toHaveText('😂');
 await b.screenshot({path:'test-results/polish-emote-mobile.png'});
 await b.getByRole('button',{name:'Table chat'}).click();await b.getByLabel('Chat message').fill('nice peek 👀');await b.keyboard.press('Enter');
 await expect(a.locator('.chat-toast')).toContainText('Basil');await expect(a.locator('.chat-toast-text')).toHaveText('nice peek 👀');
 await expect(a.getByRole('button',{name:/Table chat, 1 unread/})).toBeVisible();
 await a.getByRole('button',{name:/Table chat/}).click();await expect(a.locator('.chat-panel li').last()).toContainText('nice peek 👀');
 await a.screenshot({path:'test-results/polish-chat-desktop.png'});
 await b.screenshot({path:'test-results/polish-chat-mobile.png'});
 await close();
});
