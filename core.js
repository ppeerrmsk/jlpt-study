'use strict';
(function(root){
const DAY=86400000, GOAL=20, MAX_ATTEMPTS=100000;
const uid=()=>Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
function day(at=Date.now()){return new Date(at+9*3600000).toISOString().slice(0,10);}
function shift(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
function weekStart(at=Date.now()){const d=day(at),w=new Date(d+'T00:00:00Z').getUTCDay();return shift(d,-((w+6)%7));}
function profile(p){if(!p||!/^\w{16,64}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>24||!['N1','N2'].includes(p.level))throw Error('学习者资料无效');return {id:p.id,name:p.name.trim(),level:p.level};}
function validateAttempts(input,questions,now=Date.now()){
 if(!Array.isArray(input)||input.length>MAX_ATTEMPTS)throw Error('答题记录数量无效');
 const byId=new Map(questions.map(q=>[q.id,q]));
 return mergeAttempts([],input.map(a=>{const q=byId.get(a?.qid);if(!q||typeof a.id!=='string'||!/^[\w-]{12,100}$/.test(a.id)||!Number.isInteger(a.answer)||a.answer<1||a.answer>4||!Number.isSafeInteger(a.at)||a.at<1577836800000||a.at>now+300000)throw Error('答题记录无效：请检查题库、时间和文件');return {id:a.id,qid:q.id,answer:a.answer,at:a.at};}));
}
function mergeAttempts(a,b){
 const m=new Map();for(const x of [...a,...b]){const old=m.get(x.id);if(old&&(old.qid!==x.qid||old.answer!==x.answer||old.at!==x.at))throw Error('发现相同编号但内容冲突的记录');m.set(x.id,x);}
 if(m.size>MAX_ATTEMPTS)throw Error('答题记录超过上限，请先备份');
 return [...m.values()].sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));
}
function history(attempts,q){
 const a=attempts.filter(a=>a.qid===q.id).sort((x,y)=>x.at-y.at||x.id.localeCompare(y.id));
 const lastWrong=a.findLastIndex(x=>x.answer!==q.answer),days=new Set(a.slice(lastWrong+1).filter(x=>x.answer===q.answer).map(x=>day(x.at)));
 const wrong=lastWrong>=0,mastered=wrong&&days.size>=2;
 return {attempts:a,first:a[0],last:a.at(-1),everWrong:wrong,review:wrong&&!mastered,mastered,recoveryDays:wrong?Math.min(days.size,2):0,due:wrong&&!mastered&&(!a.length||day(a.at(-1).at)<day())};
}
function summary(attempts,questions,level,now=Date.now()){
 const qs=questions.filter(q=>q.level===level&&q.type!=='custom'),ids=new Set(qs.map(q=>q.id)),as=attempts.filter(a=>ids.has(a.qid)),today=day(now),week=weekStart(now),daily={};
 for(const a of as){const d=day(a.at);if(!daily[d])daily[d]=new Set();daily[d].add(a.qid);}
 const days=Object.fromEntries(Object.entries(daily).map(([d,v])=>[d,v.size]));
 let seen=0,firstCorrect=0,latestCorrect=0,review=0,everWrong=0,recovered=0;
 const byQuestion=new Map();for(const a of as){if(!byQuestion.has(a.qid))byQuestion.set(a.qid,[]);byQuestion.get(a.qid).push(a);}
 for(const q of qs){const h=history(byQuestion.get(q.id)||[],q);if(h.first){seen++;if(h.first.answer===q.answer)firstCorrect++;if(h.last.answer===q.answer)latestCorrect++;}if(h.everWrong)everWrong++;if(h.review)review++;if(h.mastered)recovered++;}
 const weekDays=Array.from({length:7},(_,i)=>{const date=shift(week,i);return {date,count:days[date]||0,checked:(days[date]||0)>=GOAL};});
 let cursor=(days[today]||0)>=GOAL?today:shift(today,-1),streak=0;while((days[cursor]||0)>=GOAL){streak++;cursor=shift(cursor,-1);}
 return {level,total:qs.length,seen,firstCorrect,latestCorrect,review,everWrong,recovered,coverage:qs.length?Math.round(seen/qs.length*1000)/10:0,accuracy:seen?Math.round(firstCorrect/seen*100):null,today:days[today]||0,goal:GOAL,streak,weekDays,checkins:weekDays.filter(x=>x.checked).length,weekPoints:weekDays.reduce((s,d)=>s+Math.min(GOAL,d.count),0),attemptCount:as.length,lastAttempt:as.at(-1)?.at||0};
}
function customQuestions(list){
 if(!Array.isArray(list)||list.length>3000)throw Error('扩展题库需要 questions 数组，最多 3000 题');
 const ids=new Set();return list.map(q=>{
  if(!q||typeof q.id!=='string'||!/^custom-[\w-]{1,70}$/.test(q.id)||ids.has(q.id)||!['N1','N2'].includes(q.level)||!['vocab','grammar'].includes(q.section)||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>10000||!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>typeof x!=='string'||!x.trim()||x.length>4000)||!Number.isInteger(q.answer)||q.answer<1||q.answer>4||typeof q.source!=='string'||!q.source.trim()||q.source.length>500)throw Error('扩展题格式不符：需要 custom- 开头的独立编号、级别、题面、四选项、答案及来源');
  ids.add(q.id);return {id:q.id,level:q.level,section:q.section,prompt:q.prompt,options:q.options.slice(),answer:q.answer,source:q.source,explanation:typeof q.explanation==='string'?q.explanation.slice(0,10000):'',type:'custom'};
 });
}
// XP is derived from unique answer events, never trusted from a saved total.
const XP=Object.freeze({first:5,correct:15,recovery:10,review:3,checkin:30,reviewLimit:20});
function growth(attempts,questions,now=Date.now()){
 const byId=new Map(questions.map(q=>[q.id,q])),seen=new Map(),daily=new Map(),events=[];
 const ordered=mergeAttempts([],attempts).filter(a=>byId.has(a.qid)),today=day(now),week=weekStart(now);
 let total=0;
 function award(a,kind,amount,label){total+=amount;events.push({id:a.id+':'+kind,qid:kind==='checkin'?null:a.qid,at:a.at,kind,amount,label,total});}
 for(const a of ordered){
  const q=byId.get(a.qid),date=day(a.at),correct=a.answer===q.answer;
  if(!daily.has(date))daily.set(date,{ids:new Set(),reviews:0});
  const d=daily.get(date),firstToday=!d.ids.has(q.id);d.ids.add(q.id);
  let h=seen.get(q.id);
  if(!h){h={correct:false,lastWrong:null,recovered:false};seen.set(q.id,h);award(a,'first',XP.first,'初次作答');}
  if(correct){
   const hadCorrect=h.correct;
   if(!hadCorrect){award(a,'correct',XP.correct,'首次答对');h.correct=true;}
   if(firstToday&&h.lastWrong!==null&&h.lastWrong<date&&!h.recovered){award(a,'recovery',XP.recovery,'隔日纠错');h.recovered=true;}
   else if(firstToday&&hadCorrect&&d.reviews<XP.reviewLimit){award(a,'review',XP.review,'隔日温习');d.reviews++;}
  }else h.lastWrong=date;
  if(firstToday&&d.ids.size===GOAL)award(a,'checkin',XP.checkin,'每日打卡');
 }
 const count=date=>daily.get(date)?.ids.size||0;
 const weekDays=Array.from({length:7},(_,i)=>{const date=shift(week,i);return {date,count:count(date),checked:count(date)>=GOAL};});
 let cursor=count(today)>=GOAL?today:shift(today,-1),streak=0;
 while(count(cursor)>=GOAL){streak++;cursor=shift(cursor,-1);}
 let level=1,base=0,needed=100;
 while(total>=base+needed){base+=needed;level++;needed=100+50*(level-1);}
 return {total,level,base,needed,into:total-base,next:base+needed,remaining:base+needed-total,events,todayXP:events.filter(e=>day(e.at)===today).reduce((s,e)=>s+e.amount,0),weekXP:events.filter(e=>day(e.at)>=week&&day(e.at)<=today).reduce((s,e)=>s+e.amount,0),today:count(today),goal:GOAL,weekDays,checkins:weekDays.filter(d=>d.checked).length,streak};
}
function validateBackup(s,official,now=Date.now()){
 if(!((s?.version===1&&s?.app==='jlpt-duo')||(s?.version===2&&s?.app==='jlpt-solo')))throw Error('不是本工具的备份文件');
 const p=profile(s.profile),custom=customQuestions(s.custom||[]),qs=[...official,...custom],ids=new Set(qs.map(q=>q.id)),notes={};
 if(!s.notes||typeof s.notes!=='object'||Array.isArray(s.notes)||!Array.isArray(s.stars))throw Error('笔记或收藏格式无效');
 for(const [id,n]of Object.entries(s.notes)){if(ids.has(id)&&typeof n==='string')notes[id]=n.slice(0,10000);}
 const result={app:'jlpt-solo',version:2,profile:p,custom,attempts:validateAttempts(s.attempts,qs,now),notes,stars:[...new Set(s.stars.filter(x=>ids.has(x)))]};
 if(s.game!==undefined){const G=typeof module!=='undefined'&&module.exports?require('./game-core.js'):root.JLPT_GAME;result.game=G.validate(s.game,result.attempts,qs,now);}
 if(s.preferences!==undefined){const P=typeof module!=='undefined'&&module.exports?require('./preferences-core.js'):root.JLPT_PREFERENCES;result.preferences=P.normalize(s.preferences);}
 return result;
}
const api={uid,day,shift,weekStart,profile,validateAttempts,mergeAttempts,history,summary,growth,XP,customQuestions,validateBackup,GOAL};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JLPT_CORE=api;
})(globalThis);
