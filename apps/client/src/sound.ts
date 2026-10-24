import {Howl,Howler} from 'howler';
import type {SoundName} from '../../../packages/protocol/src/index';
const sounds=new Map<string,Howl>();
const cardRecordings:Partial<Record<SoundName,string>>={shuffle:'shuffle',deal:'card-contact1',draw:'card-cut',snap:'card-contact2',flip:'card-cut',burn:'card-contact2'};
let enabled=true,volume=0.65;let ambient:Howl|undefined;
export function configureSound(sound:boolean,level:number,ambience:boolean){enabled=sound;volume=level;Howler.volume(level);if(!sound)Howler.stop();if(sound&&ambience){ambient??=new Howl({src:['/audio/ambience.wav'],loop:true,volume:0.16});if(!ambient.playing())ambient.play();}else ambient?.stop();}
export function playSound(name:SoundName,options:{rate?:number}={}){if(!enabled||volume===0)return;let sound=sounds.get(name);if(!sound){sound=new Howl({src:[`/audio/${cardRecordings[name]??name}.wav`],volume:name==='penalty'?0.82:name==='tick'?0.46:name==='dutch'?1:name==='shuffle'?0.7:0.85,preload:true});sounds.set(name,sound);}const id=sound.play();if(options.rate)sound.rate(options.rate,id);}
