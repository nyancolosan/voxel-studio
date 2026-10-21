"""Assemble the single-file app: src/index.template.html + src/app.js + data/sample.json -> dist/voxel_studio.html

The Claude artifact must be ONE html file, so the app is authored in pieces and inlined here.
Usage: python3 tools/build.py
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(ROOT, *a)
tpl = open(p('src', 'index.template.html'), encoding='utf-8').read()
js = open(p('src', 'app.js'), encoding='utf-8').read()
sample = json.load(open(p('data', 'sample.json'), encoding='utf-8'))
sample.setdefault('name', 'オーク')
assert '/*__SAMPLE__*/null' in js and '/*__APP_JS__*/' in tpl
js = js.replace('/*__SAMPLE__*/null', json.dumps(sample, ensure_ascii=False))
out = tpl.replace('/*__APP_JS__*/', js)
os.makedirs(p('dist'), exist_ok=True)
open(p('dist', 'voxel_studio.html'), 'w', encoding='utf-8').write(out)
print('dist/voxel_studio.html', len(out.encode('utf-8')), 'bytes')
