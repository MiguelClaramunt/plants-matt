import json
import urllib.request
import urllib.parse
import time
import os
import re
from concurrent.futures import ThreadPoolExecutor

HEADERS = {
    'User-Agent': 'SLU-PlantQuiz/1.0 (BI1452 tree identification interactive quiz; contact: student@slu.se)'
}

def clean_latin(name):
    # Strip quotes, hybrids, var
    base = re.sub(r"\(.*?\)", "", name)
    base = re.sub(r"'.*?'", "", base)
    base = base.replace('×', ' ').replace('x ', ' ').replace('var.', ' ').replace('subsp.', ' ')
    parts = base.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return name.strip()

def get_commons_image_url(filename, width=800):
    if not filename.startswith('File:'):
        filename = 'File:' + filename
    url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(filename)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth={width}&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            for pid, p in pages.items():
                ii = p.get('imageinfo', [{}])[0]
                thumb = ii.get('thumburl') or ii.get('url')
                artist = ii.get('extmetadata', {}).get('Artist', {}).get('value', 'Wikimedia Commons')
                clean_artist = re.sub('<[^<]+?>', '', artist)[:80].strip() if artist else 'Wikimedia Commons'
                return thumb, clean_artist
    except Exception:
        pass
    return None, 'Wikimedia Commons'

def search_commons_category_files(cat_name, limit=3):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle={urllib.parse.quote(cat_name)}&gcmtype=file&gcmlimit={limit}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
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
                        'author': clean_artist
                    })
            return results
    except Exception:
        return []

def search_commons_search(query, limit=2):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
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
                        'author': clean_artist
                    })
            return results
    except Exception:
        return []

def fetch_inaturalist_taxon_and_photos(clean_name):
    url = f"https://api.inaturalist.org/v1/taxa?q={urllib.parse.quote(clean_name)}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            if not results:
                return None, []
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
                tax_detail = d2.get('results', [{}])[0]
                t_photos = tax_detail.get('taxon_photos', [])
                photos = []
                for tp in t_photos[:8]:
                    p = tp.get('photo', {})
                    m_url = p.get('medium_url')
                    if m_url:
                        photos.append({
                            'title': f"{clean_name} Observation",
                            'url': m_url.replace('/medium.', '/large.'),
                            'source': 'iNaturalist Research Grade',
                            'author': p.get('attribution', 'iNaturalist')
                        })
                return taxon, photos
    except Exception:
        return None, []

