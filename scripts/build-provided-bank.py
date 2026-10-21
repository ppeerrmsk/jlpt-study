"""Rebuild the supplied N1 collection from unchanged PDFs and reviewed page mappings.
Usage: python scripts/build-provided-bank.py --input C:/path/to/JLPT
Dependencies: pypdfium2, Pillow. The manifest is the reviewed question/answer index.
"""
from pathlib import Path
import argparse,hashlib,json,shutil
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser();args.add_argument('--input',type=Path,required=True);opts=args.parse_args()
manifest=json.loads((ROOT/'data/provided-manifest.json').read_text(encoding='utf-8'))
bank=json.loads((ROOT/'data/bank.json').read_text(encoding='utf-8'))
bank['questions']=[q for q in bank['questions'] if q['type']!='provided']
bank['sources']=[s for s in bank['sources'] if s.get('kind')!='provided']
for exam in manifest['exams']:
    key=exam['key'];original=opts.input/exam['file'];digest=hashlib.sha256(original.read_bytes()).hexdigest()
    assert digest==exam['sha256'],f'Source changed: {original.name}'
    pdf_rel=f'sources/provided/N1-{key}.pdf';pdf_target=ROOT/pdf_rel;pdf_target.parent.mkdir(parents=True,exist_ok=True)
    if not pdf_target.exists() or hashlib.sha256(pdf_target.read_bytes()).hexdigest()!=digest:shutil.copy2(original,pdf_target)
    dest=ROOT/'assets/provided'/key;dest.mkdir(parents=True,exist_ok=True)
    needed={n for q in exam['questions'] for n in q['pages']}|{exam['answerPage']}
    with pdfium.PdfDocument(original) as doc:
        for n in sorted(needed):
            image=dest/f'page-{n:02}.webp'
            if not image.exists():
                doc[n-1].render(scale=2.3).to_pil().convert('RGB').save(image,format='WEBP',quality=92,method=4)
    source_id='provided-N1-'+key
    bank['sources'].append(dict(id=source_id,kind='provided',exam=key,level='N1',title=exam['title'],originalName=exam['file'],file=pdf_rel,answerFile=pdf_rel+'#page='+str(exam['answerPage']),answerImage=f'assets/provided/{key}/page-{exam["answerPage"]:02}.webp',answerPage=exam['answerPage'],explanationPage=exam['answerPage']+1,sha256=digest,total=len(exam['questions']),sections=exam['sections'],issues=exam['issues']))
    for item in exam['questions']:
        n=item['number'];g=item['group'];section='vocab' if g<=4 else 'grammar' if g<=7 else 'reading'
        images=[f'assets/provided/{key}/page-{p:02}.webp' for p in item['pages']]
        bank['questions'].append(dict(id=f'provided-N1-{key}-{n}',type='provided',level='N1',section=section,group=g,number=n,exam=key,sourceId=source_id,image=images[0],pageImage=f'assets/provided/{key}/page-{item["page"]:02}.webp',images=images,pages=item['pages'],questionPage=item['page'],answer=item['answer'],searchText=item['searchText'],sourceNote=item.get('note',''),explanationPage=item['explanationPage']))
    print(key,len(exam['questions']),'questions;',len(needed),'pages',flush=True)
bank.update(version=2,id='jlpt-n1-collection-20261019',stats={'official':sum(q['type']=='official' for q in bank['questions']),'provided':sum(q['type']=='provided' for q in bank['questions']),'exams':len(manifest['exams'])})
(ROOT/'data/bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'data/bank.js').write_text('globalThis.JLPT_BANK = '+json.dumps(bank,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('TOTAL',len(bank['questions']))
