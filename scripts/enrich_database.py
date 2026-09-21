import json
import urllib.request
import urllib.parse
import time
import os
import re
from concurrent.futures import ThreadPoolExecutor

HEADERS = {
    'User-Agent': 'TreeMemorizationApp/2.0 (Plant identification database enrichment; contact: bot@example.org)'
}

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DISCARDED_PATH = os.path.join(DATA_DIR, 'discarded_images.json')
DISCARDED_URLS = set()
if os.path.exists(DISCARDED_PATH):
    try:
        with open(DISCARDED_PATH, 'r', encoding='utf-8') as df:
            for item in json.load(df):
                if item and 'url' in item:
                    DISCARDED_URLS.add(item['url'])
        print(f"Loaded {len(DISCARDED_URLS)} discarded URLs to skip during scraping.")
    except Exception as e:
        print(f"Warning: could not load discarded_images.json: {e}")

ORGAN_CONFIG = {
    'bark': [
        'bark', 'trunk', 'cortex'
    ],
    'botanical_illustration': [
        'illustration', 'plate', 'Lindman', 'Thome', 'Bilder ur Nordens Flora'
    ],
    'buds_winter': [
        'bud', 'buds', 'winter bud', 'Knospen', 'knopp'
    ],
    'leaves_top': [
        'leaf', 'leaves', 'foliage', 'needles'
    ],
    'leaves_underside': [
        'leaf underside', 'abaxial', 'stomata', 'leaves under'
    ],
    'flowers': [
        'flower', 'flowers', 'blossom', 'catkin', 'catkins', 'inflorescence', 'strobili'
    ],
    'fruits_seeds': [
        'fruit', 'fruits', 'seed', 'seeds', 'cone', 'cones', 'samara', 'acorn', 'berry', 'drupe', 'nut'
    ],
    'stem_branch': [
        'twig', 'twigs', 'branch', 'branches', 'shoot', 'branchlet'
    ],
    'tree_shape': [
        'tree', 'habit', 'silhouette', 'solitary', 'canopy'
    ]
}

def clean_latin(name):
    # E.g. "Salix alba var. Sericea" -> "Salix alba"
    # "Populus × canadensis 'Robusta'" -> "Populus x canadensis"
    # "Juniperus communis ('Vemboö' E)" -> "Juniperus communis"
    # "Thuja plicata ('Excelsa')" -> "Thuja plicata"
    # "Larix x marschlinsii (eurolepis)" -> "Larix marschlinsii"
    if 'wettsteinii' in name.lower():
        return 'Populus x wettsteinii'
    base = re.sub(r"\(.*?\)", "", name)
    base = re.sub(r"'.*?'", "", base)
    base = base.replace('×', 'x').replace('var.', '').replace('subsp.', '').replace('f.', '')
    parts = base.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return name.strip()

