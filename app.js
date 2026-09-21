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

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await initDatabase();
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

// Setup Organ Checkboxes in UI
function setupOrganCheckboxes() {
  const container = document.getElementById('organ-checkboxes-container');
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
    parentEl.className = 'flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition bg-stone-950 border-emerald-800/80 text-emerald-300';
  } else {
    activeOrganFilters.delete(key);
    parentEl.className = 'flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition bg-stone-950/40 border-stone-800 text-stone-400';
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
      const matchSwedish = (sp.swedish || '').toLowerCase().includes(searchTerm);
      const matchEnglish = (sp.english || '').toLowerCase().includes(searchTerm);
      const matchFamily = sp.family.toLowerCase().includes(searchTerm);
      if (!matchLatin && !matchSwedish && !matchEnglish && !matchFamily) {
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
            <div class="text-[11px] text-stone-400 truncate flex items-center gap-2">
              <span>🇸🇪 ${sp.swedish}</span>
              <span>•</span>
              <span>🇬🇧 ${sp.english}</span>
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

  if (activeOrganFilters.size === 0) {
    alert('Please select at least 1 botanical organ type to examine.');
    return;
  }

  // Read settings
  clueMode = document.getElementById('clue-mode-select').value;
  fuzzyTolerance = document.getElementById('fuzzy-spelling-checkbox').checked;
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
    // Pick available organs for this species that are in activeOrganFilters
    const validOrgans = Object.keys(species.images || {}).filter(organKey => {
      return activeOrganFilters.has(organKey) && (species.images[organKey] || []).length > 0;
    });

    let chosenOrgan = 'leaves_top';
    let chosenImg = null;

    if (validOrgans.length > 0) {
      chosenOrgan = validOrgans[Math.floor(Math.random() * validOrgans.length)];
      const imgList = species.images[chosenOrgan];
      chosenImg = imgList[Math.floor(Math.random() * imgList.length)];
    } else {
      // Fallback: pick any available image from any organ
      const allImages = [];
      Object.entries(species.images || {}).forEach(([k, imgs]) => {
        imgs.forEach(im => allImages.push({ organ: k, ...im }));
      });
      if (allImages.length > 0) {
        const pick = allImages[Math.floor(Math.random() * allImages.length)];
        chosenOrgan = pick.organ;
        chosenImg = pick;
      }
    }

    // Collect extra images for clues/hints
    const otherOrganClues = [];
    Object.entries(species.images || {}).forEach(([k, imgs]) => {
      if (k !== chosenOrgan && imgs.length > 0) {
        otherOrganClues.push({
          organ: k,
          ...imgs[0]
        });
      }
    });

    quizQuestions.push({
      species,
      primaryOrgan: chosenOrgan,
      primaryImage: chosenImg,
      otherOrganClues: otherOrganClues.sort(() => 0.5 - Math.random()),
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

  // Display Image with Anti-Cheat Detection
  const organMeta = ORGAN_METADATA[currentQuestion.primaryOrgan] || { label: 'Organ', icon: '🌿' };
  document.getElementById('quiz-organ-badge').innerHTML = `${organMeta.icon} ${organMeta.label}`;
  
  const imgEl = document.getElementById('quiz-primary-img');
  if (currentQuestion.primaryImage && currentQuestion.primaryImage.url) {
    imgEl.src = currentQuestion.primaryImage.url;
    document.getElementById('quiz-image-source').textContent = currentQuestion.primaryImage.source || 'Wikimedia Commons';
    
    // Auto-detect botanical illustrations or plates containing plant names
    const requiresCrop = shouldCropImage(currentQuestion.primaryImage, currentQuestion.primaryOrgan);
    if (requiresCrop) {
      applyInteractiveCrop(14);
      document.getElementById('anti-cheat-crop-status').textContent = 'Botanical plate label cropped (Anti-Cheat)';
    } else {
      applyInteractiveCrop(0);
      document.getElementById('anti-cheat-crop-status').textContent = 'Uncropped full image';
    }
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
  if (answerType === 'swedish') {
    labelEl.textContent = 'Vad heter detta träd på svenska? (t.ex. skogslönn, tall, vårtbjörk)';
    inputEl.placeholder = 'Skriv svenskt namn...';
  } else {
    labelEl.textContent = 'What is the Latin scientific name of this species? (e.g. Acer platanoides)';
    inputEl.placeholder = 'Type scientific Latin name...';
  }

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
    alert('No additional organ photos available for this species.');
    return;
  }

  const clue = currentQuestion.otherOrganClues.shift();
  currentQuestion.revealedExtraClues.push(clue);

  const extraContainer = document.getElementById('quiz-extra-clues-container');
  const extraGrid = document.getElementById('quiz-extra-clues-grid');
  extraContainer.classList.remove('hidden');

  const meta = ORGAN_METADATA[clue.organ] || { label: clue.organ, icon: '🌿' };
  const card = document.createElement('div');
  card.className = 'relative bg-stone-900 border border-stone-800 rounded-lg overflow-hidden group cursor-pointer';
  card.onclick = () => openLightbox(clue.url, `${meta.icon} ${meta.label}`, clue.title, clue.author);
  card.innerHTML = `
    <img src="${clue.url}" alt="${meta.label}" class="h-24 w-full object-cover group-hover:scale-105 transition" />
    <span class="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-bold text-emerald-300">
      ${meta.icon} ${meta.label}
    </span>
  `;
  extraGrid.appendChild(card);

  if (currentQuestion.otherOrganClues.length === 0) {
    document.getElementById('reveal-hint-btn').classList.add('hidden');
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
  const targetAnswer = answerType === 'swedish' ? species.swedish : species.latin;
  
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
  document.getElementById('feedback-swedish-name').textContent = species.swedish;
  document.getElementById('feedback-english-name').textContent = species.english;
  document.getElementById('feedback-family-zone').textContent = `${species.family} • Zone: ${species.zone || 'N/A'}`;

  // Fill Mini Gallery
  const gallery = document.getElementById('feedback-all-organs-gallery');
  gallery.innerHTML = '';
  
  Object.entries(species.images || {}).forEach(([orgKey, imgs]) => {
    if (imgs.length > 0) {
      const meta = ORGAN_METADATA[orgKey] || { label: orgKey, icon: '🌿' };
      const img = imgs[0];
      const thumb = document.createElement('div');
      thumb.className = 'relative rounded-lg overflow-hidden bg-stone-900 border border-stone-800 cursor-pointer group';
      thumb.onclick = () => openLightbox(img.url, `${meta.icon} ${meta.label}`, `${species.latin} - ${meta.label}`, img.author);
      thumb.innerHTML = `
        <img src="${img.url}" alt="${meta.label}" class="h-16 w-full object-cover group-hover:scale-105 transition" />
        <span class="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] font-bold text-center py-0.5 text-stone-200 truncate px-1">
          ${meta.icon} ${meta.label}
        </span>
      `;
      gallery.appendChild(thumb);
    }
  });

  // Uncrop image so student can study the original plate and text label
  applyInteractiveCrop(0);
  const statusEl = document.getElementById('anti-cheat-crop-status');
  if (statusEl) statusEl.textContent = 'Label revealed to verify answer';

  // Switch to feedback view
  document.getElementById('quiz-input-section').classList.add('hidden');
  document.getElementById('quiz-feedback-section').classList.remove('hidden');

  // Focus Next button
  setTimeout(() => document.getElementById('next-question-btn')?.focus(), 50);
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

// Key listeners (Enter to check or advance)
function initKeyListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const nextBtn = document.getElementById('next-question-btn');
      const feedbackSection = document.getElementById('quiz-feedback-section');
      if (feedbackSection && !feedbackSection.classList.contains('hidden') && nextBtn) {
        e.preventDefault();
        proceedToNextQuestion();
      }
    }
    if (e.key === 'Escape') {
      closeLightbox();
      toggleExportModal(false);
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
      const targetAnswer = answerType === 'swedish' ? species.swedish : species.latin;
      const userText = userExamAnswers[idx] ? userExamAnswers[idx].trim() : '(Unanswered)';
      
      const { isMatch, isClose } = checkAnswerMatch(userText, targetAnswer);
      if (isMatch) quizUserScore += 1;

      quizAnswersRecord.push({
        questionNumber: idx + 1,
        species,
        organTested: q.primaryOrgan,
        imageShown: q.primaryImage,
        userAnswer: userText,
        correctAnswer: targetAnswer,
        isCorrect: isMatch,
        isClose: isClose
      });
    });
  }

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

  // Missed species count badge
  const missedRecords = quizAnswersRecord.filter(a => !a.isCorrect);
  document.getElementById('missed-count-badge').textContent = missedRecords.length;
  const drillBtn = document.getElementById('drill-missed-btn');
  if (missedRecords.length === 0) {
    drillBtn.classList.add('hidden');
  } else {
    drillBtn.classList.remove('hidden');
  }

  // Organ Performance Breakdown
  const organStats = {};
  quizAnswersRecord.forEach(rec => {
    const o = rec.organTested;
    if (!organStats[o]) organStats[o] = { total: 0, correct: 0 };
    organStats[o].total++;
    if (rec.isCorrect) organStats[o].correct++;
  });

  const organBreakdownContainer = document.getElementById('results-organ-breakdown-grid');
  organBreakdownContainer.innerHTML = Object.entries(organStats).map(([orgKey, stats]) => {
    const meta = ORGAN_METADATA[orgKey] || { label: orgKey, icon: '🌿' };
    const orgPct = Math.round((stats.correct / stats.total) * 100);
    return `
      <div class="bg-stone-950 p-3 rounded-xl border border-stone-800">
        <div class="flex items-center justify-between text-xs font-semibold text-stone-300 mb-1.5">
          <span>${meta.icon} ${meta.label}</span>
          <span class="${orgPct >= 70 ? 'text-emerald-400' : 'text-amber-400'}">${orgPct}% (${stats.correct}/${stats.total})</span>
        </div>
        <div class="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${orgPct >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${orgPct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Detailed Review Table
  const reviewTable = document.getElementById('results-review-table');
  reviewTable.innerHTML = quizAnswersRecord.map(rec => {
    const meta = ORGAN_METADATA[rec.organTested] || { label: rec.organTested, icon: '🌿' };
    const statusBg = rec.isCorrect 
      ? (rec.isClose ? 'bg-amber-950/30 border-amber-800/60' : 'bg-emerald-950/30 border-emerald-800/60')
      : 'bg-rose-950/30 border-rose-900/60';
    const statusIcon = rec.isCorrect ? (rec.isClose ? '⚠️ Close' : '✅ Correct') : '❌ Incorrect';
    const statusTextClass = rec.isCorrect ? (rec.isClose ? 'text-amber-400' : 'text-emerald-400') : 'text-rose-400';

    return `
      <div class="p-3 rounded-xl border ${statusBg} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-3">
          <img 
            src="${rec.imageShown?.url || ''}" 
            alt="Question Image" 
            class="w-14 h-14 rounded-lg object-cover bg-stone-800 cursor-pointer shrink-0 border border-stone-700" 
            onclick="openLightbox('${rec.imageShown?.url || ''}', '${meta.icon} ${meta.label}', '${rec.species.latin}', '${rec.imageShown?.author || ''}')"
          />
          <div>
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-bold font-botanical italic text-stone-100 text-sm">${rec.species.latin}</span>
              <span class="px-1.5 py-0.5 rounded bg-stone-800 text-[10px] text-stone-300">${meta.icon} ${meta.label}</span>
            </div>
            <div class="text-stone-400 text-[11px]">
              🇸🇪 ${rec.species.swedish} • 🇬🇧 ${rec.species.english}
            </div>
            <div class="mt-1">
              <span class="text-stone-500">Your answer:</span> 
              <span class="font-mono font-medium ${rec.isCorrect ? 'text-stone-200' : 'text-rose-300 line-through'}">
                "${rec.userAnswer}"
              </span>
            </div>
          </div>
        </div>

        <div class="shrink-0 flex sm:flex-col items-end gap-1">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${statusTextClass} bg-stone-900 border border-stone-800">
            ${statusIcon}
          </span>
        </div>
      </div>
    `;
  }).join('');
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
// SPECIES ATLAS & BROWSING
// ==========================================

function renderAtlasList() {
  const container = document.getElementById('atlas-species-grid');
  const search = (document.getElementById('atlas-search-input')?.value || '').toLowerCase().trim();

  const list = allSpecies.filter(sp => {
    if (!search) return true;
    return sp.latin.toLowerCase().includes(search) ||
           (sp.swedish || '').toLowerCase().includes(search) ||
           (sp.english || '').toLowerCase().includes(search) ||
           sp.family.toLowerCase().includes(search);
  });

  if (list.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-10 text-stone-500 text-sm">No species found matching query.</div>';
    return;
  }

  container.innerHTML = list.map(sp => {
    // Pick primary photo
    let coverPhoto = '';
    for (const k of ['botanical_illustration', 'tree_shape', 'leaves_top', 'bark']) {
      if ((sp.images[k] || []).length > 0) {
        coverPhoto = sp.images[k][0].url;
        break;
      }
    }

    const organChips = Object.entries(sp.images || {}).filter(([k, v]) => v.length > 0).map(([k, v]) => {
      const m = ORGAN_METADATA[k] || { icon: '🌿', label: k };
      return `<span class="px-1.5 py-0.5 bg-stone-800 text-[10px] rounded text-stone-300">${m.icon} ${v.length}</span>`;
    }).join('');

    return `
      <div class="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden hover:border-emerald-700 transition flex flex-col justify-between group">
        <div>
          <div class="relative h-44 bg-stone-900 overflow-hidden cursor-pointer" onclick="openAtlasModal('${sp.id}')">
            <img src="${coverPhoto}" alt="${sp.latin}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            <span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/80 border border-stone-700 text-[10px] text-stone-200 font-mono">
              ${sp.family}
            </span>
          </div>
          <div class="p-4">
            <h3 class="text-base font-bold font-botanical italic text-emerald-400 cursor-pointer" onclick="openAtlasModal('${sp.id}')">
              ${sp.latin}
            </h3>
            <div class="text-xs text-stone-300 mt-0.5">
              <span>🇸🇪 ${sp.swedish}</span> • <span>🇬🇧 ${sp.english}</span>
            </div>
            <div class="text-[11px] text-stone-500 mt-1">
              Hardiness Zone: ${sp.zone || 'N/A'}
            </div>
          </div>
        </div>
        <div class="p-4 pt-0 border-t border-stone-800/60 mt-2">
          <div class="flex flex-wrap gap-1 mt-2">
            ${organChips}
          </div>
          <button onclick="openAtlasModal('${sp.id}')" class="mt-3 w-full py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 transition">
            View All Organ Photos →
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openAtlasModal(speciesId) {
  const sp = allSpecies.find(s => s.id === speciesId);
  if (!sp) return;

  // Open first illustration or photo in lightbox
  const firstPhoto = sp.images?.botanical_illustration?.[0] || sp.images?.leaves_top?.[0] || sp.images?.bark?.[0];
  if (firstPhoto) {
    openLightbox(firstPhoto.url, 'Botanical Plate', `${sp.latin} (${sp.swedish} / ${sp.english})`, firstPhoto.author);
  }
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
      english: commonName || latinName,
      swedish: commonName || latinName,
      family: taxon?.iconic_taxon_name || 'Plantae',
      zone: 'Custom',
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

function shouldCropImage(imageItem, organKey) {
  if (organKey === 'botanical_illustration') return true;
  if (!imageItem || !imageItem.title) return false;
  const t = imageItem.title.toLowerCase();
  return (
    t.includes('illustration') ||
    t.includes('plate') ||
    t.includes('drawing') ||
    t.includes('tafel') ||
    t.includes('planche') ||
    t.includes('herbarium') ||
    t.includes('flora') ||
    t.includes('lindman') ||
    t.includes('thome')
  );
}

function applyInteractiveCrop(percent) {
  currentCropBottom = Math.max(0, Math.min(35, parseInt(percent, 10) || 0));
  const slider = document.getElementById('interactive-crop-slider');
  if (slider) slider.value = currentCropBottom;
  const valDisplay = document.getElementById('interactive-crop-val');
  if (valDisplay) valDisplay.textContent = `${currentCropBottom}%`;

  const imgEl = document.getElementById('quiz-primary-img');
  const maskOverlay = document.getElementById('crop-mask-overlay');
  const statusEl = document.getElementById('anti-cheat-crop-status');

  if (imgEl) {
    imgEl.style.setProperty('--crop-bottom', `${currentCropBottom}%`);
  }

  if (currentCropBottom > 0) {
    if (maskOverlay) {
      maskOverlay.classList.remove('hidden');
      maskOverlay.style.height = `${currentCropBottom}%`;
    }
    if (statusEl) statusEl.textContent = `Bottom ${currentCropBottom}% hidden (Anti-Cheat active)`;
  } else {
    if (maskOverlay) maskOverlay.classList.add('hidden');
    if (statusEl) statusEl.textContent = 'Showing full uncropped photo';
  }
}

function setInteractiveCropPreset(percent) {
  applyInteractiveCrop(percent);
}

function handleImageLoadError(imgEl) {
  if (!currentQuestion) return;
  const organ = currentQuestion.primaryOrgan;
  const pool = (currentQuestion.species?.images?.[organ] || []).filter(im => im.url !== imgEl.src);
  if (pool.length > 0) {
    const backup = pool[0];
    imgEl.src = backup.url;
    currentQuestion.primaryImage = backup;
    document.getElementById('quiz-image-source').textContent = backup.source || 'Wikimedia Commons';
  }
}

function toggleLightboxCrop() {
  const lbImg = document.getElementById('lightbox-img');
  const lbMask = document.getElementById('lightbox-mask-overlay');
  const lbText = document.getElementById('lightbox-crop-text');
  
  lightboxCropActive = !lightboxCropActive;
  if (lightboxCropActive) {
    lbImg.style.setProperty('--lightbox-crop-bottom', '14%');
    lbMask.classList.remove('hidden');
    lbMask.style.height = '14%';
    lbText.textContent = 'Crop Active (14%)';
  } else {
    lbImg.style.setProperty('--lightbox-crop-bottom', '0%');
    lbMask.classList.add('hidden');
    lbText.textContent = 'Reveal Full (0%)';
  }
}

// ==========================================
// LIGHTBOX VIEWER
// ==========================================

function openLightbox(url, organLabel, title, author, autoCrop = false) {
  if (!url) return;
  const modal = document.getElementById('lightbox-modal');
  const lbImg = document.getElementById('lightbox-img');
  const lbMask = document.getElementById('lightbox-mask-overlay');
  const lbText = document.getElementById('lightbox-crop-text');

  lbImg.src = url;
  document.getElementById('lightbox-organ').textContent = organLabel || 'Plant Detail';
  document.getElementById('lightbox-title').textContent = title || '';
  document.getElementById('lightbox-author').textContent = author ? `Credit: ${author}` : '';
  document.getElementById('lightbox-link').href = url;

  lightboxCropActive = autoCrop;
  if (autoCrop) {
    lbImg.style.setProperty('--lightbox-crop-bottom', '14%');
    lbMask.classList.remove('hidden');
    lbMask.style.height = '14%';
    if (lbText) lbText.textContent = 'Crop Active (14%)';
  } else {
    lbImg.style.setProperty('--lightbox-crop-bottom', '0%');
    lbMask.classList.add('hidden');
    if (lbText) lbText.textContent = 'Uncropped (0%)';
  }

  modal.classList.remove('hidden');
}

function openCurrentPhotoLightbox() {
  if (!currentQuestion || !currentQuestion.primaryImage) return;
  const meta = ORGAN_METADATA[currentQuestion.primaryOrgan] || { label: 'Organ', icon: '🌿' };
  const autoCrop = currentCropBottom > 0;
  openLightbox(
    currentQuestion.primaryImage.url,
    `${meta.icon} ${meta.label}`,
    `${currentQuestion.species.latin} (${meta.label})`,
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
    renderAtlasList();
  } else if (viewId === 'search-view') {
    document.getElementById('nav-search-btn')?.classList.add('bg-emerald-600', 'text-white');
    document.getElementById('nav-search-btn')?.classList.remove('text-stone-300');
  }
}
