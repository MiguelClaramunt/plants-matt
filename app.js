// ==========================================
// PhytoMemo — Tree Identification App Engine
// ==========================================

const ORGAN_METADATA = {
  bark: { label: 'Bark', icon: '🪵', order: 1 },
  botanical_illustration: { label: 'Botanical Illustration', icon: '🎨', order: 2 },
  buds_winter: { label: 'Winter Buds & Buds', icon: '❄️', order: 3 },
  leaves_top: { label: 'Leaves (Top / Needles)', icon: '🍃', order: 4 },
  leaves_underside: { label: 'Leaves (Underside)', icon: '🍃', order: 5 },
  flowers: { label: 'Flowers & Catkins', icon: '🌸', order: 6 },
  fruits_seeds: { label: 'Fruits, Cones & Seeds', icon: '🌰', order: 7 },
  stem_branch: { label: 'Twigs & Branches', icon: '🌿', order: 8 },
  tree_shape: { label: 'Tree Habit & Shape', icon: '🌲', order: 9 }
};

// Global App State
let allSpecies = [];
let selectedSpeciesIds = new Set();
let activeFamilyFilter = 'ALL';
let activeOrganFilters = new Set(Object.keys(ORGAN_METADATA));
let quizSize = 20;
let answerType = 'latin';
let feedbackTiming = 'end'; // 'end' = Exam mode, 'instant' = Practice mode
let clueMode = 'progressive';
let fuzzyTolerance = true;

// Active Quiz State
let quizQuestions = [];
let currentQuestionIndex = 0;
let quizUserScore = 0;
let quizAnswersRecord = [];
let userExamAnswers = {}; // Map of questionIndex -> string
let currentQuestion = null;
let currentRevealedClues = [];

// Discard & Curation State
let discardedImages = [];
let discardedUrlSet = new Set();

// Atlas, Gallery, and Slideshow State
let atlasMode = 'catalog'; // 'catalog' or 'gallery'
let galleryActiveOrgan = 'ALL';
let galleryFilteredImages = [];
let galleryPage = 1;
const GALLERY_PAGE_SIZE = 60;
let activeSpeciesModalId = null;
let speciesModalActiveOrgan = 'ALL';

// Slideshow State
let slideshowActiveList = [];
let slideshowCurrentIndex = 0;
let slideshowCropBottom = 0;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await initDatabase();
  initDiscardedStorage();
  setupOrganCheckboxes();
  setupFamilyFilterPills();
  renderSpeciesSelectorList();
  updateSelectedCountBadge();
  updateFeedbackTimingSelection();
  initKeyListeners();
});

function updateFeedbackTimingSelection() {
  const radio = document.querySelector('input[name="feedback-timing"]:checked');
  if (radio) {
    feedbackTiming = radio.value;
  }
  const endLabel = document.getElementById('feedback-timing-end-label');
  const instantLabel = document.getElementById('feedback-timing-instant-label');
  if (endLabel && instantLabel) {
    if (feedbackTiming === 'end') {
      endLabel.className = 'flex items-start gap-3 p-2.5 rounded-xl border border-emerald-700/50 bg-emerald-950/20 cursor-pointer hover:bg-emerald-950/40 transition';
      instantLabel.className = 'flex items-start gap-3 p-2.5 rounded-xl border border-stone-800 bg-stone-950/40 cursor-pointer hover:bg-stone-800/60 transition';
    } else {
      endLabel.className = 'flex items-start gap-3 p-2.5 rounded-xl border border-stone-800 bg-stone-950/40 cursor-pointer hover:bg-stone-800/60 transition';
      instantLabel.className = 'flex items-start gap-3 p-2.5 rounded-xl border border-emerald-700/50 bg-emerald-950/20 cursor-pointer hover:bg-emerald-950/40 transition';
    }
  }
}

// Load Database (window.PLANT_DATABASE or fetch)
async function initDatabase() {
  if (window.PLANT_DATABASE && Array.isArray(window.PLANT_DATABASE)) {
    allSpecies = [...window.PLANT_DATABASE];
  } else {
    try {
      const resp = await fetch('plants_data.json');
      allSpecies = await resp.json();
    } catch (e) {
      console.error('Failed to load database:', e);
      allSpecies = [];
    }
  }

  // Check for custom added species in localStorage
  const savedCustom = localStorage.getItem('phytomemo_custom_plants');
  if (savedCustom) {
    try {
      const customList = JSON.parse(savedCustom);
      allSpecies = [...allSpecies, ...customList];
    } catch (err) {
      console.warn('Could not parse custom plants:', err);
    }
  }

  // By default, select all species
  selectedSpeciesIds = new Set(allSpecies.map(s => s.id));
  document.getElementById('export-species-count').textContent = allSpecies.length;
}

// Setup Organ Checkboxes in UI (Safely handles optional selector)
function setupOrganCheckboxes() {
  const container = document.getElementById('organ-checkboxes-container');
  if (!container) return;
  container.innerHTML = '';
  
  Object.entries(ORGAN_METADATA).forEach(([key, meta]) => {
    const isChecked = activeOrganFilters.has(key);
    const label = document.createElement('label');
    label.className = `flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition ${
      isChecked 
        ? 'bg-stone-950 border-emerald-800/80 text-emerald-300' 
        : 'bg-stone-950/40 border-stone-800 text-stone-400'
    }`;
    label.innerHTML = `
      <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''} onchange="onOrganToggle('${key}', this.checked, this.parentElement)" class="w-3.5 h-3.5 rounded text-emerald-600 accent-emerald-600" />
      <span class="truncate">${meta.icon} ${meta.label}</span>
    `;
    container.appendChild(label);
  });
}

function onOrganToggle(key, isChecked, parentEl) {
  if (isChecked) {
    activeOrganFilters.add(key);
    if (parentEl) parentEl.className = 'flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition bg-stone-950 border-emerald-800/80 text-emerald-300';
  } else {
    activeOrganFilters.delete(key);
    if (parentEl) parentEl.className = 'flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition bg-stone-950/40 border-stone-800 text-stone-400';
  }
}

function toggleAllOrgans() {
  const allKeys = Object.keys(ORGAN_METADATA);
  if (activeOrganFilters.size === allKeys.length) {
    activeOrganFilters.clear();
  } else {
    activeOrganFilters = new Set(allKeys);
  }
  setupOrganCheckboxes();
}

// Setup Family Filters
function setupFamilyFilterPills() {
  const container = document.getElementById('family-filter-pills');
  const families = {};
  allSpecies.forEach(sp => {
    families[sp.family] = (families[sp.family] || 0) + 1;
  });

  const sortedFamilies = Object.entries(families).sort((a, b) => b[1] - a[1]);
  
  let html = `
    <button onclick="setFamilyFilter('ALL')" class="px-2.5 py-1 rounded-full text-xs font-semibold transition ${activeFamilyFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'}">
      All (${allSpecies.length})
    </button>
  `;

  sortedFamilies.forEach(([fam, count]) => {
    const isActive = activeFamilyFilter === fam;
    html += `
      <button onclick="setFamilyFilter('${fam}')" class="px-2.5 py-1 rounded-full text-xs font-semibold transition ${isActive ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400 hover:text-white'}">
        ${fam} (${count})
      </button>
    `;
  });

  container.innerHTML = html;
}

function setFamilyFilter(family) {
  activeFamilyFilter = family;
  setupFamilyFilterPills();
  renderSpeciesSelectorList();
}

