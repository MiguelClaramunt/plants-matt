import json
import urllib.request
import urllib.parse
import time
import os
import re

HEADERS = {
    'User-Agent': 'TreeMemorizationApp/2.0 (Plant identification database builder; contact: bot@example.org)'
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
    except Exception:
        pass

def clean_latin(name):
    # E.g. "Salix alba var. Sericea" -> "Salix alba"
    # "Populus × canadensis 'Robusta'" -> "Populus x canadensis"
    # "Juniperus communis ('Vemboö' E)" -> "Juniperus communis"
    # "Thuja plicata ('Excelsa')" -> "Thuja plicata"
    # "Larix x marschlinsii (eurolepis)" -> "Larix marschlinsii"
    base = re.sub(r"\(.*?\)", "", name)
    base = re.sub(r"'.*?'", "", base)
    base = base.replace('×', ' ').replace('x', ' ').replace('var.', ' ').replace('subsp.', ' ')
    parts = base.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return name.strip()

def search_commons_files(query, limit=2):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=900&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            imgs = []
            for pid, p in pages.items():
                title = p.get('title', '')
                lower = title.lower()
                if not any(lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    continue
                ii = p.get('imageinfo', [{}])[0]
                thumb = ii.get('thumburl') or ii.get('url')
                artist = ii.get('extmetadata', {}).get('Artist', {}).get('value', 'Wikimedia Commons')
                # clean html tags from artist
                clean_artist = re.sub('<[^<]+?>', '', artist)[:80].strip() if artist else 'Wikimedia Commons'
                if thumb and thumb not in DISCARDED_URLS:
                    imgs.append({
                        'title': title.replace('File:', '').replace('_', ' '),
                        'url': thumb,
                        'source': 'Wikimedia Commons',
                        'author': clean_artist or 'Wikimedia Commons'
                    })
            return imgs
    except Exception as e:
        return []

def fetch_inat_data(clean_name):
    url = f"https://api.inaturalist.org/v1/taxa?q={urllib.parse.quote(clean_name)}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            if not results:
                return None, []
            
            # Find closest match
            taxon = results[0]
            for r in results:
                if r.get('name', '').lower() == clean_name.lower():
                    taxon = r
                    break
            
            tax_id = taxon.get('id')
            detail_url = f"https://api.inaturalist.org/v1/taxa/{tax_id}"
            req2 = urllib.request.Request(detail_url, headers=HEADERS)
            with urllib.request.urlopen(req2, timeout=8) as resp2:
                d2 = json.loads(resp2.read().decode('utf-8'))
                tax = d2.get('results', [{}])[0]
                t_photos = tax.get('taxon_photos', [])
                photos = []
                for tp in t_photos[:8]:
                    p = tp.get('photo', {})
                    m_url = p.get('medium_url')
                    if m_url:
                        # use large photo if possible
                        large_url = m_url.replace('/medium.', '/large.')
                        if large_url not in DISCARDED_URLS:
                            photos.append({
                                'title': f"{clean_name} Observation",
                                'url': large_url,
                                'source': 'iNaturalist',
                                'author': p.get('attribution', 'iNaturalist')
                            })
                return taxon, photos
    except Exception as e:
        return None, []

def harvest_species(sp_item):
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
    
    # 1. Botanical illustrations
    illus = search_commons_files(f'"{clean}" (illustration OR Lindman OR Thome OR plate)', 2)
    organs['botanical_illustration'].extend(illus)
    time.sleep(0.3)
    
    # 2. Bark
    bark = search_commons_files(f'"{clean}" bark', 2)
    organs['bark'].extend(bark)
    time.sleep(0.3)
    
    # 3. Winter buds
    buds = search_commons_files(f'"{clean}" bud OR buds OR "winter bud"', 2)
    organs['buds_winter'].extend(buds)
    time.sleep(0.3)
    
    # 4. Leaves top / general leaves
    leaf_query = f'"{clean}" needles OR needle' if is_conifer else f'"{clean}" leaf OR leaves OR foliage'
    leaves = search_commons_files(leaf_query, 2)
    organs['leaves_top'].extend(leaves)
    time.sleep(0.3)
    
    # 5. Leaves underside / details
    underside = search_commons_files(f'"{clean}" "leaf underside" OR abaxial OR stomata', 2)
    organs['leaves_underside'].extend(underside)
    time.sleep(0.3)
    
    # 6. Flowers / Catkins / Strobili
    fl_query = f'"{clean}" male cone OR "pollen cone" OR strobili' if is_conifer else f'"{clean}" flower OR flowers OR catkin OR catkins OR inflorescence'
    flowers = search_commons_files(fl_query, 2)
    organs['flowers'].extend(flowers)
    time.sleep(0.3)
    
    # 7. Fruits / Seeds / Cones
    fr_query = f'"{clean}" cone OR cones OR female cone' if is_conifer else f'"{clean}" fruit OR fruits OR seed OR seeds OR samara OR samaras OR nut OR acorn OR drupe'
    fruits = search_commons_files(fr_query, 2)
    organs['fruits_seeds'].extend(fruits)
    time.sleep(0.3)
    
    # 8. Stem / Twig / Branch
    stem = search_commons_files(f'"{clean}" twig OR twigs OR branch OR branchlet OR shoot', 2)
    organs['stem_branch'].extend(stem)
    time.sleep(0.3)
    
    # 9. Tree habit / Shape
    shape = search_commons_files(f'"{clean}" habit OR tree OR silhouette OR solitary', 2)
    organs['tree_shape'].extend(shape)
    time.sleep(0.3)
    
    # iNaturalist curated photos as fallback/enrichment
    taxon, inat_photos = fetch_inat_data(clean)
    if inat_photos:
        # Distribute any empty organs or add to general pool
        empty_organs = [k for k, v in organs.items() if len(v) == 0 and k != 'botanical_illustration']
        for i, p in enumerate(inat_photos):
            target = empty_organs[i % len(empty_organs)] if empty_organs else 'leaves_top'
            organs[target].append(p)
            
    summary_counts = {k: len(v) for k, v in organs.items()}
    total_imgs = sum(summary_counts.values())
    
    return {
        'id': re.sub(r'[^a-z0-9]+', '-', latin.lower()).strip('-'),
        'latin': latin,
        'clean_latin': clean,
        'english': sp_item['english'],
        'swedish': sp_item['swedish'],
        'family': sp_item['family'],
        'zone': sp_item['zone'],
        'plant_type': 'conifer' if is_conifer else 'broadleaf',
        'wikipedia_summary': taxon.get('wikipedia_summary') if taxon else '',
        'inaturalist_id': taxon.get('id') if taxon else None,
        'total_images': total_imgs,
        'images': organs
    }

def main():
    species_file = os.path.join(DATA_DIR, 'species_list.json')
    with open(species_file, 'r', encoding='utf-8') as f:
        species_list = json.load(f)
        
    out_file = os.path.join(DATA_DIR, 'plants_data.json')
    
    existing = {}
    if os.path.exists(out_file):
        try:
            with open(out_file, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                existing = {item['latin']: item for item in loaded}
                print(f"Loaded {len(existing)} existing records.")
        except Exception:
            existing = {}
            
    results = []
    print(f"Beginning repository harvest for {len(species_list)} species...")
    for idx, sp in enumerate(species_list):
        latin = sp['latin']
        if latin in existing and existing[latin].get('total_images', 0) >= 5:
            print(f"[{idx+1}/{len(species_list)}] Using cached: {latin} ({existing[latin]['total_images']} imgs)")
            results.append(existing[latin])
            continue
            
        print(f"[{idx+1}/{len(species_list)}] Harvesting {latin}...")
        try:
            rec = harvest_species(sp)
            results.append(rec)
            print(f"  -> Found {rec['total_images']} images")
        except Exception as e:
            print(f"  -> Error: {e}")
            
        # Periodic save every 5 items
        if idx % 5 == 0 or idx == len(species_list) - 1:
            with open(out_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
                
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully saved {len(results)} species to {out_file}")

if __name__ == '__main__':
    main()
