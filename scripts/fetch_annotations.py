#!/usr/bin/env python3
"""
fetch_annotations.py

Fetches real organ annotations from:
  - iNaturalist API (controlled attribute: Plant Phenology / Plant Part)
  - Wikimedia Commons API (categories + description)

Then re-applies category assignments to data/plants_data.json.

iNat API: https://api.inaturalist.org/v1/observations?id=A,B,C&per_page=200
  - o['annotations'] contains [{controlled_attribute: {label}, controlled_value: {label}}]
  - We map these to our 8 categories.

Wikimedia API: categories + extmetadata (description, categories string)
  - We look for category names containing organ keywords.

Run: python3 scripts/fetch_annotations.py
"""

import json, urllib.request, urllib.parse, time, os, re
from collections import defaultdict

DATA_DIR   = os.path.join(os.path.dirname(__file__), '..', 'data')
PLANTS_JSON = os.path.join(DATA_DIR, 'plants_data.json')
PLANTS_JS   = os.path.join(DATA_DIR, 'plants_data.js')
CACHE_FILE  = os.path.join(DATA_DIR, 'annotation_cache.json')

HEADERS = {'User-Agent': 'PlantQuiz/2.0 (educational tool; contact@example.org)'}

TARGET_CATS = [
    'premature_fruit', 'seed_pot', 'leaves_closeup', 'bark_closeup',
    'tree_shape', 'bark', 'buds', 'leaves_underside'
]

# ─── iNat annotation → our category ──────────────────────────────────────────
# Source: https://www.inaturalist.org/controlled_terms
INAT_LABEL_MAP = {
    # Plant Phenology (attribute id=12)
    'Flower Budding':          'premature_fruit',  # flower buds = premature
    'Flowering':               'premature_fruit',
    'Fruiting':                'seed_pot',
    'No Evidence of Flowering': None,  # vegetative — use other signal
    # Plant Part / Organism Part (attribute id=9 or similar)
    'Flower':                  'premature_fruit',
    'Inflorescence':           'premature_fruit',
    'Catkin':                  'premature_fruit',
    'Leaf':                    'leaves_closeup',
    'Leaves':                  'leaves_closeup',
    'Green Leaves':            'leaves_closeup',
    'Leaves (Needles)':        'leaves_closeup',
    'Needles':                 'leaves_closeup',
    'Bark':                    'bark',
    'Trunk':                   'bark',
    'Branch':                  'buds',             # branches often show buds
    'Twig':                    'buds',
    'Bud':                     'buds',
    'Buds':                    'buds',
    'Winter Bud':              'buds',
    'Cone':                    'seed_pot',
    'Fruit':                   'seed_pot',
    'Seed':                    'seed_pot',
    'Seeds':                   'seed_pot',
    'Whole Organism':          'tree_shape',
    'Whole Tree':              'tree_shape',
    'Habit':                   'tree_shape',
    'Root':                    None,
    # Observed values for "Evidence of Presence" — not useful
    'Organism':                None,
}

# Wikimedia Commons category keywords → our category
WIKI_CAT_MAP = [
    # leaves_underside first (most specific)
    (['underside', 'abaxial', 'leaf underside', 'undersides', 'unterseite'], 'leaves_underside'),
    # bark_closeup
    (['lenticel', 'bark detail', 'bark texture', 'bark close', 'bark pattern'], 'bark_closeup'),
    # buds
    (['bud', 'buds', 'winter bud', 'knospe', 'knopp', 'bourgeon'], 'buds'),
    # premature_fruit
    (['flower', 'flowers', 'bloom', 'blossom', 'inflorescence', 'catkin', 'flowering',
      'blüte', 'fleur', 'fiori', 'kwiat'], 'premature_fruit'),
    # seed_pot
    (['fruit', 'fruits', 'seed', 'seeds', 'cone', 'cones', 'samara', 'acorn',
      'nut', 'drupe', 'berry', 'berries', 'pod', 'capsule', 'zapfen'], 'seed_pot'),
    # leaves_closeup
    (['leaf', 'leaves', 'foliage', 'needle', 'needles', 'blatt', 'blätter',
      'feuille', 'foglia', 'nadel', 'leaflet'], 'leaves_closeup'),
    # bark
    (['bark', 'trunk', 'stem', 'borke', 'rinde', 'écorce', 'stamm'], 'bark'),
    # tree_shape
    (['habit', 'silhouette', 'tree', 'canopy', 'baum', 'arbre'], 'tree_shape'),
]


def wiki_cats_to_organ(categories, description=''):
    """Map Wikimedia categories + description to an organ category."""
    text = ' '.join(categories).lower() + ' ' + (description or '').lower()
    for keywords, cat in WIKI_CAT_MAP:
        for kw in keywords:
            if kw in text:
                return cat
    return None


