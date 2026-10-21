'use strict';
(function(root){
 function index(data){
  const byId=new Map(),byQuestion=new Map();
  for(const card of data.cards){byId.set(card.id,card);for(const qid of card.qids){if(!byQuestion.has(qid))byQuestion.set(qid,[]);byQuestion.get(qid).push(card);}}
  return {byId,byQuestion};
 }
 function status(card,questionMap,history,stars){
  const qs=card.qids.map(id=>questionMap.get(id)).filter(Boolean),hs=qs.map(history);
  return {review:hs.some(h=>h.review),everWrong:hs.some(h=>h.everWrong),seen:hs.filter(h=>h.first).length,total:qs.length,star:card.qids.some(id=>stars.includes(id))};
 }
 const api={index,status};if(typeof module==='object'&&module.exports)module.exports=api;else root.JLPT_KNOWLEDGE_CORE=api;
})(typeof window==='object'?window:globalThis);
