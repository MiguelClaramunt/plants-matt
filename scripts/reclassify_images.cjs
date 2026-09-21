#!/usr/bin/env node
/**
 * reclassify_images.cjs
 *
 * Proper hybrid classifier: prior (source bucket) + keyword scoring override.
 *
 * ALGORITHM:
 *  For each species, images are pooled PER-BUCKET so we know their current
 *  category assignment (their "prior"). Then:
 *
 *  Phase 1 — CORRECT: for images already in a named category, run keyword
 *  scoring. If a different category scores ≥ OVERRIDE_DELTA points above the
 *  prior's score, move the image to the better category.
 *
 *  Phase 2 — PROMOTE: images currently in `unclassified` are scored and
 *  promoted to the best-matching category if score ≥ PROMOTE_THRESHOLD AND
 *  the category slot is empty.
 *
 *  Phase 3 — FILL: if any category slot is still empty after Phase 2,
 *  try additional unclassified candidates regardless of score (best available).
 *
 *  The result still enforces max 2 per category.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const PLANTS_JSON  = path.join(DATA_DIR, 'plants_data.json');
const PLANTS_JS    = path.join(DATA_DIR, 'plants_data.js');
const DISC_JSON    = path.join(DATA_DIR, 'discarded_images.json');

const TARGET_CATS = [
  'premature_fruit', 'seed_pot', 'leaves_closeup', 'bark_closeup',
  'tree_shape', 'bark', 'buds', 'leaves_underside'
];

// How many points above the prior score a different category must score
// to trigger a reassignment.
const OVERRIDE_DELTA = 10;
// Minimum keyword score for promoting an unclassified image into a slot.
const PROMOTE_THRESHOLD = 8;

// ─── Keyword scoring ──────────────────────────────────────────────────────────
const KW = {
  premature_fruit: [
    [/\bflower/i, 14],       [/\bflowers\b/i, 14],
    [/\bblossom/i, 12],      [/\bbloom/i, 10],
    [/\banthesis/i, 12],     [/\binflorescence/i, 14],
    [/\bcatkin/i, 14],       [/\bpollen/i, 10],
    [/blüh/i, 14],
    [/\bblüt/i, 14],
    [/\bfleur/i, 12],
    [/\bfiori/i, 10],
    [/\bflor\b/i, 10],
    [/\bkwiat/i, 10],
    [/\bkvetk/i, 10],
    [/\bunripe/i, 10],       [/\bimmature/i, 8],
    [/young.{0,8}cone/i, 12],[/female cone/i, 8],
    [/\bstrobil/i, 10],
    [/\bpistillat/i, 10],    [/\bstaminat/i, 10],
    [/green.{0,6}(fruit|cone)/i, 10],
    [/\bépi\b/i, 8],
    [/\banthers/i, 10],
    // Negative
    [/mature.{0,8}cone|ripe.{0,8}cone/i, -8],
    [/\bseed\b/i, -5],       [/\bsamar/i, -6],
    [/\bbark\b/i, -6],       [/\btrunk\b/i, -6],
  ],
  seed_pot: [
    [/\bseed\b/i, 14],       [/\bseeds\b/i, 14],
    [/\bcone\b/i, 12],       [/\bcones\b/i, 12],
    [/\bsamar/i, 14],        [/\bacorn/i, 14],
    [/\bfruit\b/i, 10],      [/\bfruits\b/i, 10],
    [/\bnut\b/i, 10],        [/\bnuts\b/i, 10],
    [/\bdrupe/i, 12],        [/\bberry\b/i, 8],
    [/\bberries\b/i, 8],     [/\bcapsule/i, 10],
    [/\bpod\b/i, 12],        [/\bgalbule/i, 12],
    [/\bzapfen/i, 14],
    [/\bfrücht/i, 12],
    [/\bzamen/i, 10],
    [/\bnoot\b/i, 10],
    [/\bfrucht\b/i, 10],
    [/mhnt\.bot/i, 6],
    [/\bripe\b/i, 6],
    [/\bflower/i, -6],       [/\bblüt/i, -6],
    [/\bcatkin/i, -8],       [/\bunripe/i, -6],
    [/\bimmature/i, -5],
  ],
  leaves_closeup: [
    [/\bleaf\b/i, 14],       [/\bleaves\b/i, 14],
    [/\bfoliage/i, 12],
    [/\bneedle\b/i, 14],     [/\bneedles\b/i, 14],
    [/\bblatt\b/i, 14],      [/\bblätter/i, 14],
    [/\bfeuille/i, 10],
    [/\bfoglia/i, 10],
    [/\bhoja\b/i, 10],
    [/\bnadel\b/i, 14],
    [/\badaxial/i, 10],
    [/\blamina/i, 8],
    [/\bleaflet/i, 12],
    [/\bpinnate/i, 8],       [/\bpalmate/i, 8],
    [/autumn.{0,8}leaf|leaf.{0,8}autumn/i, 10],
    [/\bunderside/i, -8],    [/\babaxial/i, -10],
    [/\bventral/i, -6],      [/\bstomat/i, -6],
    [/\bbark\b/i, -6],       [/\btrunk\b/i, -6],
  ],
  bark_closeup: [
    [/\blenticel/i, 16],
    [/bark.{0,25}(close|detail|texture|slice|macro|piece|pattern)/i, 14],
    [/(close|detail|texture|slice|macro|pattern).{0,25}bark/i, 14],
    [/\brhytidome/i, 12],
    [/\bfissure/i, 8],
    [/\bbark\b/i, 8],
    [/\bborke\b/i, 10],      [/\brinde\b/i, 10],
    [/\bécorce\b/i, 10],     [/\bschors\b/i, 10],
    [/\bcortex\b/i, 10],
    [/whole.{0,8}tree|tree.{0,8}whole/i, -8],
    [/\bforest\b/i, -6],     [/\bcanopy/i, -6],
    [/\bhabit\b/i, -6],      [/\bsilhouette/i, -8],
  ],
  tree_shape: [
    [/\bhabit\b/i, 14],      [/\bsilhouette/i, 14],
    [/\bsolitary/i, 12],     [/\bcanopy/i, 10],
    [/\blandscape/i, 8],     [/\bparkland/i, 8],
    [/meadow.{0,12}tree|tree.{0,12}meadow/i, 8],
    [/\bbaum\b/i, 10],
    [/\barbre\b/i, 10],
    [/\bárbol\b/i, 10],
    [/\balbero\b/i, 10],
    [/\bvista\b/i, 6],
    [/\bseedling\b/i, 8],
    [/\btree\b/i, 4],
    [/\bjpg1[ab]\b/i, 6],
    [/\bbark\b/i, -5],       [/\bneedle/i, -5],
    [/\bleaf\b/i, -5],       [/\bbud\b/i, -6],
    [/bark.{0,8}(close|detail|slice)/i, -8],
    [/\blenticel/i, -10],
  ],
  bark: [
    [/\bbark\b/i, 12],
    [/\btrunk\b/i, 10],
    [/\bstem\b/i, 6],
    [/\bborke\b/i, 12],      [/\brinde\b/i, 12],
    [/\bécorce\b/i, 12],
    [/\bstamm\b/i, 10],
    [/bark\.(jpg|jpeg|png)/i, 6],
    [/\blenticel/i, -6],
    [/(close|detail|texture|slice|macro|pattern).{0,25}bark|bark.{0,25}(close|detail|texture|slice|macro)/i, -6],
    [/\bhabit\b/i, -6],      [/\bcanopy/i, -6],
    [/\bsilhouette/i, -8],
  ],
  buds: [
    [/\bbud\b/i, 14],        [/\bbuds\b/i, 14],
    [/winter.{0,6}bud|bud.{0,6}winter/i, 16],
    [/\bwinterknospe/i, 16],
    [/\bknospe/i, 14],       [/\bknospen/i, 14],
    [/\bknopp/i, 14],        [/\bknoppen/i, 14],
    [/\bknop\b/i, 12],
    [/\bgemma\b/i, 12],
    [/\bbourgeon/i, 12],
    [/\bbrote\b/i, 10],
    [/\btwig\b/i, 8],        [/\bzweig\b/i, 8],
    [/\bshoot\b/i, 8],
    [/\bsprouting/i, 10],    [/\bdormant/i, 8],
    [/scale.{0,6}bud|bud.{0,6}scale/i, 10],
    [/\bflower/i, -6],       [/\bfruit/i, -5],
    [/\bleaf\b/i, -5],       [/\bbark\b/i, -6],
    [/\bcone\b/i, -4],
  ],
  leaves_underside: [
    [/\bunderside/i, 16],    [/under.?side/i, 16],
    [/\babaxial/i, 16],
    [/\bventral/i, 12],
    [/reverse.{0,8}leaf|leaf.{0,8}reverse/i, 12],
    [/bottom.{0,8}leaf|leaf.{0,8}bottom/i, 12],
    [/\bunterseite/i, 16],
    [/\bstomata/i, 14],
    [/\bpubescen/i, 8],
    [/\btomentose/i, 10],
    [/silvery.{0,8}(leaf|needle|under)|under.{0,8}silver/i, 10],
    [/\badaxial/i, -8],
    [/top.{0,8}leaf|leaf.{0,8}top/i, -6],
    [/\bbark\b/i, -6],
  ],
};

function scoreKw(text, cat) {
  let score = 0;
  for (const [pat, w] of KW[cat]) {
    if (pat instanceof RegExp ? pat.test(text) : text.includes(pat)) score += w;
  }
  return score;
}

function allScores(text) {
  const s = {};
  for (const cat of TARGET_CATS) s[cat] = scoreKw(text, cat);
  return s;
}

// ─── Load ─────────────────────────────────────────────────────────────────────
const plants    = JSON.parse(fs.readFileSync(PLANTS_JSON, 'utf8'));
const discarded = JSON.parse(fs.readFileSync(DISC_JSON, 'utf8'));
const discardedUrls = new Set(discarded.map(d => d.url));

let movedCount = 0, promotedCount = 0, filledCount = 0;
let totalActive = 0, totalUncl = 0, emptySlots = 0;

const result = plants.map(species => {
  // ── Build buckets from current JSON structure ─────────────────────────────
  // Each bucket keeps images that currently belong there.
  const buckets = {};
  TARGET_CATS.forEach(c => { buckets[c] = []; });
  const unclassified = [];

  TARGET_CATS.forEach(srcCat => {
    (species.images[srcCat] || []).forEach(img => {
      if (discardedUrls.has(img.url)) return;
      buckets[srcCat].push({ ...img });
    });
  });
  (species.images.unclassified || []).forEach(img => {
    if (!discardedUrls.has(img.url)) unclassified.push({ ...img });
  });

  // ── Phase 1: CORRECT already-classified images ───────────────────────────
  // For each active category, check if any image would score much better
  // in a different category (strong keyword evidence).
  TARGET_CATS.forEach(srcCat => {
    const toRemove = [];
    buckets[srcCat].forEach((img, idx) => {
      const text  = (img.title || '') + ' ' + (img.url || '');
      const scores = allScores(text);
      const srcScore = scores[srcCat];
      // Find best alternative
      let bestAlt = null, bestAltScore = -Infinity;
      TARGET_CATS.forEach(c => {
        if (c !== srcCat && scores[c] > bestAltScore) {
          bestAltScore = scores[c]; bestAlt = c;
        }
      });
      // Override only if: alt score ≥ OVERRIDE_DELTA above src score AND
      // alt score is positive (real keyword match, not just less negative)
      if (bestAlt && bestAltScore >= srcScore + OVERRIDE_DELTA && bestAltScore >= PROMOTE_THRESHOLD) {
        if (buckets[bestAlt].length < 2) {
          buckets[bestAlt].push({ ...img, organ: bestAlt });
          toRemove.push(idx);
          movedCount++;
        }
        // Even if target is full, remove from wrong category → unclassified
        else {
          unclassified.push({ ...img, organ: 'unclassified' });
          toRemove.push(idx);
          movedCount++;
        }
      }
    });
    // Remove reassigned images (reverse order to preserve indices)
    toRemove.reverse().forEach(i => buckets[srcCat].splice(i, 1));
  });

  // ── Phase 2: PROMOTE unclassified images into empty/half-full slots ──────
  // Score all unclassified images, sort by confidence, promote best matches.
  const scored = unclassified.map(img => {
    const text   = (img.title || '') + ' ' + (img.url || '');
    const scores = allScores(text);
    const best   = TARGET_CATS.reduce((b, c) => scores[c] > scores[b] ? c : b, TARGET_CATS[0]);
    return { img, scores, best, bestScore: scores[best] };
  }).sort((a, b) => b.bestScore - a.bestScore);

  const stillUncl = [];
  scored.forEach(({ img, scores, best, bestScore }) => {
    if (bestScore >= PROMOTE_THRESHOLD && buckets[best].length < 2) {
      buckets[best].push({ ...img, organ: best });
      promotedCount++;
    } else {
      stillUncl.push({ ...img, organ: 'unclassified' });
    }
  });

  // ── Phase 3: FILL remaining empty slots with best available unclassified ──
  TARGET_CATS.forEach(cat => {
    if (buckets[cat].length === 0 && stillUncl.length > 0) {
      // Find the unclassified image with highest score for this cat
      let bestIdx = 0, bestSc = -Infinity;
      stillUncl.forEach((item, i) => {
        const text  = (item.title || '') + ' ' + (item.url || '');
        const sc    = scoreKw(text, cat);
        if (sc > bestSc) { bestSc = sc; bestIdx = i; }
      });
      const [promoted] = stillUncl.splice(bestIdx, 1);
      buckets[cat].push({ ...promoted, organ: cat });
      filledCount++;
    }
  });

  const active = TARGET_CATS.reduce((s, c) => s + buckets[c].length, 0);
  totalActive += active;
  totalUncl   += stillUncl.length;
  TARGET_CATS.forEach(c => { if (buckets[c].length === 0) emptySlots++; });

  return {
    id:          species.id,
    latin:       species.latin,
    clean_latin: species.clean_latin,
    family:      species.family,
    plant_type:  species.plant_type,
    total_images: active,
    images: { ...buckets, unclassified: stillUncl },
  };
});

// ─── Save ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(PLANTS_JSON, JSON.stringify(result, null, 2), 'utf8');
console.log(`✔ Saved ${PLANTS_JSON}`);

fs.writeFileSync(
  PLANTS_JS,
  `// Auto-generated — do not edit manually\nwindow.PLANT_DATABASE = ${JSON.stringify(result, null, 2)};\n`,
  'utf8'
);
console.log(`✔ Saved ${PLANTS_JS}`);

console.log(`\n=== Reclassification Summary ===`);
console.log(`  Moved (corrected):   ${movedCount}`);
console.log(`  Promoted from uncl.: ${promotedCount}`);
console.log(`  Force-filled slots:  ${filledCount}`);
console.log(`  Active images total: ${totalActive}`);
console.log(`  Unclassified pool:   ${totalUncl}`);
console.log(`  Empty slots remain:  ${emptySlots}`);
console.log(`  Species:             ${result.length}`);
