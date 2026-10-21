'use strict';
const assert=require('node:assert/strict'),C=require('../core.js'),G=require('../game-core.js'),B=require('../data/bank.json');
const qs=B.questions,now=Date.parse('2026-10-20T02:00:00Z'),day=86400000,pool=qs.filter(q=>q.level==='N2'&&q.section!=='reading'),byId=new Map(qs.map(q=>[q.id,q]));
let n=0;const tests=[],test=(name,fn)=>tests.push([name,fn]);
const attempt=(q,correct=true,at=now)=>({id:'event-'+String(++n).padStart(12,'0'),qid:q.id,answer:correct?q.answer:q.answer%4+1,at});
function run(mode='quick',answers,offset=0){const q=pool.slice(offset,offset+G.MODES[mode].size),as=q.map((q,i)=>attempt(q,answers?.[i]??true,now+i));return {as,r:{id:'run-'+String(++n).padStart(12,'0'),mode,level:'N2',started:now,qids:q.map(q=>q.id),attemptIds:as.map(a=>a.id)}};}
test('Short rounds are unique, omit reading/custom and prioritize unseen questions',()=>{
 const as=pool.slice(0,10).map(q=>attempt(q));for(const mode of ['quick','combo']){const ids=G.pick(mode,'N2',qs,as,now,()=>.5);assert.equal(ids.length,G.MODES[mode].size);assert.equal(new Set(ids).size,ids.length);assert(ids.every(id=>byId.get(id).level==='N2'&&byId.get(id).section!=='reading'&&!as.some(a=>a.qid===id)));}
 assert.deepEqual(G.pick('review','N2',qs,as,now),[]);
 const wrong=pool.slice(20,25).map(q=>attempt(q,false));assert.deepEqual(new Set(G.pick('review','N2',qs,[...as,...wrong],now)),new Set(wrong.map(a=>a.qid)));
});
test('Combo scoring, cap, wrong reset, grades and partial sessions',()=>{
 let {r,as}=run('combo');let s=G.score(r,as,qs);assert.equal(s.points,1700);assert.equal(s.bestCombo,10);assert.equal(s.rank,'S');assert.equal(s.stars,3);
 ({r,as}=run('quick',[true,true,false,true,true]));s=G.score(r,as,qs);assert.equal(s.points,440);assert.equal(s.bestCombo,2);assert.equal(s.combo,2);assert.equal(s.rank,'A');assert.equal(s.stars,2);
 r.attemptIds.pop();assert.equal(G.score(r,as,qs).complete,false);assert.equal(G.score(r,as,qs).rank,'—');
 for(const [answers,rank]of [[[true,true,true,false,false],'B'],[[false,false,false,false,false],'C']]){const {r,as}=run('quick',answers);assert.equal(G.score(r,as,qs).rank,rank);}
});
test('Backup retains partial run, validates references and ignores forged totals',()=>{
 const {r,as}=run();r.attemptIds=r.attemptIds.slice(0,2);const game={...G.empty(),runs:[r],activeId:r.id,score:999999,stars:999999},backup={app:'jlpt-solo',version:2,profile:{id:'abcdefghijklmnop',name:'游戏测试',level:'N2'},attempts:as.slice(0,2),custom:[],stars:[],notes:{},game};
 const restored=C.validateBackup(JSON.parse(JSON.stringify(backup)),qs,now+1000);assert.equal(restored.game.runs[0].attemptIds.length,2);assert.equal(restored.game.activeId,r.id);assert(!('stars'in restored.game));assert.equal(G.overview(restored.game,restored.attempts,qs,now).stars,0);
 const bad=JSON.parse(JSON.stringify(game));bad.runs[0].attemptIds.reverse();assert.throws(()=>G.validate(bad,as,qs,now+1000));
 bad.runs[0].attemptIds=['missing-event'];assert.throws(()=>G.validate(bad,as,qs,now+1000));
 bad.runs[0].qids[1]=bad.runs[0].qids[0];assert.throws(()=>G.validate(bad,as,qs,now+1000));
 assert.throws(()=>G.validate({...G.empty(),runs:[{...r,qids:[qs.find(q=>q.section==='reading').id,...r.qids.slice(1)]}]},as,qs,now+1000));
});
test('Backup merging is idempotent, resumes longest prefix and detects divergent sessions',()=>{
 const {r,as}=run(),a={...G.empty(),runs:[{...r,attemptIds:r.attemptIds.slice(0,2)}],activeId:r.id},b={...G.empty(),runs:[r]};
 const merged=G.merge(a,b,as,qs,now+1000);assert.equal(merged.runs.length,1);assert.equal(merged.runs[0].attemptIds.length,5);assert.equal(merged.activeId,null);assert.deepEqual(G.merge(merged,b,as,qs,now+1000),merged);
 const alt=attempt(pool[0],false),different={...a,runs:[{...r,attemptIds:[alt.id]}]};assert.throws(()=>G.merge(a,different,[...as,alt],qs,now+1000));
 assert.throws(()=>G.validate({...G.empty(),runs:[r,{...r,id:'another-run-12345'}]},as,qs,now+1000));
});
test('Daily tasks count distinct questions, completed rounds only and Tokyo boundaries',()=>{
 const {r,as}=run(),game={...G.empty(),runs:[r]};let g=G.overview(game,as,qs,now+1000);assert.deepEqual(g.today.map(t=>t.value),[5,5,5]);assert.equal(g.stars,5); // one daily star + two achievements
 const repeat=run();game.runs.push(repeat.r);g=G.overview(game,[...as,...repeat.as],qs,now+1000);assert.deepEqual(g.today.map(t=>t.value),[5,5,5]);assert.equal(g.stars,5);
 const next=run('quick',undefined,5);game.runs.push(next.r);g=G.overview(game,[...as,...repeat.as,...next.as],qs,now+1000);assert.deepEqual(g.today.map(t=>t.done),[true,true,true]);assert.equal(g.stars,10);
 const future=G.overview(game,[...as,...repeat.as,...next.as],qs,now+day);assert.equal(future.today[0].value,0);assert.equal(future.stars,10);
 const boundary=Date.parse('2026-10-20T15:00:00Z'),answers=pool.slice(0,5).map(q=>attempt(q,true,boundary-1));assert.equal(G.overview(G.empty(),answers,qs,boundary).today[0].value,0);
 assert.equal(G.overview(G.empty(),answers,qs,boundary-1).today[0].value,5);
});
test('Best scores are separate by level/mode and do not alter original XP',()=>{
 const {r,as}=run('combo'),game={...G.empty(),runs:[r]};const before=C.growth(as,qs,now+1000);const g=G.overview(game,as,qs,now+1000);assert.equal(g.best['N2:combo'].points,1700);assert(!g.best['N1:combo']);assert(!g.best['N2:quick']);assert(g.badges.find(b=>b.id==='combo').unlocked);assert.deepEqual(C.growth(as,qs,now+1000),before);
});
test('A recovery achievement stays unlocked if a formerly recovered question is wrong again',()=>{
 const as=pool.slice(0,10).flatMap(q=>[attempt(q,false,now-3*day),attempt(q,true,now-2*day),attempt(q,true,now-day)]),game=G.empty();
 const before=G.overview(game,as,qs,now);assert(before.badges.find(b=>b.id==='recovery').unlocked);
 as.push(attempt(pool[0],false,now));const after=G.overview(game,as,qs,now);assert(after.badges.find(b=>b.id==='recovery').unlocked);assert.equal(after.stars,before.stars);
});
for(const [name,fn]of tests){fn();console.log('PASS '+name);}console.log(`PASS ${tests.length} game test groups`);