def inat_annotations_to_organ(annotations):
    """Map iNat annotation list to best organ category."""
    for ann in (annotations or []):
        attr_label = ann.get('controlled_attribute', {}).get('label', '')
        val_label  = ann.get('controlled_value', {}).get('label', '')
        # Check value first (more specific)
        cat = INAT_LABEL_MAP.get(val_label)
        if cat:
            return cat
        cat = INAT_LABEL_MAP.get(attr_label)
        if cat:
            return cat
    return None


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:
        print(f'  WARN fetch failed: {url[:80]} → {e}')
        return None


# ─── Load database ────────────────────────────────────────────────────────────
with open(PLANTS_JSON, 'r', encoding='utf-8') as f:
    plants = json.load(f)

# ─── Load / init cache ────────────────────────────────────────────────────────
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    print(f'Loaded cache with {len(cache)} entries')
else:
    cache = {}
    print('Starting fresh cache')

all_cats = TARGET_CATS + ['unclassified']

# ─── Collect all images grouped by source ────────────────────────────────────
inat_images  = []   # (species, cat, img, obs_id)
wiki_images  = []   # (species, cat, img, wiki_title)

for sp in plants:
    for cat in all_cats:
        for img in sp['images'].get(cat, []):
            url   = img.get('url', '')
            title = img.get('title', '')
            m_obs = re.search(r'#(\d+)', title)
            if 'inaturalist-open-data' in url and m_obs:
                inat_images.append((sp, cat, img, m_obs.group(1)))
            elif 'wikimedia.org' in url or 'wikipedia.org' in url:
                # Extract filename
                decoded = urllib.parse.unquote(url)
                m_file  = re.search(r'/([^/]+\.(?:jpg|jpeg|png|svg|webp))(?:[?/]|$)', decoded, re.I)
                fn = m_file.group(1) if m_file else title
                wiki_images.append((sp, cat, img, fn))

print(f'iNat images to annotate: {len(inat_images)}')
print(f'Wikimedia images to annotate: {len(wiki_images)}')

# ─── Fetch iNat annotations in batches of 200 ────────────────────────────────
# Group by obs_id to avoid duplicate fetches
obs_to_ann = {}  # obs_id → organ_cat or None
obs_ids_needed = [obs_id for (_, _, _, obs_id) in inat_images if obs_id not in cache]
obs_ids_needed = list(dict.fromkeys(obs_ids_needed))  # deduplicate

print(f'\nFetching {len(obs_ids_needed)} new iNat observations (cached: {len(inat_images)-len(obs_ids_needed)})...')
BATCH = 200
for i in range(0, len(obs_ids_needed), BATCH):
    batch = obs_ids_needed[i:i+BATCH]
    ids   = ','.join(batch)
    url   = f'https://api.inaturalist.org/v1/observations?id={ids}&per_page={BATCH}&fields=annotations,taxon'
    print(f'  Batch {i//BATCH+1}/{(len(obs_ids_needed)+BATCH-1)//BATCH}: {len(batch)} obs...')
    data = fetch_json(url)
    if not data:
        for oid in batch: cache[oid] = None
        continue
    results_map = {str(r['id']): r for r in data.get('results', [])}
    for oid in batch:
        r = results_map.get(oid)
        if r:
            organ = inat_annotations_to_organ(r.get('annotations', []))
            cache[oid] = organ
        else:
            cache[oid] = None
    time.sleep(0.5)  # respect rate limit

# ─── Fetch Wikimedia annotations ──────────────────────────────────────────────
wiki_titles_needed = [fn for (_, _, _, fn) in wiki_images if fn not in cache]
wiki_titles_needed = list(dict.fromkeys(wiki_titles_needed))

print(f'\nFetching {len(wiki_titles_needed)} new Wikimedia files (cached: {len(wiki_images)-len(wiki_titles_needed)})...')
WIKI_BATCH = 50
for i in range(0, len(wiki_titles_needed), WIKI_BATCH):
    batch = wiki_titles_needed[i:i+WIKI_BATCH]
    titles_param = '|'.join(f'File:{fn}' for fn in batch)
    url = (
        'https://commons.wikimedia.org/w/api.php'
        '?action=query'
        f'&titles={urllib.parse.quote(titles_param)}'
        '&prop=categories|imageinfo'
        '&iiprop=extmetadata'
        '&cllimit=50'
        '&format=json'
    )
    print(f'  Batch {i//WIKI_BATCH+1}/{(len(wiki_titles_needed)+WIKI_BATCH-1)//WIKI_BATCH}: {len(batch)} files...')
    data = fetch_json(url)
    if not data:
        for fn in batch: cache[fn] = None
        continue
    pages = data.get('query', {}).get('pages', {})
    # Build mapping from normalized title → result
    results_map = {}
    for pid, p in pages.items():
        t = p.get('title', '').replace('File:', '')
        results_map[t] = p
    for fn in batch:
        p = results_map.get(fn) or results_map.get(fn.replace('_', ' ')) or {}
        cats  = [c['title'].replace('Category:', '') for c in p.get('categories', [])]
        meta  = (p.get('imageinfo') or [{}])[0].get('extmetadata', {})
        desc  = meta.get('ImageDescription', {}).get('value', '')
        # Strip HTML
        desc  = re.sub(r'<[^>]+>', ' ', desc)
        organ = wiki_cats_to_organ(cats, desc)
        cache[fn] = organ
    time.sleep(0.3)

