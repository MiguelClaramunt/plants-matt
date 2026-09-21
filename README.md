# Tree Species Identification Quiz

A client-side web application for studying and testing tree species identification using curated high-resolution botanical photography.

Easily hostable on **GitHub Pages** with zero build steps or external server dependencies.

---

## 🚀 Key Features

1. **Complete BI1452 Exam Reference List (61 Species)**:
   - Full dataset extracted from `BI1452 - tree species to be examined, autumn 2026 (1).pdf`.
   - Includes **Family**, **Scientific Name (Latin)**, **Swedish Common Name**, **English Common Name**, and **Hardiness Zone**.
   - 15 Gymnosperms / Conifers and 46 Angiosperms / Broadleaf trees.

2. **Organ-Categorized Verified Images (3,360+ Quality Images)**:
   - Curated from **Wikimedia Commons** and **iNaturalist (Research Grade)**.
   - Quality-filtered to eliminate non-diagnostic scans, stamps, information boards, or low-res files.
   - **Interactive Anti-Cheat Dynamic Cropping (Name Masking)**:
     - Automatically detects botanical illustrations and plates with printed binomials/labels.
     - Interactively crops the bottom margin (default 14%, adjustable 0–35% with a live slider and quick presets) directly in the browser via CSS `clip-path` and dynamic masking.
     - **Zero local image saving required**: crops dynamically from the original repository file URL!
     - Protected in both the main quiz view and the high-res zoom Lightbox.
     - Once an answer is checked or the exam is submitted, the full original plate and label are uncropped for verification and study.
   - Organized across 9 distinct botanical organs:
     - 🪵 **Bark**
     - 🎨 **Classical Botanical Illustrations** (Lindman's *Bilder ur Nordens Flora*, Thomé, Köhler)
     - ❄️ **Winter Buds & Buds**
     - 🍃 **Leaves (Top / Foliage / Needles)**
     - 🍃 **Leaves (Underside / Abaxial surface)**
     - 🌸 **Flowers & Catkins / Male & Female Strobili**
     - 🌰 **Fruits, Cones & Seeds**
     - 🌿 **Twigs, Shoots & Branches**
     - 🌲 **Tree Habit / Silhouette**
   - High-resolution zoom lightbox for inspecting bud scales, lenticels, and leaf venation.

3. **Interactive Quiz Configuration**:
   - **Custom Species Selection**: Select all 61 species, or select by type (*Conifers only*, *Broadleaf only*), filter by Family (*Pinaceae, Betulaceae, Rosaceae, Sapindaceae, etc.*), or toggle individual species checkboxes.
   - **Adjustable Quiz Size**: Default 20 questions (or choose 5, 10, 15, 20, 30, or all selected).
   - **Exam Mode vs Practice Mode**:
     - 🎓 **Exam Mode (Showcase Results at End Only)**: Simulates real exam conditions. Answers and feedback stay hidden throughout the test. Students can navigate between questions, jump to any question, review/edit answers, and receive their comprehensive scorecard and answer key only after submitting all answers.
     - 💡 **Practice Mode (Instant Feedback)**: Displays immediate feedback, the correct Latin name, and full organ mini-gallery after each question.
   - **Organ Focus**: Test on all organs randomly or drill into specific organs (e.g. *Winter buds only* or *Bark only*).
   - **Clue Modes**:
     - *1 Random Image* (strict exam challenge)
     - *Progressive Reveal* (starts with 1 image; reveals more clues on request)
     - *Multi-Organ Gallery* (shows 2-3 organs side by side)
   - **Spell-Check & Matching**:
     - Tests Latin scientific name by default (with optional practice mode for Swedish common names).
     - Tolerant spelling mode for forgiving minor typos and hybrid accents (`×` vs `x`).

4. **Instant Feedback & Species Profile**:
   - Immediate feedback showing whether you were correct, made a minor typo, or were incorrect.
   - Shows the actual Latin name, Swedish name, English name, Family, and Hardiness Zone.
   - Displays a mini-gallery of all other organs for that species so you learn the complete tree profile.

5. **Comprehensive Review & Weakness Drill**:
   - Final percentage score and botanical rank.
   - Accuracy breakdown by botanical organ (see if you need more practice on winter buds vs bark).
   - Question-by-question review table showing the tested image, your answer, and the actual answer.
   - **"Drill Missed Species Only"** button to immediately launch a targeted quiz on species you got wrong.

6. **Species Atlas & Flashcard Browser**:
   - Browse all 61 species with search and family filters.
   - Inspect all organ photos side-by-side.

7. **Generalizable Beyond BI1452 (Add Any Plant)**:
   - Built-in live search connecting to iNaturalist Research Grade and Wikimedia Commons directly in your browser.
   - Search any plant species on Earth (e.g. *Sequoiadendron giganteum*, *Eucalyptus*, *Monstera*) and add it to your custom deck.
   - Export and import custom decks as JSON.

---

## 🌐 Deploy to GitHub Pages (1 Minute)

This app is built with pure HTML, Tailwind CSS (via CDN), and vanilla JavaScript. There are **no build steps**, **no npm commands required**, and **no server needed**:

1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit of PhytoMemo tree identification app"
   git push origin main
   ```
2. On GitHub, go to your repository **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **Deploy from a branch**.
4. Set branch to `main` and folder to `/ (root)`, then click **Save**.
5. Your quiz app is live at `https://<your-username>.github.io/<repo-name>/`!

---

## 💻 Run Locally

You can open `index.html` directly in any web browser, or run a simple local HTTP server:

```bash
# Using Python 3:
python3 -m http.server 8000

# Open in browser:
# http://localhost:8000
```

---

## 📂 File Structure

- [index.html](file:///home/mca/git/plants-matt/index.html) — Main application user interface.
- [app.js](file:///home/mca/git/plants-matt/app.js) — Quiz engine, interactive species filter, fuzzy matcher, scoring, and atlas logic.
- [plants_data.js](file:///home/mca/git/plants-matt/plants_data.js) — Pre-compiled verified repository of 61 species and 670+ images (loads in `<script>` tag, works offline and on `file://`).
- [plants_data.json](file:///home/mca/git/plants-matt/plants_data.json) — Standard JSON database format for export/import.
- [bi1452_species.json](file:///home/mca/git/plants-matt/bi1452_species.json) — Clean structured list of the 61 species transcribed from the reference PDF.
- `scripts/` — Automated data harvesting scripts for generating or updating botanical images from Wikimedia Commons and iNaturalist.
