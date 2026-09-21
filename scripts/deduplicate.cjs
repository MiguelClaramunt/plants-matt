const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'plants_data.json');
const jsPath = path.join(__dirname, '..', 'data', 'plants_data.js');

const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

function getNormalizedWmFilename(url, title) {
  if (!url || !url.includes('wikimedia.org')) return null;
  const m = url.match(/\/([^\/?#]+)(?:\?|$)/);
  let name = m ? decodeURIComponent(m[1]).replace(/^\d+px-/, '') : (title || '');
  return name.toLowerCase().trim();
}

function getInatPhotoId(url) {
  if (!url) return null;
  const m = url.match(/photos\/(\d+)\//);
  return m ? parseInt(m[1]) : null;
}

let totalBefore = 0;
let totalAfter = 0;
const report = [];

const cleanedData = rawData.map(sp => {
  const seenUrls = new Set();
  const seenWmFiles = new Set();
  const seenInatIds = new Set();
  const seenWmBasePatterns = new Map();
  const authorOrganPhotos = new Map();

  let spBefore = 0;
  let spAfter = 0;
  const newImages = {};

  Object.entries(sp.images || {}).forEach(([org, list]) => {
    newImages[org] = [];
    list.forEach(img => {
      spBefore++;
      totalBefore++;
      const url = (img.url || '').trim();
      if (!url) return;

      const wmFile = getNormalizedWmFilename(url, img.title);
      const inatId = getInatPhotoId(url);
      const author = (img.author || 'Unknown').trim();

      // 1. Exact URL dupe across species
      if (seenUrls.has(url)) return;

      // 2. Exact WM filename dupe across species (excluding generic thumbnail.jpg)
      if (wmFile && wmFile !== 'thumbnail.jpg') {
        if (seenWmFiles.has(wmFile)) return;
      }

      // 3. Exact iNat Photo ID dupe across species
      if (inatId) {
        if (seenInatIds.has(inatId)) return;
      }

      // 4. Obvious Mislabeled / Fungus
      const tLower = (img.title || '').toLowerCase();
      if (tLower.includes('inonotus hispidus') || tLower.includes('dichomitus campestris') || 
         (sp.clean_latin === 'Acer campestre' && tLower.includes('malus sargentii'))) {
        return;
      }

      // 5. Wikimedia sequence burst (e.g. bark 1, bark 2, bark 3)
      if (wmFile) {
        let basePattern = wmFile
          .replace(/\.(jpe?g|png|webp)$/i, '')
          .replace(/[\-_](\d+|[a-z])$/i, '')
          .replace(/\s+(\d+|[a-z])$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (basePattern.length > 6) {
          const c = seenWmBasePatterns.get(basePattern) || 0;
          if (c >= 1) return; // Drop redundant sequence bursts
          seenWmBasePatterns.set(basePattern, c + 1);
        }
      }

      // 6. iNaturalist burst shots (same author taking rapid burst in same organ)
      if (inatId) {
        if (!authorOrganPhotos.has(author)) {
          authorOrganPhotos.set(author, new Map());
        }
        const orgMap = authorOrganPhotos.get(author);
        const prevIdsInOrg = orgMap.get(org) || [];

        // Burst check within same organ (close photo IDs)
        const isBurst = prevIdsInOrg.some(pid => Math.abs(pid - inatId) < 250);
        if (isBurst) return;

        // Max 2 photos per organ per author
        if (prevIdsInOrg.length >= 2) return;

        prevIdsInOrg.push(inatId);
        orgMap.set(org, prevIdsInOrg);
      }

      // Valid kept image
      seenUrls.add(url);
      if (wmFile && wmFile !== 'thumbnail.jpg') seenWmFiles.add(wmFile);
      if (inatId) seenInatIds.add(inatId);
      newImages[org].push(img);
      spAfter++;
      totalAfter++;
    });
  });

  const total_images = Object.values(newImages).reduce((s, l) => s + l.length, 0);
  report.push({ latin: sp.latin, before: spBefore, after: total_images, removed: spBefore - total_images });

  return {
    ...sp,
    total_images,
    images: newImages
  };
});

console.log('Deduplication finished:');
console.log(`Initial total images: ${totalBefore}`);
console.log(`Cleaned total images: ${totalAfter}`);
console.log(`Duplicates & burst images purged: ${totalBefore - totalAfter}`);

report.sort((a, b) => a.after - b.after);
console.log('Lowest 5 species counts:', report.slice(0, 5));
console.log('Highest 5 species counts:', report.slice(-5));

// Write back to files
fs.writeFileSync(dataPath, JSON.stringify(cleanedData, null, 2), 'utf-8');
fs.writeFileSync(jsPath, `window.PLANT_DATABASE = ${JSON.stringify(cleanedData, null, 2)};\n`, 'utf-8');

console.log('Successfully updated data/plants_data.json and data/plants_data.js!');
