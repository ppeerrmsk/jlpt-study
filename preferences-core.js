'use strict';
(function(root){
const PRESETS=Object.freeze({sage:{accent:'#31594a',background:'#f5f4ef'},ink:{accent:'#355d83',background:'#f0f3f6'},amber:{accent:'#80602f',background:'#f7f3ec'}});
const defaults=()=>({sound:true,volume:35,motion:'full',appearance:{custom:false,accent:'#31594a',background:'#f5f4ef',textSize:'normal',density:'comfortable',corners:'soft'}});
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fallback;
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
function normalize(input){
 const d=defaults(),p=input&&typeof input==='object'&&!Array.isArray(input)?input:{},a=p.appearance&&typeof p.appearance==='object'?p.appearance:{};
 return {sound:typeof p.sound==='boolean'?p.sound:d.sound,volume:typeof p.volume==='number'&&Number.isFinite(p.volume)?Math.round(Math.min(100,Math.max(0,p.volume))):d.volume,motion:choice(p.motion,['full','subtle','off'],d.motion),appearance:{custom:typeof a.custom==='boolean'?a.custom:false,accent:color(a.accent,d.appearance.accent),background:color(a.background,d.appearance.background),textSize:choice(a.textSize,['normal','large','larger'],'normal'),density:choice(a.density,['comfortable','compact'],'comfortable'),corners:choice(a.corners,['soft','small','square'],'soft')}};
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=channels=>'#'+channels.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
function mix(a,b,f){const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v*(1-f)+y[i]*f));}
function luminance(c){return rgb(c).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function readable(bg){return contrast('#000000',bg)>=contrast('#ffffff',bg)?'#000000':'#ffffff';}
function legible(c,backgrounds){const target=readable(backgrounds[0]);for(let i=0;i<=100;i++){const candidate=mix(c,target,i/100);if(backgrounds.every(bg=>contrast(candidate,bg)>=4.5))return candidate;}return target;}
function palette(preferences,theme='sage'){
 const p=normalize(preferences),a=p.appearance,colors=a.custom?a:PRESETS[theme]||PRESETS.sage,bg=colors.background,accent=colors.accent,dark=readable(bg)==='#ffffff';
 // Surface colors follow the background's light/dark range, so one readable text color works throughout.
 const paper=mix(bg,dark?'#111820':'#ffffff',.72),soft=mix(paper,legible(accent,[bg,paper]),.09),backgrounds=[bg,paper,soft];
 const ink=legible(dark?'#e9eef5':'#283e38',backgrounds),muted=legible(mix(ink,bg,.42),backgrounds),green=legible(accent,backgrounds);
 return {'--bg':bg,'--paper':paper,'--ink':ink,'--muted':muted,'--green':green,'--accent':accent,'--on-accent':readable(accent),'--soft':soft,'--line':mix(paper,ink,.22),'--orange':legible('#b6603d',backgrounds),'--ui-base':{normal:'16px',large:'18px',larger:'20px'}[a.textSize],'--card-radius':{soft:'14px',small:'6px',square:'0px'}[a.corners],'--control-radius':{soft:'8px',small:'4px',square:'0px'}[a.corners]};
}
function eventKind(event){return event.levelUp?'level':event.correct&&event.combo>=3?'combo':event.correct?'correct':null;}
function notes(kind,combo=3){
 if(kind==='level')return [[523.25,0,.16],[659.25,.12,.16],[783.99,.24,.18],[1046.5,.4,.3]];
 if(kind==='combo'){const step=1+Math.min(Math.max(combo-3,0),7)*.035;return [[659.25*step,0,.12],[783.99*step,.09,.12],[987.77*step,.18,.2]];}
 return kind==='correct'?[[523.25,0,.1],[783.99,.085,.16]]:[];
}
const api={PRESETS,defaults,normalize,palette,contrast,eventKind,notes};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JLPT_PREFERENCES=api;
})(globalThis);
