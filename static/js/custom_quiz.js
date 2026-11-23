/**
 * CustomQuizModule: 自訂圖文出題測驗工坊 (全面升級版)
 * 支援字詞雙向翻譯 (看英選中 / 看中選英)、看圖選詞、看提示拼字、情境例句克漏字、聽力辨義、同義詞與搭配
 * 內建高精度干擾項演算法與鍵盤快捷鍵 (1/2/3/4 或 A/B/C/D)
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

    // 預設勾選前 10 個單字
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
        exampleTranslation: item.exampleTranslation || '',
        collocations: item.collocations || [],
        synonyms: item.synonyms || [],
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
    const totalAvailEl = document.getElementById('cqTotalAvailableCount');
    if (totalAvailEl) totalAvailEl.textContent = list.length;

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
    showToast(`🎲 已隨機挑選 ${Math.min(count, list.length)} 個單字！`);
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
   * 高品質干擾項生成器
   * 確保永遠取得 3 個相異且不與正解重複的選項
   * @param {Object} targetWord 目標單字物件
   * @param {'en'|'zh'} mode 選項語言類型
   * @param {Array} pool 當前題庫候選池
   */
  getHighQualityDistractors(targetWord, mode, pool) {
    const allCandidates = (pool && pool.length > 0) ? pool : this.vocabList;
    const targetVal = (mode === 'en' ? targetWord.word : targetWord.definition).trim().toLowerCase();

    // 備援詞庫 (即使題庫只有 1 個單字也能產生優質干擾項)
    const fallbackEn = [
      'innovation', 'subsequent', 'implement', 'sustainable', 'facilitate',
      'comprehensive', 'resilient', 'perspective', 'integrity', 'ambiguous',
      'collaborate', 'advocate', 'coherent', 'prevalent', 'reluctant',
      'diminish', 'elaborate', 'indispensable', 'meticulous', 'spontaneous'
    ];
    const fallbackZh = [
      '創新的、革新的', '隨後的、接著的', '實施、貫徹執行', '可持續的、永續的', '促進、使便利',
      '全面的、包羅萬象的', '堅韌的、適應力強的', '觀點、視角', '正直、誠信', '模稜兩可的、含糊的',
      '合作、協作', '擁護、倡導', '連貫的、條理分明的', '盛行的、普遍的', '勉強的、不情願的',
      '減少、減弱', '詳細說明的、精密的', '不可或缺的、核心的', '一絲不苟的、精緻的', '自發的、自然產生的'
    ];

    const results = new Set();

    // 優先策略 1: 尋找相同詞性 (pos) 的單字干擾項
    const samePos = allCandidates.filter(w => 
      w.pos === targetWord.pos && 
      w.word.toLowerCase() !== targetWord.word.toLowerCase() &&
      w.definition !== targetWord.definition
    ).sort(() => 0.5 - Math.random());

    for (const item of samePos) {
      const val = (mode === 'en' ? item.word : item.definition).trim();
      if (val && val.toLowerCase() !== targetVal && !results.has(val)) {
        results.add(val);
        if (results.size >= 3) break;
      }
    }

    // 策略 2: 從全體題庫與全域 vocabList 隨機補充
    if (results.size < 3) {
      const combined = [...allCandidates, ...this.vocabList].sort(() => 0.5 - Math.random());
      for (const item of combined) {
        const val = (mode === 'en' ? item.word : item.definition).trim();
        if (val && val.toLowerCase() !== targetVal && !results.has(val)) {
          results.add(val);
          if (results.size >= 3) break;
        }
      }
    }

    // 策略 3: 使用靜態高頻詞彙補齊
    if (results.size < 3) {
      const fbList = (mode === 'en' ? fallbackEn : fallbackZh).sort(() => 0.5 - Math.random());
      for (const fb of fbList) {
        if (fb.toLowerCase() !== targetVal && !results.has(fb)) {
          results.add(fb);
          if (results.size >= 3) break;
        }
      }
    }

    return Array.from(results).slice(0, 3);
  },

  /**
   * 生成客製化測驗考卷
   */
  generateQuiz() {
    const allAvailable = this.getCurrentSourceList();
    const selectedWords = allAvailable.filter(w => this.selectedWordIds.has(w.id));

    if (selectedWords.length === 0) {
      alert("請至少勾選 1 個單字才能開始測驗！");
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
      const qType = selectedTypes[idx % selectedTypes.length];
      return this.buildQuestionItem(wordObj, qType, allAvailable, idx);
    });

    // 切換至測驗進行畫面
    this.startQuizSession();
  },

  /**
   * 智慧建構單一考題 (支援字詞雙向翻譯與多種題型)
   */
  buildQuestionItem(targetWord, qType, allWords, index) {
    // 舊版題型轉譯相容
    if (qType === 'def_to_word') qType = 'trans_zh_to_en';
    if (qType === 'listen_image') qType = 'listen_quiz';

    const questionItem = {
      index: index + 1,
      type: qType,
      target: targetWord,
      image: targetWord.imageUrl || null,
      answered: false,
      userAnswer: null,
      isCorrect: false,
      heroType: null
    };

    // 1. 字詞翻譯：看英選中 (English -> Chinese)
    if (qType === 'trans_en_to_zh') {
      const distractors = this.getHighQualityDistractors(targetWord, 'zh', allWords);
      questionItem.typeLabel = '🌐 字詞翻譯・看英選中';
      questionItem.heroType = 'en_to_zh';
      questionItem.heroWord = targetWord.word;
      questionItem.heroPhonetic = targetWord.phonetic || '';
      questionItem.heroPos = targetWord.pos || 'n.';
      questionItem.stem = '請觀察題目單字，從下列選項中選出正確的中文釋義：';
      questionItem.substem = targetWord.englishDef ? `English Definition: ${targetWord.englishDef}` : '';
      questionItem.options = [targetWord.definition, ...distractors].sort(() => 0.5 - Math.random());
      questionItem.answer = targetWord.definition;
      questionItem.autoPlayAudio = true;
    }
    // 2. 字詞翻譯：看中選英 (Chinese -> English)
    else if (qType === 'trans_zh_to_en') {
      const distractors = this.getHighQualityDistractors(targetWord, 'en', allWords);
      questionItem.typeLabel = '🇹🇼 字詞翻譯・看中選英';
      questionItem.heroType = 'zh_to_en';
      questionItem.heroWord = targetWord.definition;
      questionItem.heroPhonetic = '';
      questionItem.heroPos = targetWord.pos ? `${targetWord.pos} 詞性` : '';
      questionItem.stem = '請觀察題目中文釋義，從下列選項中選出對應的英文單字：';
      questionItem.substem = targetWord.category ? `分類領域：${targetWord.category}` : '';
      questionItem.options = [targetWord.word, ...distractors].sort(() => 0.5 - Math.random());
      questionItem.answer = targetWord.word;
      questionItem.autoPlayAudio = false;
    }
    // 3. 看圖識字選詞 (Image Recognition)
    else if (qType === 'image_to_word') {
      const distractors = this.getHighQualityDistractors(targetWord, 'en', allWords);
      questionItem.typeLabel = '🖼️ 看圖識字選詞';
      questionItem.stem = '請觀察情境圖片與關鍵線索，選出最相符的英文單字：';
      questionItem.substem = `中文釋義提示：${targetWord.definition} (${targetWord.pos || ''})`;
      questionItem.options = [targetWord.word, ...distractors].sort(() => 0.5 - Math.random());
      questionItem.answer = targetWord.word;
    }
    // 4. 看提示拼字挑戰 (Spelling Challenge)
    else if (qType === 'spelling') {
      questionItem.typeLabel = '⌨️ 看提示拼字挑戰';
      questionItem.stem = '請根據中文定義與音標，在下方輸入框拼寫出完整英文單字：';
      questionItem.substem = `中文釋義：${targetWord.definition} (${targetWord.pos || ''}) ${targetWord.phonetic ? '・' + targetWord.phonetic : ''}`;
      questionItem.answer = targetWord.word;
      questionItem.autoPlayAudio = true;
    }
    // 5. 情境例句克漏字 (Sentence Cloze)
    else if (qType === 'sentence_cloze') {
      const distractors = this.getHighQualityDistractors(targetWord, 'en', allWords);
      questionItem.typeLabel = '📝 情境例句克漏字';
      questionItem.heroType = 'cloze';
      const rawExample = targetWord.example || `The team must ______ this critical plan effectively.`;
      const regex = new RegExp(`\\b${targetWord.word}\\b`, 'gi');
      const clozeSentence = rawExample.replace(regex, '________');
      questionItem.stem = '請根據語意情境與文法，選出最適合填入空格中的單字：';
      questionItem.substem = `"${clozeSentence}"`;
      questionItem.options = [targetWord.word, ...distractors].sort(() => 0.5 - Math.random());
      questionItem.answer = targetWord.word;
    }
    // 6. 聽力真題辨義 (Listening Quiz)
    else if (qType === 'listen_quiz') {
      const distractors = this.getHighQualityDistractors(targetWord, 'zh', allWords);
      questionItem.typeLabel = '🎧 聽力真題辨義';
      questionItem.heroType = 'listen';
      questionItem.heroWord = '🎧 播放發音中...';
      questionItem.stem = '請點擊聆聽道地發音，選出聽到的單字之正確中文釋義：';
      questionItem.substem = '💡 提示：點擊右側朗讀按鈕可無限制重複聆聽';
      questionItem.options = [targetWord.definition, ...distractors].sort(() => 0.5 - Math.random());
      questionItem.answer = targetWord.definition;
      questionItem.autoPlayAudio = true;
    }
    // 7. 同義詞與搭配辨析 (Synonyms & Collocations)
    else if (qType === 'collocation_synonym') {
      questionItem.typeLabel = '🔄 同義詞與搭配辨析';
      questionItem.heroType = 'synonym';
      questionItem.heroWord = targetWord.word;
      questionItem.heroPhonetic = targetWord.phonetic || '';
      questionItem.heroPos = targetWord.pos || '';

      if (targetWord.synonyms && targetWord.synonyms.length > 0) {
        const correctSyn = targetWord.synonyms[0];
        const distractors = this.getHighQualityDistractors(targetWord, 'en', allWords);
        questionItem.stem = `請選出與單字【${targetWord.word}】語意最相近的同義詞：`;
        questionItem.substem = `中文釋義：${targetWord.definition}`;
        questionItem.options = [correctSyn, ...distractors].sort(() => 0.5 - Math.random());
        questionItem.answer = correctSyn;
      } else if (targetWord.collocations && targetWord.collocations.length > 0) {
        const colloc = targetWord.collocations[0];
        const regex = new RegExp(`\\b${targetWord.word}\\b`, 'gi');
        const collocBlank = colloc.replace(regex, '________');
        const distractors = this.getHighQualityDistractors(targetWord, 'en', allWords);
        questionItem.stem = '請選出最常見的道地搭配詞 (Collocation)：';
        questionItem.substem = `搭配片語：${collocBlank} (定義: ${targetWord.definition})`;
        questionItem.options = [targetWord.word, ...distractors].sort(() => 0.5 - Math.random());
        questionItem.answer = targetWord.word;
      } else {
        // Fallback to trans_en_to_zh
        const distractors = this.getHighQualityDistractors(targetWord, 'zh', allWords);
        questionItem.stem = '請選出該單字的正確中文釋義：';
        questionItem.substem = targetWord.englishDef ? `English: ${targetWord.englishDef}` : '';
        questionItem.options = [targetWord.definition, ...distractors].sort(() => 0.5 - Math.random());
        questionItem.answer = targetWord.definition;
      }
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

    // 單字焦點大卡牌渲染
    const heroBox = document.getElementById('cqHeroWordBox');
    const heroBadge = document.getElementById('cqHeroBadge');
    const heroWord = document.getElementById('cqHeroWord');
    const heroAudioBtn = document.getElementById('cqHeroAudioBtn');
    const heroPhonetic = document.getElementById('cqHeroPhonetic');
    const heroPos = document.getElementById('cqHeroPos');

    if (q.heroType) {
      if (heroBox) heroBox.style.display = 'block';

      if (q.heroType === 'en_to_zh') {
        if (heroBox) heroBox.className = 'cq-hero-word-box';
        if (heroBadge) {
          heroBadge.className = 'cq-hero-badge';
          heroBadge.textContent = '🌐 字詞翻譯・看英選中 (選中文釋義)';
        }
        if (heroWord) heroWord.textContent = q.heroWord;
        if (heroPhonetic) {
          heroPhonetic.style.display = 'inline-block';
          heroPhonetic.textContent = q.heroPhonetic;
        }
        if (heroPos) {
          heroPos.style.display = 'inline-block';
          heroPos.textContent = q.heroPos;
        }
        if (heroAudioBtn) {
          heroAudioBtn.style.display = 'inline-flex';
          heroAudioBtn.innerHTML = '🔊 朗讀發音';
          heroAudioBtn.onclick = () => SpeechEngine.speak(q.target.word);
        }
      } 
      else if (q.heroType === 'zh_to_en') {
        if (heroBox) heroBox.className = 'cq-hero-word-box zh-mode';
        if (heroBadge) {
          heroBadge.className = 'cq-hero-badge zh-badge';
          heroBadge.textContent = '🇹🇼 字詞翻譯・看中選英 (選英文單字)';
        }
        if (heroWord) heroWord.textContent = q.heroWord;
        if (heroPhonetic) heroPhonetic.style.display = 'none';
        if (heroPos) {
          heroPos.style.display = 'inline-block';
          heroPos.textContent = q.heroPos;
        }
        if (heroAudioBtn) heroAudioBtn.style.display = 'none';
      }
      else if (q.heroType === 'listen') {
        if (heroBox) heroBox.className = 'cq-hero-word-box listen-mode';
        if (heroBadge) {
          heroBadge.className = 'cq-hero-badge listen-badge';
          heroBadge.textContent = '🎧 聽力真題辨義 (純聽力測驗)';
        }
        if (heroWord) heroWord.textContent = q.answered ? q.target.word : '🎧 播放發音中...';
        if (heroPhonetic) {
          heroPhonetic.style.display = q.answered ? 'inline-block' : 'none';
          heroPhonetic.textContent = q.target.phonetic || '';
        }
        if (heroPos) {
          heroPos.style.display = 'inline-block';
          heroPos.textContent = q.target.pos || '';
        }
        if (heroAudioBtn) {
          heroAudioBtn.style.display = 'inline-flex';
          heroAudioBtn.innerHTML = '🔊 重複播放';
          heroAudioBtn.onclick = () => SpeechEngine.speak(q.target.word);
        }
      }
      else if (q.heroType === 'synonym') {
        if (heroBox) heroBox.className = 'cq-hero-word-box';
        if (heroBadge) {
          heroBadge.className = 'cq-hero-badge synonym-badge';
          heroBadge.textContent = '🔄 同義詞與搭配辨析';
        }
        if (heroWord) heroWord.textContent = q.heroWord;
        if (heroPhonetic) {
          heroPhonetic.style.display = 'inline-block';
          heroPhonetic.textContent = q.heroPhonetic;
        }
        if (heroPos) {
          heroPos.style.display = 'inline-block';
          heroPos.textContent = q.heroPos;
        }
        if (heroAudioBtn) {
          heroAudioBtn.style.display = 'inline-flex';
          heroAudioBtn.innerHTML = '🔊 朗讀發音';
          heroAudioBtn.onclick = () => SpeechEngine.speak(q.target.word);
        }
      }
      else {
        if (heroBox) heroBox.style.display = 'none';
      }
    } else {
      if (heroBox) heroBox.style.display = 'none';
    }

    // 圖片渲染
    const imgWrap = document.getElementById('cqQImageWrap');
    const imgTag = document.getElementById('cqQImage');
    if (q.image && q.type !== 'trans_en_to_zh' && q.type !== 'trans_zh_to_en') {
      imgTag.src = q.image;
      imgWrap.style.display = 'block';
      imgTag.onclick = () => this.openLightbox(q.image, `${q.target.word} - ${q.target.definition}`);
    } else {
      imgWrap.style.display = 'none';
    }

    // 頂部小發音按鈕
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
      btn.setAttribute('data-choice-idx', optIdx);
      btn.innerHTML = `
        <span class="choice-label">${String.fromCharCode(65 + optIdx)}</span>
        <span class="choice-text">${optText}</span>
        <span class="choice-kbd-tag">[${optIdx + 1}]</span>
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
    input.value = '';
    input.disabled = false;
    input.focus();

    const targetWord = q.target.word.trim();
    this.revealedIndices = new Set();
    this.hintsUsedCount = 0;
    this.updateSpellBoxes(targetWord);
    document.getElementById('cqHintsLeft').textContent = this.maxHintsPerQ - this.hintsUsedCount;

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

    const isCorrect = (selectedOpt.trim().toLowerCase() === q.answer.trim().toLowerCase());
    q.isCorrect = isCorrect;

    // 若是聽力題，答題後揭曉單字文字
    if (q.heroType === 'listen') {
      const heroWord = document.getElementById('cqHeroWord');
      const heroPhonetic = document.getElementById('cqHeroPhonetic');
      if (heroWord) heroWord.textContent = q.target.word;
      if (heroPhonetic) {
        heroPhonetic.style.display = 'inline-block';
        heroPhonetic.textContent = q.target.phonetic || '';
      }
    }

    // 高亮選項按鈕
    const optionsGrid = document.getElementById('cqOptionsGrid');
    Array.from(optionsGrid.children).forEach(btn => {
      btn.disabled = true;
      const text = btn.querySelector('.choice-text').textContent.trim();
      if (text.toLowerCase() === q.answer.trim().toLowerCase()) {
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
      showToast(newStatus ? `⭐ 已將【${q.target.word}】加入生字本` : `已從生字本移除`);
    };

    expPanel.style.display = 'block';

    // 更新即時得分
    document.getElementById('cqRunnerScore').textContent = this.score;

    // 下一題按鈕文字 (最後一題改為查看成績)
    const nextBtn = document.getElementById('btnCqNextQuestion');
    const isLast = (this.currentQIndex === this.activeQuiz.length - 1);
    nextBtn.textContent = isLast ? '查看測驗成績 🏆 (按 Enter)' : '下一題 → (按 Enter)';
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
      subEl.textContent = '您已完全掌握本次所有單字與出題題型！';
    } else if (finalAccuracy >= 80) {
      iconEl.textContent = '🏆';
      titleEl.textContent = '成績優異！表現出色！';
      subEl.textContent = '單字敏銳度極佳，大考與檢定高分在握！';
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

    // 批次選擇按鈕
    document.getElementById('btnCqSelectAll')?.addEventListener('click', () => this.selectAll());
    document.getElementById('btnCqDeselectAll')?.addEventListener('click', () => this.deselectAll());
    document.getElementById('btnCqSelectRandom')?.addEventListener('click', () => this.selectRandom(10));

    // 題型勾選方塊視覺同步
    document.querySelectorAll('.cq-type-card').forEach(card => {
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb) {
        cb.addEventListener('change', () => {
          card.classList.toggle('active', cb.checked);
          this.updateSelectionSummary();
        });
      }
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
    document.getElementById('btnCqAddAllWrong')?.addEventListener('click', () => {
      if (this.wrongQuestions.length === 0) {
        showToast("本次測驗無錯題！");
        return;
      }
      this.wrongQuestions.forEach(wq => {
        if (!AppState.isWordStarred(wq.target.word)) {
          AppState.addCustomWordToWordbook(wq.target);
        }
      });
      showToast(`⭐ 已將 ${this.wrongQuestions.length} 個錯題全數加入生字本！`);
    });

    // 鍵盤監聽快捷鍵：1/2/3/4 或 A/B/C/D 作答，Space/Enter 跳下一題
    window.addEventListener('keydown', (e) => {
      const runnerScreen = document.getElementById('cqRunnerScreen');
      if (!runnerScreen || runnerScreen.style.display === 'none') return;

      // 若正專注於文字輸入框且非 Enter，不攔截
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && e.key !== 'Enter') {
        return;
      }

      const q = this.activeQuiz[this.currentQIndex];
      if (!q) return;

      // 已回答狀態：按 Space 或 Enter 進入下一題
      if (q.answered) {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          const nextBtn = document.getElementById('btnCqNextQuestion');
          if (nextBtn) nextBtn.click();
        }
        return;
      }

      // 未回答狀態：選擇題按 1/2/3/4 或 A/B/C/D
      if (q.type !== 'spelling') {
        let optIdx = -1;
        const key = e.key.toUpperCase();
        if (key === '1' || key === 'A') optIdx = 0;
        else if (key === '2' || key === 'B') optIdx = 1;
        else if (key === '3' || key === 'C') optIdx = 2;
        else if (key === '4' || key === 'D') optIdx = 3;

        if (optIdx >= 0 && optIdx < q.options.length) {
          e.preventDefault();
          const optionsGrid = document.getElementById('cqOptionsGrid');
          const btn = optionsGrid?.children[optIdx];
          if (btn && !btn.disabled) {
            btn.click();
          }
        }
      }
    });

    // 手動新增單字折疊面板控制
    document.getElementById('btnToggleCustomWordForm')?.addEventListener('click', () => {
      const panel = document.getElementById('cqCustomWordPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      if (panel.style.display === 'block') {
        panel.scrollIntoView({ behavior: 'smooth' });
      }
    });

    document.getElementById('btnCloseCustomWordPanel')?.addEventListener('click', () => {
      document.getElementById('cqCustomWordPanel').style.display = 'none';
    });

    // Lightbox 點擊遮罩關閉
    document.getElementById('cqLightboxClose')?.addEventListener('click', () => this.closeLightbox());
    document.getElementById('cqImageLightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'cqImageLightbox') this.closeLightbox();
    });

    // 更換圖片彈窗關閉
    document.getElementById('cqModalClose')?.addEventListener('click', () => this.closeChangeImageModal());
    document.getElementById('cqBtnCancelChangeImg')?.addEventListener('click', () => this.closeChangeImageModal());

    // 儲存更換圖片
    document.getElementById('cqBtnSaveChangeImg')?.addEventListener('click', () => {
      const input = document.getElementById('cqModalUrlInput');
      this.applyModalImage(input.value.trim());
    });
  }
};

window.CustomQuizModule = CustomQuizModule;
