import numpy as np, struct, json, math

S = 0.05  # 1 block = 5cm

def lin(h):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i+2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]

C = {
    'skin': lin('#D4A06A'), 'skin_d': lin('#B07A48'), 'pink': lin('#D9736E'),
    'white': lin('#E6E2DA'), 'yellow': lin('#E8CF7A'), 'pants': lin('#3E3A36'),
    'boot': lin('#6B4423'), 'black': lin('#1E1A18'), 'tusk': lin('#F2EFE8'),
    'ear': lin('#C4465A'), 'ear_in': lin('#E68A86'), 'snout': lin('#D7716F'),
    'nostril': lin('#9E3340'), 'brow': lin('#E4B788'),
}

# bone: (parent, world pivot in blocks)
BONES = {
    'Root': (None, (0, 0, 0)),
    'Hips': ('Root', (0, 14, 0)),
    'Spine': ('Hips', (0, 17, 0)),
    'Head': ('Spine', (0, 27, 0)),
    'UpperArm.L': ('Spine', (9.8, 26, 0)),
    'LowerArm.L': ('UpperArm.L', (9.8, 20, 0)),
    'UpperArm.R': ('Spine', (-9.8, 26, 0)),
    'LowerArm.R': ('UpperArm.R', (-9.8, 20, 0)),
    'UpperLeg.L': ('Hips', (3.8, 14, 0)),
    'LowerLeg.L': ('UpperLeg.L', (3.8, 8, 0)),
    'UpperLeg.R': ('Hips', (-3.8, 14, 0)),
    'LowerLeg.R': ('UpperLeg.R', (-3.8, 8, 0)),
}

P = {k: [] for k in BONES}
def box(bone, x0, x1, y0, y1, z0, z1, col):
    P[bone].append(((x0, y0, z0), (x1, y1, z1), C[col]))

def mirror(bone_l, bone_r, x0, x1, *rest):
    box(bone_l, x0, x1, *rest)
    box(bone_r, -x1, -x0, *rest)

# Hips: pants top (chubby waist)
box('Hips', -7.6, 7.6, 12, 17.5, -4.3, 4.3, 'pants')
# Torso (chubby: wide chest + belly pushing the shirt forward)
box('Spine', -7.6, 7.6, 17.5, 27, -4.3, 4.3, 'white')
box('Spine', -6.2, 6.2, 16, 24, 4.3, 5.8, 'white')       # belly
box('Spine', -4.8, 4.8, 17, 22.5, 5.8, 6.6, 'white')     # belly front
box('Spine', -2.5, 2.5, 26.5, 27.5, -2.5, 2.5, 'skin')  # neck
mirror('Spine', 'Spine', 6, 7.7, 25, 27.2, -2.8, 2.8, 'skin')  # shoulder skin past straps
# Head (local y measured from head base at y=27)
def hb(x0, x1, y0, y1, z0, z1, col, m=True):
    if m: mirror('Head', 'Head', x0, x1, 27 + y0, 27 + y1, z0, z1, col)
    else: box('Head', x0, x1, 27 + y0, 27 + y1, z0, z1, col)
hb(-5, 5, 0, 7.8, -4.5, 4.5, 'skin', False)          # main block
hb(-3.9, 3.9, 7.8, 8.9, -4.2, 3.4, 'skin', False)    # crown step 1
hb(-3, 3, 8.9, 10.1, -3.8, 2.4, 'skin', False)       # crown step 2
hb(5, 5.5, 0.4, 3.8, -1, 4, 'skin')                  # jowls
# ears: stepped triangles, tip to the outside
hb(3.3, 5.2, 7.8, 8.9, -0.2, 1.0, 'ear')
hb(3.8, 5.2, 8.9, 10.0, -0.2, 1.0, 'ear')
hb(4.4, 5.2, 10.0, 11.4, -0.2, 1.0, 'ear')
hb(3.9, 4.6, 8.1, 9.9, 1.0, 1.15, 'ear_in')
# brows and eyes (white outside, black inside)
hb(2.0, 3.6, 5.4, 6.2, 4.5, 4.9, 'brow')
hb(2.9, 3.6, 4.1, 5.2, 4.5, 4.62, 'white')
hb(2.0, 2.9, 4.1, 5.2, 4.5, 4.62, 'black')
# snout
hb(-2.3, 2.3, 0.7, 4.0, 4.5, 6.5, 'snout', False)
hb(0.55, 1.2, 1.3, 2.8, 6.5, 6.62, 'nostril')
# tusks: L shape beside the snout
hb(2.3, 4.6, 0.7, 1.8, 4.3, 6.2, 'tusk')
hb(3.2, 4.2, 1.8, 3.4, 4.6, 6.0, 'tusk')
# Arms
for b, s in (('L', 1), ('R', -1)):
    def ab(bone, x0, x1, *r):
        if s > 0: box(bone, x0, x1, *r)
        else: box(bone, -x1, -x0, *r)
    ab('UpperArm.' + b, 7.7, 12.3, 20, 27.4, -2.5, 2.5, 'skin')
    ab('LowerArm.' + b, 7.9, 12.1, 15, 20, -2.3, 2.3, 'skin')
    ab('LowerArm.' + b, 8.1, 11.9, 12, 15, -2.1, 2.1, 'skin')
    ab('UpperLeg.' + b, 0.1, 7.5, 8, 14, -4, 4, 'pants')
    ab('LowerLeg.' + b, 0.4, 7.1, 3, 8, -3.7, 3.7, 'pants')
    ab('LowerLeg.' + b, 0.3, 7.2, 0, 3, -3.4, 4.3, 'boot')

