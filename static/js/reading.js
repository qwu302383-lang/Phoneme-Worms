/**
 * ReadingModule: 文章閱讀、任意單字點詞浮動字典、加入生字本與理解測驗
 */
const ReadingModule = {
  articles: [],
  currentArticle: null,
  activePopupWord: null,

  async init() {
    await this.loadArticles();
    this.bindEvents();
  },

  async loadArticles() {
    try {
      const res = await fetch('/api/articles');
      const json = await res.json();
      if (json.success && json.data) {
        this.articles = json.data;
      }
    } catch (e) {
      console.warn("Using offline articles fallback", e);
    }

    this.renderArticleList();
    if (this.articles.length > 0) {
      this.selectArticle(this.articles[0].id);
    }
  },

  renderArticleList() {
    const selectorRow = document.getElementById('articleSelector');
    if (!selectorRow) return;
    selectorRow.innerHTML = '';

    this.articles.forEach(art => {
      const card = document.createElement('div');
      card.className = 'article-card-thumb';
      card.id = `art-thumb-${art.id}`;
      card.innerHTML = `
        <span class="category-pill">${art.category}</span>
        <h4 style="margin: 0.5rem 0; font-size: 1rem; font-weight: 700;">${art.title}</h4>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${art.difficulty} • ${art.readTime}</span>
      `;
      card.onclick = () => this.selectArticle(art.id);
      selectorRow.appendChild(card);
    });
  },

  selectArticle(artId) {
    const art = this.articles.find(a => a.id === artId);
    if (!art) return;
    this.currentArticle = art;

    document.querySelectorAll('.article-card-thumb').forEach(c => c.classList.remove('active'));
    document.getElementById(`art-thumb-${artId}`)?.classList.add('active');

    // 填充標頭資訊
    document.getElementById('artCategory').textContent = art.category;
    document.getElementById('artTitle').textContent = art.title;
    document.getElementById('artDifficulty').textContent = `難度: ${art.difficulty}`;
    document.getElementById('artReadTime').textContent = `預估閱讀: ${art.readTime}`;
    document.getElementById('artSummary').textContent = art.summary;
    document.getElementById('artTranslationText').textContent = art.translation;

    // 將英文文章內容包裝為每個單詞均可點擊的元素
    this.renderClickableContent(art.content);

    // 渲染文末閱讀測驗
    this.renderComprehensionQuiz(art.questions || []);

    // 關閉可能已開啟的字典視窗
    this.hidePopup();
  },

  renderClickableContent(text) {
    const box = document.getElementById('artContentEnglish');
    if (!box) return;

    // 依照空格切分，保留標點符號
    const words = text.split(/\s+/);
    const htmlParts = words.map(rawToken => {
      // 提取乾淨的單字與標點
      const match = rawToken.match(/^([a-zA-Z0-9'-]+)(.*?)$/);
      if (match) {
        const cleanWord = match[1];
        const punctuation = match[2];
        return `<span class="clickable-word" data-word="${cleanWord}">${cleanWord}</span>${punctuation}`;
      } else {
        return rawToken;
      }
    });

    box.innerHTML = htmlParts.join(' ');

    // 綁定所有單字的點選事件
    box.querySelectorAll('.clickable-word').forEach(span => {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = span.dataset.word;
        this.lookupAndShowPopup(word, span);
      });
    });
  },

  async lookupAndShowPopup(word, targetEl) {
    const popup = document.getElementById('dictPopup');
    if (!popup) return;

    this.activePopupWord = word;
    document.getElementById('popWord').textContent = word;
    document.getElementById('popPhonetic').textContent = '';
    document.getElementById('popDef').textContent = '查詢釋義中...';

    // 定位在點擊元素下方
    const rect = targetEl.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    popup.style.display = 'block';
    popup.style.top = `${rect.bottom + scrollY + 8}px`;
    popup.style.left = `${Math.min(rect.left + scrollX, window.innerWidth - 300)}px`;

    // 查詢釋義
    try {
      const res = await fetch('/api/dict/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word })
      });
      const data = await res.json();
      if (data.success && data.found) {
        document.getElementById('popPhonetic').textContent = data.phonetic || '';
        document.getElementById('popDef').textContent = `${data.pos ? '[' + data.pos + '] ' : ''}${data.definition}`;
      } else {
        document.getElementById('popDef').textContent = '（點擊發音聆聽，亦可直接收藏至生字本）';
      }
    } catch (e) {
      document.getElementById('popDef').textContent = '快速查詢';
    }

    // 發音按鈕
    document.getElementById('popAudioBtn').onclick = () => {
      SpeechEngine.speak(word);
    };

    // 收藏生字本按鈕狀態
    const isStarred = AppState.isWordStarred(word);
    const starBtn = document.getElementById('popAddStarBtn');
    starBtn.textContent = isStarred ? '⭐ 已在生字本' : '⭐ 加入生字本';
    starBtn.onclick = () => {
      AppState.toggleStarWord({
        word: word,
        definition: document.getElementById('popDef').textContent,
        category: '閱讀提取'
      });
      const newStatus = AppState.isWordStarred(word);
      starBtn.textContent = newStatus ? '⭐ 已在生字本' : '⭐ 加入生字本';
      showToast(newStatus ? `⭐ 已將【${word}】加入生字本` : `已移除【${word}】`);
    };
  },

  hidePopup() {
    const popup = document.getElementById('dictPopup');
    if (popup) popup.style.display = 'none';
    this.activePopupWord = null;
  },

  renderComprehensionQuiz(questions) {
    const container = document.getElementById('artQuestionsList');
    if (!container) return;
    container.innerHTML = '';

    if (questions.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);">本篇文章暫無額外閱讀測驗題目。</p>';
      return;
    }

    questions.forEach((q, qIdx) => {
      const card = document.createElement('div');
      card.className = 'quiz-item-card';
      card.style.marginBottom = '1.5rem';

      const optionsHtml = q.options.map((opt, optIdx) => `
        <button class="quiz-choice-btn" data-qidx="${qIdx}" data-optidx="${optIdx}">
          <span class="choice-label">${String.fromCharCode(65 + optIdx)}</span>
          <span>${opt}</span>
        </button>
      `).join('');

      card.innerHTML = `
        <p class="quiz-stem">Q${qIdx + 1}. ${q.question}</p>
        <div class="quiz-options-grid">${optionsHtml}</div>
        <div class="quiz-explanation-box" id="art-exp-${qIdx}" style="display:none;"></div>
      `;

      card.querySelectorAll('.quiz-choice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const selectedIdx = parseInt(btn.dataset.optidx, 10);
          const expBox = card.querySelector(`#art-exp-${qIdx}`);
          
          if (selectedIdx === q.answer) {
            btn.classList.add('selected-correct');
            expBox.innerHTML = `<strong>✅ 答對了！</strong><br>${q.explanation}`;
          } else {
            btn.classList.add('selected-incorrect');
            const correctBtn = card.querySelector(`[data-optidx="${q.answer}"]`);
            if (correctBtn) correctBtn.classList.add('selected-correct');
            expBox.innerHTML = `<strong>❌ 答錯了！正確選項為 (${String.fromCharCode(65 + q.answer)})</strong><br>${q.explanation}`;
          }

          expBox.style.display = 'block';
          // 鎖定所有選項
          card.querySelectorAll('.quiz-choice-btn').forEach(b => b.disabled = true);
          AppState.incrementQuizFinished();
        });
      });

      container.appendChild(card);
    });
  },

  bindEvents() {
    // 點擊文章外部關閉字典視窗
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('dictPopup');
      if (popup && popup.style.display === 'block') {
        if (!popup.contains(e.target) && !e.target.classList.contains('clickable-word')) {
          this.hidePopup();
        }
      }
    });

    document.getElementById('popCloseBtn')?.addEventListener('click', () => {
      this.hidePopup();
    });

    // 雙語中譯切換開關
    document.getElementById('toggleBilingual')?.addEventListener('change', (e) => {
      const transBox = document.getElementById('artContentChinese');
      if (transBox) {
        transBox.style.display = e.target.checked ? 'block' : 'none';
      }
    });
  }
};

window.ReadingModule = ReadingModule;
