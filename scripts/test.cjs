'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../core.js'),B=require('../data/bank.json');
const root=path.resolve(__dirname,'..'),now=Date.parse('2026-10-19T08:00:00Z'),DAY=86400000;
const q=B.questions[0],n2=B.questions.filter(q=>q.level==='N2');
let seq=0;const attempt=(q,answer,at=now)=>({id:'testattempt'+String(++seq).padStart(6,'0'),qid:q.id,answer,at});
const wrong=q=>q.answer%4+1,profile={id:'a'.repeat(32),name:'学习者',level:'N2'};
const tests=[];function test(name,fn){tests.push([name,fn]);}
test('Official bank, original images and source answers',()=>{
 assert.match(C.uid(),/^[a-f0-9]{32}$/);
 assert.equal(B.questions.filter(q=>q.type==='official').length,190);assert.equal(B.questions.length,1727);assert.equal(new Set(B.questions.map(q=>q.id)).size,1727);
 for(const q of B.questions){assert(q.answer>=1&&q.answer<=4);if(q.knowledge)assert(q.knowledge.tip);assert(fs.existsSync(path.join(root,q.image)));assert(fs.existsSync(path.join(root,q.pageImage)));}
 for(const s of B.sources)assert(fs.existsSync(path.join(root,s.answerFile.split('#')[0])));
 assert.equal(C.validateAttempts(B.questions.map(q=>attempt(q,q.answer)),B.questions,now).length,1727);
});
test('22 supplied papers, complete numbering, reading context and source links',()=>{
 const manifest=require('../data/provided-manifest.json');assert.equal(manifest.exams.length,22);
 for(const e of manifest.exams){const qs=B.questions.filter(q=>q.exam===e.key);assert.equal(qs.length,e.questions.length);assert.deepEqual(qs.map(q=>q.number),Array.from({length:qs.length},(_,i)=>i+1));
  const src=B.sources.find(s=>s.exam===e.key);assert.equal(src.kind,'provided');assert.equal(src.total,qs.length);
  for(const q of qs){const expected=e.questions[q.number-1];assert.equal(q.answer,expected.answer);assert.equal(q.group,expected.group);assert.deepEqual(q.pages,expected.pages);assert(q.pages.includes(q.questionPage));assert.equal(q.images.length,q.pages.length);for(const image of q.images)assert(fs.existsSync(path.join(root,image)));assert(q.pages.every(p=>p<src.answerPage));assert(q.explanationPage>src.answerPage);}
 }
 assert.equal(B.questions.filter(q=>q.type==='provided').length,1537);assert.equal(B.questions.filter(q=>q.level==='N1').length,1577);assert.equal(B.questions.filter(q=>q.level==='N2').length,150);
});
test('Old question identity and XP survive collection expansion; new reading supports review',()=>{
 const old=require('../data/official-bank.json');assert.deepEqual(B.questions.filter(q=>old.questions.some(o=>o.id===q.id)),old.questions);
 const as=old.questions.slice(0,5).map(q=>attempt(q,q.answer));assert.equal(C.growth(as,B.questions,now).total,C.growth(as,old.questions,now).total);
 const reading=B.questions.find(q=>q.type==='provided'&&q.section==='reading');as.push(attempt(reading,wrong(reading)));assert(C.history(as,reading).review);assert.equal(C.growth(as,B.questions,now).total,105);
 const backup={app:'jlpt-solo',version:2,profile,custom:[],attempts:as,notes:{[reading.id]:'阅读笔记'},stars:[reading.id]};assert.deepEqual(C.validateBackup(backup,B.questions,now),backup);
});
test('Duplicate merge, conflicting events and invalid dates/answers',()=>{
 const a=attempt(q,q.answer);assert.equal(C.mergeAttempts([a],[a]).length,1);assert.throws(()=>C.mergeAttempts([a],[{...a,answer:wrong(q)}]));
 assert.throws(()=>C.validateAttempts([{...a,correct:true,answer:0}],B.questions,now));assert.throws(()=>C.validateAttempts([{...a,at:now+300001}],B.questions,now));
 assert.throws(()=>C.validateAttempts([{...a,qid:'unknown'}],B.questions,now));
});
test('Wrong notebook needs distinct dates; recurrence preserves history',()=>{
 let as=[attempt(q,wrong(q),now-DAY),attempt(q,q.answer,now),attempt(q,q.answer,now+1000)];
 assert(C.history(as,q).review);assert.equal(C.history(as,q).recoveryDays,1);
 as.push(attempt(q,q.answer,now+DAY));assert(C.history(as,q).mastered);assert(C.history(as,q).everWrong);
 as.push(attempt(q,wrong(q),now+DAY+1));assert(C.history(as,q).review);assert.equal(C.history(as,q).recoveryDays,0);
});
test('Tokyo day and week boundaries, first accuracy independent of repeats',()=>{
 assert.equal(C.day(Date.parse('2026-10-18T14:59:59Z')),'2026-10-18');assert.equal(C.day(Date.parse('2026-10-18T15:00:00Z')),'2026-10-19');assert.equal(C.weekStart(now),'2026-10-19');
 let as=n2.slice(0,20).map(q=>attempt(q,q.answer));as.push(attempt(n2[0],wrong(n2[0]),now+1000));const s=C.summary(as,B.questions,'N2',now+2000);
 assert.equal(s.accuracy,100);assert.equal(s.latestCorrect,19);assert.equal(C.summary(as,B.questions,'N1',now).seen,0);
});
test('XP empty state, first attempts, no repeated farming and import duplication',()=>{
 let g=C.growth([],B.questions,now);assert.equal(g.total,0);assert.equal(g.level,1);assert.equal(g.needed,100);
 const a=attempt(q,wrong(q));let as=[a];assert.equal(C.growth(as,B.questions,now).total,5);
 as.push(attempt(q,q.answer,now+1000));assert.equal(C.growth(as,B.questions,now).total,20);
 for(let i=0;i<10;i++)as.push(attempt(q,i%2?q.answer:wrong(q),now+2000+i));
 g=C.growth([...as,...as],B.questions,now+3000);assert.equal(g.total,20);assert.equal(g.events.length,2);
 assert.deepEqual(C.growth([...as].reverse(),B.questions,now+3000),C.growth(as,B.questions,now+3000));
});
test('Spaced recovery once per question, review requires first attempt of a new day',()=>{
 let as=[attempt(q,wrong(q),now-2*DAY),attempt(q,q.answer,now-DAY)];let g=C.growth(as,B.questions,now-DAY);
 assert.equal(g.total,30);assert.equal(g.events.filter(e=>e.kind==='recovery').length,1);
 as.push(attempt(q,q.answer,now));g=C.growth(as,B.questions,now);assert.equal(g.total,33);assert.equal(g.todayXP,3);
 as.push(attempt(q,wrong(q),now+DAY),attempt(q,q.answer,now+DAY+1000));assert.equal(C.growth(as,B.questions,now+DAY+2000).total,33);
 as.push(attempt(q,q.answer,now+2*DAY));g=C.growth(as,B.questions,now+2*DAY);assert.equal(g.total,36);assert.equal(g.events.filter(e=>e.kind==='recovery').length,1);
});
test('Daily review reward capped at 20; check-in once at 20 unique questions',()=>{
 const as=n2.slice(0,25).map(q=>attempt(q,q.answer,now-DAY));
 as.push(...n2.slice(0,25).map(q=>attempt(q,q.answer,now)));
 let g=C.growth(as,B.questions,now);assert.equal(g.todayXP,90);assert.equal(g.events.filter(e=>e.kind==='review').length,20);assert.equal(g.checkins,1);assert.equal(g.streak,2);
 as.push(...n2.slice(0,25).map(q=>attempt(q,q.answer,now+1000)));g=C.growth(as,B.questions,now+1000);assert.equal(g.todayXP,90);assert.equal(g.today,25);assert.equal(g.events.filter(e=>e.kind==='checkin').length,2);
 assert.equal(C.growth(as,B.questions,now+DAY).streak,2);assert.equal(C.growth(as,B.questions,now+2*DAY).streak,0);
});
test('Overall XP/check-in spans N1, N2 and custom; exact level thresholds',()=>{
 const custom=C.customQuestions(require('../data/custom-template.json').questions),all=[...B.questions,...custom];
 let as=B.questions.slice(0,10).map(q=>attempt(q,q.answer));as.push(...n2.slice(0,9).map(q=>attempt(q,q.answer)));
 let g=C.growth(as,all,now);assert.equal(g.today,19);assert.equal(g.total,380);
 as.push(attempt(custom[0],custom[0].answer));g=C.growth(as,all,now);assert.equal(g.today,20);assert.equal(g.checkins,1);assert.equal(g.total,430);assert.equal(g.level,3);assert.equal(g.into,180);assert.equal(g.remaining,20);
 const five=B.questions.slice(0,5).map(q=>attempt(q,q.answer));g=C.growth(five,B.questions,now);assert.equal(g.total,100);assert.equal(g.level,2);assert.equal(g.into,0);assert.equal(g.needed,150);
 const threshold=B.questions.slice(0,20).map(q=>attempt(q,q.answer));threshold.push(attempt(B.questions[20],B.questions[20].answer));g=C.growth(threshold,B.questions,now);assert.equal(g.total,450);assert.equal(g.level,4);assert.equal(g.into,0);
 assert.equal(C.summary(as,all,'N2',now).seen,9);
});
test('Solo backup round trip, legacy migration, no credentials or trusted XP',()=>{
 const custom=C.customQuestions(require('../data/custom-template.json').questions),data={app:'jlpt-solo',version:2,profile,custom,attempts:[attempt(custom[0],custom[0].answer)],notes:{[custom[0].id]:'笔记'},stars:[custom[0].id]};
 const restored=C.validateBackup(JSON.parse(JSON.stringify(data)),B.questions,now);assert.deepEqual(restored,data);
 const legacy={...data,app:'jlpt-duo',version:1,connection:{url:'obsolete-service',token:'private'},peer:{name:'old'},invite:'old-code',xp:999999,level:999};
 const migrated=C.validateBackup(legacy,B.questions,now);assert.deepEqual(migrated,data);assert.equal(C.growth(migrated.attempts,[...B.questions,...custom],now).total,20);
 assert(!JSON.stringify(migrated).includes('private'));assert.throws(()=>C.validateBackup({...data,version:9},B.questions,now));assert.throws(()=>C.customQuestions([{...custom[0],id:q.id}]));
});
test('Single learner app contains no network handlers or room UI',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert(!/fetch\(|XMLHttpRequest|WebSocket|function sync|create-room|join-room|sync-state/.test(app+html));
 assert(!/双人|同伴|排行榜|ふたり/.test(app+html));assert(html.includes('data-view="growth"'));assert(!fs.existsSync(path.join(root,'server/server.cjs')));
});
test('N2 official workbooks contain two complete 75-question written sets and both answer pages',()=>{
 for(const year of ['2012','2018']){
  const qs=B.questions.filter(q=>q.level==='N2'&&(q.exam||'2018')===year).sort((a,b)=>a.number-b.number);
  assert.deepEqual(qs.map(q=>q.number),Array.from({length:75},(_,i)=>i+1));
  assert.equal(qs.filter(q=>q.section==='vocab').length,32);assert.equal(qs.filter(q=>q.section==='grammar').length,22);assert.equal(qs.filter(q=>q.section==='reading').length,21);
  for(const q of qs.filter(q=>q.images)){const src=B.sources.find(s=>s.id===q.sourceId);assert(q.pages.includes(q.questionPage));assert.equal(q.images.length,q.pages.length);for(const file of [...q.images,src.answerImages[q.answerPage-1]])assert(fs.existsSync(path.join(root,file)));}
  const last=qs.at(-1);assert.equal(last.answerPage,2);assert(last.pages.length>1);
 }
});
test('Knowledge covers all 1136 built-in vocabulary and grammar questions with bidirectional source links',()=>{
 const K=require('../data/knowledge-bank.json'),KC=require('../knowledge-core.js'),idx=KC.index(K);
 const allExpected=B.questions.filter(q=>q.section!=='reading');assert.equal(allExpected.length,1136);assert.equal(K.linkedQuestions,1136);assert.equal(K.cards.length,1049);
 for(const q of allExpected)assert(idx.byQuestion.has(q.id),q.id);
 const n2Entries=require('../data/knowledge-n2.json');assert.equal(n2Entries.length,59);
 for(const e of n2Entries){assert.equal(e.origin,'independent');assert.equal(e.pages.length,0);assert(e.meaning&&e.tip);assert(idx.byQuestion.has(e.qid));}
 const vm=require('node:vm'),ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'data/knowledge-bank.js'),'utf8'),ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.JLPT_KNOWLEDGE)),K);
 const expected=B.questions.filter(q=>q.type==='provided'&&q.section!=='reading');assert.equal(expected.length,988);
 for(const q of expected){const cards=idx.byQuestion.get(q.id);assert(cards?.length);for(const c of cards){assert.equal(c.level,q.level);assert.equal(c.section,q.section);const e=c.entries.find(e=>e.qid===q.id);assert(e.meaning.length>1);assert(e.pages.length);assert(e.pages.every(p=>p>B.sources.find(s=>s.id===q.sourceId).answerPage));}}
 assert.equal(new Set(K.cards.map(k=>k.id)).size,K.cards.length);
 for(const c of K.cards){assert(c.term&&c.meaning);assert.deepEqual(c.qids,c.entries.map(e=>e.qid));for(const id of c.qids)assert(B.questions.some(q=>q.id===id));}
 assert(!/〔字形|\(cid:/.test(JSON.stringify(K)));
 for(const q of require('../data/official-bank.json').questions)assert(idx.byQuestion.has(q.id));
});
test('Knowledge review state follows existing attempts, stars and recovery without changing XP',()=>{
 const K=require('../data/knowledge-bank.json'),KC=require('../knowledge-core.js'),idx=KC.index(K),qm=new Map(B.questions.map(q=>[q.id,q]));
 const id='provided-N1-2021-07-27',q=qm.get(id),k=idx.byQuestion.get(id)[0];assert(k.qids.length>=2);
 const as=[attempt(q,wrong(q),now-2*DAY)],before=C.growth(as,B.questions,now).total;
 let h=KC.status(k,qm,q=>C.history(as,q),[id]);assert(h.review&&h.everWrong&&h.star);assert.equal(h.seen,1);
 for(let i=0;i<10;i++)KC.status(k,qm,q=>C.history(as,q),[]);assert.equal(C.growth(as,B.questions,now).total,before);assert.equal(as.length,1);
 as.push(attempt(q,q.answer,now-DAY),attempt(q,q.answer,now));h=KC.status(k,qm,q=>C.history(as,q),[]);assert(!h.review&&h.everWrong);
 const data={app:'jlpt-solo',version:2,profile,custom:[],attempts:as,stars:[id],notes:{[id]:'极其；ナ形容词词干'}};assert.deepEqual(C.validateBackup(JSON.parse(JSON.stringify(data)),B.questions,now),data);
});
(async()=>{for(const [name,fn]of tests){await fn();console.log('PASS '+name);}console.log(`PASS ${tests.length} test groups`);})().catch(e=>{console.error(e);process.exitCode=1;});