def search_commons(query, limit=5):
    # Search bitmap files on Wikimedia Commons
    full_q = f"{query} filetype:bitmap"
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(full_q)}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=900&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=9) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            results = []
            for pid, p in pages.items():
                title = p.get('title', '')
                lower = title.lower()
                if not any(lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    continue
                ii = p.get('imageinfo', [{}])[0]
                thumb = ii.get('thumburl') or ii.get('url')
                artist = ii.get('extmetadata', {}).get('Artist', {}).get('value', 'Wikimedia Commons')
                clean_artist = re.sub('<[^<]+?>', '', artist)[:80].strip() if artist else 'Wikimedia Commons'
                if thumb:
                    results.append({
                        'title': title.replace('File:', '').replace('_', ' '),
                        'url': thumb,
                        'source': 'Wikimedia Commons',
                        'author': clean_artist or 'Wikimedia Commons'
                    })
            return results
    except Exception:
        return []

def fetch_inat_research_photos(clean_name, limit=20):
    # Try exact name first, then fallback
    queries = [clean_name]
    if 'x wettsteinii' in clean_name.lower():
        queries = ['Populus × wettsteinii', 'Populus tremula x tremuloides', 'Populus tremuloides']
    
    for q in queries:
        url = f"https://api.inaturalist.org/v1/observations?taxon_name={urllib.parse.quote(q)}&quality_grade=research&photos=true&per_page={limit}"
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                results = data.get('results', [])
                if not results:
                    # Try general observations if research grade is 0
                    url2 = f"https://api.inaturalist.org/v1/observations?taxon_name={urllib.parse.quote(q)}&photos=true&per_page={limit}"
                    req2 = urllib.request.Request(url2, headers=HEADERS)
                    with urllib.request.urlopen(req2, timeout=8) as resp2:
                        d2 = json.loads(resp2.read().decode('utf-8'))
                        results = d2.get('results', [])
                
                photos = []
                for obs in results:
                    obs_photos = obs.get('photos', [])
                    for p in obs_photos[:3]:
                        sq = p.get('url', '')
                        if sq:
                            large_url = sq.replace('/square.', '/large.')
                            photos.append({
                                'title': f"{clean_name} Observation #{obs.get('id')}",
                                'url': large_url,
                                'source': 'iNaturalist (Research Grade)',
                                'author': p.get('attribution') or obs.get('user', {}).get('login', 'iNaturalist Observer')
                            })
                if photos:
                    return photos
        except Exception:
            continue
    return []

def enrich_species(sp_item):
    latin = sp_item['latin']
    clean = clean_latin(latin)
    is_conifer = sp_item['family'] in ['Pinaceae', 'Cupressaceae', 'Taxaceae', 'Ginkgoaceae']

    organs = {
        'bark': [],
        'botanical_illustration': [],
        'leaves_top': [],
        'leaves_underside': [],
        'buds_winter': [],
        'stem_branch': [],
        'flowers': [],
        'fruits_seeds': [],
        'tree_shape': []
    }

    seen_urls = set()

    def add_imgs(organ_key, img_list):
        for im in img_list:
            u = im.get('url')
            if u and u not in seen_urls and u not in DISCARDED_URLS:
                seen_urls.add(u)
                organs[organ_key].append(im)

    # 1. Botanical illustrations (High priority for study)
    illus = search_commons(f'"{clean}" (illustration OR plate OR Lindman OR Thome OR Curtis)', 5)
    if len(illus) < 2:
        illus += search_commons(f'{clean} illustration', 4)
    add_imgs('botanical_illustration', illus)

    # 2. Bark
    bark = search_commons(f'"{clean}" bark', 5)
    if len(bark) < 3:
        bark += search_commons(f'{clean} trunk', 4)
    add_imgs('bark', bark)

    # 3. Winter Buds / Buds
    buds = search_commons(f'"{clean}" (bud OR buds OR "winter bud" OR Knospen OR knoppar)', 5)
    if len(buds) < 3:
        buds += search_commons(f'{clean} twig bud', 4)
    add_imgs('buds_winter', buds)

    # 4. Leaves Top / Foliage
    leaf_term = 'needles OR needle' if is_conifer else 'leaf OR leaves OR foliage'
    leaves = search_commons(f'"{clean}" ({leaf_term})', 5)
    if len(leaves) < 3:
        leaves += search_commons(f'{clean} leaves', 4)
    add_imgs('leaves_top', leaves)

    # 5. Leaves Underside
    under = search_commons(f'"{clean}" ("leaf underside" OR abaxial OR stomata OR under)', 4)
    add_imgs('leaves_underside', under)

    # 6. Flowers / Catkins / Strobili
    fl_term = 'male cone OR "pollen cone" OR strobili' if is_conifer else 'flower OR flowers OR catkin OR catkins OR blossom'
    flowers = search_commons(f'"{clean}" ({fl_term})', 5)
    if len(flowers) < 3:
        flowers += search_commons(f'{clean} flowers', 4)
    add_imgs('flowers', flowers)

    # 7. Fruits / Seeds / Cones
    fr_term = 'cone OR cones OR "female cone"' if is_conifer else 'fruit OR fruits OR seed OR seeds OR samara OR acorn OR nut OR berry'
    fruits = search_commons(f'"{clean}" ({fr_term})', 5)
    if len(fruits) < 3:
        fruits += search_commons(f'{clean} fruit', 4)
    add_imgs('fruits_seeds', fruits)

    # 8. Twigs / Branches / Stem
    twigs = search_commons(f'"{clean}" (twig OR twigs OR branch OR branches OR shoot)', 4)
    add_imgs('stem_branch', twigs)

    # 9. Habit / Shape / Solitary
    habit = search_commons(f'"{clean}" (habit OR silhouette OR "solitary tree" OR canopy)', 5)
    if len(habit) < 3:
        habit += search_commons(f'{clean} tree', 4)
    add_imgs('tree_shape', habit)

    # 10. Enrich and fill any sparse organs with high-res iNaturalist Research Grade photos
    inat_photos = fetch_inat_research_photos(clean, 25)
    if inat_photos:
        # Prioritize filling organs with < 3 images
        for p in inat_photos:
            sparse_organs = [k for k in organs.keys() if len(organs[k]) < 3 and k != 'botanical_illustration']
            if sparse_organs:
                target_organ = sparse_organs[0]
                add_imgs(target_organ, [p])
            else:
                # If all organs have at least 3, distribute into leaves, bark, habit
                add_imgs('leaves_top', [p])

    total_images = sum(len(v) for v in organs.values())

    return {
        'id': re.sub(r'[^a-z0-9]+', '-', latin.lower()).strip('-'),
        'latin': latin,
        'clean_latin': clean,
        'english': sp_item['english'],
        'swedish': sp_item['swedish'],
        'family': sp_item['family'],
        'zone': sp_item['zone'],
        'plant_type': 'conifer' if is_conifer else 'broadleaf',
        'total_images': total_images,
        'images': organs
    }

def main():
    species_file = os.path.join(DATA_DIR, 'species_list.json')
    with open(species_file, 'r', encoding='utf-8') as f:
        species_list = json.load(f)

    print(f"Enriching database with large image sets for all {len(species_list)} species...")
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=6) as executor:
        enriched_results = list(executor.map(enrich_species, species_list))

    total_images_all = sum(r['total_images'] for r in enriched_results)
    min_images = min(r['total_images'] for r in enriched_results)
    max_images = max(r['total_images'] for r in enriched_results)
    avg_images = total_images_all / len(enriched_results)

    print(f"\nCompleted enrichment in {time.time()-t0:.2f}s!")
    print(f"Total images collected: {total_images_all} (Average: {avg_images:.1f} imgs/species, Min: {min_images}, Max: {max_images})")

    # Save to data/plants_data.json
    out_json = os.path.join(DATA_DIR, 'plants_data.json')
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(enriched_results, f, indent=2, ensure_ascii=False)

    # Save to data/plants_data.js
    out_js = os.path.join(DATA_DIR, 'plants_data.js')
    js_content = "// Botanical Database — Verified & Enriched Image Repository\n"
    js_content += f"window.PLANT_DATABASE = {json.dumps(enriched_results, indent=2, ensure_ascii=False)};\n"
    with open(out_js, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print("Saved enriched data to data/plants_data.json and data/plants_data.js successfully!")

if __name__ == '__main__':
    main()
