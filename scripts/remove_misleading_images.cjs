#!/usr/bin/env node
/**
 * remove_misleading_images.cjs
 *
 * Removes misleading images (wrong species, parasites, fungi, insects, crafts, etc.)
 * from both active categories and unclassified pool.
 * For active slots that drop below 1, promotes the best unclassified candidate.
 * Adds removed images to data/discarded_images.json with a reason field.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLANTS_JSON = path.join(DATA_DIR, 'plants_data.json');
const PLANTS_JS   = path.join(DATA_DIR, 'plants_data.js');
const DISC_JSON   = path.join(DATA_DIR, 'discarded_images.json');
const DISC_JS     = path.join(DATA_DIR, 'discarded_images.js');

const TARGET_CATS = [
  'premature_fruit', 'seed_pot', 'leaves_closeup', 'bark_closeup',
  'tree_shape', 'bark', 'buds', 'leaves_underside'
];

// ─── Misleading image titles (exact filename match) ───────────────────────────
// Reason codes: "wrong_species" | "wrong_genus" | "non_plant_subject" | "disease_only"
const MISLEADING = [
  // Wrong species / wrong genus
  { title: "Knoppen van een esdoorn (Acer platanoides). 03-04-2023 (d.j.b.).jpg", reason: "wrong_species" },
  { title: "Castanea sativa foliage Artvin.jpg", reason: "wrong_species" },
  { title: "Antispila treitschkiella-AT, Upper Austria, Mattsee, Camping Stein-E-NMW00129-Z32429a.jpg", reason: "non_plant_subject" },
  { title: "Crataegus laevigata 'Punicea' (Rosaceae) bark.JPG", reason: "wrong_species" },
  { title: "Malus domestica leaf illustrations.jpg", reason: "wrong_species" },
  { title: "Malus domestica bud illustrations.jpg", reason: "wrong_species" },
  { title: "Pine tree bark.jpg", reason: "wrong_species" },
  { title: "Boxwood (Buxus) and Beech (Fagus) tree forest canopy, Mezmay, Russia.jpg", reason: "wrong_species" },
  { title: "Boxwood and beech relict forest canopy, Epiphytes, Mezmay, Russia.jpg", reason: "wrong_species" },
  { title: "Tsuga-heterophylla-cones.JPG", reason: "wrong_species" },
  { title: "Alnus serrulata leaves.jpg", reason: "wrong_species" },
  { title: "Juniperus oxycedrus 2601.jpg", reason: "wrong_species" },
  { title: "Larix kaempferi MHNT.BOT.2007.40.39.jpg", reason: "wrong_species" },
  { title: "(Larix leptolepis close-up at Yumoto, Japan) - DPLA - 93b2e1982702933e0480770396e8bc18.jpg", reason: "wrong_species" },
  { title: "Western Tuya.jpg", reason: "wrong_species" },
  { title: "Tilia x orbicularis JPG1Aa.jpg", reason: "wrong_species" },
  { title: "Tilia x orbicularis JPG1Ab.jpg", reason: "wrong_species" },
  { title: "Tilia × orbicularis.jpg", reason: "wrong_species" },
  { title: "Foxtail pine vs lodgepole pine trunks.jpg", reason: "wrong_species" },
  { title: "CBG Fruit Veg Island - Cornus mas 'Golden Glory', Juglans cinerea 'Weschcke' Butternut, Thuja occidentalis 'Brandon', Vitis cvs Grapes 150627 (19708869043).jpg", reason: "wrong_species" },
  { title: "Acer pseudoplatanus leaves with disease.jpg", reason: "disease_only" },
  { title: "CornusMasInfectedLeaves.jpg", reason: "disease_only" },
  { title: "Associatie van melige schotelkorst (Lecanoretum carpineae).jpg", reason: "non_plant_subject" },
  { title: "Telekia ozdobná, Yellow oxeye (Telekia speciosa) near the chalet and historic hunting lodge Kaštielik, on the western shore of the lake Morské oko, Vihorlat Mountains (Vihorlatské vrchy), Slovakia (September 2023) 01.jpg", reason: "wrong_species" },
  { title: "Budai Arborétum. Felső kert. Délszaki kutyatej (Euphorbia myrsinites). - Budapest.JPG", reason: "wrong_species" },
  { title: "Krim-Linde (Sonnenstraße, Neuendettelsau) 20250711 131845.jpg", reason: "wrong_species" },
  // Parasites, fungi, insects, non-plant subjects
  { title: "2006-08-01 Fomes fomentarius.png", reason: "non_plant_subject" },
  { title: "Acronicta auricoma - Betula pubescens - Niitvälja bog.jpg", reason: "non_plant_subject" },
  { title: "Phyllonorycter corylifoliella Mine.jpg", reason: "non_plant_subject" },
  { title: "Perittia herrichiella mosbo6.jpg", reason: "non_plant_subject" },
  { title: "1924. These lodgepole pine trees, first weakened by a needle miner, were later killed by mountain pine beetle. Tenaya Basin, Yosemite National Park. (26445242119).jpg", reason: "non_plant_subject" },
  { title: "Dendroctonus ponderosae f11060656 2a.jpg", reason: "non_plant_subject" },
  { title: "Saprows woodpecker.jpg", reason: "non_plant_subject" },
  { title: "BazzaniatriDolly2.JPG", reason: "non_plant_subject" },
  { title: "Flickr - Nicholas T - Shelved.jpg", reason: "non_plant_subject" },
  { title: "Stemonitis fusca 28Jun2011.jpg", reason: "non_plant_subject" },
  { title: "Yellow ectomycorrhizal fruting body.jpg", reason: "non_plant_subject" },
  { title: "2012-08-14 Melomastia mastoidea (Fr.) J. Schröt 365956.jpg", reason: "non_plant_subject" },
  { title: "219 Donkey Sled Yard at Toledo. Bark Peelers (22040375755).jpg", reason: "non_plant_subject" },
  { title: "Lirula macrospora.jpg", reason: "non_plant_subject" },
  { title: "De8xeonX0AAKjV1.jpg", reason: "non_plant_subject" },
  { title: "Conifer cones for arts and crafts use at a primary school in Norway (gran- og furukongler som formingsmateriale på barneskole) 2017-10-23.jpg", reason: "non_plant_subject" },
  { title: "Xanthoria parietina - Common orange lichen - Gewöhnliche Gelbflechte - 04.jpg", reason: "non_plant_subject" },
  { title: "Fungus on leaves of Juglans regia (38832814821).jpg", reason: "non_plant_subject" },
  { title: "Catacomb columbarium City of London Cemetery south bank Newham London England 1.jpg", reason: "non_plant_subject" },
  { title: "306 Betula alba L.jpg", reason: "wrong_species" },
];

// Build a fast lookup map: filename → reason
const BAD_MAP = new Map();
MISLEADING.forEach(({ title, reason }) => {
  const key = title.toLowerCase();
  BAD_MAP.set(key, reason);
});

/** Extract filename from a URL or plain title */
function extractFilename(urlOrTitle) {
  try {
    const u = new URL(urlOrTitle);
    const parts = u.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1]).toLowerCase();
  } catch {
    return urlOrTitle.toLowerCase();
  }
}

