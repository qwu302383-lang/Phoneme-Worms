/**
 * AppState: 本地存儲與全域狀態管理
 */
const AppState = {
  MASTERED_KEY: 'apex_mastered_words_v1',
  STARRED_KEY: 'apex_starred_words_v1',
  STATS_KEY: 'apex_learning_stats_v1',
  THEME_KEY: 'apex_theme_v1',
  ACCENT_KEY: 'apex_accent_v1',

  getMasteredIds() {
    try {
      return JSON.parse(localStorage.getItem(this.MASTERED_KEY) || '[]');
    } catch {
      return [];
    }
  },

  addMasteredId(id) {
    const list = this.getMasteredIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(this.MASTERED_KEY, JSON.stringify(list));
    }
  },

  removeMasteredId(id) {
    let list = this.getMasteredIds();
    list = list.filter(item => item !== id);
    localStorage.setItem(this.MASTERED_KEY, JSON.stringify(list));
  },

  getStarredWords() {
    try {
      return JSON.parse(localStorage.getItem(this.STARRED_KEY) || '[]');
    } catch {
      return [];
    }
  },

  isWordStarred(word) {
    const list = this.getStarredWords();
    return list.some(item => item.word.toLowerCase() === word.toLowerCase());
  },

  addCustomWordToWordbook(wordObj) {
    let list = this.getStarredWords();
    const existingIndex = list.findIndex(item => item.word.toLowerCase() === wordObj.word.toLowerCase());
    const newEntry = {
      word: wordObj.word.trim(),
      phonetic: (wordObj.phonetic || '').trim(),
      pos: (wordObj.pos || 'n.').trim(),
      definition: (wordObj.definition || '').trim(),
      example: (wordObj.example || '').trim(),
      exampleTranslation: (wordObj.exampleTranslation || '').trim(),
      dateAdded: new Date().toLocaleDateString()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...newEntry };
    } else {
      list.unshift(newEntry);
    }
    localStorage.setItem(this.STARRED_KEY, JSON.stringify(list));
    this.updateStarredBadge();
    return true;
  },

  toggleStarWord(wordObj) {
    let list = this.getStarredWords();
    const existingIndex = list.findIndex(item => item.word.toLowerCase() === wordObj.word.toLowerCase());
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
      localStorage.setItem(this.STARRED_KEY, JSON.stringify(list));
      this.updateStarredBadge();
      return false;
    } else {
      list.unshift({
        word: wordObj.word,
        phonetic: wordObj.phonetic || '',
        pos: wordObj.pos || '',
        definition: wordObj.definition || '',
        example: wordObj.example || '',
        dateAdded: new Date().toLocaleDateString()
      });
      localStorage.setItem(this.STARRED_KEY, JSON.stringify(list));
      this.updateStarredBadge();
      return true;
    }
  },

  clearAllStarred() {
    localStorage.removeItem(this.STARRED_KEY);
    this.updateStarredBadge();
  },

  getStats() {
    try {
      return JSON.parse(localStorage.getItem(this.STATS_KEY) || '{"oralCount": 0, "quizCount": 0, "streak": 1}');
    } catch {
      return { oralCount: 0, quizCount: 0, streak: 1 };
    }
  },

  incrementOralSession() {
    const stats = this.getStats();
    stats.oralCount = (stats.oralCount || 0) + 1;
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    document.getElementById('statOralSessions').textContent = stats.oralCount;
  },

  incrementQuizFinished() {
    const stats = this.getStats();
    stats.quizCount = (stats.quizCount || 0) + 1;
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    document.getElementById('statQuizFinished').textContent = stats.quizCount;
  },

  updateStarredBadge() {
    const badge = document.getElementById('starredCountBadge');
    if (badge) {
      badge.textContent = this.getStarredWords().length;
    }
  }
};

/**
 * 全域通知 Toast
 */
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/**
 * 頁面分頁切換
 */