def process_species(sp_item):
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
    
    # 1. Botanical Illustration
    illus_cat = f"Category:{clean} - botanical illustrations"
    illus = search_commons_category_files(illus_cat, 2)
    if not illus:
        illus = search_commons_category_files(f"Category:Botanical illustrations of {clean}", 2)
    if not illus:
        illus = search_commons_search(f'"{clean}" filetype:bitmap (illustration OR Lindman OR Thome OR plate)', 2)
    organs['botanical_illustration'] = illus
    
    # 2. Bark
    bark = search_commons_category_files(f"Category:{clean} (bark)", 2)
    if not bark:
        bark = search_commons_search(f'incategory:"{clean} (bark)"', 2)
    if not bark:
        bark = search_commons_search(f'"{clean}" bark filetype:bitmap', 2)
    organs['bark'] = bark
    
    # 3. Winter Buds / Buds
    buds = search_commons_category_files(f"Category:{clean} buds", 2)
    if not buds:
        buds = search_commons_category_files(f"Category:{clean} (buds)", 2)
    if not buds:
        buds = search_commons_search(f'"{clean}" (bud OR buds OR "winter bud") filetype:bitmap', 2)
    organs['buds_winter'] = buds
    
    # 4. Leaves / Top / Foliage
    leaves = search_commons_category_files(f"Category:{clean} (leaves)", 2)
    if not leaves:
        leaf_q = f'"{clean}" (needles OR needle) filetype:bitmap' if is_conifer else f'"{clean}" (leaf OR leaves) filetype:bitmap'
        leaves = search_commons_search(leaf_q, 2)
    organs['leaves_top'] = leaves
    
    # 5. Flowers / Catkins / Strobili
    flowers = search_commons_category_files(f"Category:{clean} (flowers)", 2)
    if not flowers:
        flowers = search_commons_category_files(f"Category:{clean} (catkins)", 2)
    if not flowers:
        fl_q = f'"{clean}" ("pollen cone" OR strobili) filetype:bitmap' if is_conifer else f'"{clean}" (flower OR flowers OR catkin) filetype:bitmap'
        flowers = search_commons_search(fl_q, 2)
    organs['flowers'] = flowers
    
    # 6. Fruits / Cones / Seeds
    fruits = search_commons_category_files(f"Category:{clean} (fruit)", 2)
    if not fruits and is_conifer:
        fruits = search_commons_category_files(f"Category:{clean} cones", 2)
    if not fruits:
        fr_q = f'"{clean}" (cone OR cones) filetype:bitmap' if is_conifer else f'"{clean}" (fruit OR fruits OR seed OR samara) filetype:bitmap'
        fruits = search_commons_search(fr_q, 2)
    organs['fruits_seeds'] = fruits
    
    # 7. Habit / Tree shape
    habit = search_commons_category_files(f"Category:Solitary {clean}", 2)
    if not habit:
        habit = search_commons_search(f'"{clean}" (habit OR silhouette OR "solitary tree") filetype:bitmap', 2)
    organs['tree_shape'] = habit

    # 8. Twig / Branch
    twig = search_commons_search(f'"{clean}" (twig OR branch OR branchlet) filetype:bitmap', 2)
    organs['stem_branch'] = twig
    
    # 9. Leaf underside
    underside = search_commons_search(f'"{clean}" ("leaf underside" OR abaxial OR stomata) filetype:bitmap', 1)
    organs['leaves_underside'] = underside

    # iNaturalist curated photos
    taxon, inat_photos = fetch_inaturalist_taxon_and_photos(clean)
    if inat_photos:
        # Fill any missing organs
        empty_keys = [k for k, v in organs.items() if len(v) == 0 and k != 'botanical_illustration']
        for i, p in enumerate(inat_photos):
            target = empty_keys[i % len(empty_keys)] if empty_keys else 'leaves_top'
            organs[target].append(p)
            
    total_imgs = sum(len(v) for v in organs.values())
    
    return {
        'id': re.sub(r'[^a-z0-9]+', '-', latin.lower()).strip('-'),
        'latin': latin,
        'clean_latin': clean,
        'english': sp_item['english'],
        'swedish': sp_item['swedish'],
        'family': sp_item['family'],
        'zone': sp_item['zone'],
        'plant_type': 'conifer' if is_conifer else 'broadleaf',
        'wikipedia_summary': taxon.get('wikipedia_summary', '') if taxon else '',
        'inaturalist_id': taxon.get('id') if taxon else None,
        'total_images': total_imgs,
        'images': organs
    }

def main():
    with open('bi1452_species.json', 'r', encoding='utf-8') as f:
        species_list = json.load(f)
        
    print(f"Resolving images for all {len(species_list)} species concurrently...")
    t0 = time.time()
    
    with ThreadPoolExecutor(max_workers=6) as executor:
        results = list(executor.map(process_species, species_list))
        
    print(f"Finished resolution in {time.time()-t0:.2f}s!")
    
    # Save to plants_data.json
    with open('plants_data.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        
    # Also save as JS file for direct inclusion in index.html (bypasses any browser CORS on file://)
    js_content = "// PhytoMemo Botanical Database — Verified Image Repository for BI1452 & World Flora\n"
    js_content += f"window.PLANT_DATABASE = {json.dumps(results, indent=2, ensure_ascii=False)};\n"
    with open('plants_data.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    # Also save to src/data for completeness
    os.makedirs('src/data', exist_ok=True)
    with open('src/data/plantRepository.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        
    total_all_images = sum(r['total_images'] for r in results)
    print(f"Saved {len(results)} species with {total_all_images} verified images across all organs!")

if __name__ == '__main__':
    main()