/** Check if an image object is misleading; returns reason string or null */
function getMisleadingReason(img) {
  // Check title field
  if (img.title) {
    const key = img.title.toLowerCase();
    if (BAD_MAP.has(key)) return BAD_MAP.get(key);
  }
  // Check URL filename
  const fn = extractFilename(img.url || '');
  if (BAD_MAP.has(fn)) return BAD_MAP.get(fn);
  // Substring match for very distinctive filenames
  for (const [pattern, reason] of BAD_MAP) {
    if (fn.includes(pattern) || (img.title && img.title.toLowerCase().includes(pattern))) {
      return reason;
    }
  }
  return null;
}

// ─── Load data ────────────────────────────────────────────────────────────────
const plants = JSON.parse(fs.readFileSync(PLANTS_JSON, 'utf8'));
const discarded = JSON.parse(fs.readFileSync(DISC_JSON, 'utf8'));
const discardedUrls = new Set(discarded.map(d => d.url));

const timestamp = new Date().toISOString();
let totalRemoved = 0;
let totalPromoted = 0;

// ─── Process each species ─────────────────────────────────────────────────────
plants.forEach(species => {
  const imgs = species.images;
  const allCats = [...TARGET_CATS, 'unclassified'];

  allCats.forEach(cat => {
    if (!imgs[cat]) return;
    const toKeep = [];
    imgs[cat].forEach(img => {
      const reason = getMisleadingReason(img);
      if (reason) {
        console.log(`  ✗ [${species.latin}] [${cat}] ${img.title || img.url} → ${reason}`);
        if (!discardedUrls.has(img.url)) {
          discarded.push({
            url: img.url,
            speciesLatin: species.latin,
            organ: cat,
            title: img.title || '',
            author: img.author || '',
            source: img.source || '',
            reason,
            timestamp,
          });
          discardedUrls.add(img.url);
        }
        totalRemoved++;
      } else {
        toKeep.push(img);
      }
    });
    imgs[cat] = toKeep;
  });

  // For any active category now empty, try to promote from unclassified
  TARGET_CATS.forEach(cat => {
    if ((imgs[cat] || []).length === 0 && (imgs.unclassified || []).length > 0) {
      // Prefer candidates whose title contains the genus name
      const genus = species.latin.split(' ')[0].toLowerCase();
      const pool = imgs.unclassified;
      const idx = pool.findIndex(img =>
        (img.title || '').toLowerCase().includes(genus) ||
        (img.url || '').toLowerCase().includes(genus)
      );
      const candidate = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift();
      if (candidate) {
        imgs[cat].push({ ...candidate, organ: cat });
        console.log(`  ↑ [${species.latin}] promoted to [${cat}]: ${candidate.title || candidate.url}`);
        totalPromoted++;
      }
    }
  });

  // Recalculate total_images (only active categories, 1-2 cap)
  species.total_images = TARGET_CATS.reduce((sum, c) => sum + (imgs[c] || []).length, 0);
});

