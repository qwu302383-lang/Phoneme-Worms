/**
 * AuthModule: 帳號登入 / 註冊與雲端同步
 * 登入後，生字本與片語本會自動同步到伺服器，換裝置也不會消失。
 */
function authEscapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const AuthModule = {
  currentUser: null,
  _pushTimer: null,
  _mode: 'login',

  async init() {
    document.getElementById('authForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.handleAuthRedirect();
    await this.refreshSession();
  },

  /** 處理從 Google 登入導回時的網址參數（?login=google 或 ?auth_error=...） */
  handleAuthRedirect() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch (e) {
      return;
    }
    const login = url.searchParams.get('login');
    const errorCode = url.searchParams.get('auth_error');
    if (!login && !errorCode) return;

    url.searchParams.delete('login');
    url.searchParams.delete('auth_error');
    const clean = url.pathname + (url.search ? url.search : '') + url.hash;
    window.history.replaceState({}, '', clean);

    if (login === 'google') {
      showToast('✅ 已使用 Google 帳號登入，收藏已同步到雲端！', 3600);
      return;
    }

    const messages = {
      google_not_configured: '⚠️ Google 登入尚未啟用（管理員需設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）',
      google_cancelled: '已取消 Google 登入',
      google_state: '登入驗證逾時，請再試一次',
      google_token: 'Google 驗證失敗，請再試一次',
      google_audience: 'Google 驗證失敗（金鑰不符）',
      google_email: '此 Google 帳號的信箱尚未驗證',
      google_no_code: 'Google 未回傳授權碼，請再試一次'
    };
    showToast(messages[errorCode] || 'Google 登入失敗，請再試一次', 4200);
  },

  /* ---------- 彈窗控制 ---------- */

  openModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    this.setMode(mode);
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('authUsername')?.focus(), 60);
  },

  closeModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
  },

  setMode(mode) {
    this._mode = mode === 'register' ? 'register' : 'login';
    const isRegister = this._mode === 'register';

    document.getElementById('authTabLogin')?.classList.toggle('active', !isRegister);
    document.getElementById('authTabRegister')?.classList.toggle('active', isRegister);

    const title = document.getElementById('authModalTitle');
    if (title) title.textContent = isRegister ? '✨ 註冊新帳號' : '👤 登入帳號';

    const submitBtn = document.getElementById('authSubmitBtn');
    if (submitBtn) submitBtn.textContent = isRegister ? '註冊並登入' : '登入';

    const passwordEl = document.getElementById('authPassword');
    if (passwordEl) {
      passwordEl.autocomplete = isRegister ? 'new-password' : 'current-password';
    }

    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.style.display = 'none';
  },

  mobileAccountClick() {
    if (this.currentUser) {
      this.logout();
    } else {
      this.openModal('login');
    }
  },

  /* ---------- 登入 / 註冊 ---------- */

  async submit() {
    const username = (document.getElementById('authUsername')?.value || '').trim();
    const password = document.getElementById('authPassword')?.value || '';
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!username || !password) {
      this.showError('請輸入帳號與密碼');
      return;
    }
    if (this._mode === 'register' && password.length < 4) {
      this.showError('密碼至少需要 4 個字元');
      return;
    }

    const endpoint = this._mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = this._mode === 'register' ? '註冊中…' : '登入中…';
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!data || !data.success) {
        this.showError((data && data.message) || `操作失敗（HTTP ${res.status}）`);
        return;
      }

      this.currentUser = data.username;
      await this.applyServerState(data.state || {});
      this.renderUserUI();
      this.refreshLocalViews();
      this.closeModal();
      showToast(`👤 已登入【${data.username}】，收藏已同步到雲端！`, 3200);
    } catch (e) {
      this.showError('連線失敗，請檢查網路後再試一次');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = this._mode === 'register' ? '註冊並登入' : '登入';
      }
    }
  },

  async logout() {
    if (!confirm('確定要登出嗎？\n\n登出後這台裝置的收藏仍會保留，但將停止雲端同步。')) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* 忽略網路錯誤 */ }
    this.currentUser = null;
    this.renderUserUI();
    this.refreshLocalViews();
    showToast('👋 已登出帳號');
  },

  showError(message) {
    const errorEl = document.getElementById('authError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  },

  /* ---------- 雲端同步 ---------- */

  async refreshSession() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let data = null;
      try {
        const res = await fetch('/api/auth/me', { signal: controller.signal });
        data = await res.json();
      } finally {
        clearTimeout(timer);
      }
      if (data && data.loggedIn) {
        this.currentUser = data.username;
        await this.applyServerState(data.state || {});
      }
    } catch (e) {
      // 未登入、逾時或離線時維持訪客模式，不影響其他功能
      this.currentUser = null;
    }
    this.renderUserUI();
  },

  /** 以單字為鍵合併本機與雲端資料，任何一邊的收藏都不會消失 */
  mergeEntries(localList, serverList) {
    const map = new Map();
    const add = (item) => {
      if (!item || !item.word) return;
      const key = String(item.word).trim().toLowerCase();
      if (!key) return;
      const prev = map.get(key) || {};
      const merged = { ...prev, ...item };
      ['phonetic', 'pos', 'definition', 'example', 'exampleTranslation', 'dateAdded', 'kind'].forEach((field) => {
        if (!merged[field] && prev[field]) merged[field] = prev[field];
      });
      map.set(key, merged);
    };
    (serverList || []).forEach(add);
    (localList || []).forEach(add);
    return Array.from(map.values());
  },

  async applyServerState(state) {
    // AppState 以 const 宣告，不會掛在 window 上，需用全域變數直接判斷
    if (typeof AppState === 'undefined') return;

    const mergedWords = this.mergeEntries(AppState.getStarredWords(), state.wordbook || []);
    localStorage.setItem(AppState.STARRED_KEY, JSON.stringify(mergedWords));

    const mergedPhrases = this.mergeEntries(AppState.getPhrases(), state.phrases || []);
    localStorage.setItem(AppState.PHRASES_KEY, JSON.stringify(mergedPhrases));

    const mastered = Array.from(new Set([
      ...(AppState.getMasteredIds() || []),
      ...((state.mastered || []).map(String))
    ]));
    localStorage.setItem(AppState.MASTERED_KEY, JSON.stringify(mastered));

    const localStats = AppState.getStats();
    const mergedStats = { ...localStats };
    Object.keys(state.stats || {}).forEach((key) => {
      const value = state.stats[key];
      if (typeof value === 'number') {
        mergedStats[key] = Math.max(mergedStats[key] || 0, value);
      } else if (value && !mergedStats[key]) {
        mergedStats[key] = value;
      }
    });
    localStorage.setItem(AppState.STATS_KEY, JSON.stringify(mergedStats));

    // 把合併後的結果推回伺服器，讓兩邊保持一致（merge 模式不會刪掉任何一邊的資料）
    await this.pushState(true);
  },

  /** 收藏變動後延遲推送，避免連續操作產生大量請求 */
  schedulePush() {
    if (!this.currentUser) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this.pushState(), 800);
  },

  async pushState(mergeMode = false) {
    if (!this.currentUser || typeof AppState === 'undefined') return;
    try {
      await fetch('/api/user/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordbook: AppState.getStarredWords(),
          phrases: AppState.getPhrases(),
          mastered: AppState.getMasteredIds(),
          stats: AppState.getStats(),
          merge: !!mergeMode
        })
      });
    } catch (e) {
      console.warn('Cloud sync failed:', e);
    }
  },

  /* ---------- 介面更新 ---------- */

  refreshLocalViews() {
    if (typeof AppState !== 'undefined') AppState.updateStarredBadge();
    if (typeof renderWordbook === 'function') {
      renderWordbook(document.getElementById('wbSearchInput')?.value || '');
    }
    if (window.VocabModule) VocabModule.applyFilter(VocabModule.currentFilter);
  },

  renderUserUI() {
    const container = document.getElementById('sidebarAccount');
    if (container) {
      if (this.currentUser) {
        container.innerHTML = `
          <div class="account-card logged-in">
            <span class="account-avatar">👤</span>
            <span class="account-info">
              <strong>${authEscapeHtml(this.currentUser)}</strong>
              <small>☁️ 收藏已雲端同步</small>
            </span>
            <button type="button" class="account-action-btn" onclick="AuthModule.logout()">登出</button>
          </div>`;
      } else {
        container.innerHTML = `
          <button type="button" class="account-card logged-out" onclick="AuthModule.openModal('login')">
            <span class="account-avatar">👤</span>
            <span class="account-info">
              <strong>登入 / 註冊</strong>
              <small>登入後收藏永久保存</small>
            </span>
            <span class="account-chevron">›</span>
          </button>`;
      }
    }

    const mobileBtn = document.getElementById('mobileAccountBtn');
    if (mobileBtn) mobileBtn.textContent = this.currentUser ? '👤' : '登入';

    const syncHint = document.getElementById('wbSyncHint');
    if (syncHint) syncHint.style.display = this.currentUser ? 'none' : 'flex';
  }
};

window.AuthModule = AuthModule;
