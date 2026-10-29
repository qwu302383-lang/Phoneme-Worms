/**
 * CustomQuizModule: 自訂圖文出題測驗工坊
 * 支援載入單字、配置/上傳本機圖片、多題型組合（看圖選詞、看圖拼字、聽音看圖、例句克漏字等）
 */
const CustomQuizModule = {
  vocabList: [],
  selectedWordIds: new Set(),
  currentSource: 'library', // 'library' | 'wordbook'
  
  // 測驗執行狀態
  activeQuiz: [],
  currentQIndex: 0,
  score: 0,
  correctCount: 0,
  wrongQuestions: [],
  timerInterval: null,
  elapsedSeconds: 0,
  isTimerEnabled: true,
  hintsUsedCount: 0,
  maxHintsPerQ: 3,
  revealedIndices: new Set(),

  // 當前編輯更換圖片之單字
  editingWordForImg: null,

  async init() {
    await this.loadVocab();
    this.bindEvents();
    this.renderWordGrid();
    this.updateSelectionSummary();
  },

  async loadVocab() {
    try {
      const res = await fetch('/api/vocab');
      const json = await res.json();
      if (json.success && json.data) {
        this.vocabList = json.data;
      }
    } catch (e) {
      console.warn("Using offline vocab in CustomQuizModule", e);
    }

    // 預設全選前 10 個單字
    this.vocabList.slice(0, 10).forEach(w => this.selectedWordIds.add(w.id));
  },

  getCurrentSourceList() {
    if (this.currentSource === 'wordbook') {
      const starred = AppState.getStarredWords();
      return starred.map((item, idx) => ({
        id: `wb_${idx}`,
        word: item.word,
        phonetic: item.phonetic || '',
        pos: item.pos || '',
        definition: item.definition || '',
        example: item.example || '',
        imageUrl: item.imageUrl || ''
      }));
    }
    return this.vocabList;
  },

  renderWordGrid() {
    const grid = document.getElementById('cqWordGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = this.getCurrentSourceList();
    document.getElementById('cqTotalAvailableCount').textContent = list.length;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem;">
          <div class="empty-icon">📂</div>
          <h4>查無可用單字</h4>
          <p style="color:var(--text-muted);">生字本目前為空，可點擊上方「➕ 手動新增單字與圖片」或切換回「內建單字庫」。</p>
        </div>
      `;
      return;
    }

    list.forEach(wordObj => {
      const isChecked = this.selectedWordIds.has(wordObj.id);
      const card = document.createElement('div');
      card.className = `cq-word-item-card ${isChecked ? 'selected' : ''}`;
      card.id = `cq-card-${wordObj.id}`;

      const imgPlaceholder = `<div class="cq-thumb-placeholder">📷 點擊更換</div>`;
      const imgTag = wordObj.imageUrl 
        ? `<img src="${wordObj.imageUrl}" alt="${wordObj.word}" class="cq-thumb-img" onerror="this.onerror=null; this.parentElement.innerHTML='${imgPlaceholder}';">` 
        : imgPlaceholder;

      card.innerHTML = `
        <div class="cq-card-top">
          <label class="cq-checkbox-label">
            <input type="checkbox" class="cq-card-checkbox" data-id="${wordObj.id}" ${isChecked ? 'checked' : ''}>
            <span class="cq-custom-check"></span>
          </label>
          <button class="cq-btn-change-img" data-id="${wordObj.id}" title="更換/上傳圖片">📷 更換圖片</button>
        </div>

        <div class="cq-card-thumb-wrap" data-id="${wordObj.id}">
          ${imgTag}
        </div>

        <div class="cq-card-body">
          <div class="cq-word-title-row">
            <span class="cq-word-text">${wordObj.word}</span>
            <span class="cq-pos-tag">${wordObj.pos || ''}</span>
          </div>
          <p class="cq-word-phonetic">${wordObj.phonetic || ''}</p>
          <p class="cq-word-def">${wordObj.definition}</p>
        </div>
      `;

      // 點擊卡片切換勾選 (避開按鈕與圖片)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.cq-btn-change-img') || e.target.closest('.cq-card-thumb-wrap')) return;
        const cb = card.querySelector('.cq-card-checkbox');
        cb.checked = !cb.checked;
        this.toggleWordSelect(wordObj.id, cb.checked);
      });

      // 勾選框直接變更
      const checkbox = card.querySelector('.cq-card-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleWordSelect(wordObj.id, e.target.checked);
      });

      // 更換圖片按鈕與縮圖點擊
      card.querySelector('.cq-btn-change-img').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openChangeImageModal(wordObj);
      });

      card.querySelector('.cq-card-thumb-wrap').addEventListener('click', (e) => {
        e.stopPropagation();
        if (wordObj.imageUrl) {
          this.openLightbox(wordObj.imageUrl, `${wordObj.word} - ${wordObj.definition}`);
        } else {
          this.openChangeImageModal(wordObj);
        }
      });

      grid.appendChild(card);
    });

    this.updateSelectionSummary();
  },

  toggleWordSelect(wordId, isChecked) {
    if (isChecked) {
      this.selectedWordIds.add(wordId);
    } else {
      this.selectedWordIds.delete(wordId);
    }
    const card = document.getElementById(`cq-card-${wordId}`);
    if (card) {
      card.classList.toggle('selected', isChecked);
    }
    this.updateSelectionSummary();
  },

  updateSelectionSummary() {
    const count = this.selectedWordIds.size;
    const countEl = document.getElementById('cqSelectedCount');
    const finalWordEl = document.getElementById('cqFinalWordCount');
    if (countEl) countEl.textContent = count;
    if (finalWordEl) finalWordEl.textContent = count;

    // 更新選中題型數
    const activeTypes = document.querySelectorAll('input[name="qType"]:checked');
    const finalTypeEl = document.getElementById('cqFinalTypeCount');
    if (finalTypeEl) finalTypeEl.textContent = activeTypes.length;
  },

  selectAll() {
    const list = this.getCurrentSourceList();
    list.forEach(w => this.selectedWordIds.add(w.id));
    this.renderWordGrid();
  },

  deselectAll() {
    this.selectedWordIds.clear();
    this.renderWordGrid();
  },

  selectRandom(count) {
    this.selectedWordIds.clear();
    const list = [...this.getCurrentSourceList()];
    const shuffled = list.sort(() => 0.5 - Math.random());
    shuffled.slice(0, count).forEach(w => this.selectedWordIds.add(w.id));
    this.renderWordGrid();
    showToast(`🎲 已為您隨機挑選 ${Math.min(count, list.length)} 個單字！`);
  },

  // 開啟更換圖片 Modal
  openChangeImageModal(wordObj) {
    this.editingWordForImg = wordObj;
    const modal = document.getElementById('cqChangeImageModal');
    const title = document.getElementById('cqChangeImgTitle');
    const preview = document.getElementById('cqModalImgPreview');
    const urlInput = document.getElementById('cqModalUrlInput');

    title.textContent = `📷 更換單字圖片：${wordObj.word}`;
    preview.src = wordObj.imageUrl || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600';
    urlInput.value = wordObj.imageUrl || '';

    modal.style.display = 'flex';
  },

  closeChangeImageModal() {
    const modal = document.getElementById('cqChangeImageModal');
    if (modal) modal.style.display = 'none';
    this.editingWordForImg = null;
  },

  async applyModalImage(newUrl) {
    if (!this.editingWordForImg || !newUrl) return;
    this.editingWordForImg.imageUrl = newUrl;

    // 同步儲存至後端
    try {
      await fetch('/api/vocab/save_custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: this.editingWordForImg.word,
          imageUrl: newUrl
        })
      });
    } catch (e) {
      console.warn("Failed to persist image on server", e);
    }

    this.renderWordGrid();
    this.closeChangeImageModal();
    showToast(`🖼️ 已更新【${this.editingWordForImg.word}】的圖片！`);
  },

  // Lightbox 放大檢視
  openLightbox(imgSrc, caption = '') {
    const box = document.getElementById('cqImageLightbox');
    const img = document.getElementById('cqLightboxImg');
    const cap = document.getElementById('cqLightboxCaption');
    if (!box || !img) return;

    img.src = imgSrc;
    if (cap) cap.textContent = caption;
    box.style.display = 'flex';
  },

  closeLightbox() {
    const box = document.getElementById('cqImageLightbox');
    if (box) box.style.display = 'none';
  },

  /**
   * 生成客製化測驗考卷
   */
  generateQuiz() {
    const allAvailable = this.getCurrentSourceList();
    const selectedWords = allAvailable.filter(w => this.selectedWordIds.has(w.id));

    if (selectedWords.length < 2) {
      alert("請至少勾選 2 個單字才能組成題目與選項！");
      return;
    }

    const typeCheckboxes = document.querySelectorAll('input[name="qType"]:checked');
    const selectedTypes = Array.from(typeCheckboxes).map(cb => cb.value);

    if (selectedTypes.length === 0) {
      alert("請至少勾選 1 種要測驗的題型！");
      return;
    }

    // 依設定截取題目數
    const countSetting = document.getElementById('cqQuizCountSelect').value;
    let quizPool = [...selectedWords];

    const isShuffle = document.getElementById('cqShuffleCheck').checked;
    if (isShuffle) {
      quizPool = quizPool.sort(() => 0.5 - Math.random());
    }

    if (countSetting !== 'all') {
      const maxCount = parseInt(countSetting, 10);
      quizPool = quizPool.slice(0, maxCount);
    }

    // 建立題目清單
    this.activeQuiz = quizPool.map((wordObj, idx) => {
      // 隨機選一種勾選的題型
      const qType = selectedTypes[Math.floor(Math.random() * selectedTypes.length)];
      return this.buildQuestionItem(wordObj, qType, allAvailable, idx);
    });

    // 切換至測驗進行畫面
    this.startQuizSession();
  },

  buildQuestionItem(targetWord, qType, allWords, index) {
    // 挑選 3 個干擾項
    const distractors = allWords
      .filter(w => w.word !== targetWord.word)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    const questionItem = {
      index: index + 1,
      type: qType,
      target: targetWord,
      image: targetWord.imageUrl || null,
      answered: false,
      userAnswer: null,
      isCorrect: false
    };

    if (qType === 'image_to_word') {
      questionItem.typeLabel = '🖼️ 看圖選單字';
      questionItem.stem = '觀察上方圖片與中文釋義，選出正確的英文單字：';
      questionItem.substem = `中文釋義：${targetWord.definition}`;
      // 四個單字選項
      const options = [targetWord.word, ...distractors.map(d => d.word)].sort(() => 0.5 - Math.random());
      questionItem.options = options;
      questionItem.answer = targetWord.word;
    } 
    else if (qType === 'spelling') {
      questionItem.typeLabel = '⌨️ 看圖拼字挑戰';
      questionItem.stem = '觀察圖片與提示，拼寫出完整的英文單字：';
      questionItem.substem = `中文釋義：${targetWord.definition} (${targetWord.pos || ''})`;
      questionItem.answer = targetWord.word;
    }
    else if (qType === 'def_to_word') {
      questionItem.typeLabel = '🔠 釋義四選一';
      questionItem.stem = `根據釋義「${targetWord.definition}」，請選出對應的英文單字：`;
      questionItem.substem = targetWord.englishDef ? `English: ${targetWord.englishDef}` : '';
      const options = [targetWord.word, ...distractors.map(d => d.word)].sort(() => 0.5 - Math.random());
      questionItem.options = options;
      questionItem.answer = targetWord.word;
    }
    else if (qType === 'listen_image') {
      questionItem.typeLabel = '🎧 看圖聽音選詞';
      questionItem.stem = '點擊發音按鈕並結合情境圖片，選出正確的單字：';
      questionItem.substem = `中文提示：${targetWord.definition}`;
      const options = [targetWord.word, ...distractors.map(d => d.word)].sort(() => 0.5 - Math.random());
      questionItem.options = options;
      questionItem.answer = targetWord.word;
      questionItem.autoPlayAudio = true;
    }
    else if (qType === 'sentence_cloze') {
      questionItem.typeLabel = '📝 情境例句克漏字';
      const rawExample = targetWord.example || `We must ______ this strategy carefully.`;
      // 將單字挖空
      const regex = new RegExp(`\\b${targetWord.word}\\b`, 'gi');
      const clozeSentence = rawExample.replace(regex, '________');
      questionItem.stem = '請根據句意與圖片情境，選出最適合填入空格的單字：';
      questionItem.substem = `"${clozeSentence}"`;
      const options = [targetWord.word, ...distractors.map(d => d.word)].sort(() => 0.5 - Math.random());
      questionItem.options = options;
      questionItem.answer = targetWord.word;
    }

    return questionItem;
  },

  startQuizSession() {
    this.currentQIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.wrongQuestions = [];
    this.elapsedSeconds = 0;

    document.getElementById('cqBuilderScreen').style.display = 'none';
    document.getElementById('cqResultScreen').style.display = 'none';
    document.getElementById('cqRunnerScreen').style.display = 'block';

    // 計時器設定
    this.isTimerEnabled = document.getElementById('cqTimerCheck').checked;
    document.getElementById('cqRunnerTimerWrap').style.display = this.isTimerEnabled ? 'inline-flex' : 'none';

    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.isTimerEnabled) {
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds++;
        const mins = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
        const secs = String(this.elapsedSeconds % 60).padStart(2, '0');
        document.getElementById('cqRunnerTimer').textContent = `${mins}:${secs}`;
      }, 1000);
    }

    this.renderCurrentQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  renderCurrentQuestion() {
    const q = this.activeQuiz[this.currentQIndex];
    if (!q) {
      this.finishQuiz();
      return;
    }

    const total = this.activeQuiz.length;
    const current = this.currentQIndex + 1;

    // 頂部統計
    document.getElementById('cqRunnerCurrentQ').textContent = current;
    document.getElementById('cqRunnerTotalQ').textContent = total;
    document.getElementById('cqRunnerScore').textContent = this.score;

    const percent = Math.round((current / total) * 100);
    document.getElementById('cqRunnerProgressFill').style.width = `${percent}%`;

    // 題型徽章
    document.getElementById('cqQTypePill').textContent = q.typeLabel;

    // 圖片渲染
    const imgWrap = document.getElementById('cqQImageWrap');
    const imgTag = document.getElementById('cqQImage');
    if (q.image) {
      imgTag.src = q.image;
      imgWrap.style.display = 'block';
      imgTag.onclick = () => this.openLightbox(q.image, `${q.target.word} - ${q.target.definition}`);
    } else {
      imgWrap.style.display = 'none';
    }

    // 發音按鈕
    const audioBtn = document.getElementById('cqQAudioBtn');
    audioBtn.onclick = () => SpeechEngine.speak(q.target.word);
    if (q.autoPlayAudio) {
      setTimeout(() => SpeechEngine.speak(q.target.word), 300);
    }

    // 題幹文字
    document.getElementById('cqQStem').textContent = `Q${current}. ${q.stem}`;
    document.getElementById('cqQSubstem').textContent = q.substem || '';

    // 重設詳解面板
    const expPanel = document.getElementById('cqExpPanel');
    expPanel.style.display = 'none';

    // 選擇題 vs 拼字題顯示控制
    const optionsGrid = document.getElementById('cqOptionsGrid');
    const spellingArea = document.getElementById('cqSpellingArea');

    if (q.type === 'spelling') {
      optionsGrid.style.display = 'none';
      spellingArea.style.display = 'block';
      this.setupSpellingQuestion(q);
    } else {
      spellingArea.style.display = 'none';
      optionsGrid.style.display = 'grid';
      this.setupOptionsQuestion(q);
    }
  },

  setupOptionsQuestion(q) {
    const optionsGrid = document.getElementById('cqOptionsGrid');
    optionsGrid.innerHTML = '';

    q.options.forEach((optText, optIdx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice-btn cq-choice-btn';
      btn.innerHTML = `
        <span class="choice-label">${String.fromCharCode(65 + optIdx)}</span>
        <span class="choice-text">${optText}</span>
      `;

      btn.addEventListener('click', () => {
        if (q.answered) return;
        this.submitChoiceAnswer(q, optText, btn);
      });

      optionsGrid.appendChild(btn);
    });
  },

  setupSpellingQuestion(q) {
    const input = document.getElementById('cqSpellInput');
    const boxes = document.getElementById('cqSpellBoxes');
    input.value = '';
    input.disabled = false;
    input.focus();

    // 字母格子與提示設定
    const targetWord = q.target.word.trim();
    this.revealedIndices = new Set();
    this.hintsUsedCount = 0;
    this.updateSpellBoxes(targetWord);
    document.getElementById('cqHintsLeft').textContent = this.maxHintsPerQ - this.hintsUsedCount;

    // 即時輸入同步提示格
    input.oninput = () => {
      this.updateSpellBoxes(targetWord, input.value.trim().toLowerCase());
    };

    // 提示一個字母
    document.getElementById('btnCqHintLetter').onclick = () => {
      if (q.answered || this.hintsUsedCount >= this.maxHintsPerQ) return;
      const unrevealed = [];
      for (let i = 0; i < targetWord.length; i++) {
        if (!this.revealedIndices.has(i) && targetWord[i] !== ' ' && targetWord[i] !== '-') {
          unrevealed.push(i);
        }
      }
      if (unrevealed.length > 0) {
        const randomIdx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        this.revealedIndices.add(randomIdx);
        this.hintsUsedCount++;
        document.getElementById('cqHintsLeft').textContent = this.maxHintsPerQ - this.hintsUsedCount;
        this.updateSpellBoxes(targetWord, input.value.trim().toLowerCase());
      }
    };

    // 提交答案
    const submitBtn = document.getElementById('btnSubmitSpell');
    submitBtn.onclick = () => {
      if (q.answered) return;
      this.submitSpellAnswer(q, input.value.trim());
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!q.answered) this.submitSpellAnswer(q, input.value.trim());
      }
    };
  },

  updateSpellBoxes(targetWord, currentTyped = '') {
    const boxes = document.getElementById('cqSpellBoxes');
    boxes.innerHTML = '';

    for (let i = 0; i < targetWord.length; i++) {
      const char = targetWord[i];
      const box = document.createElement('div');
      box.className = 'spell-letter-box';

      if (char === ' ' || char === '-') {
        box.textContent = char;
        box.classList.add('separator');
      } else if (this.revealedIndices.has(i)) {
        box.textContent = char;
        box.classList.add('revealed');
      } else if (currentTyped[i]) {
        box.textContent = currentTyped[i];
        box.classList.add('typed');
      } else {
        box.textContent = '';
      }
      boxes.appendChild(box);
    }
  },

  submitChoiceAnswer(q, selectedOpt, clickedBtn) {
    q.answered = true;
    q.userAnswer = selectedOpt;

    const isCorrect = (selectedOpt.toLowerCase() === q.answer.toLowerCase());
    q.isCorrect = isCorrect;

    // 高亮選項按鈕
    const optionsGrid = document.getElementById('cqOptionsGrid');
    Array.from(optionsGrid.children).forEach(btn => {
      btn.disabled = true;
      const text = btn.querySelector('.choice-text').textContent;
      if (text.toLowerCase() === q.answer.toLowerCase()) {
        btn.classList.add('selected-correct');
      }
    });

    if (isCorrect) {
      this.correctCount++;
      this.score += Math.round(100 / this.activeQuiz.length);
      SpeechEngine.speak(q.target.word);
    } else {
      clickedBtn.classList.add('selected-incorrect');
      this.wrongQuestions.push(q);
    }

    this.showExplanationPanel(q, isCorrect);
  },

  submitSpellAnswer(q, typedText) {
    q.answered = true;
    q.userAnswer = typedText;
    const input = document.getElementById('cqSpellInput');
    input.disabled = true;

    const cleanTyped = typedText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanAnswer = q.answer.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isCorrect = (cleanTyped === cleanAnswer);
    q.isCorrect = isCorrect;

    if (isCorrect) {
      this.correctCount++;
      this.score += Math.round(100 / this.activeQuiz.length);
      input.classList.add('correct');
      SpeechEngine.speak(q.target.word);
    } else {
      input.classList.add('incorrect');
      this.wrongQuestions.push(q);
    }

    this.showExplanationPanel(q, isCorrect);
  },

  showExplanationPanel(q, isCorrect) {
    const expPanel = document.getElementById('cqExpPanel');
    const statusBox = document.getElementById('cqExpStatus');

    statusBox.className = `exp-status-bar ${isCorrect ? 'status-correct' : 'status-incorrect'}`;
    statusBox.innerHTML = isCorrect 
      ? `<span>🎉 太棒了！回答完全正確！</span>`
      : `<span>❌ 差一點！正確答案是：<strong>${q.answer}</strong></span>`;

    document.getElementById('cqExpWord').textContent = q.target.word;
    document.getElementById('cqExpPhonetic').textContent = q.target.phonetic || '';
    document.getElementById('cqExpPos').textContent = q.target.pos || '';
    document.getElementById('cqExpDef').textContent = q.target.definition;
    document.getElementById('cqExpExEn').textContent = q.target.example || '';
    document.getElementById('cqExpExZh').textContent = q.target.exampleTranslation || '';

    // 星號生字本狀態
    const starBtn = document.getElementById('btnCqExpAddStar');
    const isStarred = AppState.isWordStarred(q.target.word);
    starBtn.textContent = isStarred ? '⭐ 已在生字本' : '⭐ 加入生字本';
    starBtn.onclick = () => {
      AppState.toggleStarWord(q.target);
      const newStatus = AppState.isWordStarred(q.target.word);
      starBtn.textContent = newStatus ? '⭐ 已在生字本' : '⭐ 加入生字本';
      showToast(newStatus ? `⭐ 已將【${q.target.word}】加入生字本` : `已移除`);
    };

    expPanel.style.display = 'block';

    // 更新即時得分
    document.getElementById('cqRunnerScore').textContent = this.score;

    // 下一題按鈕文字 (最後一題改為查看成績)
    const nextBtn = document.getElementById('btnCqNextQuestion');
    const isLast = (this.currentQIndex === this.activeQuiz.length - 1);
    nextBtn.textContent = isLast ? '查看測驗成績 🏆' : '下一題 →';
    nextBtn.onclick = () => {
      if (isLast) {
        this.finishQuiz();
      } else {
        this.currentQIndex++;
        this.renderCurrentQuestion();
      }
    };
  },

  finishQuiz() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    document.getElementById('cqRunnerScreen').style.display = 'none';
    document.getElementById('cqResultScreen').style.display = 'block';

    const total = this.activeQuiz.length;
    const finalAccuracy = total > 0 ? Math.round((this.correctCount / total) * 100) : 0;

    // 成績展示
    document.getElementById('cqResScore').textContent = `${finalAccuracy}%`;
    document.getElementById('cqResCorrectCount').textContent = `${this.correctCount} / ${total}`;

    const mins = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
    const secs = String(this.elapsedSeconds % 60).padStart(2, '0');
    document.getElementById('cqResTime').textContent = `${mins}:${secs}`;

    const iconEl = document.getElementById('cqResultBadgeIcon');
    const titleEl = document.getElementById('cqResultTitle');
    const subEl = document.getElementById('cqResultSubtitle');

    if (finalAccuracy === 100) {
      iconEl.textContent = '🌟';
      titleEl.textContent = '滿分神人！完美無缺！';
      subEl.textContent = '您已完全掌握本次所有單字與題型！';
    } else if (finalAccuracy >= 80) {
      iconEl.textContent = '🏆';
      titleEl.textContent = '成績優異！表現出色！';
      subEl.textContent = '單字敏銳度極佳，大考高分近在眼前！';
    } else if (finalAccuracy >= 60) {
      iconEl.textContent = '👍';
      titleEl.textContent = '及格通過！持續進步！';
      subEl.textContent = '複習一下錯題，記憶將更加牢固！';
    } else {
      iconEl.textContent = '💪';
      titleEl.textContent = '再接再厲！別灰心！';
      subEl.textContent = '建議將錯題加入生字本，進行翻卡加強練習！';
    }

    // 錯題清單回顧
    const wrongSection = document.getElementById('cqWrongSection');
    const wrongGrid = document.getElementById('cqWrongListGrid');

    if (this.wrongQuestions.length > 0) {
      wrongSection.style.display = 'block';
      wrongGrid.innerHTML = '';

      this.wrongQuestions.forEach(wq => {
        const item = document.createElement('div');
        item.className = 'wrong-review-card';
        item.innerHTML = `
          ${wq.image ? `<img src="${wq.image}" alt="${wq.target.word}" class="wrong-card-thumb">` : ''}
          <div class="wrong-card-info">
            <div class="wrong-word-row">
              <span class="wrong-word">${wq.target.word}</span>
              <span class="wrong-phonetic">${wq.target.phonetic || ''}</span>
              <button class="card-audio-btn-sm" title="朗讀">🔊</button>
            </div>
            <p class="wrong-def">${wq.target.definition}</p>
            <p class="wrong-your-answer">您的作答：<span class="bad-ans">${wq.userAnswer || '未作答'}</span> | 正確：<span class="good-ans">${wq.answer}</span></p>
          </div>
        `;
        item.querySelector('.card-audio-btn-sm').onclick = () => SpeechEngine.speak(wq.target.word);
        wrongGrid.appendChild(item);
      });
    } else {
      wrongSection.style.display = 'none';
    }

    // 累積測驗統計至 AppState
    for (let i = 0; i < total; i++) {
      AppState.incrementQuizFinished();
    }
  },

  exitToBuilder() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    document.getElementById('cqRunnerScreen').style.display = 'none';
    document.getElementById('cqResultScreen').style.display = 'none';
    document.getElementById('cqBuilderScreen').style.display = 'block';
  },

  bindEvents() {
    // 來源分頁切換 (內建庫 vs 生字本)
    document.querySelectorAll('.cq-tab-btn[data-source]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cq-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentSource = e.target.dataset.source;
        this.selectedWordIds.clear();
        this.renderWordGrid();
      });
    });

    // 快捷選取按鈕
    document.getElementById('btnCqSelectAll')?.addEventListener('click', () => this.selectAll());
    document.getElementById('btnCqDeselectAll')?.addEventListener('click', () => this.deselectAll());
    document.getElementById('btnCqRandom5')?.addEventListener('click', () => this.selectRandom(5));
    document.getElementById('btnCqRandom10')?.addEventListener('click', () => this.selectRandom(10));

    // 題型勾選方塊視覺同步
    document.querySelectorAll('.cq-type-card').forEach(card => {
      const cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => {
        card.classList.toggle('active', cb.checked);
        this.updateSelectionSummary();
      });
    });

    // 開始測驗
    document.getElementById('btnStartCustomQuiz')?.addEventListener('click', () => this.generateQuiz());

    // 退出測驗
    document.getElementById('btnCqExitQuiz')?.addEventListener('click', () => {
      if (confirm("確定要中途退出本次測驗嗎？")) {
        this.exitToBuilder();
      }
    });

    // 成績頁按鈕
    document.getElementById('btnCqRetryQuiz')?.addEventListener('click', () => this.startQuizSession());
    document.getElementById('btnCqBackToBuilder')?.addEventListener('click', () => this.exitToBuilder());

    // 一鍵錯題加入生字本
    document.getElementById('btnCqAddAllWrongToStar')?.addEventListener('click', () => {
      let count = 0;
      this.wrongQuestions.forEach(wq => {
        if (!AppState.isWordStarred(wq.target.word)) {
          AppState.toggleStarWord(wq.target);
          count++;
        }
      });
      showToast(`⭐ 已將 ${count} 個錯題單字加入生字本！`);
    });

    // 手動新增單字摺疊表單切換
    const toggleFormBtn = document.getElementById('btnToggleCustomWordForm');
    const formPanel = document.getElementById('cqCustomWordPanel');
    const closeFormBtn = document.getElementById('btnCloseCustomWordPanel');

    toggleFormBtn?.addEventListener('click', () => {
      const isOpen = (formPanel.style.display !== 'none');
      formPanel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) formPanel.scrollIntoView({ behavior: 'smooth' });
    });

    closeFormBtn?.addEventListener('click', () => {
      formPanel.style.display = 'none';
    });

    // 本機圖片上傳預覽
    const fileInput = document.getElementById('cqFileInput');
    const imgPreview = document.getElementById('cqNewImagePreview');
    const urlInput = document.getElementById('cqImageUrlInput');

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // 嘗試上傳至伺服器
      const formData = new FormData();
      formData.append('image', file);

      try {
        const res = await fetch('/api/upload_image', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.url) {
          urlInput.value = data.url;
          imgPreview.innerHTML = `<img src="${data.url}" class="preview-img">`;
          showToast("📷 本機圖片上傳成功！");
          return;
        }
      } catch (err) {
        console.warn("Upload to backend failed, falling back to base64 DataURL", err);
      }

      // 降級 Base64 DataURL
      const reader = new FileReader();
      reader.onload = (re) => {
        urlInput.value = re.target.result;
        imgPreview.innerHTML = `<img src="${re.target.result}" class="preview-img">`;
      };
      reader.readAsDataURL(file);
    });

    // 預覽網址
    document.getElementById('btnApplyImageUrl')?.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        imgPreview.innerHTML = `<img src="${url}" class="preview-img">`;
      }
    });

    // 儲存自訂單字
    document.getElementById('btnSaveCustomWord')?.addEventListener('click', async () => {
      const word = document.getElementById('cqInputWord').value.trim();
      const def = document.getElementById('cqInputDef').value.trim();
      const phonetic = document.getElementById('cqInputPhonetic').value.trim();
      const pos = document.getElementById('cqInputPos').value;
      const example = document.getElementById('cqInputExample').value.trim();
      const imageUrl = urlInput.value.trim();

      if (!word || !def) {
        alert("請至少填寫「英文單字」與「中文釋義」！");
        return;
      }

      const payload = {
        word,
        definition: def,
        phonetic,
        pos,
        example,
        imageUrl,
        category: '自訂出題'
      };

      try {
        const res = await fetch('/api/vocab/save_custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.data) {
          this.vocabList = data.data;
        }
      } catch (e) {
        // 本地降級
        this.vocabList.push({
          id: Date.now(),
          ...payload
        });
      }

      // 清空表單並關閉
      document.getElementById('cqInputWord').value = '';
      document.getElementById('cqInputDef').value = '';
      document.getElementById('cqInputPhonetic').value = '';
      document.getElementById('cqInputExample').value = '';
      urlInput.value = '';
      imgPreview.innerHTML = '<span class="preview-placeholder">📷 尚未設定圖片</span>';
      formPanel.style.display = 'none';

      // 自動選取新增的單字
      const newWordObj = this.vocabList.find(w => w.word.toLowerCase() === word.toLowerCase());
      if (newWordObj) this.selectedWordIds.add(newWordObj.id);

      this.renderWordGrid();
      showToast(`🎉 成功新增自訂單字【${word}】並加入題庫！`);
    });

    // Lightbox 關閉
    document.getElementById('btnCqCloseLightbox')?.addEventListener('click', () => this.closeLightbox());
    document.querySelector('.lightbox-overlay')?.addEventListener('click', () => this.closeLightbox());

    // 更換單字圖片 Modal 事件
    const modalFileInput = document.getElementById('cqModalFileInput');
    const modalUrlInput = document.getElementById('cqModalUrlInput');
    const modalImgPreview = document.getElementById('cqModalImgPreview');

    modalFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/upload_image', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success && data.url) {
          modalUrlInput.value = data.url;
          modalImgPreview.src = data.url;
          return;
        }
      } catch (err) {
        console.warn("Upload failed, fallback to DataURL", err);
      }

      const reader = new FileReader();
      reader.onload = (re) => {
        modalUrlInput.value = re.target.result;
        modalImgPreview.src = re.target.result;
      };
      reader.readAsDataURL(file);
    });

    modalUrlInput?.addEventListener('input', (e) => {
      modalImgPreview.src = e.target.value;
    });

    document.getElementById('btnCqCloseChangeImgModal')?.addEventListener('click', () => this.closeChangeImageModal());
    document.getElementById('btnCqCancelChangeImg')?.addEventListener('click', () => this.closeChangeImageModal());
    document.getElementById('btnCqSaveChangeImg')?.addEventListener('click', () => {
      const url = modalUrlInput.value.trim();
      this.applyModalImage(url);
    });
  }
};

window.CustomQuizModule = CustomQuizModule;
