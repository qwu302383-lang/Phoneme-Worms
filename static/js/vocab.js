/**
 * VocabModule: 單字卡片翻轉學習、掌握度追蹤與快速抽考
 */
const VocabModule = {
  vocabList: [],
  filteredList: [],
  currentIndex: 0,
  isFlipped: false,
  currentFilter: 'all',
  quizCurrentIndex: 0,

  async init() {
    await this.loadData();
    this.bindEvents();
    this.renderCard();
    this.updateStats();
  },

  async loadData() {
    try {
      const res = await fetch('/api/vocab');
      const json = await res.json();
      if (json.success && json.data) {
        this.vocabList = json.data;
      }
    } catch (e) {
      console.warn("Using offline vocab fallback", e);
    }

    this.applyFilter('all');
  },

  applyFilter(filterType) {
    this.currentFilter = filterType;
    const masteredIds = AppState.getMasteredIds();
    const starredWords = AppState.getStarredWords();
    const starredWordSet = new Set(starredWords.map(w => w.word.toLowerCase()));

    // 自動過濾已在個人生字本中的單字（有出現在單字本的單字就不出現在每日單字卡）
    const unstarredList = this.vocabList.filter(v => !starredWordSet.has(v.word.toLowerCase()));

    if (filterType === 'all') {
      this.filteredList = [...unstarredList];
    } else if (filterType === 'mastered') {
      this.filteredList = unstarredList.filter(v => masteredIds.includes(v.id));
    } else if (filterType === 'unmastered') {
      this.filteredList = unstarredList.filter(v => !masteredIds.includes(v.id));
    } else {
      this.filteredList = unstarredList.filter(v => (v.category || '').includes(filterType));
    }

    this.currentIndex = 0;
    this.renderCard();
  },

  renderCard() {
    const cardEl = document.getElementById('mainFlashcard');
    if (!cardEl) return;

    if (this.filteredList.length === 0) {
      const starredWords = AppState.getStarredWords();
      const hasStarred = this.vocabList.length > 0 && starredWords.length > 0;
      document.getElementById('cardWord').textContent = hasStarred ? "🎉 本類別單字皆已收藏至生字本！" : "無匹配單字";
      document.getElementById('cardPhonetic').textContent = hasStarred ? "已收藏單字自動自每日單字卡排除" : "";
      document.getElementById('cardPos').textContent = "★";
      document.getElementById('cardCategoryBadge').textContent = "生字本已收錄";
      document.getElementById('cardIndexText').textContent = "0 / 0";
      document.getElementById('cardProgressFill').style.width = "100%";
      document.getElementById('cardZhDef').textContent = "這些單字已在您的「個人生字本」中收藏管理。若將其從生字本移除，單字會自動重新回到每日單字卡！";
      document.getElementById('cardEnDef').textContent = "";
      const collocWrap = document.getElementById('cardCollocations');
      if (collocWrap) collocWrap.innerHTML = "";
      document.getElementById('cardExample').textContent = "";
      document.getElementById('cardExampleZh').textContent = "";
      this.updateStats();
      return;
    }

    const item = this.filteredList[this.currentIndex];
    this.isFlipped = false;
    cardEl.classList.remove('is-flipped');

    // 正面
    document.getElementById('cardWord').textContent = item.word;
    document.getElementById('cardPhonetic').textContent = item.phonetic || '';
    document.getElementById('cardPos').textContent = item.pos || 'n.';
    document.getElementById('cardCategoryBadge').textContent = item.category || 'General';

    // 星號狀態
    const isStarred = AppState.isWordStarred(item.word);
    const starBtns = [document.getElementById('cardStarBtn'), document.getElementById('cardStarBackBtn')];
    starBtns.forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', isStarred);
        btn.textContent = isStarred ? '★' : '☆';
      }
    });

    // 背面
    document.getElementById('cardBackWord').textContent = item.word;
    document.getElementById('cardZhDef').textContent = item.definition;
    document.getElementById('cardEnDef').textContent = item.englishDef || '';
    
    // 搭配詞
    const collocWrap = document.getElementById('cardCollocations');
    collocWrap.innerHTML = '';
    (item.collocations || []).forEach(c => {
      const span = document.createElement('span');
      span.className = 'colloc-tag';
      span.textContent = c;
      collocWrap.appendChild(span);
    });

    // 例句
    document.getElementById('cardExample').textContent = item.example || '';
    document.getElementById('cardExampleZh').textContent = item.exampleTranslation || '';

    // 進度條
    const total = this.filteredList.length;
    const current = this.currentIndex + 1;
    document.getElementById('cardIndexText').textContent = `${current} / ${total}`;
    const percent = Math.round((current / total) * 100);
    document.getElementById('cardProgressFill').style.width = `${percent}%`;

    this.updateStats();
  },

  flipCard() {
    const cardEl = document.getElementById('mainFlashcard');
    if (!cardEl) return;
    this.isFlipped = !this.isFlipped;
    cardEl.classList.toggle('is-flipped', this.isFlipped);
  },

  nextCard() {
    if (this.currentIndex < this.filteredList.length - 1) {
      this.currentIndex++;
    } else {
      this.currentIndex = 0; // 循環回到第一個
      showToast("🎉 已完成本輪單字學習！重新複習。");
    }
    this.renderCard();
  },

  markMastered() {
    if (this.filteredList.length === 0) return;
    const item = this.filteredList[this.currentIndex];
    AppState.addMasteredId(item.id);
    showToast(`✅ 已將【${item.word}】標記為掌握！`);
    this.nextCard();
  },

  markReview() {
    if (this.filteredList.length === 0) return;
    const item = this.filteredList[this.currentIndex];
    AppState.removeMasteredId(item.id);
    showToast(`⏳ 【${item.word}】排入後續加強複習。`);
    this.nextCard();
  },

  toggleStarCurrent() {
    if (this.filteredList.length === 0) return;
    const item = this.filteredList[this.currentIndex];
    const isNowStarred = AppState.toggleStarWord(item);
    showToast(isNowStarred ? `⭐ 已將【${item.word}】加入生字本（已自動從每日單字卡排除）` : `已從生字本移除【${item.word}】`);
    // 當單字被加入生字本後，立即重新過濾每日單字卡，移出該字並跳至下一個
    this.applyFilter(this.currentFilter);
  },

  updateStats() {
    const masteredIds = AppState.getMasteredIds();
    const starredWords = AppState.getStarredWords();
    const starredSet = new Set(starredWords.map(w => w.word.toLowerCase()));
    const unstarredVocab = this.vocabList.filter(v => !starredSet.has(v.word.toLowerCase()));

    const masteredCount = unstarredVocab.filter(v => masteredIds.includes(v.id)).length;
    const unmasteredCount = unstarredVocab.length - masteredCount;

    const elM = document.getElementById('masteredCount');
    const elU = document.getElementById('unmasteredCount');
    const statEl = document.getElementById('statLearnedWords');

    if (elM) elM.textContent = masteredCount;
    if (elU) elU.textContent = unmasteredCount;
    if (statEl) statEl.textContent = masteredCount;
  },

  // 快捷測驗小遊戲
  startQuizMode() {
    document.getElementById('flashcardContainer').style.display = 'none';
    document.getElementById('vocabQuizContainer').style.display = 'block';
    this.quizCurrentIndex = 0;
    this.renderQuizQuestion();
  },

  stopQuizMode() {
    document.getElementById('vocabQuizContainer').style.display = 'none';
    document.getElementById('flashcardContainer').style.display = 'block';
  },

  renderQuizQuestion() {
    if (this.vocabList.length === 0) return;
    const currentItem = this.vocabList[this.quizCurrentIndex % this.vocabList.length];
    document.getElementById('vQuizWord').textContent = currentItem.word;
    document.getElementById('vQuizPhonetic').textContent = currentItem.phonetic || '';
    
    // 產生選項 (1 正確 + 3 隨機錯誤)
    const otherDefs = this.vocabList
      .filter(v => v.id !== currentItem.id)
      .map(v => v.definition);
    
    // 隨機選 3 個
    const shuffledOthers = otherDefs.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [currentItem.definition, ...shuffledOthers].sort(() => 0.5 - Math.random());

    const optionsContainer = document.getElementById('vQuizOptions');
    optionsContainer.innerHTML = '';
    const feedbackBox = document.getElementById('vQuizFeedback');
    feedbackBox.innerHTML = '';
    const nextBtn = document.getElementById('vQuizNextBtn');
    nextBtn.style.display = 'none';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt-btn';
      btn.textContent = opt;
      btn.onclick = () => {
        if (opt === currentItem.definition) {
          btn.classList.add('correct');
          feedbackBox.innerHTML = '<span style="color:var(--success); font-weight:700;">🎉 答對了！非常優秀！</span>';
          SpeechEngine.speak(currentItem.word);
        } else {
          btn.classList.add('incorrect');
          feedbackBox.innerHTML = `<span style="color:var(--danger); font-weight:700;">❌ 答錯囉！正確釋義是：${currentItem.definition}</span>`;
        }
        // 鎖定所有選項
        Array.from(optionsContainer.children).forEach(c => c.disabled = true);
        nextBtn.style.display = 'inline-flex';
      };
      optionsContainer.appendChild(btn);
    });
  },

  bindEvents() {
    const cardEl = document.getElementById('mainFlashcard');
    if (cardEl) {
      cardEl.addEventListener('click', (e) => {
        // 若點擊的是發音或星號按鈕則不觸發翻卡
        if (e.target.closest('button')) return;
        this.flipCard();
      });
    }

    document.getElementById('btnFlipCard')?.addEventListener('click', () => this.flipCard());
    document.getElementById('btnMarkMaster')?.addEventListener('click', () => this.markMastered());
    document.getElementById('btnMarkReview')?.addEventListener('click', () => this.markReview());

    document.getElementById('cardStarBtn')?.addEventListener('click', () => this.toggleStarCurrent());
    document.getElementById('cardStarBackBtn')?.addEventListener('click', () => this.toggleStarCurrent());

    document.getElementById('cardAudioBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = this.filteredList[this.currentIndex];
      if (item) SpeechEngine.speak(item.word);
    });

    document.getElementById('cardExampleAudioBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = this.filteredList[this.currentIndex];
      if (item && item.example) SpeechEngine.speak(item.example);
    });

    // 鍵盤監聽快捷鍵 [Space], [ArrowLeft], [ArrowRight]
    window.addEventListener('keydown', (e) => {
      // 只有在 vocab tab 為 active 且沒有 focus 輸入框時才觸發
      const activeTab = document.querySelector('.tab-pane.active');
      if (!activeTab || activeTab.id !== 'tab-vocab') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.flipCard();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.markReview();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.markMastered();
      }
    });

    // 篩選標籤
    document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        this.applyFilter(e.target.dataset.filter);
      });
    });

    // 模式切換按鈕
    document.getElementById('btnModeCard')?.addEventListener('click', () => {
      document.getElementById('btnModeCard').classList.add('active');
      document.getElementById('btnModeQuiz').classList.remove('active');
      this.stopQuizMode();
    });

    document.getElementById('btnModeQuiz')?.addEventListener('click', () => {
      document.getElementById('btnModeQuiz').classList.add('active');
      document.getElementById('btnModeCard').classList.remove('active');
      this.startQuizMode();
    });

    document.getElementById('vQuizNextBtn')?.addEventListener('click', () => {
      this.quizCurrentIndex++;
      this.renderQuizQuestion();
    });
  }
};

window.VocabModule = VocabModule;