FACES = [((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
         ((-1, 0, 0), [(0, 0, 1), (0, 1, 1), (0, 1, 0), (0, 0, 0)]),
         ((0, 1, 0), [(0, 1, 1), (1, 1, 1), (1, 1, 0), (0, 1, 0)]),
         ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
         ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]),
         ((0, 0, -1), [(1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 1, 0)])]

# ---------- binary buffer helpers ----------
buf = bytearray(); views = []; accs = []
def add(arr, comp, typ, target=None, minmax=False):
    global buf
    while len(buf) % 4: buf.append(0)
    data = arr.tobytes()
    v = {'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); buf += data
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax:
        a['min'] = arr.min(0).tolist() if arr.ndim > 1 else [float(arr.min())]
        a['max'] = arr.max(0).tolist() if arr.ndim > 1 else [float(arr.max())]
    accs.append(a); return len(accs) - 1

names = list(BONES)
nodes, meshes = [], []
for n in names:
    parent, pv = BONES[n]
    ppv = BONES[parent][1] if parent else (0, 0, 0)
    node = {'name': n, 'translation': [(pv[i] - ppv[i]) * S for i in range(3)]}
    if P[n]:
        pos, nor, col, idx = [], [], [], []
        for (mn, mx, c) in P[n]:
            for nm, corners in FACES:
                base = len(pos)
                for cx, cy, cz in corners:
                    p = [(mn[0] if cx == 0 else mx[0]), (mn[1] if cy == 0 else mx[1]), (mn[2] if cz == 0 else mx[2])]
                    pos.append([(p[i] - pv[i]) * S for i in range(3)]); nor.append(nm); col.append(c)
                idx += [base, base + 1, base + 2, base, base + 2, base + 3]
        pa = add(np.array(pos, np.float32), 5126, 'VEC3', 34962, True)
        na = add(np.array(nor, np.float32), 5126, 'VEC3', 34962)
        ca = add(np.array(col, np.float32), 5126, 'VEC4', 34962)
        ia = add(np.array(idx, np.uint16), 5123, 'SCALAR', 34963)
        meshes.append({'name': n + '_mesh', 'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na, 'COLOR_0': ca}, 'indices': ia, 'material': 0}]})
        node['mesh'] = len(meshes) - 1
    nodes.append(node)
for i, n in enumerate(names):
    ch = [j for j, m in enumerate(names) if BONES[m][0] == n]
    if ch: nodes[i]['children'] = ch

# ---------- animation ----------
REST = {'UpperArm.L': (0, 0, 10), 'UpperArm.R': (0, 0, -10)}
def quat(rx, ry, rz):
    def q(ax, a):
        a = math.radians(a) / 2; v = [0, 0, 0]; v[ax] = math.sin(a); return v + [math.cos(a)]
    def mul(a, b):
        ax, ay, az, aw = a; bx, by, bz, bw = b
        return [aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx,
                aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz]
    return mul(q(1, ry), mul(q(0, rx), q(2, rz)))

def X(*v): return [(a, 0, 0) for a in v]

CLIPS = {
 'Idle': (2, [0, 1, 2], {
    'Hips_T': [(0, 0, 0), (0, -0.25, 0), (0, 0, 0)],
    'Spine': X(0, 2, 0), 'Head': X(0, -2, 0),
    'UpperArm.L': [(0, 0, 0), (0, 0, 3), (0, 0, 0)], 'UpperArm.R': [(0, 0, 0), (0, 0, -3), (0, 0, 0)]}),
 'Walk': (1, [0, .25, .5, .75, 1], {
    'Hips_T': [(0, 0, 0), (0, .4, 0), (0, 0, 0), (0, .4, 0), (0, 0, 0)],
    'Spine': [(0, 3, 0), (0, 0, 0), (0, -3, 0), (0, 0, 0), (0, 3, 0)],
    'UpperLeg.L': X(-30, 0, 30, 0, -30), 'UpperLeg.R': X(30, 0, -30, 0, 30),
    'LowerLeg.L': X(5, 5, 15, 35, 5), 'LowerLeg.R': X(15, 35, 5, 5, 15),
    'UpperArm.L': X(25, 0, -25, 0, 25), 'UpperArm.R': X(-25, 0, 25, 0, -25),
    'LowerArm.L': X(-10, -10, -10, -10, -10), 'LowerArm.R': X(-10, -10, -10, -10, -10)}),
 'Run': (.6, [0, .15, .3, .45, .6], {
    'Hips_T': [(0, -.5, 0), (0, .6, 0), (0, -.5, 0), (0, .6, 0), (0, -.5, 0)],
    'Spine': X(15, 15, 15, 15, 15), 'Head': X(-10, -10, -10, -10, -10),
    'UpperLeg.L': X(-50, 0, 45, 0, -50), 'UpperLeg.R': X(45, 0, -50, 0, 45),
    'LowerLeg.L': X(10, 20, 30, 70, 10), 'LowerLeg.R': X(30, 70, 10, 20, 30),
    'UpperArm.L': X(50, 0, -50, 0, 50), 'UpperArm.R': X(-50, 0, 50, 0, -50),
    'LowerArm.L': X(-70, -70, -70, -70, -70), 'LowerArm.R': X(-70, -70, -70, -70, -70)}),
 'Attack': (.8, [0, .25, .4, .55, .8], {
    'Hips_T': [(0, 0, 0), (0, -.5, -.3), (0, -1, 1), (0, -1, 1), (0, 0, 0)],
    'Spine': [(0, 0, 0), (-5, -25, 0), (12, 25, 0), (12, 20, 0), (0, 0, 0)],
    'UpperArm.R': X(0, 40, -95, -95, 0), 'LowerArm.R': X(0, -90, -5, -5, 0),
    'UpperArm.L': X(0, -20, 20, 15, 0), 'LowerArm.L': X(0, -60, -40, -40, 0),
    'UpperLeg.L': X(0, -20, -25, -25, 0), 'UpperLeg.R': X(0, 10, 20, 20, 0),
    'LowerLeg.L': X(0, 10, 15, 15, 0)}),
 'Sit': (2, [0, 1, 2], {
    'Hips_T': [(0, -10.0, 0)] * 3,
    'Spine': X(-5, -2, -5), 'Head': X(3, 0, 3),
    'UpperLeg.L': [(-86, 0, 4)] * 3, 'UpperLeg.R': [(-86, 0, -4)] * 3,
    'UpperArm.L': [(-15, 0, 8)] * 3, 'UpperArm.R': [(-15, 0, -8)] * 3,
    'LowerArm.L': X(-35, -35, -35), 'LowerArm.R': X(-35, -35, -35)}),
 'Sleep': (3, [0, 1.5, 3], {
    'Hips_T': [(0, -9.4, 0)] * 3, 'Hips': X(-90, -90, -90),
    'Spine': X(0, -3, 0), 'Head': X(0, 2, 0),
    'UpperArm.L': [(0, 0, 4)] * 3, 'UpperArm.R': [(0, 0, -4)] * 3,
    'UpperLeg.L': [(0, 0, 5)] * 3, 'UpperLeg.R': [(0, 0, -5)] * 3}),
}

animated = [n for n in names if n != 'Root']
animations = []
for cname, (T, times, kf) in CLIPS.items():
    ta = add(np.array(times, np.float32), 5126, 'SCALAR', None, True)
    samplers, channels = [], []
    for n in animated:
        rest = REST.get(n, (0, 0, 0))
        vals = kf.get(n, [(0, 0, 0)] * len(times))
        q = np.array([quat(*(rest[i] + v[i] for i in range(3))) for v in vals], np.float32)
        oa = add(q, 5126, 'VEC4')
        samplers.append({'input': ta, 'output': oa, 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': names.index(n), 'path': 'rotation'}})
    base = np.array(nodes[names.index('Hips')]['translation'])
    tv = kf.get('Hips_T', [(0, 0, 0)] * len(times))
    tr = np.array([base + np.array(v) * S for v in tv], np.float32)
    oa = add(tr, 5126, 'VEC3')
    samplers.append({'input': ta, 'output': oa, 'interpolation': 'LINEAR'})
    channels.append({'sampler': len(samplers) - 1, 'target': {'node': names.index('Hips'), 'path': 'translation'}})
    animations.append({'name': cname, 'samplers': samplers, 'channels': channels})

while len(buf) % 4: buf.append(0)
gltf = {'asset': {'version': '2.0', 'generator': 'orc builder'},
        'scene': 0, 'scenes': [{'name': 'Orc', 'nodes': [0]}], 'nodes': nodes, 'meshes': meshes,
        'materials': [{'name': 'Voxel', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}}],
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}], 'animations': animations}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
with open('orc.glb', 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
tri = sum(len(P[n]) * 12 for n in names)
print('ok', len(buf), 'bytes bin, triangles', tri)