# ─── Save cache ───────────────────────────────────────────────────────────────
with open(CACHE_FILE, 'w', encoding='utf-8') as f:
    json.dump(cache, f, indent=2)
print(f'\nCache saved ({len(cache)} entries)')

# ─── Apply annotations back to database ──────────────────────────────────────
print('\nApplying annotations to database...')
corrected = 0
confirmed = 0
no_annotation = 0

def get_best_organ(img, current_cat):
    url   = img.get('url', '')
    title = img.get('title', '')
    
    # iNat
    m_obs = re.search(r'#(\d+)', title)
    if 'inaturalist-open-data' in url and m_obs:
        ann_cat = cache.get(m_obs.group(1))
        if ann_cat and ann_cat in TARGET_CATS:
            return ann_cat
        return None  # no annotation → keep current
    
    # Wikimedia
    decoded = urllib.parse.unquote(url)
    m_file  = re.search(r'/([^/]+\.(?:jpg|jpeg|png|svg|webp))(?:[?/]|$)', decoded, re.I)
    fn = m_file.group(1) if m_file else title
    ann_cat = cache.get(fn) or cache.get(fn.replace('_', ' ')) or cache.get(fn.replace(' ', '_'))
    if ann_cat and ann_cat in TARGET_CATS:
        return ann_cat
    return None


# Re-pool and re-assign each species
for sp in plants:
    # Pool all images
    pool = []
    for cat in all_cats:
        for img in sp['images'].get(cat, []):
            pool.append((cat, img))
    
    # Get annotation for each image
    annotated = []
    for current_cat, img in pool:
        best = get_best_organ(img, current_cat)
        annotated.append((current_cat, img, best))
    
    # Build new buckets
    # Priority: images with annotations go to their annotated category first
    buckets = {c: [] for c in TARGET_CATS}
    leftover = []
    
    # Phase 1: annotated images fill their target category (cap=2)
    remaining = []
    for current_cat, img, ann_cat in annotated:
        if ann_cat and ann_cat in TARGET_CATS:
            if buckets[ann_cat].length if hasattr(buckets[ann_cat], 'length') else len(buckets[ann_cat]) < 2:
                if ann_cat != current_cat:
                    corrected += 1
                else:
                    confirmed += 1
                buckets[ann_cat].append({**img, 'organ': ann_cat})
            else:
                leftover.append({**img, 'organ': 'unclassified'})
        else:
            no_annotation += 1
            remaining.append((current_cat, img))
    
    # Phase 2: unannotated images keep their current category if slot available
    for current_cat, img in remaining:
        if current_cat in TARGET_CATS and len(buckets[current_cat]) < 2:
            buckets[current_cat].append({**img, 'organ': current_cat})
        else:
            leftover.append({**img, 'organ': 'unclassified'})
    
    # Phase 3: fill still-empty slots from leftover
    for cat in TARGET_CATS:
        if len(buckets[cat]) == 0 and leftover:
            buckets[cat].append({**leftover.pop(0), 'organ': cat})
    
    sp['images'] = {**buckets, 'unclassified': leftover}
    sp['total_images'] = sum(len(buckets[c]) for c in TARGET_CATS)

print(f'  Corrected: {corrected}')
print(f'  Confirmed: {confirmed}')
print(f'  No annotation: {no_annotation}')

# ─── Verify ───────────────────────────────────────────────────────────────────
empties = 0
for sp in plants:
    for cat in TARGET_CATS:
        if len(sp['images'].get(cat, [])) == 0:
            empties += 1
print(f'  Empty slots: {empties}')

# ─── Save ─────────────────────────────────────────────────────────────────────
with open(PLANTS_JSON, 'w', encoding='utf-8') as f:
    json.dump(plants, f, indent=2, ensure_ascii=False)
print(f'\n✔ Saved {PLANTS_JSON}')

with open(PLANTS_JS, 'w', encoding='utf-8') as f:
    f.write('// Auto-generated — do not edit manually\n')
    f.write(f'window.PLANT_DATABASE = {json.dumps(plants, indent=2, ensure_ascii=False)};\n')
print(f'✔ Saved {PLANTS_JS}')
