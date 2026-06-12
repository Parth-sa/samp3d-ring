import os, json, re

BASE = r'G:\3ddemo\signi'

PRONG_IDS = {'4PR', '6PR', 'BZ', 'DH', 'HH', 'SH'}
SHAPE_IDS = {'EM', 'MQ', 'OV', 'PE', 'PR', 'RA', 'RD'}
BAND_STYLE_IDS = {'CA', 'KF', 'PL', 'SP', 'TW', 'WD'}
SHANK_STYLE_IDS = {'CA', 'KE', 'KF', 'PL', 'SP', 'TW', 'WD'}

PRONG_LABELS = {'4PR': '4 Prong', '6PR': '6 Prong', 'BZ': 'Bezel', 'DH': 'Double Halo', 'HH': 'Hidden Halo', 'SH': 'Shared Prong'}
SHAPE_LABELS = {'EM': 'Emerald', 'MQ': 'Marquise', 'OV': 'Oval', 'PE': 'Pear', 'PR': 'Princess', 'RA': 'Radiant', 'RD': 'Round'}
BAND_STYLE_LABELS = {'CA': 'Caviar', 'KF': 'Knife Edge', 'PL': 'Plain', 'SP': 'Split', 'TW': 'Twist', 'WD': 'Wide'}
SHANK_STYLE_LABELS = {'CA': 'Caviar', 'KE': 'Knife Edge Flat', 'KF': 'Knife Edge', 'PL': 'Plain', 'SP': 'Split', 'TW': 'Twist', 'WD': 'Wide'}

HD_RE_PATTERN1 = re.compile(r'^HD-([A-Z0-9]+)-([A-Z]+)-([\d.]+)-(\d+)\.glb$')
HD_RE_PATTERN2 = re.compile(r'^HD-([A-Z]+)-([A-Z0-9]+)-([\d.]+)-(\d+)\.glb$')
BN_RE = re.compile(r'^BN-([A-Z]+)-([A-Z]+)-(\d+)\.glb$')
SH_RE = re.compile(r'^SH-([A-Z]+)-([A-Z]+)-(\d+)\.glb$')

all_heads = []
all_bands = []
all_shanks = []

shapes_set = set()
prongs_set = set()
sizes_set = set()
band_styles_set = set()
shank_styles_set = set()

def parse_head(filename):
    m = HD_RE_PATTERN1.match(filename)
    if m:
        prong, shape, size_str, id_ = m.groups()
        if prong in PRONG_IDS and shape in SHAPE_IDS:
            return prong, shape, size_str, id_
    m = HD_RE_PATTERN2.match(filename)
    if m:
        shape, prong, size_str, id_ = m.groups()
        if shape in SHAPE_IDS and prong in PRONG_IDS:
            return prong, shape, size_str, id_
    return None

# 'sigli' holds AES-encrypted heads (WebGiGLBWrapper) that the local viewer
# cannot decrypt — 'sigli headss' has the loadable unencrypted Draco versions.
for fname in sorted(os.listdir(os.path.join(BASE, 'sigli headss'))):
    if not fname.endswith('.glb'): continue
    parsed = parse_head(fname)
    if parsed:
        prong, shape, size_str, id_ = parsed
        all_heads.append({'file': fname, 'prong': prong, 'shape': shape, 'sizeStr': size_str, 'size': float(size_str), 'id': id_})
        shapes_set.add(shape)
        prongs_set.add(prong)
        sizes_set.add(size_str)

for fname in sorted(os.listdir(os.path.join(BASE, 'sigli bands'))):
    if not fname.endswith('.glb') or fname == 'empty.glb': continue
    m = BN_RE.match(fname)
    if m:
        style, type_, id_ = m.groups()
        all_bands.append({'file': fname, 'style': style, 'type': type_, 'id': id_})
        band_styles_set.add(style)

for fname in sorted(os.listdir(os.path.join(BASE, 'sigli Shanks'))):
    if not fname.endswith('.glb'): continue
    m = SH_RE.match(fname)
    if m:
        style, type_, id_ = m.groups()
        all_shanks.append({'file': fname, 'style': style, 'type': type_, 'id': id_})
        shank_styles_set.add(style)

shapes = sorted(shapes_set, key=lambda s: list(SHAPE_IDS).index(s) if s in SHAPE_IDS else 99)
prongs = sorted(prongs_set, key=lambda p: list(PRONG_IDS).index(p) if p in PRONG_IDS else 99)
sizes = sorted(sizes_set, key=float)
band_styles = sorted(band_styles_set, key=lambda s: list(BAND_STYLE_IDS).index(s) if s in BAND_STYLE_IDS else 99)
shank_styles = sorted(shank_styles_set, key=lambda s: list(SHANK_STYLE_IDS).index(s) if s in SHANK_STYLE_IDS else 99)

catalog = {
    'shapes': [{'id': s, 'label': SHAPE_LABELS.get(s, s)} for s in shapes],
    'prongs': [{'id': p, 'label': PRONG_LABELS.get(p, p)} for p in prongs],
    'sizes': sizes,
    'bandStyles': [{'id': s, 'label': BAND_STYLE_LABELS.get(s, s)} for s in band_styles],
    'shankStyles': [{'id': s, 'label': SHANK_STYLE_LABELS.get(s, s)} for s in shank_styles],
    'allHeads': all_heads,
    'allBands': all_bands,
    'allShanks': all_shanks,
}

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'catalog.json')
with open(out_path, 'w') as f:
    json.dump(catalog, f, indent=2)

print(f'Written {out_path}')
print(f'Shapes: {len(shapes)} - {shapes}')
print(f'Prongs: {len(prongs)} - {prongs}')
print(f'Sizes: {len(sizes)} - {sizes}')
print(f'Band styles: {len(band_styles)} - {band_styles}')
print(f'Shank styles: {len(shank_styles)} - {shank_styles}')
print(f'All heads: {len(all_heads)}')
print(f'All bands: {len(all_bands)}')
print(f'All shanks: {len(all_shanks)}')
