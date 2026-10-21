"""Rebuild data/sample.json (the orc) from the boxes in tools/build_orc.py."""
import math, base64, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'tools', 'build_orc.py')).read()
src = src.split('FACES =')[0]
src = src.replace("def lin(h):", "def lin(h):\n    return h.upper()\ndef _unused(h):")
ns = {}
exec(src, ns)
P = ns['P']
PARTS = {'Spine': 0, 'Hips': 1, 'Head': 2, 'UpperArm.L': 3, 'LowerArm.L': 4, 'UpperArm.R': 5,
         'LowerArm.R': 6, 'UpperLeg.L': 7, 'LowerLeg.L': 8, 'UpperLeg.R': 9, 'LowerLeg.R': 10}
W, H, D = 64, 96, 64
OX, OZ = 32, 32
def rng(a, b, off):
    r0 = math.floor(a * 2 + 0.5) + off; r1 = math.floor(b * 2 + 0.5) + off
    if r1 <= r0:
        if (a + b) / 2 > 0: r0 = r1 - 1
        else: r1 = r0 + 1
    return r0, r1
vox = {}
palette = []
for bone, boxes in P.items():
    for (mn, mx, col) in boxes:
        if col not in palette: palette.append(col)
        ci = palette.index(col) + 1
        x0, x1 = rng(mn[0], mx[0], OX); y0, y1 = rng(mn[1], mx[1], 0); z0, z1 = rng(mn[2], mx[2], OZ)
        for x in range(x0, x1):
            for y in range(y0, y1):
                for z in range(z0, z1):
                    vox[(x, y, z)] = (ci, PARTS[bone])
b = bytearray()
for (x, y, z), (c, p) in sorted(vox.items()):
    assert 0 <= x < W and 0 <= y < H and 0 <= z < D
    b += bytes([x, y, z, c, p])
data = {'name': 'オーク', 'w': W, 'h': H, 'd': D, 'unit': 2.5, 'palette': ['#' + c.lstrip('#') for c in palette],
        'vox': base64.b64encode(bytes(b)).decode()}
json.dump(data, open(os.path.join(ROOT, 'data', 'sample.json'), 'w'))
ys = [k[1] for k in vox]; xs = [k[0] for k in vox]; zs = [k[2] for k in vox]
print(len(vox), 'voxels', len(data['vox']), 'b64 chars', 'x', min(xs), max(xs), 'y', min(ys), max(ys), 'z', min(zs), max(zs))
print(data['palette'])
