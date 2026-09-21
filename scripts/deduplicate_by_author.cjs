const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'plants_data.json');
const jsPath = path.join(__dirname, '..', 'data', 'plants_data.js');

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function getWmBaseTitle(t) {
  return (t || '').toLowerCase()
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/\s*\(cropped\)/i, '')
    .replace(/[\-_](\d+|[a-z])$/i, '')
    .replace(/\s+(\d+|[a-z])$/i, '')
    .replace(/\s*-\s*detail/i, '')
    .replace(/\s*close-?up/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let totalBefore = 0;
let totalAfter = 0;
let totalRemoved = 0;
const report = [];

const cleanedData = rawData.map(sp => {
  const removeUrls = new Set();
  let spBefore = 0;

  // Group by (source, author)
  const authorMap = new Map();
  Object.entries(sp.images || {}).forEach(([org, list]) => {
    list.forEach(im => {
      spBefore++;
      totalBefore++;
      const author = (im.author || 'Unknown').trim().toLowerCase();
      const source = (im.source || '').toLowerCase().trim();
      const key = `${source} | ${author}`;
      if (!authorMap.has(key)) authorMap.set(key, []);
      authorMap.get(key).push({ org, ...im });
    });
  });

  for (const [key, list] of authorMap.entries()) {
    if (list.length <= 1) continue;

    // 1. Remove Fungi / Mislabeled
    list.forEach(im => {
      const t = (im.title || '').toLowerCase();
      if (t.includes('polyporus squamosus') || t.includes('inonotus') || t.includes('dichomitus')) {
        removeUrls.add(im.url);
      }
    });

    // 2. Wikimedia Commons duplicate checks by author & species
    if (key.includes('wikimedia')) {
      const wmBases = new Map();
      list.forEach(im => {
        if (removeUrls.has(im.url)) return;
        const t = (im.title || '').toLowerCase();
        if (t.includes('(cropped)')) {
          removeUrls.add(im.url);
          return;
        }

        const base = getWmBaseTitle(im.title);
        if (base.length > 5) {
          if (wmBases.has(base)) {
            // Duplicate base title by the same author for the same species!
            removeUrls.add(im.url);
          } else {
            wmBases.set(base, im);
          }
        }
      });
    }

    // 3. iNaturalist duplicate checks by author & species
    if (key.includes('inaturalist')) {
      // Multiple photos by same author in the SAME organ
      const organLists = new Map();
      list.forEach(im => {
        if (removeUrls.has(im.url)) return;
        if (!organLists.has(im.org)) organLists.set(im.org, []);
        organLists.get(im.org).push(im);
      });

      for (const [org, orgImgs] of organLists.entries()) {
        if (orgImgs.length > 1) {
          for (let i = 1; i < orgImgs.length; i++) {
            // Check if species would fall below 20 photos
            const currentTotal = spBefore - removeUrls.size;
            if (currentTotal > 20) {
              removeUrls.add(orgImgs[i].url);
            }
          }
        }
      }

      // Multiple photos from exact same observation ID by same author
      const obsMap = new Map();
      list.forEach(im => {
        if (removeUrls.has(im.url)) return;
        const m = (im.title || '').match(/Obs(?:ervation)?\s*#?(\d+)/i);
        if (m) {
          const obsId = m[1];
          if (obsMap.has(obsId)) {
            const currentTotal = spBefore - removeUrls.size;
            if (currentTotal > 22) {
              removeUrls.add(im.url);
            }
          } else {
            obsMap.set(obsId, im);
          }
        }
      });
    }
  }

  // Construct new cleaned images map
  const newImages = {};
  let spAfter = 0;
  Object.entries(sp.images || {}).forEach(([org, list]) => {
    newImages[org] = list.filter(im => !removeUrls.has(im.url));
    spAfter += newImages[org].length;
  });

  totalAfter += spAfter;
  totalRemoved += removeUrls.size;
  report.push({ latin: sp.latin, before: spBefore, after: spAfter, removed: removeUrls.size });

  return {
    ...sp,
    total_images: spAfter,
    images: newImages
  };
});

console.log('Author/Source/Species Deduplication Complete:');
console.log(`Initial total images: ${totalBefore}`);
console.log(`Cleaned total images: ${totalAfter}`);
console.log(`Duplicates removed: ${totalRemoved}`);

report.sort((a, b) => a.after - b.after);
console.log('Lowest 5 species counts:', report.slice(0, 5));
console.log('Highest 5 species counts:', report.slice(-5));

// Write back
fs.writeFileSync(dataPath, JSON.stringify(cleanedData, null, 2), 'utf-8');
fs.writeFileSync(jsPath, `window.PLANT_DATABASE = ${JSON.stringify(cleanedData, null, 2)};\n`, 'utf-8');

console.log('Successfully updated data/plants_data.json and data/plants_data.js!');
