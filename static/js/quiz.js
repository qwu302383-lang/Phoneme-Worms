/**
 * QuizModule: 文法與克漏字模擬測驗、即時批改與考點深入解析
 */
const QuizModule = {
  quizzes: [],
  filteredQuizzes: [],
  currentFilter: 'all',
  totalAnswered: 0,
  totalCorrect: 0,

  async init() {
    await this.loadQuizzes();
    this.bindEvents();
  },

  async loadQuizzes() {
    try {
      const res = await fetch('/api/quizzes');
      const json = await res.json();
      if (json.success && json.data) {
        this.quizzes = json.data;
      }
    } catch (e) {
      console.warn("Using offline quizzes fallback", e);
    }

    this.applyFilter('all');
  },

  applyFilter(type) {
    this.currentFilter = type;
    if (type === 'all') {
      this.filteredQuizzes = [...this.quizzes];
    } else {
      this.filteredQuizzes = this.quizzes.filter(q => q.type === type);
    }
    this.renderQuizzes();
  },

  renderQuizzes() {
    const container = document.getElementById('quizContainer');
    if (!container) return;
    container.innerHTML = '';

    if (this.filteredQuizzes.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--text-muted);">暫無此題型的題目。</p>';
      return;
    }

    this.filteredQuizzes.forEach((item, idx) => {
      if (item.type === 'grammar') {
        container.appendChild(this.createGrammarCard(item, idx));
      } else if (item.type === 'cloze') {
        container.appendChild(this.createClozeCard(item, idx));
      }
    });

    this.updateScoreStats();
  },

  createGrammarCard(q, idx) {
    const card = document.createElement('div');
    card.className = 'quiz-item-card';

    const optionsHtml = q.options.map((opt, optIdx) => `
      <button class="quiz-choice-btn" data-optidx="${optIdx}">
        <span class="choice-label">${String.fromCharCode(65 + optIdx)}</span>
        <span>${opt}</span>
      </button>
    `).join('');

    card.innerHTML = `
      <span class="quiz-tag-badge">${q.category}</span>
      <p class="quiz-stem">${idx + 1}. ${q.question}</p>
      <div class="quiz-options-grid">${optionsHtml}</div>
      <div class="quiz-explanation-box" style="display:none;"></div>
    `;

    const expBox = card.querySelector('.quiz-explanation-box');
    card.querySelectorAll('.quiz-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedIdx = parseInt(btn.dataset.optidx, 10);
        this.totalAnswered++;

        if (selectedIdx === q.answer) {
          btn.classList.add('selected-correct');
          this.totalCorrect++;
          expBox.innerHTML = `<strong>✅ 答對了！恭喜！</strong><br>${q.explanation}`;
        } else {
          btn.classList.add('selected-incorrect');
          const correctBtn = card.querySelector(`[data-optidx="${q.answer}"]`);
          if (correctBtn) correctBtn.classList.add('selected-correct');
          expBox.innerHTML = `<strong>❌ 答錯了！正確答案為 (${String.fromCharCode(65 + q.answer)})</strong><br>${q.explanation}`;
        }

        expBox.style.display = 'block';
        card.querySelectorAll('.quiz-choice-btn').forEach(b => b.disabled = true);
        this.updateScoreStats();
        AppState.incrementQuizFinished();
      });
    });

    return card;
  },

  createClozeCard(q, idx) {
    const card = document.createElement('div');
    card.className = 'quiz-item-card';

    let subQuestionsHtml = '';
    (q.questions || []).forEach((subQ, sIdx) => {
      const optionsHtml = subQ.options.map((opt, optIdx) => `
        <button class="quiz-choice-btn" data-subidx="${sIdx}" data-optidx="${optIdx}">
          <span class="choice-label">${String.fromCharCode(65 + optIdx)}</span>
          <span>${opt}</span>
        </button>
      `).join('');

      subQuestionsHtml += `
        <div class="sub-q-block" style="margin-top: 1.5rem; border-top: 1px dashed var(--border-color); padding-top: 1rem;">
          <p style="font-weight: 700; margin-bottom: 0.75rem;">${subQ.label}: ${subQ.question}</p>
          <div class="quiz-options-grid">${optionsHtml}</div>
          <div class="quiz-explanation-box sub-exp-${sIdx}" style="display:none;"></div>
        </div>
      `;
    });

    card.innerHTML = `
      <span class="quiz-tag-badge">${q.category}</span>
      <div class="quiz-passage-box">${q.passage}</div>
      <div class="sub-questions-wrap">${subQuestionsHtml}</div>
    `;

    // 綁定各子題
    (q.questions || []).forEach((subQ, sIdx) => {
      const expBox = card.querySelector(`.sub-exp-${sIdx}`);
      const buttons = card.querySelectorAll(`[data-subidx="${sIdx}"]`);

      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedIdx = parseInt(btn.dataset.optidx, 10);
          this.totalAnswered++;

          if (selectedIdx === subQ.answer) {
            btn.classList.add('selected-correct');
            this.totalCorrect++;
            expBox.innerHTML = `<strong>✅ 答對了！</strong><br>${subQ.explanation}`;
          } else {
            btn.classList.add('selected-incorrect');
            const correctBtn = card.querySelector(`[data-subidx="${sIdx}"][data-optidx="${subQ.answer}"]`);
            if (correctBtn) correctBtn.classList.add('selected-correct');
            expBox.innerHTML = `<strong>❌ 答錯了！正確為 (${String.fromCharCode(65 + subQ.answer)})</strong><br>${subQ.explanation}`;
          }

          expBox.style.display = 'block';
          buttons.forEach(b => b.disabled = true);
          this.updateScoreStats();
          AppState.incrementQuizFinished();
        });
      });
    });

    return card;
  },

  updateScoreStats() {
    const accEl = document.getElementById('quizAccuracy');
    const scoreTextEl = document.getElementById('quizScoreText');
    const statQuizFinished = document.getElementById('statQuizFinished');

    const accuracy = this.totalAnswered > 0 ? Math.round((this.totalCorrect / this.totalAnswered) * 100) : 0;
    if (accEl) accEl.textContent = `${accuracy}%`;
    if (scoreTextEl) scoreTextEl.textContent = `${this.totalCorrect}/${this.totalAnswered}`;
    if (statQuizFinished) statQuizFinished.textContent = this.totalAnswered;
  },

  bindEvents() {
    document.querySelectorAll('.filter-chip[data-qfilter]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip[data-qfilter]').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        this.applyFilter(e.target.dataset.qfilter);
      });
    });
  }
};

window.QuizModule = QuizModule;