function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // 特殊分頁啟動回呼
  if (tabId === 'vocab' && window.VocabModule) { VocabModule.applyFilter(VocabModule.currentFilter); }
  if (tabId === 'custom-quiz' && window.CustomQuizModule) { CustomQuizModule.renderWordGrid(); }
  if (tabId === 'pk-battle' && window.PKBattleModule) { PKBattleModule.renderDeckSelector(); }
  if (tabId === 'wordbook') {
    renderWordbook();
  }

    // 在手機端切換分頁後自動收合側邊欄
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 生字本 (Wordbook) 渲染
 */
function renderWordbook(filterText = '') {
  const grid = document.getElementById('wordbookGrid');
  const emptyState = document.getElementById('wbEmptyState');
  if (!grid) return;

  const words = AppState.getStarredWords();
  const filtered = words.filter(w => 
    w.word.toLowerCase().includes(filterText.toLowerCase()) || 
    (w.definition && w.definition.includes(filterText))
  );

  grid.innerHTML = '';
  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'wb-card';
    card.innerHTML = `
      <div>
        <div class="wb-card-header">
          <span class="wb-word">${item.word}</span>
          <button class="card-audio-btn-sm" title="朗讀">🔊</button>
        </div>
        ${item.phonetic ? `<p class="wb-phonetic">${item.phonetic}</p>` : ''}
        <p class="wb-def">${item.pos ? `<strong>[${item.pos}]</strong> ` : ''}${item.definition}</p>
        ${item.example ? `<p style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">"${item.example}"</p>` : ''}
      </div>
      <div class="wb-footer">
        <span style="font-size:0.75rem; color:var(--text-light);">收藏於: ${item.dateAdded || '近期'}</span>
        <button class="btn btn-sm btn-danger-outline btn-remove-wb" title="從生字本刪除">移除</button>
      </div>
    `;

    card.querySelector('.card-audio-btn-sm').onclick = () => SpeechEngine.speak(item.word);
    card.querySelector('.btn-remove-wb').onclick = () => {
      AppState.toggleStarWord(item);
      renderWordbook(document.getElementById('wbSearchInput')?.value || '');
      if (window.VocabModule) VocabModule.applyFilter(VocabModule.currentFilter);
      showToast(`已從生字本移除【${item.word}】（已自動恢復至每日單字卡）`);
    };

    grid.appendChild(card);
  });
}

/**
 * WordbookModule: 個人生字本手動新增與智慧查詞管理
 */
const WordbookModule = {
  currentAddMode: 'single',

  openAddModal() {
    const modal = document.getElementById('addWordbookModal');
    if (!modal) return;
    this.switchAddMode('single');

    const inputWord = document.getElementById('wbInputWord');
    const inputDef = document.getElementById('wbInputDef');
    const inputPhonetic = document.getElementById('wbInputPhonetic');
    const inputExample = document.getElementById('wbInputExample');
    const inputExampleZh = document.getElementById('wbInputExampleZh');
    const batchText = document.getElementById('wbBatchText');

    if (inputWord) inputWord.value = '';
    if (inputDef) inputDef.value = '';
    if (inputPhonetic) inputPhonetic.value = '';
    if (inputExample) inputExample.value = '';
    if (inputExampleZh) inputExampleZh.value = '';
    if (batchText) batchText.value = '';

    modal.style.display = 'flex';
    setTimeout(() => inputWord?.focus(), 50);
  },

  closeAddModal() {
    const modal = document.getElementById('addWordbookModal');
    if (modal) modal.style.display = 'none';
  },

  switchAddMode(mode) {
    this.currentAddMode = mode;
    const tabSingle = document.getElementById('wbTabSingle');
    const tabBatch = document.getElementById('wbTabBatch');
    const areaSingle = document.getElementById('wbSingleAddArea');
    const areaBatch = document.getElementById('wbBatchAddArea');

    if (mode === 'single') {
      tabSingle?.classList.add('active');
      tabBatch?.classList.remove('active');
      if (areaSingle) areaSingle.style.display = 'block';
      if (areaBatch) areaBatch.style.display = 'none';
      document.getElementById('wbInputWord')?.focus();
    } else {
      tabSingle?.classList.remove('active');
      tabBatch?.classList.add('active');
      if (areaSingle) areaSingle.style.display = 'none';
      if (areaBatch) areaBatch.style.display = 'block';
      document.getElementById('wbBatchText')?.focus();
    }
  },

  async autoLookupWord() {
    const wordInput = document.getElementById('wbInputWord');
    const word = wordInput ? wordInput.value.trim() : '';
    if (!word) {
      alert("請先輸入要查詢的英文單字！");
      wordInput?.focus();
      return;
    }

    const btn = document.getElementById('btnWbLookup');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ 查詢中...';
    }

    try {
      const res = await fetch('/api/dict/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word })
      });
      const data = await res.json();
      if (data.success && data.found) {
        const inputDef = document.getElementById('wbInputDef');
        const inputPhonetic = document.getElementById('wbInputPhonetic');
        const inputPos = document.getElementById('wbInputPos');
        const inputExample = document.getElementById('wbInputExample');
        const inputExampleZh = document.getElementById('wbInputExampleZh');

        if (inputDef && data.definition) inputDef.value = data.definition;
        if (inputPhonetic && data.phonetic) inputPhonetic.value = data.phonetic;
        if (inputPos && data.pos) inputPos.value = data.pos;
        if (inputExample && data.example) inputExample.value = data.example;
        if (inputExampleZh && data.exampleTranslation) inputExampleZh.value = data.exampleTranslation;

        showToast(`🔍 已自動帶入【${word}】的釋義與例句！`);
      } else {
        showToast(`💡 詞庫未收錄此字，您可以直接在下方手動輸入中文釋義！`);
      }
    } catch (e) {
      showToast(`⚠️ 查詞時發生錯誤，請直接手動輸入`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔍 智慧查單字';
      }
    }
  },

  saveWord() {
    if (this.currentAddMode === 'single') {
      const word = document.getElementById('wbInputWord')?.value.trim();
      const def = document.getElementById('wbInputDef')?.value.trim();
      const pos = document.getElementById('wbInputPos')?.value;
      const phonetic = document.getElementById('wbInputPhonetic')?.value.trim();
      const example = document.getElementById('wbInputExample')?.value.trim();
      const exampleZh = document.getElementById('wbInputExampleZh')?.value.trim();

      if (!word) {
        alert("請輸入英文單字！");
        document.getElementById('wbInputWord')?.focus();
        return;
      }
      if (!def) {
        alert("請輸入中文解釋！");
        document.getElementById('wbInputDef')?.focus();
        return;
      }

      AppState.addCustomWordToWordbook({
        word: word,
        definition: def,
        pos: pos,
        phonetic: phonetic,
        example: example,
        exampleTranslation: exampleZh
      });

      this.closeAddModal();
      renderWordbook();
      if (window.VocabModule) VocabModule.applyFilter(VocabModule.currentFilter);
      showToast(`⭐ 成功新增【${word}】至生字本！（已自動從每日單字卡排除）`);

    } else {
      const text = document.getElementById('wbBatchText')?.value.trim();
      if (!text) {
        alert("請輸入至少一筆單字與解釋！");
        document.getElementById('wbBatchText')?.focus();
        return;
      }

      const lines = text.split('\n');
      let count = 0;

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const match = trimmed.split(/[\-\,\:\t]+/);
        if (match.length >= 2) {
          AppState.addCustomWordToWordbook({
            word: match[0].trim(),
            definition: match.slice(1).join(' ').trim(),
            pos: 'n.'
          });
          count++;
        } else {
          AppState.addCustomWordToWordbook({
            word: trimmed,
            definition: '自訂詞彙',
            pos: 'n.'
          });
          count++;
        }
      });

      if (count === 0) {
        alert("未解析出任何有效單字！格式如：apple - 蘋果");
        return;
      }

      this.closeAddModal();
      renderWordbook();
      if (window.VocabModule) VocabModule.applyFilter(VocabModule.currentFilter);
      showToast(`⭐ 成功批次新增 ${count} 筆單字至個人生字本！（已自動從每日單字卡排除）`);
    }
  }
};

window.WordbookModule = WordbookModule;

// 主程式初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 初始化語音模組
  SpeechEngine.init();

  // 2. 導航分頁點擊綁定
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

    // 手機端側邊欄抽屜開關
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const appSidebar = document.getElementById('appSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const mobileThemeToggle = document.getElementById('mobileThemeToggle');

  btnToggleSidebar?.addEventListener('click', () => {
    appSidebar?.classList.toggle('open');
    sidebarOverlay?.classList.toggle('active');
  });

  sidebarOverlay?.addEventListener('click', () => {
    appSidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');
  });

  mobileThemeToggle?.addEventListener('click', () => {
    document.getElementById('themeToggleBtn')?.click();
    mobileThemeToggle.textContent = document.body.classList.contains('theme-dark') ? '☀️' : '🌙';
  });

  // 3. 深色/淺色主題管理
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem(AppState.THEME_KEY) || 'theme-light';
  document.body.className = savedTheme;
  themeToggleBtn.querySelector('.theme-icon').textContent = savedTheme === 'theme-dark' ? '☀️' : '🌙';

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'theme-light' : 'theme-dark';
    document.body.className = newTheme;
    localStorage.setItem(AppState.THEME_KEY, newTheme);
    themeToggleBtn.querySelector('.theme-icon').textContent = newTheme === 'theme-dark' ? '☀️' : '🌙';
  });

  // 4. 發音口音選擇
  const accentSelect = document.getElementById('accentSelect');
  const savedAccent = localStorage.getItem(AppState.ACCENT_KEY) || 'en-US';
  if (accentSelect) {
    accentSelect.value = savedAccent;
    SpeechEngine.setAccent(savedAccent);
    accentSelect.addEventListener('change', (e) => {
      SpeechEngine.setAccent(e.target.value);
      localStorage.setItem(AppState.ACCENT_KEY, e.target.value);
      showToast(`發音口音已切換為：${e.target.selectedOptions[0].text}`);
    });
  }

  // 5. 每日金句播放
  document.getElementById('playQuoteBtn')?.addEventListener('click', () => {
    const quote = document.getElementById('dailyQuoteEn')?.textContent;
    if (quote) SpeechEngine.speak(quote);
  });

  // 6. 載入各功能模組
  await VocabModule.init();
  await AITutorModule.init();
  await ReadingModule.init();
  await QuizModule.init();
  if (window.CustomQuizModule) await CustomQuizModule.init();
  if (window.PKBattleModule) await PKBattleModule.init();

  // 7. 更新統計與生字徽章
  const stats = AppState.getStats();
  document.getElementById('statOralSessions').textContent = stats.oralCount || 0;
  document.getElementById('statQuizFinished').textContent = stats.quizCount || 0;
  AppState.updateStarredBadge();

  // 8. 生字本搜尋與管理事件
  const wbSearch = document.getElementById('wbSearchInput');
  wbSearch?.addEventListener('input', (e) => renderWordbook(e.target.value));

  document.getElementById('btnClearWordbook')?.addEventListener('click', () => {
    if (confirm("確定要清空生字本中的所有單字嗎？")) {
      AppState.clearAllStarred();
      renderWordbook();
      if (window.VocabModule) VocabModule.applyFilter(VocabModule.currentFilter);
      showToast("生字本已清空！所有單字已自動恢復至每日單字卡。");
    }
  });

  document.getElementById('btnExportWordbook')?.addEventListener('click', () => {
    const words = AppState.getStarredWords();
    if (words.length === 0) {
      alert("生字本目前沒有任何單字可匯出！");
      return;
    }
    const exportText = words.map(w => `${w.word}\t[${w.pos || ''}]\t${w.definition}\t"${w.example || ''}"`).join('\n');
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PhonemeWorms_生字本_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 生字本已成功匯出為純文字檔！");
  });

  document.getElementById('btnDrillStarred')?.addEventListener('click', () => {
    const words = AppState.getStarredWords();
    if (words.length === 0) {
      alert("生字本目前沒有單字，請先收藏生字！");
      return;
    }
    switchTab('vocab');
    VocabModule.startQuizMode();
    showToast("🎯 已切換至單字抽考模式！");
  });
});