// ─── Save plants_data.json ────────────────────────────────────────────────────
fs.writeFileSync(PLANTS_JSON, JSON.stringify(plants, null, 2), 'utf8');
console.log(`\n✔ Saved ${PLANTS_JSON}`);

// ─── Save plants_data.js ──────────────────────────────────────────────────────
fs.writeFileSync(
  PLANTS_JS,
  `// Auto-generated — do not edit manually\nwindow.PLANT_DATABASE = ${JSON.stringify(plants, null, 2)};\n`,
  'utf8'
);
console.log(`✔ Saved ${PLANTS_JS}`);

// ─── Save discarded_images.json ───────────────────────────────────────────────
fs.writeFileSync(DISC_JSON, JSON.stringify(discarded, null, 2), 'utf8');
console.log(`✔ Saved ${DISC_JSON} (total: ${discarded.length})`);

// ─── Save discarded_images.js ─────────────────────────────────────────────────
fs.writeFileSync(
  DISC_JS,
  `// Auto-generated — do not edit manually\nwindow.DISCARDED_IMAGES = ${JSON.stringify(discarded, null, 2)};\n`,
  'utf8'
);
console.log(`✔ Saved ${DISC_JS}`);

console.log(`\n=== Summary ===`);
console.log(`  Removed:  ${totalRemoved} misleading images`);
console.log(`  Promoted: ${totalPromoted} candidates to fill empty active slots`);
