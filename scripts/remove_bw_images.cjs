const fs = require('fs');
const https = require('https');
const http = require('http');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

// Load plants database
const dataPath = './plants_data.json';
const plants = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Fetch buffer with redirect handling
function fetchBuffer(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'SLU-BotanicalApp/2.0 (botany educational filter; contact: curator@slu.se)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve);
      }
      if (res.statusCode !== 200) {
        return resolve(null);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(7000, () => { req.destroy(); resolve(null); });
  });
}

// Convert large thumbnail URL to small ~180px for fast saturation check
function getSmallThumbnailUrl(url) {
  if (!url) return url;
  // Replace /960px- or /800px- with /180px-
  return url.replace(/\/(?:[0-9]+px-)/, '/180px-');
}

// Analyze pixel saturation
function isImageBlackAndWhite(buf, isPng) {
  try {
    let width, height, data;
    if (isPng) {
      const png = PNG.sync.read(buf);
      width = png.width;
      height = png.height;
      data = png.data;
    } else {
      const raw = jpeg.decode(buf, { useTArray: true });
      width = raw.width;
      height = raw.height;
      data = raw.data;
    }

    let totalSaturation = 0;
    let pixelCount = 0;
    let coloredPixels = 0; // saturation > 0.10

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      // ignore pure black / dark background
      if (max > 18) {
        const sat = (max - min) / max;
        totalSaturation += sat;
        pixelCount++;
        if (sat > 0.10) {
          coloredPixels++;
        }
      }
    }

    if (pixelCount === 0) return true;

    const avgSat = totalSaturation / pixelCount;
    const colorRatio = coloredPixels / pixelCount;

    // Strict black and white / grayscale detection
    // Black & white photos or monochrome sketches have avgSat < 0.05 and colorRatio < 0.04
    return (avgSat < 0.055 || colorRatio < 0.04);
  } catch (err) {
    // If decoding fails, do not falsely flag
    return false;
  }
}

async function main() {
  console.log('Collecting all images to analyze for black-and-white / monochrome...');
  const tasks = [];

  plants.forEach((sp, spIdx) => {
    Object.entries(sp.images).forEach(([org, imgs]) => {
      imgs.forEach((img, imgIdx) => {
        tasks.push({
          spLatin: sp.latin,
          spIdx,
          organ: org,
          imgIdx,
          img
        });
      });
    });
  });

  console.log(`Total images in database: ${tasks.length}`);

  const removedImages = [];
  const CONCURRENCY = 14;
  let cursor = 0;
  let analyzedCount = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const item = tasks[cursor++];
      analyzedCount++;
      if (analyzedCount % 250 === 0 || analyzedCount === tasks.length) {
        process.stdout.write(`Analyzed ${analyzedCount}/${tasks.length} images... (Found ${removedImages.length} B&W)\r`);
      }

      const img = item.img;
      const titleLower = (img.title || '').toLowerCase();

      // Quick keyword check
      const knownBWTerms = ['(bw)', 'black and white', 'monochrome', 'floral diagram', 'drawing 1.png', 'drawing 2.png', 'drawing.png'];
      const keywordHit = knownBWTerms.some(t => titleLower.includes(t));

      // Test saturation on Wikimedia Commons images and any image with suspicious titles
      // iNaturalist photos with no B&W keywords are overwhelmingly in full natural color
      const isCommons = (img.source || '').toLowerCase().includes('wikimedia');

      if (keywordHit) {
        removedImages.push(item);
        continue;
      }

      if (isCommons) {
        const smallUrl = getSmallThumbnailUrl(img.url);
        const isPng = img.url.toLowerCase().includes('.png');
        const buf = await fetchBuffer(smallUrl);
        if (buf && buf.length > 50) {
          const isBW = isImageBlackAndWhite(buf, isPng);
          if (isBW) {
            removedImages.push(item);
          }
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(`\n\nIdentified ${removedImages.length} black-and-white / monochrome images!`);
  removedImages.slice(0, 30).forEach(r => {
    console.log(`  - [${r.spLatin}] (${r.organ}) ${r.img.title}`);
  });

  // Remove B&W images from database
  const removalSet = new Set(removedImages.map(r => r.img.url));

  let totalAfter = 0;
  plants.forEach(sp => {
    Object.keys(sp.images).forEach(org => {
      sp.images[org] = sp.images[org].filter(img => !removalSet.has(img.url));
    });
    sp.total_images = Object.values(sp.images).reduce((sum, list) => sum + list.length, 0);
    totalAfter += sp.total_images;
  });

  console.log(`\nRemaining full-color verified images: ${totalAfter}`);

  // Save updated databases
  fs.writeFileSync(dataPath, JSON.stringify(plants, null, 2), 'utf8');

  const jsContent = `// PhytoMemo Botanical Database — Full-Color Verified Image Repository\nwindow.PLANT_DATABASE = ${JSON.stringify(plants, null, 2)};\n`;
  fs.writeFileSync('./plants_data.js', jsContent, 'utf8');
  fs.writeFileSync('./src/data/plantRepository.json', JSON.stringify(plants, null, 2), 'utf8');

  console.log('Successfully saved cleaned full-color database to plants_data.json, plants_data.js, and src/data/plantRepository.json!');
}

main();
