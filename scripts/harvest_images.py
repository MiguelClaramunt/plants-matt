import json
import urllib.request
import urllib.parse
import time
import os
import re

HEADERS = {
    'User-Agent': 'PlantQuizBotSLU/1.0 (SLU tree identification exam prep; contact: exam-prep@slu.se)'
}

ORGAN_CATEGORIES = [
    'bark',
    'botanical_illustration',
    'leaves_top',
    'leaves_underside',
    'buds_winter',
    'stem_branch',
    'flowers',
    'fruits_seeds',
    'tree_shape'
]

# Clean name for search
def clean_latin(name):
    # Strip quotes, hybrids, var
    base = name.split('(')[0]
    base = base.replace('×', 'x').replace("'", "")
    parts = base.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return base.strip()

def search_commons(query, limit=3):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800&format=json"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            results = []
            for pid, p in pages.items():
                title = p.get('title', '')
                # Skip non-images
                lower = title.lower()
                if not any(lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    continue
                ii = p.get('imageinfo', [{}])[0]
                thumb = ii.get('thumburl') or ii.get('url')
                if thumb:
                    results.append({
                        'title': title,
                        'url': thumb,
                        'source': 'Wikimedia Commons',
                        'author': ii.get('extmetadata', {}).get('Artist', {}).get('value', 'Wikimedia Commons')
                    })
            return results
    except Exception as e:
        # print(f"Commons error for {query}: {e}")
        return []

def search_inat_photos(latin_name):
    clean = clean_latin(latin_name)
    url = f"https://api.inaturalist.org/v1/taxa?q={urllib.parse.quote(clean)}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            res = data.get('results', [])
            if not res:
                return []
            tax_id = res[0].get('id')
            
            # Fetch taxon details with taxon_photos
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
                        # upgrade medium to large or keep medium
                        large_url = m_url.replace('/medium.', '/large.')
                        photos.append({
                            'title': f"{clean} (iNaturalist)",
                            'url': large_url,
                            'source': 'iNaturalist (Curated Taxon Photo)',
                            'author': p.get('attribution', 'iNaturalist')
                        })
                return photos
    except Exception as e:
        # print(f"iNat error for {latin_name}: {e}")
        return []

print("Harvester module ready.")
