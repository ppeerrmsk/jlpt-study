"""Build a bidirectional knowledge bank from reviewed, source-linked entries."""
from pathlib import Path
import json,hashlib,re,unicodedata
root=Path(__file__).resolve().parents[1]
bank=json.loads((root/'data/bank.json').read_text(encoding='utf-8'))
questions={q['id']:q for q in bank['questions']}
entries=[]
for q in bank['questions']:
 if q.get('knowledge'):entries.append(dict(q['knowledge'],qid=q['id'],section=q['section'],origin='independent',pages=[]))
entries+=json.loads((root/'data/knowledge-provided.json').read_text(encoding='utf-8'))
cloze=root/'data/knowledge-cloze.json'
if cloze.exists():entries+=json.loads(cloze.read_text(encoding='utf-8'))
n2=root/'data/knowledge-n2.json'
if n2.exists():entries+=json.loads(n2.read_text(encoding='utf-8'))
cards={};seen=set()
for e in entries:
 assert e['qid'] in questions and e['qid'] not in seen,e['qid'];seen.add(e['qid'])
 q=questions[e['qid']];e.setdefault('reading','');e.setdefault('tip','');e.setdefault('origin','provided')
 assert e['term'] and e['meaning'] and not re.search(r'〔字形|\(cid:',json.dumps(e,ensure_ascii=False)),e['qid']
 # Normalize typography only. Do not merge distinct inflections or grammar meanings.
 key=q['level']+'|'+q['section']+'|'+re.sub(r'\s+','',unicodedata.normalize('NFKC',e['term']))
 if key not in cards:cards[key]={'id':'knowledge-'+hashlib.sha256(key.encode()).hexdigest()[:16],'level':q['level'],'section':q['section'],'term':e['term'],'reading':e['reading'],'meaning':e['meaning'],'qids':[],'entries':[]}
 cards[key]['qids'].append(e['qid']);cards[key]['entries'].append(e)
data={'version':1,'updated':'2026-10-19','linkedQuestions':len(seen),'cards':list(cards.values())}
(root/'data/knowledge-bank.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'data/knowledge-bank.js').write_text('window.JLPT_KNOWLEDGE = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('Knowledge:',len(cards),'cards,',len(seen),'linked questions')
