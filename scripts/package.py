from pathlib import Path
import hashlib, json, zipfile

root=Path(__file__).resolve().parents[1]
target=root.parent/'刷题工具-N1-N2-完整版.zip'
files=[]
for p in sorted(root.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(root)
    if any(x in rel.parts for x in ['server','runtime','__pycache__','node_modules','.git']): continue
    if p.name=='manifest-sha256.json' or p.suffix=='.tmp': continue
    files.append((p,rel))
manifest={str(rel).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p,rel in files}
manifest_path=root/'manifest-sha256.json'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
files.append((manifest_path,Path('manifest-sha256.json')))
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p,rel in files: z.write(p,'jlpt-study/'+str(rel).replace('\\','/'))
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    for rel,digest in manifest.items(): assert hashlib.sha256(z.read('jlpt-study/'+rel)).hexdigest()==digest
    assert not any('/runtime/' in n or '/server/' in n or '同步服务' in n or 'preview-records' in n for n in z.namelist())
checksum=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256.txt').write_text(checksum+'  '+target.name+'\n',encoding='utf-8')
print(json.dumps({'zip':str(target),'bytes':target.stat().st_size,'files':len(files),'sha256':checksum},ensure_ascii=False))
