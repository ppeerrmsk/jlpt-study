"""Build original question crops; requires pdfplumber, pypdfium2, Pillow.
Input official PDFs are in ../../tmp/jlpt. Never use extracted text as the question face.
"""
from pathlib import Path
import json, re, shutil, hashlib, unicodedata
import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT.parent / 'tmp' / 'jlpt'
notes = json.loads((ROOT / 'data' / 'knowledge.json').read_text(encoding='utf-8'))
questions, sources = [], []
for level, total, vocab in [('N1',40,25),('N2',49,32)]:
    answer_file = INPUT / f'2018-{level}-answer.pdf'
    with pdfplumber.open(answer_file) as d:
        lines = unicodedata.normalize('NFKC',d.pages[0].extract_text()).splitlines()
    answers, groups = {}, {}
    for i,line in enumerate(lines):
        m=re.match(r'問題\s*(\d+)\s+([\d ]+)$',line)
        if not m: continue
        nums=list(map(int,m[2].split()))
        vals=list(map(int,lines[i+1].split()))
        assert len(nums)==len(vals)
        for n,v in zip(nums,vals): answers[n]=v; groups[n]=int(m[1])
    shutil.copy2(answer_file, ROOT/'sources'/answer_file.name)
    for part in ['V','G']:
        path=INPUT/f'2018-{level}-{part}.pdf'
        source_id=f'jlpt-2018-{level}-{part}'
        sources.append(dict(id=source_id,title=f'2018 官方问题集第二集 {level} '+('文字・語彙' if part=='V' else '文法（句子与排序）'),url=f'https://www.jlpt.jp/samples/sample2018/pdf/{level}{part}.pdf',answerUrl=f'https://www.jlpt.jp/samples/sample2018/pdf/{level}answer.pdf',answerFile=f'sources/2018-{level}-answer.pdf',sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
        n=0 if part=='V' else vocab
        rendered=pdfium.PdfDocument(path)
        with pdfplumber.open(path) as doc:
            for pi,page in enumerate(doc.pages):
                if (part=='V' and pi<2) or (part=='G' and pi>=4): continue
                ys=sorted(set(round(c['top'],1) for c in page.chars if c['text'].startswith('(cid') and 60<c['x0']<90))
                if not ys: continue
                full=rendered[pi].render(scale=2).to_pil().convert('RGB')
                page_image=f'assets/{level}-{part}-page-{pi+1}.webp'
                full.save(ROOT/page_image,format='WEBP',quality=92)
                for idx,y in enumerate(ys):
                    n+=1
                    top=max(35,y-18)
                    bottom=ys[idx+1]-18 if idx+1<len(ys) else 780
                    chars=[c for c in page.chars if 60<c['x0']<565 and top<=c['top'] and c['bottom']<=bottom]
                    bottom=min(bottom,max(c['bottom'] for c in chars)+18)
                    crop=full.crop((110,round(top*2),1130,round(bottom*2)))
                    image=f'assets/{level}-{n:02}.webp'
                    crop.save(ROOT/image,format='WEBP',quality=94)
                    text=page.crop((55,top,565,bottom)).extract_text() or ''
                    text=re.sub(r'\(cid:\d+\)','',text)
                    text='\n'.join(x for x in text.splitlines() if x.strip() not in ['文','字','・','語','彙','法'])
                    k=notes[level][n-1]
                    questions.append(dict(id=f'official-2018-{level}-{n}',level=level,section='vocab' if part=='V' else 'grammar',group=groups[n],number=n,sourceId=source_id,image=image,pageImage=page_image,answer=answers[n],searchText=text,knowledge=dict(term=k[0],reading=k[1],meaning=k[2],tip=k[3]),type='official'))
        assert n==(vocab if part=='V' else total),(level,part,n)
official=dict(version=1,id='jlpt-2018-v1',questions=questions,sources=sources)
(ROOT/'data'/'official-bank.json').write_text(json.dumps(official,ensure_ascii=False,indent=2),encoding='utf-8')
previous=json.loads((ROOT/'data'/'bank.json').read_text(encoding='utf-8')) if (ROOT/'data'/'bank.json').exists() else {}
original_ids={q['id'] for q in questions}
provided=[q for q in previous.get('questions',[]) if q['id'] not in original_ids]
original_sources={s['id'] for s in sources}
extra_sources=[s for s in previous.get('sources',[]) if s['id'] not in original_sources]
bank=dict(version=2 if provided else 1,id='jlpt-n1-collection-20261019' if provided else 'jlpt-2018-v1',questions=questions+provided,sources=sources+extra_sources)
(ROOT/'data'/'bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'data'/'bank.js').write_text('globalThis.JLPT_BANK = '+json.dumps(bank,ensure_ascii=False)+';\n',encoding='utf-8')
print(json.dumps({'questions':len(questions),'N1':sum(q['level']=='N1' for q in questions),'N2':sum(q['level']=='N2' for q in questions),'sources':len(sources)}))