// Render Species Checkboxes Grid
function renderSpeciesSelectorList() {
  const container = document.getElementById('species-checklist-container');
  const searchTerm = (document.getElementById('species-search-input')?.value || '').toLowerCase().trim();

  const filtered = allSpecies.filter(sp => {
    if (activeFamilyFilter !== 'ALL' && sp.family !== activeFamilyFilter) {
      return false;
    }
    if (searchTerm) {
      const matchLatin = sp.latin.toLowerCase().includes(searchTerm);
      const matchFamily = sp.family.toLowerCase().includes(searchTerm);
      if (!matchLatin && !matchFamily) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-stone-500 text-xs">
        No species matching criteria.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(sp => {
    const isChecked = selectedSpeciesIds.has(sp.id);
    const isConifer = sp.plant_type === 'conifer';
    return `
      <label class="flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
        isChecked 
          ? 'bg-stone-900 border-emerald-900/80 hover:border-emerald-700' 
          : 'bg-stone-950/60 border-stone-800/80 opacity-60 hover:opacity-100 hover:border-stone-700'
      }">
        <div class="flex items-center gap-3 min-w-0 pr-2">
          <input 
            type="checkbox" 
            value="${sp.id}" 
            ${isChecked ? 'checked' : ''} 
            onchange="toggleSpeciesSelect('${sp.id}', this.checked)"
            class="w-4 h-4 rounded text-emerald-600 accent-emerald-600 shrink-0" 
          />
          <div class="truncate">
            <div class="flex items-center gap-2">
              <span class="font-botanical italic font-semibold text-sm text-stone-100">${sp.latin}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded ${isConifer ? 'bg-amber-950/60 text-amber-300 border border-amber-800' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'}">
                ${isConifer ? '🌲 Conifer' : '🍃 Broadleaf'}
              </span>
            </div>
            <div class="text-[11px] text-stone-400 font-mono truncate">
              ${sp.family}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 text-right">
          <span class="text-[11px] font-mono text-stone-400 hidden sm:inline">${sp.family}</span>
          <span class="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
            ${sp.total_images || 10} imgs
          </span>
        </div>
      </label>
    `;
  }).join('');
}

function toggleSpeciesSelect(id, checked) {
  if (checked) {
    selectedSpeciesIds.add(id);
  } else {
    selectedSpeciesIds.delete(id);
  }
  updateSelectedCountBadge();
  renderSpeciesSelectorList();
}

function selectAllSpecies(select) {
  if (select) {
    selectedSpeciesIds = new Set(allSpecies.map(s => s.id));
  } else {
    selectedSpeciesIds.clear();
  }
  updateSelectedCountBadge();
  renderSpeciesSelectorList();
}

function selectByType(type) {
  selectedSpeciesIds.clear();
  allSpecies.forEach(sp => {
    if (sp.plant_type === type) {
      selectedSpeciesIds.add(sp.id);
    }
  });
  updateSelectedCountBadge();
  renderSpeciesSelectorList();
}

function updateSelectedCountBadge() {
  const badge = document.getElementById('selected-species-count');
  badge.textContent = `${selectedSpeciesIds.size} / ${allSpecies.length} Selected`;

  // Update slider max
  const slider = document.getElementById('quiz-size-slider');
  if (slider) {
    slider.max = Math.max(3, selectedSpeciesIds.size);
    if (quizSize > selectedSpeciesIds.size && quizSize !== 'all') {
      quizSize = Math.max(3, selectedSpeciesIds.size);
      slider.value = quizSize;
      document.getElementById('quiz-size-display').textContent = `${quizSize} questions`;
    }
  }
}

// Quiz Size Handlers
function setQuizSize(size) {
  quizSize = size;
  const display = document.getElementById('quiz-size-display');
  const slider = document.getElementById('quiz-size-slider');
  
  document.querySelectorAll('.quiz-size-btn').forEach(b => {
    b.className = 'quiz-size-btn px-2 py-1.5 text-xs font-bold rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition';
  });

  if (size === 'all') {
    display.textContent = `All (${selectedSpeciesIds.size}) questions`;
    if (slider) slider.value = selectedSpeciesIds.size;
  } else {
    display.textContent = `${size} questions`;
    if (slider) slider.value = size;
  }
  
  // Highlight clicked button
  event?.target?.classList?.remove('bg-stone-800', 'text-stone-300');
  event?.target?.classList?.add('bg-emerald-600', 'text-white');
}

function onQuizSliderChange(val) {
  quizSize = parseInt(val, 10);
  document.getElementById('quiz-size-display').textContent = `${quizSize} questions`;
  document.querySelectorAll('.quiz-size-btn').forEach(b => {
    b.className = 'quiz-size-btn px-2 py-1.5 text-xs font-bold rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition';
  });
}

// ==========================================
// QUIZ GENERATION & GAMEPLAY
// ==========================================

function startQuiz(customSpeciesSubset = null) {
  const speciesPool = customSpeciesSubset 
    ? customSpeciesSubset 
    : allSpecies.filter(s => selectedSpeciesIds.has(s.id));

  if (speciesPool.length === 0) {
    alert('Please select at least 1 species to begin the quiz.');
    return;
  }

  // Read settings
  clueMode = document.getElementById('clue-mode-select')?.value || 'progressive';
  fuzzyTolerance = document.getElementById('fuzzy-spelling-checkbox')?.checked ?? true;
  const answerRadio = document.querySelector('input[name="answer-type"]:checked');
  answerType = answerRadio ? answerRadio.value : 'latin';

  const timingRadio = document.querySelector('input[name="feedback-timing"]:checked');
  feedbackTiming = timingRadio ? timingRadio.value : 'end';

  // Shuffle species
  const shuffledSpecies = [...speciesPool].sort(() => 0.5 - Math.random());
  const count = (quizSize === 'all' || quizSize > shuffledSpecies.length) ? shuffledSpecies.length : quizSize;

  quizQuestions = [];
  const selectedSubset = shuffledSpecies.slice(0, count);

  selectedSubset.forEach(species => {
    // Gather all verified diagnostic photos for this species
    const allImages = [];
    Object.entries(species.images || {}).forEach(([k, imgs]) => {
      imgs.forEach(im => allImages.push({ organ: k, ...im }));
    });

    if (allImages.length === 0) return;

    // Shuffle and pick primary image + extra clue images
    const shuffledImgs = [...allImages].sort(() => 0.5 - Math.random());
    const chosenImg = shuffledImgs[0];
    const otherClues = shuffledImgs.slice(1);

    quizQuestions.push({
      species,
      primaryImage: chosenImg,
      otherOrganClues: otherClues,
      revealedExtraClues: []
    });
  });

  currentQuestionIndex = 0;
  quizUserScore = 0;
  quizAnswersRecord = [];
  userExamAnswers = {};

  // Setup UI for Exam Mode vs Practice Mode
  const navBar = document.getElementById('exam-navigator-bar');
  const finishEarlyBtn = document.getElementById('exam-finish-early-btn');
  const prevBtn = document.getElementById('exam-prev-btn');
  const modeTip = document.getElementById('exam-mode-tip');
  const statusLabel = document.getElementById('quiz-status-label');

  if (feedbackTiming === 'end') {
    navBar.classList.remove('hidden');
    finishEarlyBtn.classList.remove('hidden');
    prevBtn.classList.remove('hidden');
    modeTip.classList.remove('hidden');
    statusLabel.textContent = 'Answered:';
  } else {
    navBar.classList.add('hidden');
    finishEarlyBtn.classList.add('hidden');
    prevBtn.classList.add('hidden');
    modeTip.classList.add('hidden');
    statusLabel.textContent = 'Score:';
  }

  showView('quiz-view');
  renderCurrentQuestion();
}

function countAnsweredExamQuestions() {
  return Object.values(userExamAnswers).filter(val => val !== undefined && val !== '').length;
}

function renderExamNavigator() {
  if (feedbackTiming !== 'end') return;
  const palette = document.getElementById('exam-question-palette');
  const summary = document.getElementById('exam-answered-summary');
  
  const answeredCount = countAnsweredExamQuestions();
  summary.textContent = `${answeredCount} / ${quizQuestions.length} Answered`;

  palette.innerHTML = quizQuestions.map((_, idx) => {
    const isCurrent = idx === currentQuestionIndex;
    const isAnswered = userExamAnswers[idx] !== undefined && userExamAnswers[idx].trim() !== '';
    let btnStyle = 'bg-stone-800 text-stone-400 hover:text-stone-200';
    if (isAnswered) {
      btnStyle = 'bg-emerald-950 border border-emerald-700 text-emerald-300';
    }
    if (isCurrent) {
      btnStyle = 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-400';
    }

    return `
      <button 
        type="button" 
        onclick="jumpToQuestion(${idx})" 
        class="w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition ${btnStyle}"
        title="Question ${idx + 1} ${isAnswered ? '(Answered)' : '(Unanswered)'}"
      >
        ${idx + 1}
      </button>
    `;
  }).join('');
}

function renderCurrentQuestion() {
  if (currentQuestionIndex >= quizQuestions.length) {
    finishQuiz();
    return;
  }

  currentQuestion = quizQuestions[currentQuestionIndex];
  const qNum = currentQuestionIndex + 1;
  const totalQ = quizQuestions.length;

  // Header updates
  document.getElementById('quiz-progress-text').textContent = `Question ${qNum} of ${totalQ}`;
  const pct = Math.round((qNum / totalQ) * 100);
  document.getElementById('quiz-progress-bar').style.width = `${pct}%`;
  
  if (feedbackTiming === 'end') {
    const answeredCount = countAnsweredExamQuestions();
    document.getElementById('quiz-live-score').textContent = `${answeredCount} / ${totalQ}`;
    renderExamNavigator();
  } else {
    const currentPct = currentQuestionIndex > 0 ? Math.round((quizUserScore / currentQuestionIndex) * 100) : 0;
    document.getElementById('quiz-live-score').textContent = `${quizUserScore} / ${currentQuestionIndex} (${currentPct}%)`;
  }

  // Display Image with Transparent Anti-Cheat Detection
  const imgEl = document.getElementById('quiz-primary-img');
  if (currentQuestion.primaryImage && currentQuestion.primaryImage.url) {
    imgEl.src = currentQuestion.primaryImage.url;
    document.getElementById('quiz-image-source').textContent = currentQuestion.primaryImage.source || 'Wikimedia Commons';
    
    // Auto-detect botanical illustrations or plates containing plant names - transparently clip text
    const requiresCrop = shouldCropImage(currentQuestion.primaryImage);
    applyInteractiveCrop(requiresCrop ? 14 : 0);
  } else {
    imgEl.src = '';
    document.getElementById('quiz-image-source').textContent = 'Repository Image';
    applyInteractiveCrop(0);
  }

  // Clear extra clues container
  const extraContainer = document.getElementById('quiz-extra-clues-container');
  const extraGrid = document.getElementById('quiz-extra-clues-grid');
  extraGrid.innerHTML = '';
  extraContainer.classList.add('hidden');

  // Handle clue mode
  const revealBtn = document.getElementById('reveal-hint-btn');
  if (clueMode === 'single') {
    revealBtn.classList.add('hidden');
  } else {
    revealBtn.classList.remove('hidden');
    if (clueMode === 'multi' && currentQuestion.otherOrganClues.length > 0) {
      revealAdditionalClue();
      revealAdditionalClue();
    }
  }

  // Reset Input and Feedback views
  document.getElementById('quiz-input-section').classList.remove('hidden');
  document.getElementById('quiz-feedback-section').classList.add('hidden');
  
  const inputEl = document.getElementById('quiz-user-input');
  inputEl.disabled = false;

  // Restore previously typed answer if in Exam Mode
  if (feedbackTiming === 'end' && userExamAnswers[currentQuestionIndex]) {
    inputEl.value = userExamAnswers[currentQuestionIndex];
  } else {
    inputEl.value = '';
  }

  // Prev / Next button adjustments in Exam Mode
  const prevBtn = document.getElementById('exam-prev-btn');
  if (feedbackTiming === 'end') {
    if (currentQuestionIndex === 0) {
      prevBtn.classList.add('opacity-40', 'cursor-not-allowed');
      prevBtn.disabled = true;
    } else {
      prevBtn.classList.remove('opacity-40', 'cursor-not-allowed');
      prevBtn.disabled = false;
    }

    const actionText = document.getElementById('quiz-submit-action-text');
    if (currentQuestionIndex === totalQ - 1) {
      actionText.textContent = 'Save & Submit All 🏁';
    } else {
      actionText.textContent = 'Next →';
    }
  } else {
    document.getElementById('quiz-submit-action-text').textContent = 'Check';
  }

  const labelEl = document.getElementById('quiz-input-label');
  labelEl.textContent = 'What is the Latin scientific name of this species? (e.g. Acer platanoides)';
  inputEl.placeholder = 'Type scientific Latin name...';

  setTimeout(() => inputEl.focus(), 50);
}

function navigateExamQuestion(delta) {
  if (feedbackTiming !== 'end') return;
  // Save current input value
  const inputEl = document.getElementById('quiz-user-input');
  if (inputEl && inputEl.value.trim()) {
    userExamAnswers[currentQuestionIndex] = inputEl.value.trim();
  }

  const newIdx = currentQuestionIndex + delta;
  if (newIdx >= 0 && newIdx < quizQuestions.length) {
    currentQuestionIndex = newIdx;
    renderCurrentQuestion();
  }
}

function jumpToQuestion(index) {
  if (feedbackTiming !== 'end') return;
  // Save current input value
  const inputEl = document.getElementById('quiz-user-input');
  if (inputEl && inputEl.value.trim()) {
    userExamAnswers[currentQuestionIndex] = inputEl.value.trim();
  }

  if (index >= 0 && index < quizQuestions.length) {
    currentQuestionIndex = index;
    renderCurrentQuestion();
  }
}

function confirmSubmitExamEarly() {
  const answered = countAnsweredExamQuestions();
  const total = quizQuestions.length;
  const unanswered = total - answered;

  const msg = unanswered > 0
    ? `You have answered ${answered} of ${total} questions (${unanswered} unanswered).\n\nDo you want to finish the exam now and view your results?`
    : `You have answered all ${total} questions!\n\nSubmit your exam to showcase your results?`;

  if (confirm(msg)) {
    // Save current input if non-empty
    const inputEl = document.getElementById('quiz-user-input');
    if (inputEl && inputEl.value.trim()) {
      userExamAnswers[currentQuestionIndex] = inputEl.value.trim();
    }
    finishQuiz();
  }
}

function revealAdditionalClue() {
  if (!currentQuestion || currentQuestion.otherOrganClues.length === 0) {
    alert('No additional diagnostic photos available for this species.');
    return;
  }

  const clue = currentQuestion.otherOrganClues.shift();
  currentQuestion.revealedExtraClues.push(clue);

  const extraContainer = document.getElementById('quiz-extra-clues-container');
  const extraGrid = document.getElementById('quiz-extra-clues-grid');
  extraContainer.classList.remove('hidden');

  const card = document.createElement('div');
  card.className = 'relative bg-stone-900 border border-stone-800 rounded-lg overflow-hidden group cursor-pointer hover:border-emerald-600 transition';
  card.onclick = () => openLightbox(clue.url, currentQuestion.species.latin, clue.author);
  card.innerHTML = `
    <img src="${clue.url}" alt="${currentQuestion.species.latin}" class="h-24 w-full object-cover group-hover:scale-105 transition" />
    <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition flex items-center justify-center opacity-0 group-hover:opacity-100">
      <span class="text-white text-xs drop-shadow">🔍</span>
    </div>
  `;
  extraGrid.appendChild(card);

  if (currentQuestion.otherOrganClues.length === 0) {
    document.getElementById('reveal-hint-btn')?.classList.add('hidden');
  }
}

function discardCurrentQuizPhoto() {
  if (!currentQuestion || !currentQuestion.primaryImage) return;

  const oldImg = currentQuestion.primaryImage;
  const sp = currentQuestion.species;

  // Discard the photo permanently
  discardImage(oldImg.url, sp.latin, oldImg.organ, oldImg.title, oldImg.author, oldImg.source, true);

  // 1. Try to get another photo from this species remaining clues
  let newImg = null;
  if (currentQuestion.otherOrganClues && currentQuestion.otherOrganClues.length > 0) {
    newImg = currentQuestion.otherOrganClues.shift();
  } else {
    // Gather all valid remaining images for this species from database
    const remaining = [];
    Object.entries(sp.images || {}).forEach(([orgKey, list]) => {
      list.forEach(im => {
        if (im.url !== oldImg.url && !discardedUrlSet.has(im.url)) {
          remaining.push({ organ: orgKey, ...im });
        }
      });
    });
    if (remaining.length > 0) {
      newImg = remaining[Math.floor(Math.random() * remaining.length)];
    }
  }

  if (newImg) {
    // Replace current question photo
    currentQuestion.primaryImage = newImg;
    
    // Update live quiz display
    const imgEl = document.getElementById('quiz-primary-img');
    if (imgEl) imgEl.src = newImg.url;
    const srcEl = document.getElementById('quiz-image-source');
    if (srcEl) srcEl.textContent = newImg.source || 'Wikimedia Commons';

    const requiresCrop = shouldCropImage(newImg);
    applyInteractiveCrop(requiresCrop ? 14 : 0);

    // If Lightbox is open, update it too
    const lbModal = document.getElementById('lightbox-modal');
    if (lbModal && !lbModal.classList.contains('hidden')) {
      const lbImg = document.getElementById('lightbox-img');
      if (lbImg) lbImg.src = newImg.url;
    }

    // If in Practice Feedback view, update feedback gallery as well
    const feedbackSec = document.getElementById('quiz-feedback-section');
    if (feedbackSec && !feedbackSec.classList.contains('hidden')) {
      const totalSpeciesImgs = [];
      Object.values(sp.images || {}).forEach(list => {
        list.forEach(img => {
          if (!discardedUrlSet.has(img.url)) totalSpeciesImgs.push(img);
        });
      });
      const countBadge = document.getElementById('feedback-photos-count');
      if (countBadge) countBadge.textContent = totalSpeciesImgs.length;
    }

    showToast(`Discarded photo • Replaced with another photo for ${sp.latin}`, 'Undo', () => {
      restoreImage(oldImg.url);
    });
  } else {
    // This species has no other photos left in database!
    // Swap question with a substitute species from allSpecies not currently in quiz
    const existingSpeciesIds = new Set(quizQuestions.map(q => q.species.id));
    const candidateSpecies = allSpecies.filter(s => 
      !existingSpeciesIds.has(s.id) && 
      (s.total_images || 0) > 0 &&
      (selectedSpeciesIds.length === 0 || selectedSpeciesIds.includes(s.id))
    );

    const replacementSp = candidateSpecies.length > 0 
      ? candidateSpecies[Math.floor(Math.random() * candidateSpecies.length)]
      : allSpecies.find(s => (s.total_images || 0) > 0);

    if (replacementSp) {
      const allImgs = [];
      Object.entries(replacementSp.images || {}).forEach(([k, imgs]) => {
        imgs.forEach(im => allImgs.push({ organ: k, ...im }));
      });
      const shuffled = allImgs.sort(() => 0.5 - Math.random());
      const repImg = shuffled[0];
      const otherClues = shuffled.slice(1);

      currentQuestion.species = replacementSp;
      currentQuestion.primaryImage = repImg;
      currentQuestion.otherOrganClues = otherClues;
      currentQuestion.revealedExtraClues = [];

      // Reset Exam Mode answer for this question
      if (feedbackTiming === 'end') {
        userExamAnswers[currentQuestionIndex] = '';
        renderExamNavigator();
      }

      renderCurrentQuestion();
      showToast(`Species photos exhausted • Replaced question with ${replacementSp.latin}`);
    } else {
      showToast('Photo discarded. No replacement photos available in database.');
    }
  }
}

// Normalization & Fuzzy Match
function normalizeAnswer(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[×x]/g, 'x')
    .replace(/['"().,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function checkAnswerMatch(userRaw, targetRaw) {
  const u = normalizeAnswer(userRaw);
  const t = normalizeAnswer(targetRaw);

  if (!u) return { isMatch: false, isClose: false };
  if (u === t) return { isMatch: true, isClose: false };

  // Check prefix or genus match
  const uWords = u.split(' ');
  const tWords = t.split(' ');
  if (uWords.length >= 2 && tWords.length >= 2) {
    const uBase = `${uWords[0]} ${uWords[1]}`;
    const tBase = `${tWords[0]} ${tWords[1]}`;
    if (uBase === tBase) return { isMatch: true, isClose: false };
  }

  // Fuzzy check
  if (fuzzyTolerance) {
    const dist = levenshteinDistance(u, t);
    if (dist <= 2) {
      return { isMatch: true, isClose: true };
    }
  }

  return { isMatch: false, isClose: false };
}

// Submit Quiz Answer
function submitQuizAnswer() {
  if (!currentQuestion) return;

  const inputEl = document.getElementById('quiz-user-input');
  const userText = inputEl.value.trim();

  // In Exam Mode: save answer without revealing correctness, advance or finish
  if (feedbackTiming === 'end') {
    if (userText) {
      userExamAnswers[currentQuestionIndex] = userText;
    }
    
    // Check if on last question
    if (currentQuestionIndex === quizQuestions.length - 1) {
      confirmSubmitExamEarly();
    } else {
      currentQuestionIndex++;
      renderCurrentQuestion();
    }
    return;
  }

  // In Practice Mode: validate input and show instant feedback
  if (!userText) {
    inputEl.focus();
    return;
  }

  inputEl.disabled = true;
  evaluateAnswer(userText);
}

function skipQuizAnswer() {
  if (!currentQuestion) return;
  const inputEl = document.getElementById('quiz-user-input');

  if (feedbackTiming === 'end') {
    if (userExamAnswers[currentQuestionIndex] === undefined) {
      userExamAnswers[currentQuestionIndex] = '';
    }
    if (currentQuestionIndex === quizQuestions.length - 1) {
      confirmSubmitExamEarly();
    } else {
      currentQuestionIndex++;
      renderCurrentQuestion();
    }
    return;
  }

  inputEl.disabled = true;
  evaluateAnswer('(Skipped / Unanswered)');
}

function evaluateAnswer(userText) {
  const species = currentQuestion.species;
  const targetAnswer = species.latin;
  
  const { isMatch, isClose } = checkAnswerMatch(userText, targetAnswer);

  if (isMatch) {
    quizUserScore += 1;
  }

  quizAnswersRecord.push({
    questionNumber: currentQuestionIndex + 1,
    species,
    organTested: currentQuestion.primaryOrgan,
    imageShown: currentQuestion.primaryImage,
    userAnswer: userText,
    correctAnswer: targetAnswer,
    isCorrect: isMatch,
    isClose: isClose
  });

  // Render Feedback Card (for practice mode)
  const alertBox = document.getElementById('feedback-alert');
  const titleEl = document.getElementById('feedback-title');
  const subtitleEl = document.getElementById('feedback-subtitle');
  const iconEl = document.getElementById('feedback-icon');

  if (isMatch && !isClose) {
    alertBox.className = 'p-4 rounded-xl border flex items-start justify-between gap-3 bg-emerald-950/60 border-emerald-700/80 text-emerald-100';
    iconEl.textContent = '✅';
    titleEl.textContent = 'Correct! Spot on.';
    subtitleEl.textContent = `You correctly identified ${species.latin}.`;
  } else if (isMatch && isClose) {
    alertBox.className = 'p-4 rounded-xl border flex items-start justify-between gap-3 bg-amber-950/60 border-amber-700/80 text-amber-100';
    iconEl.textContent = '⚠️';
    titleEl.textContent = 'Accepted with Minor Typo';
    subtitleEl.textContent = `Watch exact spelling: ${targetAnswer} (you wrote: "${userText}")`;
  } else {
    alertBox.className = 'p-4 rounded-xl border flex items-start justify-between gap-3 bg-rose-950/60 border-rose-800 text-rose-100';
    iconEl.textContent = '❌';
    titleEl.textContent = 'Incorrect';
    subtitleEl.textContent = `Actual answer: ${targetAnswer} (you wrote: "${userText}")`;
  }

  // Fill Species Key Details
  document.getElementById('feedback-latin-name').textContent = species.latin;
  const famEl = document.getElementById('feedback-family');
  if (famEl) famEl.textContent = species.family;

  // Fill Study Photo Gallery & Quick Slideshow Action
  const totalSpeciesImgs = [];
  Object.values(species.images || {}).forEach(list => {
    list.forEach(img => totalSpeciesImgs.push(img));
  });

  const countBadge = document.getElementById('feedback-photos-count');
  if (countBadge) countBadge.textContent = totalSpeciesImgs.length;

  const quickSlideshowBtn = document.getElementById('feedback-slideshow-quick-btn');
  if (quickSlideshowBtn) {
    quickSlideshowBtn.innerHTML = `<span>📸</span> <span>Slideshow (${totalSpeciesImgs.length})</span>`;
    if (!isMatch) {
      quickSlideshowBtn.className = 'px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 ring-2 ring-emerald-400/50 animate-pulse';
    } else {
      quickSlideshowBtn.className = 'px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-emerald-400 hover:text-emerald-300 border border-emerald-900/60 font-bold text-xs shadow transition flex items-center gap-1.5';
    }
  }

  const gallery = document.getElementById('feedback-all-photos-gallery');
  if (gallery) {
    gallery.innerHTML = '';
    // Show up to 18 photos for instant visual study
    const previewList = totalSpeciesImgs.slice(0, 18);
    previewList.forEach((img, pIdx) => {
      const thumb = document.createElement('div');
      thumb.className = 'relative rounded-lg overflow-hidden bg-stone-900 border border-stone-800 cursor-pointer group hover:border-emerald-500 transition';
      thumb.title = `Click to study ${species.latin} in slideshow`;
      thumb.onclick = () => openFeedbackSpeciesSlideshow(pIdx);
      thumb.innerHTML = `
        <img src="${img.url}" alt="${species.latin}" class="h-16 w-full object-cover group-hover:scale-110 transition duration-200" />
        <div class="absolute inset-0 bg-black/30 group-hover:bg-transparent transition flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span class="text-white text-xs drop-shadow">🔍</span>
        </div>
      `;
      gallery.appendChild(thumb);
    });
  }

  // Uncrop image so student can study the full illustration plate if desired
  applyInteractiveCrop(0);

  // Switch to feedback view
  document.getElementById('quiz-input-section').classList.add('hidden');
  document.getElementById('quiz-feedback-section').classList.remove('hidden');

  // Focus Next button
  setTimeout(() => document.getElementById('next-question-btn')?.focus(), 50);
}

function openFeedbackSpeciesSlideshow(startIndex = 0) {
  if (!currentQuestion || !currentQuestion.species) return;
  startSlideshowForSpecies(currentQuestion.species.id, startIndex);
}

function proceedToNextQuestion() {
  currentQuestionIndex++;
  renderCurrentQuestion();
}

function confirmExitQuiz() {
  if (confirm('Are you sure you want to exit the quiz? Current progress will be lost.')) {
    showView('setup-view');
  }
}

// Key listeners (Shortcuts for quiz, slideshow, modals)
function initKeyListeners() {
  document.addEventListener('keydown', (e) => {
    // If typing in input, textarea, or select, avoid global hotkeys (except Escape to blur)
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      if (e.key === 'Escape') {
        document.activeElement.blur();
      }
      return;
    }

    // Slideshow active hotkeys
    const slideshowModal = document.getElementById('slideshow-modal');
    if (slideshowModal && !slideshowModal.classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        slideshowNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        slideshowPrev();
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        discardCurrentSlideshowImage();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSlideshow();
      }
      return;
    }

    // 'S' shortcut to launch slideshow in quiz feedback
    if (e.key === 's' || e.key === 'S') {
      const feedbackSection = document.getElementById('quiz-feedback-section');
      if (feedbackSection && !feedbackSection.classList.contains('hidden')) {
        e.preventDefault();
        openFeedbackSpeciesSlideshow();
        return;
      }
    }

    // 'D' / Delete shortcut to discard current quiz photo when viewing question
    if (e.key === 'd' || e.key === 'D' || e.key === 'Delete') {
      const quizView = document.getElementById('quiz-view');
      if (quizView && !quizView.classList.contains('hidden')) {
        e.preventDefault();
        discardCurrentQuizPhoto();
        return;
      }
    }

    // Modal Escape shortcuts
    if (e.key === 'Escape') {
      closeSpeciesModal();
      closeTrashModal();
      closeLightbox();
      toggleExportModal(false);
      closeReplacementModal();
      return;
    }

    // Enter in Quiz feedback
    if (e.key === 'Enter') {
      const nextBtn = document.getElementById('next-question-btn');
      const feedbackSection = document.getElementById('quiz-feedback-section');
      if (feedbackSection && !feedbackSection.classList.contains('hidden') && nextBtn) {
        e.preventDefault();
        proceedToNextQuestion();
      }
    }
  });
}

// ==========================================
// RESULTS & REVIEW
// ==========================================

function finishQuiz() {
  showView('results-view');

  // If in Exam Mode, compile and evaluate all answers now!
  if (feedbackTiming === 'end') {
    quizAnswersRecord = [];
    quizUserScore = 0;

    quizQuestions.forEach((q, idx) => {
      const species = q.species;
      const targetAnswer = species.latin;
      const userText = userExamAnswers[idx] ? userExamAnswers[idx].trim() : '(Unanswered)';
      
      const { isMatch, isClose } = checkAnswerMatch(userText, targetAnswer);
      if (isMatch) quizUserScore += 1;

      quizAnswersRecord.push({
        questionNumber: idx + 1,
        species,
        imageShown: q.primaryImage,
        userAnswer: userText,
        correctAnswer: targetAnswer,
        isCorrect: isMatch,
        isClose: isClose
      });
    });
  }

  renderResultsSummary();
}

function renderResultsSummary() {
  const total = quizAnswersRecord.length;
  const correct = quizAnswersRecord.filter(a => a.isCorrect).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('results-score-percent').textContent = `${pct}%`;
  document.getElementById('results-score-fraction').textContent = `${correct} / ${total} Correct`;

  // Mastery Rank
  let rank = 'Botanical Explorer 🌿';
  if (pct === 100) rank = 'Master Dendrologist 🌳 (Perfect Score!)';
  else if (pct >= 85) rank = 'Senior Forester 🌲';
  else if (pct >= 70) rank = 'Certified Field Botanist 🍃';
  else if (pct >= 50) rank = 'Apprentice Botanist 🌱';
  document.getElementById('results-rank-title').textContent = rank;

  // Missed species action controls
  const missedRecords = quizAnswersRecord.filter(a => !a.isCorrect && !a.photoDiscarded);
  const missedCountBadge = document.getElementById('missed-count-badge');
  if (missedCountBadge) missedCountBadge.textContent = missedRecords.length;
  const missedSlideshowBadge = document.getElementById('missed-slideshow-count-badge');
  if (missedSlideshowBadge) missedSlideshowBadge.textContent = missedRecords.length;

  const drillBtn = document.getElementById('drill-missed-btn');
  const missedSlideshowBtn = document.getElementById('slideshow-missed-btn');
  if (missedRecords.length === 0) {
    if (drillBtn) drillBtn.classList.add('hidden');
    if (missedSlideshowBtn) missedSlideshowBtn.classList.add('hidden');
  } else {
    if (drillBtn) drillBtn.classList.remove('hidden');
    if (missedSlideshowBtn) missedSlideshowBtn.classList.remove('hidden');
  }

  // Detailed Review Table
  const reviewTable = document.getElementById('results-review-table');
  reviewTable.innerHTML = quizAnswersRecord.map((rec, recIdx) => {
    const isDiscarded = rec.photoDiscarded && !rec.wasReplaced;
    let statusBg = 'bg-rose-950/30 border-rose-900/60';
    let statusIcon = '❌ Incorrect';
    let statusTextClass = 'text-rose-400';

    if (rec.isCorrect) {
      statusBg = rec.isClose ? 'bg-amber-950/30 border-amber-800/60' : 'bg-emerald-950/30 border-emerald-800/60';
      statusIcon = rec.isClose ? '⚠️ Close' : '✅ Correct';
      statusTextClass = rec.isClose ? 'text-amber-400' : 'text-emerald-400';
    }

    if (isDiscarded) {
      statusBg = 'bg-stone-900 border-amber-800/80';
      statusIcon = '⚠️ Photo Discarded';
      statusTextClass = 'text-amber-300';
    }

    return `
      <div class="p-3.5 rounded-xl border ${statusBg} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="relative shrink-0">
            <img 
              src="${rec.imageShown?.url || ''}" 
              alt="${rec.species.latin}" 
              class="w-16 h-16 rounded-lg object-cover bg-stone-800 cursor-pointer border border-stone-700 hover:scale-105 transition" 
              style="clip-path: inset(0% 0% ${shouldCropImage(rec.imageShown) ? '14%' : '0%'} 0%);"
              title="Click to launch slideshow for ${rec.species.latin}"
              onclick="startSlideshowForSpecies('${rec.species.id}')"
            />
            <span class="absolute bottom-0 left-0 bg-stone-900/90 text-[10px] font-mono px-1 rounded-tr text-stone-300 border-t border-r border-stone-700">
              #${recIdx + 1}
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-0.5 flex-wrap">
              <span class="font-bold font-botanical italic text-stone-100 text-sm truncate">${rec.species.latin}</span>
              ${rec.wasReplaced ? '<span class="px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 text-[10px] font-medium">🔄 Valid Replacement Scored</span>' : ''}
              ${isDiscarded ? '<span class="px-2 py-0.5 rounded bg-amber-950 border border-amber-700/80 text-amber-300 text-[10px] font-medium">Needs Valid Photo</span>' : ''}
            </div>
            <div class="text-stone-400 text-[11px] font-mono">
              Family: ${rec.species.family}
            </div>
            <div class="mt-1 flex items-center gap-2 flex-wrap">
              <span class="text-stone-500">Your answer:</span> 
              <span class="font-mono font-medium ${rec.isCorrect ? 'text-stone-200' : 'text-rose-300 line-through'}">
                "${rec.userAnswer}"
              </span>
            </div>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-2 self-end sm:self-center flex-wrap">
          ${isDiscarded ? `
            <button 
              type="button" 
              onclick="openReplacementQuestionModal(${recIdx})" 
              class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
              title="Answer a new valid photo to complete your exam score"
            >
              <span>🌱</span> <span>Answer Replacement Photo</span>
            </button>
          ` : `
            <button 
              type="button" 
              onclick="discardReviewRowPhoto(${recIdx})" 
              class="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-rose-950/60 text-rose-400 hover:text-rose-200 text-xs font-semibold flex items-center gap-1 border border-stone-700 hover:border-rose-700 transition shadow-sm"
              title="Discard this photo as invalid and answer a replacement question to keep your exam valid"
            >
              <span>🗑️</span> <span>Discard & Swap</span>
            </button>
          `}

          <button 
            type="button" 
            onclick="startSlideshowForSpecies('${rec.species.id}')" 
            class="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 border border-stone-700 hover:border-emerald-700/60 transition shadow-sm"
            title="Open interactive slideshow with all photos of ${rec.species.latin}"
          >
            <span>📸</span> <span>Slideshow</span>
          </button>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${statusTextClass} bg-stone-900 border border-stone-800">
            ${statusIcon}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

let activeReplacementIndex = null;
let activeReplacementQuestion = null;

function discardReviewRowPhoto(recIdx) {
  const rec = quizAnswersRecord[recIdx];
  if (!rec || !rec.imageShown) return;

  discardImage(
    rec.imageShown.url, 
    rec.species.latin, 
    rec.imageShown.organ, 
    rec.imageShown.title, 
    rec.imageShown.author, 
    rec.imageShown.source, 
    true
  );

  rec.photoDiscarded = true;
  rec.wasReplaced = false;

  openReplacementQuestionModal(recIdx);
}

function openReplacementQuestionModal(recIdx) {
  activeReplacementIndex = recIdx;
  const rec = quizAnswersRecord[recIdx];
  if (!rec) return;

  const sp = allSpecies.find(s => s.latin === rec.species.latin || s.id === rec.species.id) || rec.species;
  const unusedImgs = [];
  Object.entries(sp.images || {}).forEach(([org, list]) => {
    list.forEach(im => {
      if (!discardedUrlSet.has(im.url) && im.url !== rec.imageShown?.url) {
        unusedImgs.push({ organ: org, ...im });
      }
    });
  });

  let repSp = sp;
  let repImg = null;

  if (unusedImgs.length > 0) {
    repImg = unusedImgs[Math.floor(Math.random() * unusedImgs.length)];
  } else {
    const examinedIds = new Set(quizAnswersRecord.map(r => r.species.id));
    const alternates = allSpecies.filter(s => !examinedIds.has(s.id) && (s.total_images || 0) > 0);
    repSp = alternates.length > 0 
      ? alternates[Math.floor(Math.random() * alternates.length)]
      : allSpecies.find(s => (s.total_images || 0) > 0);

    const altImgs = [];
    Object.entries(repSp.images || {}).forEach(([org, list]) => {
      list.forEach(im => {
        if (!discardedUrlSet.has(im.url)) altImgs.push({ organ: org, ...im });
      });
    });
    if (altImgs.length > 0) {
      repImg = altImgs[Math.floor(Math.random() * altImgs.length)];
    }
  }

  if (!repImg) {
    showToast('No valid replacement photos available in database.');
    renderResultsSummary();
    return;
  }

  activeReplacementQuestion = {
    species: repSp,
    image: repImg,
    requiresCrop: shouldCropImage(repImg)
  };

  const modal = document.getElementById('replacement-question-modal');
  const imgEl = document.getElementById('replacement-modal-img');
  const inputEl = document.getElementById('replacement-user-input');
  const subEl = document.getElementById('replacement-modal-subtitle');

  if (subEl) {
    subEl.textContent = `Previous photo for Question #${recIdx + 1} was discarded. Answer this replacement question to ensure a complete, valid exam:`;
  }
  if (imgEl) {
    imgEl.src = repImg.url;
    imgEl.style.setProperty('--replacement-crop-bottom', activeReplacementQuestion.requiresCrop ? '14%' : '0%');
  }
  if (inputEl) {
    inputEl.value = '';
  }

  modal.classList.remove('hidden');
  setTimeout(() => inputEl && inputEl.focus(), 80);
}

function discardReplacementModalPhoto() {
  if (!activeReplacementQuestion || !activeReplacementQuestion.image) return;
  const oldImg = activeReplacementQuestion.image;
  const sp = activeReplacementQuestion.species;

  discardImage(oldImg.url, sp.latin, oldImg.organ, oldImg.title, oldImg.author, oldImg.source, true);

  const remaining = [];
  Object.entries(sp.images || {}).forEach(([org, list]) => {
    list.forEach(im => {
      if (!discardedUrlSet.has(im.url) && im.url !== oldImg.url) {
        remaining.push({ organ: org, ...im });
      }
    });
  });

  if (remaining.length > 0) {
    const nextImg = remaining[Math.floor(Math.random() * remaining.length)];
    activeReplacementQuestion.image = nextImg;
    activeReplacementQuestion.requiresCrop = shouldCropImage(nextImg);

    const imgEl = document.getElementById('replacement-modal-img');
    if (imgEl) {
      imgEl.src = nextImg.url;
      imgEl.style.setProperty('--replacement-crop-bottom', activeReplacementQuestion.requiresCrop ? '14%' : '0%');
    }
    showToast('Photo discarded • Swapped with another replacement photo');
  } else {
    openReplacementQuestionModal(activeReplacementIndex);
  }
}

function submitReplacementAnswer() {
  if (activeReplacementIndex === null || !activeReplacementQuestion) return;
  const inputEl = document.getElementById('replacement-user-input');
  const userVal = inputEl ? inputEl.value.trim() : '';

  if (!userVal) {
    if (inputEl) inputEl.focus();
    return;
  }

  const targetAnswer = activeReplacementQuestion.species.latin;
  const { isMatch, isClose } = checkAnswerMatch(userVal, targetAnswer);

  const rec = quizAnswersRecord[activeReplacementIndex];
  rec.species = activeReplacementQuestion.species;
  rec.imageShown = activeReplacementQuestion.image;
  rec.userAnswer = userVal;
  rec.correctAnswer = targetAnswer;
  rec.isCorrect = isMatch;
  rec.isClose = isClose;
  rec.photoDiscarded = false;
  rec.wasReplaced = true;

  closeReplacementModal();
  renderResultsSummary();

  const total = quizAnswersRecord.length;
  const correct = quizAnswersRecord.filter(a => a.isCorrect).length;
  const pct = Math.round((correct / total) * 100);
  showToast(`Question #${activeReplacementIndex + 1} updated! New Score: ${correct} / ${total} (${pct}%)`);
}

function closeReplacementModal() {
  const modal = document.getElementById('replacement-question-modal');
  if (modal) modal.classList.add('hidden');
  activeReplacementIndex = null;
  activeReplacementQuestion = null;
  renderResultsSummary();
}

function startMissedSpeciesSlideshow() {
  const missedSpeciesMap = new Map();
  quizAnswersRecord.forEach(a => {
    if (!a.isCorrect) {
      missedSpeciesMap.set(a.species.id, a.species);
    }
  });

  const missedList = Array.from(missedSpeciesMap.values());
  if (missedList.length === 0) {
    alert('No missed species to review in slideshow!');
    return;
  }

  const allMissedImages = [];
  missedList.forEach(sp => {
    Object.entries(sp.images || {}).forEach(([orgKey, list]) => {
      list.forEach(img => {
        allMissedImages.push({
          url: img.url,
          speciesLatin: sp.latin,
          family: sp.family,
          speciesId: sp.id,
          organ: orgKey,
          title: img.title || '',
          author: img.author || '',
          source: img.source || ''
        });
      });
    });
  });

  if (allMissedImages.length === 0) return;
  openSlideshow(allMissedImages, 0);
}

function startMissedDrillQuiz() {
  const missedSpeciesMap = new Map();
  quizAnswersRecord.forEach(a => {
    if (!a.isCorrect) {
      missedSpeciesMap.set(a.species.id, a.species);
    }
  });

  const missedList = Array.from(missedSpeciesMap.values());
  if (missedList.length === 0) {
    alert('No missed species to drill!');
    return;
  }

  startQuiz(missedList);
}

function restartSameQuiz() {
  startQuiz();
}

// ==========================================
// DISCARDED IMAGES & CURATION ENGINE
// ==========================================

function initDiscardedStorage() {
  const saved = localStorage.getItem('phytomemo_discarded_images');
  if (saved) {
    try {
      discardedImages = JSON.parse(saved);
      discardedUrlSet = new Set(discardedImages.map(d => d.url));
      
      // Purge discarded images from active in-memory database
      allSpecies.forEach(sp => {
        Object.keys(sp.images).forEach(org => {
          sp.images[org] = sp.images[org].filter(img => !discardedUrlSet.has(img.url));
        });
        sp.total_images = Object.values(sp.images).reduce((sum, list) => sum + list.length, 0);
      });
    } catch (e) {
      console.warn('Error loading discarded images:', e);
      discardedImages = [];
      discardedUrlSet = new Set();
    }
  }
  updateDiscardedBadgeCount();
}

function saveDiscardedStorage() {
  localStorage.setItem('phytomemo_discarded_images', JSON.stringify(discardedImages));
  discardedUrlSet = new Set(discardedImages.map(d => d.url));
  updateDiscardedBadgeCount();
}

function updateDiscardedBadgeCount() {
  const badge = document.getElementById('discarded-badge-count');
  if (badge) badge.textContent = discardedImages.length;
  const modalBadge = document.getElementById('trash-modal-count');
  if (modalBadge) modalBadge.textContent = discardedImages.length;
}

function discardImage(url, speciesLatin, organ, title, author, source, silent = false) {
  if (!url) return;
  if (discardedUrlSet.has(url)) return;

  // Find species in allSpecies
  const sp = allSpecies.find(s => s.latin === speciesLatin || s.id === speciesLatin);
  let removedItem = null;
  if (sp && sp.images) {
    if (organ && sp.images[organ]) {
      const idx = sp.images[organ].findIndex(img => img.url === url);
      if (idx !== -1) {
        removedItem = sp.images[organ].splice(idx, 1)[0];
      }
    }
    if (!removedItem) {
      for (const [orgKey, list] of Object.entries(sp.images)) {
        const idx = list.findIndex(img => img.url === url);
        if (idx !== -1) {
          removedItem = list.splice(idx, 1)[0];
          organ = orgKey;
          break;
        }
      }
    }
    sp.total_images = Object.values(sp.images).reduce((sum, list) => sum + list.length, 0);
  }

  const record = {
    url,
    speciesLatin: sp ? sp.latin : (speciesLatin || 'Unknown Species'),
    family: sp ? sp.family : '',
    organ: organ || 'photo',
    title: title || (removedItem ? removedItem.title : ''),
    author: author || (removedItem ? removedItem.author : ''),
    source: source || (removedItem ? removedItem.source : ''),
    timestamp: Date.now()
  };

  discardedImages.unshift(record);
  saveDiscardedStorage();

  if (!silent) {
    showToast(`Discarded image from ${record.speciesLatin}`, 'Undo', () => {
      restoreImage(url);
    });
  }

  // Refresh Views
  if (atlasMode === 'gallery') {
    const gIdx = galleryFilteredImages.findIndex(img => img.url === url);
    if (gIdx !== -1) {
      galleryFilteredImages.splice(gIdx, 1);
      const countEl = document.getElementById('gallery-image-count');
      if (countEl) countEl.textContent = galleryFilteredImages.length;
      renderGalleryGrid();
    }
    setupGalleryFilters();
  } else if (atlasMode === 'catalog') {
    renderAtlasList();
  }

  // If Species Detail modal is open
  if (activeSpeciesModalId && (!document.getElementById('species-modal')?.classList.contains('hidden'))) {
    const activeSp = allSpecies.find(s => s.id === activeSpeciesModalId);
    if (activeSp) {
      const countEl = document.getElementById('species-modal-image-count') || document.getElementById('species-modal-count');
      if (countEl) countEl.textContent = activeSp.total_images || 0;
    }
    renderSpeciesModalGallery();
  }

  // If Slideshow is open
  if (!document.getElementById('slideshow-modal')?.classList.contains('hidden')) {
    const sIdx = slideshowActiveList.findIndex(img => img.url === url);
    if (sIdx !== -1) {
      slideshowActiveList.splice(sIdx, 1);
      if (slideshowActiveList.length === 0) {
        closeSlideshow();
      } else {
        if (slideshowCurrentIndex >= slideshowActiveList.length) {
          slideshowCurrentIndex = slideshowActiveList.length - 1;
        }
        renderCurrentSlide();
      }
    }
  }

  // Update export count
  const expCount = document.getElementById('export-species-count');
  if (expCount) expCount.textContent = allSpecies.length;
}

function restoreImage(url) {
  const idx = discardedImages.findIndex(d => d.url === url);
  if (idx === -1) return;
  const item = discardedImages.splice(idx, 1)[0];
  saveDiscardedStorage();

  // Put back into allSpecies
  const sp = allSpecies.find(s => s.latin === item.speciesLatin);
  if (sp) {
    if (!sp.images[item.organ]) sp.images[item.organ] = [];
    sp.images[item.organ].push({
      url: item.url,
      title: item.title,
      author: item.author,
      source: item.source
    });
    sp.total_images = Object.values(sp.images).reduce((sum, list) => sum + list.length, 0);
  }

  showToast(`Restored image for ${item.speciesLatin}`);

  if (atlasMode === 'gallery') {
    setupGalleryFilters();
    filterGalleryImages();
  } else {
    renderAtlasList();
  }
  if (activeSpeciesModalId) {
    const activeSp = allSpecies.find(s => s.id === activeSpeciesModalId);
    if (activeSp) {
      const countEl = document.getElementById('species-modal-image-count') || document.getElementById('species-modal-count');
      if (countEl) countEl.textContent = activeSp.total_images || 0;
    }
    renderSpeciesModalGallery();
  }
  renderTrashModal();
}

function restoreAllImages() {
  if (discardedImages.length === 0) return;
  if (!confirm(`Restore all ${discardedImages.length} discarded images back to active database?`)) return;

  discardedImages.forEach(item => {
    const sp = allSpecies.find(s => s.latin === item.speciesLatin);
    if (sp) {
      if (!sp.images[item.organ]) sp.images[item.organ] = [];
      sp.images[item.organ].push({
        url: item.url,
        title: item.title,
        author: item.author,
        source: item.source
      });
      sp.total_images = Object.values(sp.images).reduce((sum, list) => sum + list.length, 0);
    }
  });

  discardedImages = [];
  saveDiscardedStorage();
  showToast('All discarded images restored!');

  if (atlasMode === 'gallery') {
    setupGalleryFilters();
    filterGalleryImages();
  } else {
    renderAtlasList();
  }
  renderTrashModal();
  closeTrashModal();
}

function openTrashModal() {
  const modal = document.getElementById('trash-modal');
  if (!modal) return;
  renderTrashModal();
  modal.classList.remove('hidden');
}

function closeTrashModal() {
  document.getElementById('trash-modal')?.classList.add('hidden');
}

function renderTrashModal() {
  const grid = document.getElementById('trash-modal-grid');
  const countEl = document.getElementById('trash-modal-count');
  if (!grid) return;
  if (countEl) countEl.textContent = discardedImages.length;

  if (discardedImages.length === 0) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-stone-500 text-xs">No discarded images in trash.</div>';
    return;
  }

  grid.innerHTML = discardedImages.map(item => {
    const cleanUrl = item.url.replace(/'/g, "\\'");
    return `
      <div class="bg-stone-900 border border-stone-800 rounded-xl p-2.5 flex items-center justify-between gap-3 group shadow-sm">
        <div class="flex items-center gap-3 min-w-0">
          <img src="${item.url}" alt="${item.speciesLatin}" class="w-12 h-12 rounded-lg object-cover bg-stone-950 shrink-0 border border-stone-800" />
          <div class="min-w-0">
            <div class="font-bold font-botanical italic text-stone-200 text-xs truncate">${item.speciesLatin}</div>
            <div class="text-[9px] text-stone-500 truncate">${item.title || item.source || ''}</div>
          </div>
        </div>
        <button 
          onclick="restoreImage('${cleanUrl}')" 
          class="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-emerald-600 text-stone-300 hover:text-white text-xs font-semibold transition shrink-0"
          title="Restore this image"
        >
          ↩️ Restore
        </button>
      </div>
    `;
  }).join('');
}

function showToast(message, actionLabel = null, actionCallback = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto bg-stone-900/95 border border-stone-700 text-stone-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md transition-all duration-200 transform translate-y-2 opacity-0';
  
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (actionLabel && actionCallback) {
    const btn = document.createElement('button');
    btn.className = 'px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shrink-0';
    btn.textContent = actionLabel;
    btn.onclick = () => {
      actionCallback();
      toast.remove();
    };
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ==========================================
// SPECIES ATLAS & BROWSING (CATALOG + GALLERY)
// ==========================================

function switchAtlasMode(mode) {
  atlasMode = mode;
  const catalogBtn = document.getElementById('atlas-mode-catalog-btn');
  const galleryBtn = document.getElementById('atlas-mode-gallery-btn');
  const catalogPanel = document.getElementById('atlas-catalog-panel');
  const galleryPanel = document.getElementById('atlas-gallery-panel');

  if (mode === 'catalog') {
    catalogBtn.className = 'px-3 py-1.5 rounded-lg font-medium transition bg-emerald-600 text-white flex items-center gap-1.5';
    galleryBtn.className = 'px-3 py-1.5 rounded-lg font-medium transition text-stone-400 hover:text-stone-200 flex items-center gap-1.5';
    catalogPanel.classList.remove('hidden');
    galleryPanel.classList.add('hidden');
    renderAtlasList();
  } else {
    galleryBtn.className = 'px-3 py-1.5 rounded-lg font-medium transition bg-emerald-600 text-white flex items-center gap-1.5';
    catalogBtn.className = 'px-3 py-1.5 rounded-lg font-medium transition text-stone-400 hover:text-stone-200 flex items-center gap-1.5';
    catalogPanel.classList.add('hidden');
    galleryPanel.classList.remove('hidden');
    setupGalleryFilters();
    filterGalleryImages();
  }
}

function renderAtlasList() {
  const container = document.getElementById('atlas-species-grid');
  const search = (document.getElementById('atlas-search-input')?.value || '').toLowerCase().trim();

  const list = allSpecies.filter(sp => {
    if (!search) return true;
    return sp.latin.toLowerCase().includes(search) ||
           sp.family.toLowerCase().includes(search);
  });

  const countEl = document.getElementById('catalog-species-count');
  if (countEl) countEl.textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-10 text-stone-500 text-sm">No species found matching query.</div>';
    return;
  }

  container.innerHTML = list.map(sp => {
    let coverPhoto = '';
    for (const k of ['botanical_illustration', 'tree_shape', 'leaves_top', 'bark']) {
      if ((sp.images[k] || []).length > 0) {
        coverPhoto = sp.images[k][0].url;
        break;
      }
    }

    return `
      <div class="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden hover:border-emerald-700 transition flex flex-col justify-between group shadow">
        <div>
          <div class="relative h-44 bg-stone-900 overflow-hidden cursor-pointer" onclick="openSpeciesModal('${sp.id}')">
            <img src="${coverPhoto}" alt="${sp.latin}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            <span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/80 border border-stone-700 text-[10px] text-stone-200 font-mono">
              ${sp.family}
            </span>
            <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-emerald-400 font-bold">
              ${sp.total_images || 0} photos
            </span>
          </div>
          <div class="p-4">
            <h3 class="text-base font-bold font-botanical italic text-emerald-400 cursor-pointer hover:underline" onclick="openSpeciesModal('${sp.id}')">
              ${sp.latin}
            </h3>
            <div class="text-xs text-stone-400 font-mono mt-1">
              Family: ${sp.family}
            </div>
          </div>
        </div>
        <div class="p-4 pt-0 border-t border-stone-800/60 mt-2">
          <div class="grid grid-cols-2 gap-2 mt-3">
            <button onclick="openSpeciesModal('${sp.id}')" class="py-1.5 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 transition flex items-center justify-center gap-1">
              <span>🖼️</span> <span>All Photos</span>
            </button>
            <button onclick="startSlideshowForSpecies('${sp.id}')" class="py-1.5 px-2 rounded-lg bg-emerald-700/70 hover:bg-emerald-600 text-xs font-semibold text-white transition flex items-center justify-center gap-1">
              <span>▶️</span> <span>Slideshow</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// FULL IMAGE GALLERY (FILTER & BATCH REVIEW)
// ==========================================

function setupGalleryFilters() {
  const spSelect = document.getElementById('gallery-species-select');
  if (spSelect && spSelect.options.length <= 1) {
    const sorted = [...allSpecies].sort((a, b) => a.latin.localeCompare(b.latin));
    sorted.forEach(sp => {
      const opt = document.createElement('option');
      opt.value = sp.latin;
      opt.textContent = `${sp.latin} (${sp.family})`;
      spSelect.appendChild(opt);
    });
  }

}

function filterGalleryImages() {
  const spVal = document.getElementById('gallery-species-select')?.value || 'ALL';
  const srcVal = document.getElementById('gallery-source-select')?.value || 'ALL';
  const textVal = (document.getElementById('gallery-text-filter')?.value || '').toLowerCase().trim();

  const collected = [];
  allSpecies.forEach(sp => {
    if (spVal !== 'ALL' && sp.latin !== spVal) return;

    Object.entries(sp.images).forEach(([orgKey, imgs]) => {
      imgs.forEach(img => {
        if (srcVal === 'Wikimedia' && !img.source?.includes('Wikimedia')) return;
        if (srcVal === 'iNaturalist' && !img.source?.includes('iNaturalist')) return;

        if (textVal) {
          const match = sp.latin.toLowerCase().includes(textVal) ||
                        sp.family.toLowerCase().includes(textVal) ||
                        (img.title || '').toLowerCase().includes(textVal);
          if (!match) return;
        }

        collected.push({
          url: img.url,
          speciesLatin: sp.latin,
          family: sp.family,
          speciesId: sp.id,
          organ: orgKey,
          title: img.title || '',
          author: img.author || '',
          source: img.source || ''
        });
      });
    });
  });

  galleryFilteredImages = collected;
  galleryPage = 1;

  const countEl = document.getElementById('gallery-image-count');
  if (countEl) countEl.textContent = galleryFilteredImages.length;

  renderGalleryGrid();
}

function renderGalleryGrid() {
  const container = document.getElementById('atlas-gallery-grid');
  if (!container) return;

  if (galleryFilteredImages.length === 0) {
    container.innerHTML = '<div class="col-span-full py-12 text-center text-stone-500 text-xs">No images match current filters.</div>';
    document.getElementById('gallery-load-more-container')?.classList.add('hidden');
    return;
  }

  const start = 0;
  const end = galleryPage * GALLERY_PAGE_SIZE;
  const pageSlice = galleryFilteredImages.slice(start, end);

  container.innerHTML = pageSlice.map((item, idx) => {
    const cleanUrl = item.url.replace(/'/g, "\\'");
    const cleanLatin = item.speciesLatin.replace(/'/g, "\\'");
    const cleanTitle = (item.title || '').replace(/'/g, "\\'");

    return `
      <div class="relative bg-stone-950 border border-stone-800 rounded-xl overflow-hidden hover:border-emerald-600 transition group flex flex-col justify-between shadow-sm">
        <div class="relative h-36 bg-stone-900 cursor-pointer overflow-hidden" onclick="openSlideshowAtFilteredIndex(${idx})">
          <img 
            src="${item.url}" 
            alt="${item.speciesLatin}" 
            loading="lazy" 
            class="w-full h-full object-cover group-hover:scale-105 transition duration-200" 
          />
          <button 
            type="button" 
            onclick="event.stopPropagation(); discardImage('${cleanUrl}', '${cleanLatin}', '${item.organ}', '${cleanTitle}', '${(item.author || '').replace(/'/g, "\\'")}', '${(item.source || '').replace(/'/g, "\\'")}')" 
            class="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/80 hover:bg-rose-600 text-stone-300 hover:text-white flex items-center justify-center transition border border-stone-700 shadow-md"
            title="Discard this image (B&W, lineart, or bad)"
          >
            🗑️
          </button>
        </div>

        <div class="p-2.5 bg-stone-950 flex flex-col justify-between flex-1">
          <div>
            <div class="font-bold font-botanical italic text-emerald-400 text-xs truncate cursor-pointer hover:underline" onclick="openSlideshowAtFilteredIndex(${idx})">
              ${item.speciesLatin}
            </div>
            <div class="text-[10px] text-stone-400 font-mono truncate mt-0.5">
              ${item.family}
            </div>
          </div>
          <div class="text-[9px] text-stone-500 truncate mt-1 flex items-center justify-between">
            <span class="truncate">${item.source?.includes('Wikimedia') ? 'Commons' : 'iNat'}</span>
            <span class="text-stone-400 hover:text-emerald-400 cursor-pointer" onclick="openSlideshowAtFilteredIndex(${idx})">Inspect →</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const loadMoreContainer = document.getElementById('gallery-load-more-container');
  const remainingCountEl = document.getElementById('gallery-remaining-count');
  if (end < galleryFilteredImages.length) {
    loadMoreContainer?.classList.remove('hidden');
    if (remainingCountEl) remainingCountEl.textContent = (galleryFilteredImages.length - end);
  } else {
    loadMoreContainer?.classList.add('hidden');
  }
}

function loadMoreGalleryImages() {
  galleryPage++;
  renderGalleryGrid();
}

function openSlideshowAtFilteredIndex(index) {
  if (!galleryFilteredImages || galleryFilteredImages.length === 0) return;
  openSlideshow(galleryFilteredImages, index);
}

function startSlideshowFromFilteredGallery() {
  if (!galleryFilteredImages || galleryFilteredImages.length === 0) {
    alert('No images match current filter criteria!');
    return;
  }
  openSlideshow(galleryFilteredImages, 0);
}

// ==========================================
// SPECIES DETAIL & ORGAN GALLERY MODAL
// ==========================================

function openSpeciesModal(speciesId) {
  const sp = allSpecies.find(s => s.id === speciesId || s.latin === speciesId);
  if (!sp) return;
  activeSpeciesModalId = sp.id;
  speciesModalActiveOrgan = 'ALL';

  document.getElementById('species-modal-latin').textContent = sp.latin;
  document.getElementById('species-modal-family').textContent = sp.family;
  const countEl = document.getElementById('species-modal-image-count') || document.getElementById('species-modal-count');
  if (countEl) countEl.textContent = sp.total_images || 0;

  renderSpeciesModalGallery();

  document.getElementById('species-modal')?.classList.remove('hidden');
}

function closeSpeciesModal() {
  document.getElementById('species-modal')?.classList.add('hidden');
  activeSpeciesModalId = null;
}

function renderSpeciesModalGallery() {
  const container = document.getElementById('species-modal-gallery-grid');
  const sp = allSpecies.find(s => s.id === activeSpeciesModalId);
  if (!container || !sp) return;

  const images = [];
  Object.entries(sp.images).forEach(([orgKey, list]) => {
    list.forEach(img => {
      images.push({
        url: img.url,
        speciesLatin: sp.latin,
        family: sp.family,
        speciesId: sp.id,
        organ: orgKey,
        title: img.title || '',
        author: img.author || '',
        source: img.source || ''
      });
    });
  });

  if (images.length === 0) {
    container.innerHTML = '<div class="col-span-full py-8 text-center text-stone-500 text-xs">No images in this collection.</div>';
    return;
  }

  container.innerHTML = images.map((item, idx) => {
    const cleanUrl = item.url.replace(/'/g, "\\'");
    const cleanLatin = item.speciesLatin.replace(/'/g, "\\'");
    const cleanTitle = (item.title || '').replace(/'/g, "\\'");

    return `
      <div class="relative bg-stone-950 border border-stone-800 rounded-xl overflow-hidden hover:border-emerald-600 transition group flex flex-col justify-between">
        <div class="relative h-32 bg-stone-900 cursor-pointer" onclick="openSlideshowFromSpeciesModalImage(${idx})">
          <img src="${item.url}" alt="${item.speciesLatin}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
          <button 
            type="button" 
            onclick="event.stopPropagation(); discardImage('${cleanUrl}', '${cleanLatin}', '${item.organ}', '${cleanTitle}', '${(item.author || '').replace(/'/g, "\\'")}', '${(item.source || '').replace(/'/g, "\\'")}')" 
            class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/80 hover:bg-rose-600 text-stone-300 hover:text-white flex items-center justify-center transition border border-stone-700 shadow"
            title="Discard this image"
          >
            🗑️
          </button>
        </div>
        <div class="p-2 bg-stone-950 text-[10px] text-stone-400 truncate">
          ${item.title || item.source || item.speciesLatin}
        </div>
      </div>
    `;
  }).join('');
}

function openSlideshowFromSpeciesModalImage(index) {
  const sp = allSpecies.find(s => s.id === activeSpeciesModalId);
  if (!sp) return;
  startSlideshowForSpecies(sp.id, index);
}

function startSlideshowFromSpeciesModal() {
  const sp = allSpecies.find(s => s.id === activeSpeciesModalId);
  if (!sp) return;
  startSlideshowForSpecies(sp.id, 0);
}
function startSlideshowForSpecies(speciesId, startIndex = 0) {
  const sp = allSpecies.find(s => s.id === speciesId || s.latin === speciesId);
  if (!sp) return;
  const images = [];
  Object.entries(sp.images || {}).forEach(([orgKey, list]) => {
    list.forEach(img => {
      images.push({
        url: img.url,
        speciesLatin: sp.latin,
        family: sp.family,
        speciesId: sp.id,
        organ: orgKey,
        title: img.title || '',
        author: img.author || '',
        source: img.source || ''
      });
    });
  });
  if (images.length === 0) return;
  openSlideshow(images, startIndex);
}

// ==========================================
// INTERACTIVE SLIDESHOW SYSTEM
// ==========================================

function openSlideshow(imagesList, startIndex = 0) {
  if (!imagesList || imagesList.length === 0) return;
  slideshowActiveList = [...imagesList];
  slideshowCurrentIndex = Math.max(0, Math.min(startIndex, slideshowActiveList.length - 1));
  slideshowCropBottom = 0;

  const modal = document.getElementById('slideshow-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  renderCurrentSlide();
}

function closeSlideshow() {
  document.getElementById('slideshow-modal')?.classList.add('hidden');
}

function renderCurrentSlide() {
  if (!slideshowActiveList || slideshowActiveList.length === 0) {
    closeSlideshow();
    return;
  }

  const cur = slideshowActiveList[slideshowCurrentIndex];

  document.getElementById('slideshow-species-latin').textContent = cur.speciesLatin;
  document.getElementById('slideshow-species-family').textContent = cur.family || '';

  document.getElementById('slideshow-counter-current').textContent = slideshowCurrentIndex + 1;
  document.getElementById('slideshow-counter-total').textContent = slideshowActiveList.length;

  const imgEl = document.getElementById('slideshow-main-img');
  imgEl.src = cur.url;

  // Auto-detect botanical plate / illustration and silently crop bottom text transparently
  const isPlate = shouldCropImage(cur);
  imgEl.style.setProperty('--slideshow-crop-bottom', isPlate ? '14%' : '0%');

  document.getElementById('slideshow-photo-author').textContent = cur.author ? `Credit: ${cur.author}` : (cur.title || '');
  const linkEl = document.getElementById('slideshow-photo-link');
  if (linkEl) {
    linkEl.href = cur.url;
  }

  renderSlideshowFilmstrip();
}

function slideshowNext() {
  if (slideshowActiveList.length === 0) return;
  slideshowCurrentIndex = (slideshowCurrentIndex + 1) % slideshowActiveList.length;
  renderCurrentSlide();
}

function slideshowPrev() {
  if (slideshowActiveList.length === 0) return;
  slideshowCurrentIndex = (slideshowCurrentIndex - 1 + slideshowActiveList.length) % slideshowActiveList.length;
  renderCurrentSlide();
}

function discardCurrentSlideshowImage() {
  if (slideshowActiveList.length === 0) return;
  const cur = slideshowActiveList[slideshowCurrentIndex];
  discardImage(cur.url, cur.speciesLatin, cur.organ, cur.title, cur.author, cur.source);
}

function renderSlideshowFilmstrip() {
  const strip = document.getElementById('slideshow-filmstrip');
  if (!strip) return;

  const total = slideshowActiveList.length;
  let startIdx = Math.max(0, slideshowCurrentIndex - 7);
  let endIdx = Math.min(total, startIdx + 15);
  if (endIdx - startIdx < 15 && startIdx > 0) {
    startIdx = Math.max(0, endIdx - 15);
  }

  let html = '';
  for (let i = startIdx; i < endIdx; i++) {
    const item = slideshowActiveList[i];
    const isCurrent = i === slideshowCurrentIndex;
    html += `
      <div 
        onclick="slideshowCurrentIndex = ${i}; renderCurrentSlide();" 
        class="h-12 w-12 rounded-lg overflow-hidden shrink-0 cursor-pointer border transition ${
          isCurrent 
            ? 'ring-2 ring-emerald-400 border-emerald-400 scale-110' 
            : 'border-stone-800 opacity-60 hover:opacity-100'
        }"
      >
        <img src="${item.url}" alt="${item.speciesLatin}" class="w-full h-full object-cover" />
      </div>
    `;
  }

  strip.innerHTML = html;
}

// ==========================================
// SEARCH & ADD ANY PLANT (LIVE INAT/COMMONS)
// ==========================================

async function searchLiveBotanicalDatabases() {
  const query = document.getElementById('add-plant-input').value.trim();
  if (!query) return;

  const statusEl = document.getElementById('live-search-status');
  const resultsContainer = document.getElementById('live-search-results-grid');
  
  statusEl.classList.remove('hidden');
  statusEl.textContent = `Searching iNaturalist Research Grade & Wikimedia Commons for "${query}"...`;
  resultsContainer.innerHTML = '';

  try {
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const taxa = data.results || [];

    if (taxa.length === 0) {
      statusEl.textContent = `No matching taxa found on iNaturalist for "${query}".`;
      return;
    }

    statusEl.textContent = `Found ${taxa.length} taxa candidates.`;
    
    resultsContainer.innerHTML = taxa.slice(0, 5).map(taxon => {
      const photoUrl = taxon.default_photo?.medium_url?.replace('/medium.', '/large.') || '';
      return `
        <div class="bg-stone-950 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <img src="${photoUrl}" alt="${taxon.name}" class="w-16 h-16 rounded-xl object-cover bg-stone-900 border border-stone-800 shrink-0" />
            <div>
              <div class="font-bold font-botanical italic text-emerald-400 text-base">${taxon.name}</div>
              <div class="text-xs text-stone-300">Common: ${taxon.preferred_common_name || 'N/A'} • Rank: ${taxon.rank}</div>
              <div class="text-[11px] text-stone-500 line-clamp-1 max-w-xl">${taxon.wikipedia_summary || ''}</div>
            </div>
          </div>
          <button 
            onclick="importTaxonLive(${taxon.id}, '${taxon.name}', '${taxon.preferred_common_name || ''}')"
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shrink-0"
          >
            + Add to My Quiz Deck
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    statusEl.textContent = `Search error: ${err.message}`;
  }
}

async function importTaxonLive(taxonId, latinName, commonName) {
  const statusEl = document.getElementById('live-search-status');
  statusEl.textContent = `Harvesting organ photos for ${latinName}...`;

  try {
    const detailResp = await fetch(`https://api.inaturalist.org/v1/taxa/${taxonId}`);
    const detailData = await detailResp.json();
    const taxon = detailData.results?.[0];

    const organBuckets = {
      bark: [],
      botanical_illustration: [],
      leaves_top: [],
      leaves_underside: [],
      buds_winter: [],
      stem_branch: [],
      flowers: [],
      fruits_seeds: [],
      tree_shape: []
    };

    const tPhotos = taxon?.taxon_photos || [];
    tPhotos.forEach((tp, i) => {
      const mUrl = tp.photo?.medium_url;
      if (mUrl) {
        const largeUrl = mUrl.replace('/medium.', '/large.');
        const organKeys = Object.keys(organBuckets);
        const assignedOrgan = organKeys[i % organKeys.length];
        organBuckets[assignedOrgan].push({
          title: `${latinName} Observation`,
          url: largeUrl,
          source: 'iNaturalist Research Grade',
          author: tp.photo?.attribution || 'iNaturalist'
        });
      }
    });

    const newRecord = {
      id: latinName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      latin: latinName,
      family: taxon?.iconic_taxon_name || 'Plantae',
      plant_type: 'broadleaf',
      total_images: tPhotos.length,
      images: organBuckets
    };

    allSpecies.push(newRecord);
    selectedSpeciesIds.add(newRecord.id);

    // Persist in localStorage
    const savedCustom = JSON.parse(localStorage.getItem('phytomemo_custom_plants') || '[]');
    savedCustom.push(newRecord);
    localStorage.setItem('phytomemo_custom_plants', JSON.stringify(savedCustom));

    alert(`Successfully added ${latinName} with ${tPhotos.length} photos!`);
    statusEl.textContent = `Added ${latinName} to your library!`;
    
    updateSelectedCountBadge();
    setupFamilyFilterPills();
    renderSpeciesSelectorList();
  } catch (err) {
    alert(`Could not import: ${err.message}`);
  }
}

// ==========================================
// EXPORT & IMPORT DATABASE
// ==========================================

function toggleExportModal(forceOpen = null) {
  const modal = document.getElementById('export-modal');
  if (forceOpen === false || (!modal.classList.contains('hidden') && forceOpen === null)) {
    modal.classList.add('hidden');
  } else {
    modal.classList.remove('hidden');
  }
}

function downloadDatabaseJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allSpecies, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "plants_data.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importDatabaseJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported) && imported.length > 0) {
        allSpecies = imported;
        selectedSpeciesIds = new Set(allSpecies.map(s => s.id));
        updateSelectedCountBadge();
        setupFamilyFilterPills();
        renderSpeciesSelectorList();
        toggleExportModal(false);
        alert(`Successfully loaded ${imported.length} species deck!`);
      }
    } catch (err) {
      alert(`Invalid JSON file: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ==========================================
// ANTI-CHEAT DYNAMIC INTERACTIVE CROPPING
// ==========================================

let currentCropBottom = 0;
let lightboxCropActive = false;

function shouldCropImage(imageItem) {
  if (!imageItem) return false;
  const str = `${imageItem.title || ''} ${imageItem.url || ''} ${imageItem.organ || ''}`.toLowerCase();
  return (
    str.includes('botanical_illustration') ||
    str.includes('illustration') ||
    str.includes('plate') ||
    str.includes('drawing') ||
    str.includes('tafel') ||
    str.includes('planche') ||
    str.includes('flora') ||
    str.includes('lindman') ||
    str.includes('thome') ||
    str.includes('kops') ||
    str.includes('masclef') ||
    str.includes('woodville') ||
    str.includes('curtis') ||
    str.includes('sowerby') ||
    str.includes('duhamel') ||
    str.includes('medizinal') ||
    str.includes('deutschland') ||
    str.includes('icones')
  );
}

function applyInteractiveCrop(percent) {
  currentCropBottom = Math.max(0, Math.min(35, parseInt(percent, 10) || 0));
  const imgEl = document.getElementById('quiz-primary-img');
  if (imgEl) {
    imgEl.style.setProperty('--crop-bottom', `${currentCropBottom}%`);
  }
}

function handleImageLoadError(imgEl) {
  if (!currentQuestion) return;
  const allImgs = [];
  Object.values(currentQuestion.species?.images || {}).forEach(list => {
    list.forEach(im => allImgs.push(im));
  });
  const pool = allImgs.filter(im => im.url !== imgEl.src);
  if (pool.length > 0) {
    const backup = pool[0];
    imgEl.src = backup.url;
    currentQuestion.primaryImage = backup;
    document.getElementById('quiz-image-source').textContent = backup.source || 'Wikimedia Commons';
  }
}

// ==========================================
// LIGHTBOX VIEWER
// ==========================================

let lightboxCurrentPhoto = null;

function openLightbox(url, title, author, autoCrop = false) {
  if (!url) return;
  lightboxCurrentPhoto = { url, title, author };
  const modal = document.getElementById('lightbox-modal');
  const lbImg = document.getElementById('lightbox-img');

  lbImg.src = url;
  const titleEl = document.getElementById('lightbox-title');
  if (titleEl) titleEl.textContent = title || '';
  const authorEl = document.getElementById('lightbox-author');
  if (authorEl) authorEl.textContent = author ? `Credit: ${author}` : '';
  const linkEl = document.getElementById('lightbox-link');
  if (linkEl) linkEl.href = url;

  if (autoCrop) {
    lbImg.style.setProperty('--lightbox-crop-bottom', '14%');
  } else {
    lbImg.style.setProperty('--lightbox-crop-bottom', '0%');
  }

  modal.classList.remove('hidden');
}

function discardLightboxPhoto() {
  if (!lightboxCurrentPhoto || !lightboxCurrentPhoto.url) return;
  const url = lightboxCurrentPhoto.url;

  // If this was the current quiz question photo
  if (currentQuestion && currentQuestion.primaryImage && currentQuestion.primaryImage.url === url) {
    closeLightbox();
    discardCurrentQuizPhoto();
    return;
  }

  // Find which species owns this photo
  let foundSp = null;
  let foundOrg = null;
  for (const sp of allSpecies) {
    for (const [org, list] of Object.entries(sp.images || {})) {
      if (list.some(im => im.url === url)) {
        foundSp = sp;
        foundOrg = org;
        break;
      }
    }
    if (foundSp) break;
  }

  closeLightbox();
  discardImage(url, foundSp ? foundSp.latin : '', foundOrg, lightboxCurrentPhoto.title, lightboxCurrentPhoto.author);
}

function openCurrentPhotoLightbox() {
  if (!currentQuestion || !currentQuestion.primaryImage) return;
  const autoCrop = currentCropBottom > 0;
  openLightbox(
    currentQuestion.primaryImage.url,
    currentQuestion.species.latin,
    currentQuestion.primaryImage.author,
    autoCrop
  );
}

function closeLightbox() {
  document.getElementById('lightbox-modal').classList.add('hidden');
}

// ==========================================
// VIEW SWITCHER
// ==========================================

function showView(viewId) {
  ['setup-view', 'quiz-view', 'results-view', 'atlas-view', 'search-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const activeEl = document.getElementById(viewId);
  if (activeEl) activeEl.classList.remove('hidden');

  // Update Nav Buttons
  document.querySelectorAll('header nav button').forEach(b => {
    b.classList.remove('bg-emerald-600', 'text-white');
    b.classList.add('text-stone-300');
  });

  if (viewId === 'setup-view') {
    document.getElementById('nav-setup-btn')?.classList.add('bg-emerald-600', 'text-white');
    document.getElementById('nav-setup-btn')?.classList.remove('text-stone-300');
  } else if (viewId === 'atlas-view') {
    document.getElementById('nav-atlas-btn')?.classList.add('bg-emerald-600', 'text-white');
    document.getElementById('nav-atlas-btn')?.classList.remove('text-stone-300');
    if (atlasMode === 'catalog') {
      renderAtlasList();
    } else {
      setupGalleryFilters();
      filterGalleryImages();
    }
    updateDiscardedBadgeCount();
  } else if (viewId === 'search-view') {
    document.getElementById('nav-search-btn')?.classList.add('bg-emerald-600', 'text-white');
    document.getElementById('nav-search-btn')?.classList.remove('text-stone-300');
  }
}
