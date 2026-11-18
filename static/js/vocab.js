/**
 * VocabModule: 單字卡片翻轉學習、掌握度追蹤、每日完讀跳轉測驗與評分系統
 */
const VocabModule = {
  vocabList: [],
  filteredList: [],
  currentIndex: 0,
  isFlipped: false,
  currentFilter: 'all',
  viewedIndices: new Set(),
  finishCountdownTimer: null,
  finishCountdownSec: 3,

  // 測驗與評分系統狀態
  quizQuestions: [],
  quizCurrentIndex: 0,
  quizCorrectCount: 0,
  quizWrongCount: 0,
  quizResults: [],

  async init() {
    await this.loadData();
    this.bindEvents();
    this.renderCard();
    this.updateStats();
  },

  async loadData(forceRefresh = false) {
    try {
      const url = forceRefresh ? '/api/vocab?refresh=1' : '/api/vocab';
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        this.vocabList = json.data;
        if (json.date) {
          const statusEl = document.getElementById('vocabDailyStatusText');
          if (statusEl) {
            statusEl.textContent = `📅 ${json.date} 今日專屬池 (${json.data.length} 字・非重複)`;
          }
        }
      }
    } catch (e) {
      console.warn("Using offline vocab fallback", e);
    }

    this.applyFilter(this.currentFilter || 'all');
  },

  applyFilter(filterType) {
    this.currentFilter = filterType;
    this.viewedIndices.clear();
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

    // 紀錄當前單字已被閱畢
    this.viewedIndices.add(this.currentIndex);

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
    if (collocWrap) {
      collocWrap.innerHTML = '';
      (item.collocations || []).forEach(c => {
        const span = document.createElement('span');
        span.className = 'colloc-tag';
        span.textContent = c;
        collocWrap.appendChild(span);
      });
    }

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
      this.renderCard();
    } else {
      // 已翻完最後一張單字卡 -> 觸發完讀彈窗並進入評分測驗
      this.triggerFinishAndQuiz();
    }
  },

  /**
   * 當今日單字卡翻閱完畢，彈出過渡提示並開始倒數跳轉測驗
   */
  triggerFinishAndQuiz() {
    if (this.finishCountdownTimer) {
      clearInterval(this.finishCountdownTimer);
      this.finishCountdownTimer = null;
    }

    const modal = document.getElementById('vocabFinishModal');
    if (!modal) {
      this.startDailyGradedQuiz();
      return;
    }

    const finishCountEl = document.getElementById('vocabFinishCount');
    if (finishCountEl) {
      finishCountEl.textContent = this.filteredList.length || this.vocabList.length;
    }

    modal.style.display = 'flex';
    this.finishCountdownSec = 3;
    const countdownText = document.getElementById('finishCountdownText');
    const countdownFill = document.getElementById('countdownFill');

    if (countdownText) countdownText.textContent = this.finishCountdownSec;
    if (countdownFill) countdownFill.style.width = '100%';

    this.finishCountdownTimer = setInterval(() => {
      this.finishCountdownSec--;
      if (countdownText) countdownText.textContent = this.finishCountdownSec;
      if (countdownFill) {
        countdownFill.style.width = `${Math.max(0, (this.finishCountdownSec / 3) * 100)}%`;
      }

      if (this.finishCountdownSec <= 0) {
        clearInterval(this.finishCountdownTimer);
        this.finishCountdownTimer = null;
        this.startDailyGradedQuiz();
      }
    }, 1000);
  },

  /**
   * 關閉完讀彈窗（使用者選擇繼續翻卡）
   */
  closeFinishModal() {
    if (this.finishCountdownTimer) {
      clearInterval(this.finishCountdownTimer);
      this.finishCountdownTimer = null;
    }
    const modal = document.getElementById('vocabFinishModal');
    if (modal) modal.style.display = 'none';
    this.currentIndex = 0;
    this.renderCard();
    showToast("已重置為第 1 張單字卡，繼續自主翻卡複習。");
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

  // 快捷測驗切換（傳統按鈕觸發）
  startQuizMode() {
    this.startDailyGradedQuiz();
  },

  stopQuizMode() {
    if (this.finishCountdownTimer) {
      clearInterval(this.finishCountdownTimer);
      this.finishCountdownTimer = null;
    }
    const modal = document.getElementById('vocabFinishModal');
    if (modal) modal.style.display = 'none';

    document.getElementById('vocabQuizContainer').style.display = 'none';
    document.getElementById('flashcardContainer').style.display = 'block';

    const btnCard = document.getElementById('btnModeCard');
    const btnQuiz = document.getElementById('btnModeQuiz');
    if (btnCard) btnCard.classList.add('active');
    if (btnQuiz) btnQuiz.classList.remove('active');

    this.currentIndex = 0;
    this.renderCard();
  },

  /**
   * 啟動每日評分測驗
   */
  startDailyGradedQuiz(customList = null) {
    if (this.finishCountdownTimer) {
      clearInterval(this.finishCountdownTimer);
      this.finishCountdownTimer = null;
    }
    const modal = document.getElementById('vocabFinishModal');
    if (modal) modal.style.display = 'none';

    const sourceWords = (customList && customList.length > 0)
      ? customList
      : (this.filteredList.length > 0 ? this.filteredList : this.vocabList);

    if (!sourceWords || sourceWords.length === 0) {
      showToast("目前沒有可測驗的單字！");
      return;
    }

    // 洗牌出題
    this.quizQuestions = [...sourceWords].sort(() => 0.5 - Math.random());
    this.quizCurrentIndex = 0;
    this.quizCorrectCount = 0;
    this.quizWrongCount = 0;
    this.quizResults = [];

    // 切換 UI 模式
    document.getElementById('flashcardContainer').style.display = 'none';
    document.getElementById('vocabQuizContainer').style.display = 'block';
    document.getElementById('vQuizCardBox').style.display = 'block';
    document.getElementById('vocabScoreReportContainer').style.display = 'none';

    const btnCard = document.getElementById('btnModeCard');
    const btnQuiz = document.getElementById('btnModeQuiz');
    if (btnCard) btnCard.classList.remove('active');
    if (btnQuiz) btnQuiz.classList.add('active');

    this.renderGradedQuizQuestion();
  },

  /**
   * 渲染當前評分測驗題目 (四選一)
   */
  renderGradedQuizQuestion() {
    if (this.quizCurrentIndex >= this.quizQuestions.length) {
      this.finishQuizAndShowScoreReport();
      return;
    }

    const currentItem = this.quizQuestions[this.quizCurrentIndex];
    const total = this.quizQuestions.length;
    const currentNum = this.quizCurrentIndex + 1;

    // 更新題目序號與即時分數
    const currentNumEl = document.getElementById('vQuizCurrentNum');
    const totalNumEl = document.getElementById('vQuizTotalNum');
    const liveScoreEl = document.getElementById('vQuizLiveScore');
    const barFillEl = document.getElementById('vQuizProgressBarFill');

    if (currentNumEl) currentNumEl.textContent = currentNum;
    if (totalNumEl) totalNumEl.textContent = total;
    if (liveScoreEl) liveScoreEl.textContent = Math.round((this.quizCorrectCount / total) * 100);
    if (barFillEl) {
      barFillEl.style.width = `${Math.round(((currentNum - 1) / total) * 100)}%`;
    }

    // 題目單字與音標
    const wordEl = document.getElementById('vQuizWord');
    const phoneticEl = document.getElementById('vQuizPhonetic');
    if (wordEl) wordEl.textContent = currentItem.word;
    if (phoneticEl) phoneticEl.textContent = currentItem.phonetic || '';

    // 朗讀按鈕綁定
    const audioBtn = document.getElementById('vQuizAudioBtn');
    if (audioBtn) {
      audioBtn.onclick = () => SpeechEngine.speak(currentItem.word);
    }

    // 產生選項 (1 正確 + 3 隨機干擾項)
    const otherDefs = this.vocabList
      .filter(v => v.id !== currentItem.id && v.definition !== currentItem.definition)
      .map(v => v.definition);

    const fallbackDefs = [
      '實踐、執行', '不可或缺的、核心的', '顯著的、引人注目的', '克服、戰勝',
      '維持、保護', '精準的、精密的', '協調、配合', '促進、助長'
    ];
    while (otherDefs.length < 3) {
      const fb = fallbackDefs[otherDefs.length % fallbackDefs.length];
      if (!otherDefs.includes(fb) && fb !== currentItem.definition) otherDefs.push(fb);
    }

    const shuffledOthers = otherDefs.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [currentItem.definition, ...shuffledOthers].sort(() => 0.5 - Math.random());

    const optionsContainer = document.getElementById('vQuizOptions');
    optionsContainer.innerHTML = '';
    const feedbackBox = document.getElementById('vQuizFeedback');
    feedbackBox.innerHTML = '';
    const nextBtn = document.getElementById('vQuizNextBtn');
    nextBtn.style.display = 'none';

    if (currentNum === total) {
      nextBtn.innerHTML = '📊 查看今日評分成果 &rarr;';
    } else {
      nextBtn.innerHTML = '下一題 &rarr;';
    }

    let isAnswered = false;

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt-btn';
      btn.textContent = opt;

      btn.onclick = () => {
        if (isAnswered) return;
        isAnswered = true;

        const isCorrect = (opt === currentItem.definition);
        if (isCorrect) {
          this.quizCorrectCount++;
          btn.classList.add('correct');
          feedbackBox.innerHTML = '<span style="color:var(--success); font-weight:700;">🎉 答對了！理解非常透徹！</span>';
          SpeechEngine.speak(currentItem.word);
        } else {
          this.quizWrongCount++;
          btn.classList.add('incorrect');
          feedbackBox.innerHTML = `<span style="color:var(--danger); font-weight:700;">❌ 答錯囉！正確釋義是：【${currentItem.definition}】</span>`;
          // 高亮正確選項
          Array.from(optionsContainer.children).forEach(child => {
            if (child.textContent === currentItem.definition) {
              child.classList.add('correct');
            }
          });
        }

        // 紀錄作答明細
        this.quizResults.push({
          word: currentItem.word,
          phonetic: currentItem.phonetic || '',
          definition: currentItem.definition,
          example: currentItem.example || '',
          selected: opt,
          isCorrect: isCorrect
        });

        // 即時刷新得分顯示
        if (liveScoreEl) liveScoreEl.textContent = Math.round((this.quizCorrectCount / total) * 100);

        // 鎖定所有選項並顯示下一題按鈕
        Array.from(optionsContainer.children).forEach(c => c.disabled = true);
        nextBtn.style.display = 'inline-flex';
      };

      optionsContainer.appendChild(btn);
    });
  },

  /**
   * 測驗完成：計算綜合得分並彈出全方位評分成果報告
   */
  finishQuizAndShowScoreReport() {
    const total = this.quizQuestions.length;
    const score = Math.round((this.quizCorrectCount / total) * 100);

    // 評級制度判定
    let rankBadgeText = '';
    let trophy = '🏆';
    let comment = '';

    if (score === 100) {
      trophy = '🏆';
      rankBadgeText = '🏆 S+ 級・大師級吸收';
      comment = '太強了！今日單字全數完美掌握，詞彙記憶度與反射速度達到頂尖大師水準！';
    } else if (score >= 90) {
      trophy = '🥇';
      rankBadgeText = '🥇 S 級・卓越非凡';
      comment = '表現極度亮眼！幾乎完全吸收今日全部單字，繼續保持這個黃金學習節奏！';
    } else if (score >= 80) {
      trophy = '🌟';
      rankBadgeText = '🌟 A 級・優秀進階';
      comment = '掌握度非常紮實！少數錯題建議加入生字本隨時加強，迅速補足記憶盲點。';
    } else if (score >= 70) {
      trophy = '📈';
      rankBadgeText = '📈 B 級・良好穩健';
      comment = '具備良好基礎！建議將答錯的單字收錄至生字本，配合抗遺忘曲線加深記憶。';
    } else if (score >= 60) {
      trophy = '⚠️';
      rankBadgeText = '⚠️ C 級・需多複習';
      comment = '剛好通過及格門檻！單字記憶尚不夠牢固，建議將錯題收錄進生字本並重新測驗挑戰。';
    } else {
      trophy = '💡';
      rankBadgeText = '💡 D 級・再接再厲';
      comment = '今日單字掌握度偏低，別氣餒！一鍵將錯題加入生字本，重新翻卡複習後再次挑戰吧！';
    }

    // 寫入報告卡片各元素
    document.getElementById('scoreReportTrophy').textContent = trophy;
    document.getElementById('scoreNumber').textContent = score;
    document.getElementById('scoreRankBadge').textContent = rankBadgeText;
    document.getElementById('scoreComment').textContent = comment;

    document.getElementById('scoreTotalQuestions').textContent = `${total} 題`;
    document.getElementById('scoreCorrectCount').textContent = `${this.quizCorrectCount} 題`;
    document.getElementById('scoreWrongCount').textContent = `${this.quizWrongCount} 題`;
    document.getElementById('scoreAccuracyPercent').textContent = `${score}%`;

    // 錯題檢視或全對祝賀
    const wrongSection = document.getElementById('scoreWrongSection');
    const perfectSection = document.getElementById('scorePerfectSection');
    const wrongList = document.getElementById('scoreWrongList');
    const wrongCountEl = document.getElementById('scoreWrongListCount');
    const btnAddWrong = document.getElementById('btnAddAllWrongToWordbook');

    const wrongItems = this.quizResults.filter(r => !r.isCorrect);

    if (wrongItems.length > 0) {
      wrongSection.style.display = 'block';
      perfectSection.style.display = 'none';
      if (wrongCountEl) wrongCountEl.textContent = wrongItems.length;

      wrongList.innerHTML = '';
      wrongItems.forEach(w => {
        const itemBox = document.createElement('div');
        itemBox.className = 'score-wrong-card';
        itemBox.innerHTML = `
          <div class="score-wrong-card-top">
            <div>
              <span class="score-wrong-word">${w.word}</span>
              <span class="score-wrong-phonetic">${w.phonetic || ''}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline" onclick="SpeechEngine.speak('${w.word}')">🔊 朗讀</button>
          </div>
          <div class="score-wrong-meaning"><strong>正確釋義：</strong>${w.definition}</div>
          <div class="score-wrong-answered"><strong>你的答案：</strong>${w.selected || '未作答'}</div>
        `;
        wrongList.appendChild(itemBox);
      });

      if (btnAddWrong) {
        btnAddWrong.disabled = false;
        btnAddWrong.innerHTML = '⭐ 一鍵將錯題加入生字本';
      }
    } else {
      wrongSection.style.display = 'none';
      perfectSection.style.display = 'block';
    }

    // 切換至報告卡片
    document.getElementById('vQuizCardBox').style.display = 'none';
    document.getElementById('vocabScoreReportContainer').style.display = 'block';

    // 儲存至 AppState 今日評分紀錄
    const todayStr = new Date().toISOString().split('T')[0];
    const scoreData = {
      score: score,
      total: total,
      correct: this.quizCorrectCount,
      wrong: this.quizWrongCount,
      rank: rankBadgeText,
      date: todayStr
    };
    AppState.saveDailyVocabScore(todayStr, scoreData);

    // 刷新首頁儀表板單字評分標籤
    const badgeRow = document.getElementById('dailyVocabScorePillRow');
    const badgeEl = document.getElementById('dailyVocabScoreBadge');
    if (badgeRow && badgeEl) {
      badgeRow.style.display = 'flex';
      badgeEl.textContent = `🏆 今日測驗評分：${score}分 (${rankBadgeText.split('・')[0]})`;
    }

    showToast(`📊 今日單字評分出爐：${score} 分！成績已同步記錄！`);
  },

  /**
   * 一鍵將錯題全部加入生字本，並自動自每日單字卡排除
   */
  addAllWrongToWordbook() {
    const wrongItems = this.quizResults.filter(r => !r.isCorrect);
    if (!wrongItems || wrongItems.length === 0) {
      showToast("太棒了，今日測驗全對，無任何錯題！");
      return;
    }

    let addedCount = 0;
    wrongItems.forEach(w => {
      const fullItem = this.vocabList.find(v => v.word.toLowerCase() === w.word.toLowerCase()) || {
        word: w.word,
        phonetic: w.phonetic,
        definition: w.definition,
        example: w.example || '',
        exampleTranslation: ''
      };
      if (!AppState.isWordStarred(w.word)) {
        AppState.addCustomWordToWordbook(fullItem);
        addedCount++;
      }
    });

    const btn = document.getElementById('btnAddAllWrongToWordbook');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '✓ 已全數收錄至生字本 (已自每日卡排除)';
    }

    // 刷新生字本計數
    if (window.WordbookModule && typeof WordbookModule.renderList === 'function') {
      WordbookModule.renderList();
    }

    showToast(`⭐ 已將 ${wrongItems.length} 個錯題單字加入生字本！將自動自每日單字卡排除。`);
  },

  /**
   * 重新進行一次測驗
   */
  restartQuiz() {
    this.startDailyGradedQuiz();
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
      this.stopQuizMode();
    });

    document.getElementById('btnModeQuiz')?.addEventListener('click', () => {
      this.startQuizMode();
    });

    // 下一題按鈕
    document.getElementById('vQuizNextBtn')?.addEventListener('click', () => {
      this.quizCurrentIndex++;
      this.renderGradedQuizQuestion();
    });

    // 換一池新的單字
    document.getElementById('btnRefreshVocabPool')?.addEventListener('click', async () => {
      showToast('正在換一池全新未學習的單字...');
      await this.loadData(true);
      if (window.DailyPoolModule) window.DailyPoolModule.loadOverview();
      showToast('已換入全新單字池！');
    });
  }
};

window.VocabModule = VocabModule;
