'use strict';
(function(root){
const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.JLPT_CORE;
const MODES=Object.freeze({quick:{name:'快速局',size:5,description:'5 道词汇与语法，优先抽取未做题。'},combo:{name:'连击局',size:10,description:'10 道词汇与语法，连续答对提高得分。'},review:{name:'错题挑战',size:5,description:'从待复习错题中抽取 5 道。'}});
const THEMES=[{id:'sage',name:'青苔',cost:0},{id:'ink',name:'墨蓝',cost:8},{id:'amber',name:'琥珀',cost:20}];
const empty=()=>({version:1,runs:[],activeId:null,theme:'sage'});
const validId=id=>typeof id==='string'&&/^[\w-]{12,100}$/.test(id);
function validate(input,attempts,questions,now=Date.now()){
 if(input===undefined)return empty();
 if(!input||input.version!==1||!Array.isArray(input.runs)||input.runs.length>10000)throw Error('挑战记录格式无效');
 const qs=new Map(questions.map(q=>[q.id,q])),as=new Map(attempts.map(a=>[a.id,a])),ids=new Set(),used=new Set();
 const runs=input.runs.map(r=>{
  if(!r||!validId(r.id)||ids.has(r.id)||!Object.hasOwn(MODES,r.mode)||!['N1','N2'].includes(r.level)||!Number.isSafeInteger(r.started)||r.started<1577836800000||r.started>now+300000||!Array.isArray(r.qids)||r.qids.length!==MODES[r.mode].size||new Set(r.qids).size!==r.qids.length||!Array.isArray(r.attemptIds)||r.attemptIds.length>r.qids.length)throw Error('挑战局资料无效');
  ids.add(r.id);
  for(const id of r.qids){const q=qs.get(id);if(!q||q.type==='custom'||q.level!==r.level||!['vocab','grammar'].includes(q.section))throw Error('挑战题目与题库不符');}
  let previous=r.started;
  for(const [i,id]of r.attemptIds.entries()){const a=as.get(id);if(!a||a.qid!==r.qids[i]||a.at<previous||used.has(id))throw Error('挑战答案顺序或引用无效');previous=a.at;used.add(id);}
  return {id:r.id,mode:r.mode,level:r.level,started:r.started,qids:r.qids.slice(),attemptIds:r.attemptIds.slice()};
 });
 const activeId=input.activeId??null;
 if(activeId!==null&&!runs.some(r=>r.id===activeId&&r.attemptIds.length<r.qids.length))throw Error('未完成挑战编号无效');
 return {version:1,runs,activeId,theme:THEMES.some(t=>t.id===input.theme)?input.theme:'sage'};
}
// Merging snapshots keeps the longer valid prefix of a session, never counts it twice.
function merge(a,b,attempts,questions,now=Date.now()){
 a=validate(a,attempts,questions,now);b=validate(b,attempts,questions,now);
 const runs=new Map(a.runs.map(r=>[r.id,r]));
 for(const r of b.runs){const old=runs.get(r.id);if(old){if(old.mode!==r.mode||old.level!==r.level||old.started!==r.started||JSON.stringify(old.qids)!==JSON.stringify(r.qids)||old.attemptIds.slice(0,Math.min(old.attemptIds.length,r.attemptIds.length)).some((id,i)=>id!==r.attemptIds[i]))throw Error('同一挑战局存在冲突，请保留两份备份');if(old.attemptIds.length>=r.attemptIds.length)continue;}runs.set(r.id,r);}
 const activeId=[a.activeId,b.activeId].find(id=>id&&runs.get(id).attemptIds.length<runs.get(id).qids.length)||null;
 return validate({version:1,runs:[...runs.values()].sort((x,y)=>x.started-y.started||x.id.localeCompare(y.id)),activeId,theme:a.theme},attempts,questions,now);
}
function histories(attempts,questions){
 const grouped=new Map();for(const a of attempts){if(!grouped.has(a.qid))grouped.set(a.qid,[]);grouped.get(a.qid).push(a);}
 return new Map(questions.map(q=>[q.id,C.history(grouped.get(q.id)||[],q)]));
}
function everRecovered(h,q){
 let wrong=false;const dates=new Set();
 for(const a of h.attempts){if(a.answer!==q.answer){wrong=true;dates.clear();}else if(wrong){dates.add(C.day(a.at));if(dates.size>=2)return true;}}
 return false;
}
function pick(mode,level,questions,attempts,now=Date.now(),random=Math.random){
 const hs=histories(attempts,questions),today=C.day(now);
 return questions.filter(q=>q.level===level&&q.type!=='custom'&&['vocab','grammar'].includes(q.section)&&(mode!=='review'||hs.get(q.id).review)).map(q=>{const h=hs.get(q.id);return {q,priority:(h.attempts.some(a=>C.day(a.at)===today)?4:0)+(h.first?1:0),random:random()};}).sort((a,b)=>a.priority-b.priority||a.random-b.random).slice(0,MODES[mode].size).map(x=>x.q.id);
}
function score(run,attempts,questions){
 const as=attempts instanceof Map?attempts:new Map(attempts.map(a=>[a.id,a])),qs=questions instanceof Map?questions:new Map(questions.map(q=>[q.id,q]));
 let points=0,combo=0,bestCombo=0,correct=0;const steps=[];
 for(const id of run.attemptIds){const a=as.get(id),right=a.answer===qs.get(a.qid).answer;combo=right?combo+1:0;const gain=right?100+20*Math.min(combo-1,5):0;points+=gain;correct+=Number(right);bestCombo=Math.max(combo,bestCombo);steps.push({qid:a.qid,answer:a.answer,right,gain,combo,at:a.at});}
 const complete=steps.length===run.qids.length,ratio=correct/run.qids.length;
 return {points,combo,bestCombo,correct,steps,complete,rank:!complete?'—':ratio===1?'S':ratio>=.8?'A':ratio>=.6?'B':'C',stars:complete?(ratio===1?3:ratio>=.8?2:1):0,ended:steps.at(-1)?.at||run.started};
}
function overview(game,attempts,questions,now=Date.now()){
 const as=new Map(attempts.map(a=>[a.id,a])),qs=new Map(questions.map(q=>[q.id,q])),daily=new Map(),hs=histories(attempts,questions);
 const dayData=d=>{if(!daily.has(d))daily.set(d,{seen:new Set(),correct:new Set(),challenge:new Set()});return daily.get(d);};
 for(const a of attempts){if(!qs.has(a.qid))continue;const d=dayData(C.day(a.at));d.seen.add(a.qid);if(a.answer===qs.get(a.qid).answer)d.correct.add(a.qid);}
 const results=game.runs.map(r=>({...r,...score(r,as,qs)})),completed=results.filter(r=>r.complete);
 for(const r of completed){const d=dayData(C.day(r.ended));r.qids.forEach(id=>d.challenge.add(id));}
 const taskList=d=>[{id:'start',name:'完成 5 道不同题',value:d.seen.size,target:5,reward:1},{id:'correct',name:'答对 8 道不同题',value:d.correct.size,target:8,reward:2},{id:'rounds',name:'结算挑战，覆盖 10 道不同题',value:d.challenge.size,target:10,reward:3}].map(t=>({...t,done:t.value>=t.target}));
 const today=taskList(dayData(C.day(now))),seen=[...hs.values()].filter(h=>h.first).length,recovered=questions.filter(q=>everRecovered(hs.get(q.id),q)).length;
 const badges=[
  {id:'first',name:'初次通关',detail:'结算 1 局挑战',value:completed.length,target:1},
  {id:'perfect',name:'全对通关',detail:'任意一局全部答对',value:completed.filter(r=>r.rank==='S').length,target:1},
  {id:'combo',name:'十连击',detail:'单局连续答对 10 题',value:Math.max(0,...completed.map(r=>r.bestCombo)),target:10},
  {id:'fifty',name:'五十题',detail:'累计练习 50 道不同题',value:seen,target:50},
  {id:'twohundred',name:'二百题',detail:'累计练习 200 道不同题',value:seen,target:200},
  {id:'recovery',name:'错题修复',detail:'10 道错题完成两个日期的正确回顾',value:recovered,target:10},
  {id:'days',name:'七日记录',detail:'累计 7 个不同日期有答题记录',value:[...daily.values()].filter(d=>d.seen.size).length,target:7},
  {id:'twenty',name:'二十局',detail:'结算 20 局挑战',value:completed.length,target:20}
 ].map(b=>({...b,reward:2,unlocked:b.value>=b.target}));
 const stars=[...daily.values()].flatMap(taskList).filter(t=>t.done).reduce((sum,t)=>sum+t.reward,0)+badges.filter(b=>b.unlocked).length*2;
 const best={};for(const r of completed){const key=r.level+':'+r.mode;if(!best[key]||r.points>best[key].points)best[key]=r;}
 return {today,badges,stars,results,completed,best,active:game.runs.find(r=>r.id===game.activeId)||null};
}
const api={MODES,THEMES,empty,validate,merge,pick,score,overview};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JLPT_GAME=api;
})(globalThis);
