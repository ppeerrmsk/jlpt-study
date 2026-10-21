'use strict';
(function(root){
const P=typeof module!=='undefined'&&module.exports?require('./preferences-core.js'):root.JLPT_PREFERENCES;
function create({getPreferences,document:doc=root.document,AudioContext:Context=root.AudioContext||root.webkitAudioContext,onAudioStatus=()=>{}}){
 let context=null,voices=new Set(),generation=0,timer=null;
 function stopSound(){generation++;for(const voice of voices){try{voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}catch{}}voices.clear();}
 function clearVisual(){if(timer)clearTimeout(timer);timer=null;doc?.getElementById('reward-layer')?.replaceChildren();doc?.querySelectorAll('.fx-correct,.fx-combo,.fx-level').forEach(el=>el.classList.remove('fx-correct','fx-combo','fx-level'));}
 async function sound(event){
  stopSound();const p=P.normalize(getPreferences()),kind=P.eventKind(event),token=generation;
  if(!kind||!p.sound||p.volume===0)return false;
  try{
   if(!Context){onAudioStatus('当前浏览器不支持音效。');return false;}
   if(!context||context.state==='closed')context=new Context();
   if(context.state!=='running')await context.resume();
   const current=P.normalize(getPreferences());if(token!==generation||!current.sound||current.volume===0)return false;
   if(context.state!=='running'){onAudioStatus('音效尚未启用，请点击试听重试。');return false;}
   const start=context.currentTime+.015;
   for(const [frequency,offset,duration]of P.notes(kind,event.combo)){
    const osc=context.createOscillator(),gain=context.createGain(),at=start+offset,voice={osc,gain};
    osc.type=kind==='level'?'triangle':'sine';osc.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12*current.volume/100,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(context.destination);voices.add(voice);osc.onended=()=>{voices.delete(voice);osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.025);
   }
   onAudioStatus('音效可用');return true;
  }catch{if(token===generation){stopSound();onAudioStatus('音效暂不可用，点击试听可重试；答题记录已正常保存。');}return false;}
 }
 function visual(event,preview=false){
  clearVisual();const kind=P.eventKind(event),p=P.normalize(getPreferences());if(!doc||!kind||p.motion==='off')return;
  const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches,motion=reduced?'subtle':p.motion;
  let layer=doc.getElementById('reward-layer');if(!layer){layer=doc.createElement('div');layer.id='reward-layer';layer.setAttribute('role','status');layer.setAttribute('aria-live','polite');layer.setAttribute('aria-atomic','true');doc.body.append(layer);}
  const card=doc.createElement('div');card.className=`reward-pop reward-${kind}`;card.dataset.motion=motion;
  const mark=doc.createElement('div');mark.className='reward-symbol';mark.setAttribute('aria-hidden','true');mark.textContent=kind==='level'?'↑':kind==='combo'?'×'+event.combo:'✓';
  const content=doc.createElement('div'),title=doc.createElement('strong'),detail=doc.createElement('span');
  title.textContent=kind==='level'?`升级 · Lv. ${event.level}`:kind==='combo'?`${event.combo} 连击`:'回答正确';
  detail.textContent=preview?'效果预览 · 不计入学习记录':kind==='level'?`本次 +${event.xp||0} XP${event.combo>=3?' · '+event.combo+' 连击':''}`:kind==='combo'?`连击加成 +${20*Math.min(event.combo-1,5)} 分`:(event.xp?`+${event.xp} XP`:'答案已记录');
  content.append(title,detail);card.append(mark,content);
  if(motion==='full'&&kind!=='correct')for(let i=0;i<(kind==='level'?12:8);i++){const particle=doc.createElement('i');particle.className='reward-particle';particle.setAttribute('aria-hidden','true');particle.style.setProperty('--angle',`${i*360/(kind==='level'?12:8)}deg`);particle.style.setProperty('--travel',`${50+i%3*15}px`);card.append(particle);}
  layer.append(card);const target=kind==='level'?doc.querySelector('#growth-state'):kind==='combo'?doc.querySelector('.run-hud'):doc.querySelector('.feedback');if(target)target.classList.add('fx-'+kind);
  timer=setTimeout(clearVisual,kind==='level'?3000:kind==='combo'?2400:1800);
 }
 function play(event,preview=false){visual(event,preview);return sound(event);}
 return {play,sound,clearVisual,stopSound};
}
const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JLPT_FEEDBACK=api;
})(globalThis);
