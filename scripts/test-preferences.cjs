'use strict';
const assert=require('node:assert/strict'),P=require('../preferences-core.js'),F=require('../feedback.js'),C=require('../core.js'),B=require('../data/bank.json');
const tests=[],test=(name,fn)=>tests.push([name,fn]);
function audioHarness(initialState='running'){
 const nodes=[],instances=[],events=[];let resolveResume;
 class Context{
  constructor(){this.state=initialState;this.currentTime=10;this.destination={};instances.push(this);}
  resume(){return new Promise(resolve=>{resolveResume=()=>{this.state='running';resolve();};});}
  createOscillator(){const o={type:'',frequency:{setValueAtTime:(f,t)=>events.push(['frequency',f,t])},connect(){},disconnect(){},start(t){o.started=t;},stop(t){o.stopped=t??true;}};nodes.push(o);return o;}
  createGain(){return {gain:{setValueAtTime:(v,t)=>events.push(['zero',v,t]),linearRampToValueAtTime:(v,t)=>events.push(['attack',v,t]),exponentialRampToValueAtTime:(v,t)=>events.push(['release',v,t])},connect(){},disconnect(){}};}
 }
 return {Context,nodes,instances,events,resume:()=>resolveResume()};
}
test('Preferences sanitize colors and bounded values without trusting arbitrary CSS',()=>{
 assert.deepEqual(P.normalize(),P.defaults());assert.deepEqual(P.normalize(null),P.defaults());
 const p=P.normalize({sound:'yes',volume:120,motion:'flash',appearance:{custom:true,accent:'url(secret)',background:'#ABCDEF',textSize:'200px',density:'compact',corners:'square'},unknown:'drop'});
 assert.equal(p.sound,true);assert.equal(p.volume,100);assert.equal(p.motion,'full');assert.equal(p.appearance.accent,'#31594a');assert.equal(p.appearance.background,'#abcdef');assert.equal(p.appearance.textSize,'normal');assert(!('unknown'in p));assert.equal(P.normalize({volume:-1}).volume,0);assert.equal(P.normalize({volume:NaN}).volume,35);
});
test('Custom light and dark palettes preserve text and primary-button contrast',()=>{
 const colors=['#000000','#ffffff','#777777','#808080','#ff0000','#00ff00','#0000ff','#f2e8d5','#151925'];
 let seed=12345;for(let i=0;i<120;i++){seed=(seed*1664525+1013904223)>>>0;colors.push('#'+(seed&0xffffff).toString(16).padStart(6,'0'));}
 for(const [i,bg]of colors.entries()){const p=P.defaults();p.appearance={...p.appearance,custom:true,background:bg,accent:colors[(i*7+3)%colors.length]};const css=P.palette(p);for(const fg of ['--ink','--muted','--green','--orange'])for(const background of ['--bg','--paper','--soft'])assert(P.contrast(css[fg],css[background])>=4.5,`${fg} ${background} ${bg}`);assert(P.contrast(css['--on-accent'],css['--accent'])>=4.5);}
});
test('Backups round-trip settings while legacy backups and XP remain compatible',()=>{
 const q=B.questions[0],now=Date.now(),data={app:'jlpt-solo',version:2,profile:{id:'abcdefghijklmnop',name:'偏好测试',level:'N1'},custom:[],attempts:[{id:'answer-event-12345',qid:q.id,answer:q.answer,at:now}],stars:[],notes:{}};
 assert.deepEqual(C.validateBackup(data,B.questions,now),data);
 const preferences=P.defaults();preferences.sound=false;preferences.volume=20;preferences.motion='subtle';preferences.appearance={...preferences.appearance,custom:true,accent:'#cc5577',background:'#151925',textSize:'large',corners:'square'};
 const restored=C.validateBackup(JSON.parse(JSON.stringify({...data,preferences})),B.questions,now);assert.deepEqual(restored.preferences,preferences);assert.equal(C.growth(restored.attempts,B.questions,now).total,20);
});
test('Muted and zero-volume feedback never create an audio context',async()=>{
 const h=audioHarness(),p=P.defaults(),fx=F.create({getPreferences:()=>p,AudioContext:h.Context,document:null});p.sound=false;assert.equal(await fx.play({correct:true}),false);p.sound=true;p.volume=0;assert.equal(await fx.play({correct:true,levelUp:true}),false);assert.equal(h.instances.length,0);
});
test('Correct/combo/level use distinct bounded melodies and level takes priority',async()=>{
 const h=audioHarness(),p=P.defaults(),fx=F.create({getPreferences:()=>p,AudioContext:h.Context,document:null});
 assert(await fx.play({correct:true}));assert.equal(h.nodes.length,2);assert(await fx.play({correct:true,combo:5}));assert.equal(h.nodes.length,5);assert(await fx.play({correct:true,combo:10,levelUp:true}));assert.equal(h.nodes.length,9);assert.equal(h.instances.length,1);
 assert(h.nodes.slice(-4).every(n=>n.type==='triangle'));assert(h.events.filter(e=>e[0]==='attack').every(e=>e[1]>.0&&e[1]<=.12));assert(h.events.filter(e=>e[0]==='release').every(e=>e[1]>.0));
 assert.deepEqual(P.notes('combo',10),P.notes('combo',100));assert.equal(await fx.play({correct:false}),false);assert(h.nodes.every(n=>n.stopped===true));
});
test('Muting stops scheduled voices immediately and cancels pending resume',async()=>{
 const h=audioHarness(),p=P.defaults(),fx=F.create({getPreferences:()=>p,AudioContext:h.Context,document:null});await fx.play({correct:true,levelUp:true});p.sound=false;fx.stopSound();assert(h.nodes.every(n=>n.stopped===true));
 const suspended=audioHarness('suspended'),next=F.create({getPreferences:()=>p,AudioContext:suspended.Context,document:null});p.sound=true;const pending=next.play({correct:true});p.sound=false;next.stopSound();suspended.resume();assert.equal(await pending,false);assert.equal(suspended.nodes.length,0);
});
test('Missing or blocked audio reports status without rejecting answer feedback',async()=>{
 const statuses=[],p=P.defaults(),noAudio=F.create({getPreferences:()=>p,AudioContext:null,document:null,onAudioStatus:s=>statuses.push(s)});assert.equal(await noAudio.play({correct:true}),false);assert(statuses.at(-1).includes('不支持'));
 class Blocked{constructor(){this.state='suspended';}resume(){return Promise.reject(Error('blocked'));}}
 const blocked=F.create({getPreferences:()=>p,AudioContext:Blocked,document:null,onAudioStatus:s=>statuses.push(s)});assert.equal(await blocked.play({levelUp:true}),false);assert(statuses.at(-1).includes('暂不可用'));
});
(async()=>{for(const [name,fn]of tests){await fn();console.log('PASS '+name);}console.log(`PASS ${tests.length} preference/feedback test groups`);})().catch(e=>{console.error(e);process.exitCode=1;});
