const fs = require('fs');
const path = require('path');

const TARGET_CATS = [
  'premature_fruit',
  'seed_pot',
  'leaves_closeup',
  'bark_closeup',
  'tree_shape',
  'bark',
  'buds',
  'leaves_underside'
];

const inputPath = path.join(__dirname, '../data/plants_data.json');
const outputPathJson = path.join(__dirname, '../data/plants_data.json');
const outputPathJs = path.join(__dirname, '../data/plants_data.js');

const plants = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function cleanImg(im, cat) {
  return {
    url: im.url,
    title: im.title || '',
    author: im.author || '',
    source: im.source || '',
    organ: cat
  };
}

const migrated = plants.map(sp => {
  const result = {};
  TARGET_CATS.forEach(c => { result[c] = []; });
  const unclassified = [];

  const allImgs = [];
  Object.entries(sp.images || {}).forEach(([org, list]) => {
    if (Array.isArray(list)) {
      list.forEach(im => allImgs.push({ originalOrgan: org, ...im }));
    }
  });

  allImgs.forEach(im => {
    const t = (im.title || '').toLowerCase();
    const o = im.originalOrgan || '';

    // Leaves underside
    if (o === 'leaves_underside' || t.includes('underside') || t.includes('abaxial') || t.includes('unterseite') || t.includes('stomata')) {
      if (result.leaves_underside.length < 2) {
        result.leaves_underside.push(cleanImg(im, 'leaves_underside'));
        return;
      }
    }

    // Buds
    if (o === 'buds_winter' || t.includes('bud') || t.includes('knospe') || t.includes('knopp') || t.includes('knop') || t.includes('gemma')) {
      if (result.buds.length < 2) {
        result.buds.push(cleanImg(im, 'buds'));
        return;
      }
    }

    // Tree shape
    if (o === 'tree_shape' || t.includes('habit') || t.includes('solitary') || t.includes('silhouette') || t.includes('tree ') || t.includes('canopy') || t.includes('baum') || t.includes('arbre')) {
      if (result.tree_shape.length < 2) {
        result.tree_shape.push(cleanImg(im, 'tree_shape'));
        return;
      }
    }

    // Premature fruit: unripe, green fruit, flowers/catkins/cones
    if (t.includes('young cone') || t.includes('female cone') || t.includes('unripe') || t.includes('immature') || t.includes('green fruit') || t.includes('catkin') || t.includes('flower') || t.includes('inflorescence') || t.includes('blossom') || o === 'flowers') {
      if (result.premature_fruit.length < 2) {
        result.premature_fruit.push(cleanImg(im, 'premature_fruit'));
        return;
      }
    }

    // Seed pot: fruits, cones, seeds, pods, samaras
    if (o === 'fruits_seeds' || t.includes('seed') || t.includes('cone') || t.includes('pod') || t.includes('pot') || t.includes('samara') || t.includes('acorn') || t.includes('fruit') || t.includes('nut') || t.includes('drupe') || t.includes('berry') || t.includes('capsule')) {
      if (result.seed_pot.length < 2) {
        result.seed_pot.push(cleanImg(im, 'seed_pot'));
        return;
      }
    }

    // Bark closeup vs Bark
    if ((o === 'bark' || t.includes('bark') || t.includes('trunk') || t.includes('rinde')) && (t.includes('slice') || t.includes('detail') || t.includes('texture') || t.includes('close') || t.includes('macro'))) {
      if (result.bark_closeup.length < 2) {
        result.bark_closeup.push(cleanImg(im, 'bark_closeup'));
        return;
      }
    }

    if (o === 'bark' || t.includes('bark') || t.includes('trunk') || t.includes('rinde') || t.includes('borke')) {
      if (result.bark.length < 2) {
        result.bark.push(cleanImg(im, 'bark'));
        return;
      } else if (result.bark_closeup.length < 2) {
        result.bark_closeup.push(cleanImg(im, 'bark_closeup'));
        return;
      }
    }

    // Leaves closeup
    if (o === 'leaves_top' || t.includes('leaf') || t.includes('leaves') || t.includes('foliage') || t.includes('needle') || t.includes('blatt')) {
      if (result.leaves_closeup.length < 2) {
        result.leaves_closeup.push(cleanImg(im, 'leaves_closeup'));
        return;
      }
    }

    // Stem / Twig can fill buds or bark_closeup if empty
    if (o === 'stem_branch' || t.includes('twig') || t.includes('branch') || t.includes('zweig')) {
      if (result.buds.length < 2) {
        result.buds.push(cleanImg(im, 'buds'));
        return;
      }
      if (result.bark_closeup.length < 2) {
        result.bark_closeup.push(cleanImg(im, 'bark_closeup'));
        return;
      }
    }

    // Fallbacks for remaining empty categories
    if (result.premature_fruit.length < 2 && (o === 'fruits_seeds' || o === 'flowers')) {
      result.premature_fruit.push(cleanImg(im, 'premature_fruit'));
      return;
    }
    if (result.seed_pot.length < 2 && (o === 'fruits_seeds' || o === 'flowers')) {
      result.seed_pot.push(cleanImg(im, 'seed_pot'));
      return;
    }
    if (result.bark_closeup.length < 2 && o === 'bark') {
      result.bark_closeup.push(cleanImg(im, 'bark_closeup'));
      return;
    }
    if (result.bark.length < 2 && o === 'bark') {
      result.bark.push(cleanImg(im, 'bark'));
      return;
    }

    unclassified.push(cleanImg(im, 'unclassified'));
  });

  const activeCount = TARGET_CATS.reduce((sum, c) => sum + result[c].length, 0);
  result.unclassified = unclassified;

  return {
    id: sp.id,
    latin: sp.latin,
    clean_latin: sp.clean_latin,
    family: sp.family,
    plant_type: sp.plant_type,
    total_images: activeCount,
    images: result
  };
});

fs.writeFileSync(outputPathJson, JSON.stringify(migrated, null, 2), 'utf8');
console.log(`Saved ${migrated.length} species to ${outputPathJson}`);

const jsContent = `window.PLANT_DATABASE = ${JSON.stringify(migrated, null, 2)};\n`;
fs.writeFileSync(outputPathJs, jsContent, 'utf8');
console.log(`Saved ${migrated.length} species to ${outputPathJs}`);
