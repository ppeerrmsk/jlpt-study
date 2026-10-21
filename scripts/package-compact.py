"""Build a complete portable ZIP using losslessly deduplicated supplied PDFs.

Usage: python scripts/package-compact.py
Requires pypdf and pypdfium2 only when preparing PDFs; no learning-time dependency.
The source application and source PDFs are never overwritten.
"""
from pathlib import Path
import argparse,hashlib,json,logging,tempfile,zipfile

ROOT=Path(__file__).resolve().parents[1]
NAME='刷题工具-N1-N2-无损精简版.zip'
sha=lambda data:hashlib.sha256(data).hexdigest()
SKIP={'server','runtime','__pycache__','node_modules','.git'}

def prepare(work):
    from pypdf import PdfWriter
    import pypdfium2 as pdfium
    logging.getLogger('pypdf').setLevel(logging.ERROR)
    rows=[]
    for src in sorted((ROOT/'sources/provided').glob('*.pdf')):
        rel=src.relative_to(ROOT).as_posix();out=work/rel;out.parent.mkdir(parents=True,exist_ok=True)
        writer=PdfWriter(clone_from=src)
        writer.compress_identical_objects(remove_duplicates=True,remove_unreferenced=True)
        writer.write(out);writer.close()
        a=pdfium.PdfDocument(src);b=pdfium.PdfDocument(out)
        assert len(a)==len(b),(rel,'page count')
        hashes=[]
        for i in range(len(a)):
            ap,bp=a[i],b[i]
            assert ap.get_size()==bp.get_size(),(rel,i+1,'page dimensions')
            for scale in ([1,2] if i in {0,8,len(a)//2,len(a)-1} else [1]):
                ba,bb=ap.render(scale=scale),bp.render(scale=scale)
                ia,ib=ba.to_pil(),bb.to_pil()
                digest=sha(ia.tobytes())
                assert ia.size==ib.size and digest==sha(ib.tobytes()),(rel,i+1,scale,'render mismatch')
                if scale==1:hashes.append(digest)
                ia.close();ib.close();ba.close();bb.close()
            ap.close();bp.close()
        rows.append(dict(file=rel,originalBytes=src.stat().st_size,compressedBytes=out.stat().st_size,
                         originalSha256=sha(src.read_bytes()),compressedSha256=sha(out.read_bytes()),
                         pages=len(a),allPagesPixelIdenticalAt72dpi=True,sampledPagesPixelIdenticalAt144dpi=True,
                         pageRenderSha256=hashes))
        a.close();b.close()
        print(rel,'verified',flush=True)
    report={'method':'pypdf duplicate-object sharing and removal of unreferenced objects; no image re-encoding, downsampling, page deletion or text changes','files':rows}
    (work/'compression-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report

def build(work,report):
    rows=report['files']
    expected={p.relative_to(ROOT).as_posix() for p in (ROOT/'sources/provided').glob('*.pdf')}
    assert len(rows)==22 and {r['file'] for r in rows}==expected
    for r in rows:
        assert r['allPagesPixelIdenticalAt72dpi'] and r['sampledPagesPixelIdenticalAt144dpi']
        assert len(r['pageRenderSha256'])==r['pages']
        assert sha((ROOT/r['file']).read_bytes())==r['originalSha256'],r['file']
        assert sha((work/r['file']).read_bytes())==r['compressedSha256'],r['file']
    originals=sum(r['originalBytes'] for r in rows);compressed=sum(r['compressedBytes'] for r in rows)
    note=f'''# 无损精简版说明

日期：2026-10-21。

本包保留 1,727 道题、1,049 张知识卡、全部题图、原版解析、错题本、经验值、挑战玩法、音效动画与外观设置。没有降低图片分辨率或重新有损编码，也没有删除 PDF 页面。

22 份 N1 PDF 通过共享重复嵌入对象、清理未引用对象缩小体积：合计 {originals/1e6:.2f} MB → {compressed/1e6:.2f} MB。所有 {sum(r['pages'] for r in rows):,} 页在同一渲染器 72 dpi 下逐像素一致，另抽取每份 4 页在 144 dpi 下比对一致。页码、尺寸、题面、署名、水印和解析保留。其他题库数据、知识库和刷题图片与完整版本相同。

PDF 文件字节与原件不同。`data/provided-manifest.json`、题库来源中的 SHA-256 和较早验证记录仍指原始上传文件；本包文件校验以 `manifest-sha256.json` 为准。压缩前后哈希及逐页核对结果见 `data/compact-pdf-manifest.json`。

使用方法不变：完整解压后打开 `index.html` 或“开始学习.cmd”。更新前先导出学习 JSON 备份，换文件夹后需要时恢复备份。原题 ID、答题格式、收藏与 XP 规则没有变化；笔记编辑功能已移除，旧备份仍可恢复。

开发维护：运行 `python scripts/package-compact.py` 可重建精简 ZIP，依赖 pypdf 与 pypdfium2。普通学习无需这些依赖。`build-provided-bank.py` 仍要求原始上传 PDF，不接受以精简 PDF 冒充原件；若重建原图后再次打包，请使用本精简打包脚本。
'''
    overlays={r['file']:(work/r['file']).read_bytes() for r in rows}
    overlays['docs/无损精简版说明.md']=note.encode('utf-8')
    overlays['data/compact-pdf-manifest.json']=json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8')
    guide=(ROOT/'使用说明.txt').read_text(encoding='utf-8')
    guide=guide.replace('（知识库与 N2 扩充版）','（无损精简版）')
    guide=guide.replace('原 PDF 按字节原样保留','本精简包中的 N1 PDF 已做无损对象去重，文件哈希不同于原件，详见 docs/无损精简版说明.md')
    guide=guide.replace('python scripts/package.py','python scripts/package-compact.py')
    guide=guide.replace('刷题工具-N1-N2-完整版.zip',NAME)
    overlays['使用说明.txt']=guide.encode('utf-8')
    app=(ROOT/'app.js').read_text(encoding='utf-8').replace('保留原始文件、版面、水印及解析','PDF 已无损精简，保留原版面、水印及解析')
    overlays['app.js']=app.encode('utf-8')
    doc_replacements={
        'docs/SPEC.md':('用户 PDF 按原字节随包保存','用户 PDF 的原版内容随包保存；本精简包做了无损对象去重'),
        'docs/N1题库收录清单.md':('源文件未修改。','原始源文件未修改；本精简包使用内容相同的无损去重 PDF，校验见“无损精简版说明.md”。'),
        'docs/验证记录.md':('用户提供的 22 份 N1 PDF 原样保存','用户提供的 22 份 N1 PDF 原版内容保留（本精简包另做无损去重，见“无损精简版说明.md”）'),
    }
    for rel,(old,new) in doc_replacements.items():
        overlays[rel]=(ROOT/rel).read_text(encoding='utf-8').replace(old,new).encode('utf-8')
    sources={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if p.is_file() and not SKIP.intersection(p.relative_to(ROOT).parts) and p.name!='manifest-sha256.json' and p.suffix!='.tmp'}
    names=sorted(set(sources)|set(overlays));manifest={}
    final_target=ROOT.parent/NAME
    target=final_target.with_suffix('.zip.tmp')
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name in names:
            data=overlays[name] if name in overlays else sources[name].read_bytes()
            manifest[name]=sha(data);z.writestr('jlpt-study/'+name,data)
        z.writestr('jlpt-study/manifest-sha256.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8'))
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for name,digest in manifest.items():assert sha(z.read('jlpt-study/'+name))==digest,name
        assert not any('/runtime/' in n or '/server/' in n or 'preview-records' in n for n in z.namelist())
        # The exact bank/knowledge IDs, learning core and every practice image stay unchanged.
        for name in names:
            if name.startswith(('assets/','data/bank.','data/knowledge-')) or name in {'core.js','game-core.js','preferences-core.js','feedback.js','knowledge-core.js','index.html','style.css'}:
                assert z.read('jlpt-study/'+name)==(ROOT/name).read_bytes(),name
    assert target.stat().st_size<300_000_000,'Package did not meet the 300 MB target'
    digest=sha(target.read_bytes())
    target.replace(final_target)
    target=final_target
    target.with_suffix('.zip.sha256.txt').write_text(digest+'  '+target.name+'\n',encoding='utf-8')
    print(json.dumps({'zip':str(target),'bytes':target.stat().st_size,'sha256':digest,'pdfPagesVerified':sum(r['pages'] for r in rows),'files':len(names)+1},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prepared-dir',type=Path,help='Reuse a hash-checked preparation directory with a completed render audit')
    args=parser.parse_args()
    if args.prepared_dir:
        build(args.prepared_dir,json.loads((args.prepared_dir/'compression-audit.json').read_text(encoding='utf-8')))
    else:
        with tempfile.TemporaryDirectory(prefix='jlpt-pdf-compact-') as folder:
            work=Path(folder);build(work,prepare(work))
