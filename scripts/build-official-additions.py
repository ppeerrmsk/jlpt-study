"""Merge reviewed official workbooks; retain existing question identities."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
bank=json.loads((root/'data/bank.json').read_text(encoding='utf-8'))
extra=json.loads((root/'data/official-additions.json').read_text(encoding='utf-8'))
for key in ['questions','sources']:
 items={item['id']:item for item in bank[key]}
 for item in extra[key]:items[item['id']]=item
 bank[key]=list(items.values())
(root/'data/bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'data/bank.js').write_text('window.JLPT_BANK = '+json.dumps(bank,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('Bank:',len(bank['questions']),'questions')
