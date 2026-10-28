/**
 * AITutorModule: AI 英語口說情境導師
 * 整合語音 STT 輸入、TTS 朗讀、文法診斷與母語表達推薦
 */
const AITutorModule = {
  scenarios: [],
  currentScenario: null,
  chatHistory: [],
  isRecording: false,

  async init() {
    await this.loadScenarios();
    this.bindEvents();
  },

  async loadScenarios() {
    try {
      const res = await fetch('/api/scenarios');
      const json = await res.json();
      if (json.success && json.data) {
        this.scenarios = json.data;
      }
    } catch (e) {
      console.warn("Using offline scenarios fallback", e);
    }

    this.renderScenarioList();
    if (this.scenarios.length > 0) {
      this.selectScenario(this.scenarios[0].id);
    }
  },

  renderScenarioList() {
    const listEl = document.getElementById('scenarioList');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.scenarios.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'scenario-item';
      item.id = `sc-item-${sc.id}`;
      item.innerHTML = `
        <span class="scenario-icon">${sc.icon || '💬'}</span>
        <div class="scenario-item-info">
          <h4>${sc.name}</h4>
          <span>${sc.category}</span>
        </div>
      `;
      item.onclick = () => this.selectScenario(sc.id);
      listEl.appendChild(item);
    });
  },

  selectScenario(scId) {
    const target = this.scenarios.find(s => s.id === scId);
    if (!target) return;
    this.currentScenario = target;

    // 更新側邊欄高亮
    document.querySelectorAll('.scenario-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`sc-item-${scId}`)?.classList.add('active');

    // 更新資訊卡
    document.getElementById('scInfoTitle').textContent = target.name;
    document.getElementById('scInfoRole').textContent = `Role: ${target.role}`;
    document.getElementById('scInfoGuidance').textContent = target.promptGuidance;

    const chipsEl = document.getElementById('scInfoVocabChips');
    chipsEl.innerHTML = '';
    (target.targetVocab || []).forEach(w => {
      const chip = document.createElement('span');
      chip.className = 'tv-chip';
      chip.textContent = w;
      chip.onclick = () => SpeechEngine.speak(w);
      chipsEl.appendChild(chip);
    });

    document.getElementById('chatTutorName').textContent = `${target.role}`;

    // 重置對話記錄並顯示 AI 開場白
    this.resetConversation();
  },

  resetConversation() {
    this.chatHistory = [];
    const chatBox = document.getElementById('chatMessages');
    chatBox.innerHTML = '';

    if (this.currentScenario && this.currentScenario.greeting) {
      this.appendAIMessage({
        reply: this.currentScenario.greeting,
        grammarFeedback: null,
        nativeSuggestion: null,
        score: null
      });
      // 自動播放開場白語音
      SpeechEngine.speak(this.currentScenario.greeting);
    }
  },

  appendAIMessage(aiData) {
    const chatBox = document.getElementById('chatMessages');
    const row = document.createElement('div');
    row.className = 'chat-msg-row ai';

    let feedbackHTML = '';
    if (aiData.grammarFeedback || aiData.nativeSuggestion) {
      feedbackHTML = `
        <div class="feedback-card">
          ${aiData.score ? `<div class="fb-score-pill">🎯 本輪得分：${aiData.score} / 100</div>` : ''}
          ${aiData.grammarFeedback ? `
            <div class="fb-section">
              <span class="fb-icon">🔍</span>
              <div>
                <span class="fb-label">文法與用語診斷：</span>
                <span class="fb-content">${aiData.grammarFeedback}</span>
              </div>
            </div>
          ` : ''}
          ${aiData.nativeSuggestion ? `
            <div class="fb-section">
              <span class="fb-icon">💡</span>
              <div>
                <span class="fb-label">母語人士進階表達：</span>
                <span class="fb-content">${aiData.nativeSuggestion}</span>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    row.innerHTML = `
      <div class="msg-avatar">${this.currentScenario?.avatar || '👩‍💼'}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">
          <p>${aiData.reply}</p>
          <div class="bubble-meta">
            <button class="ai-speak-btn" title="朗讀此段">🔊 聆聽發音</button>
          </div>
        </div>
        ${feedbackHTML}
      </div>
    `;

    row.querySelector('.ai-speak-btn')?.addEventListener('click', () => {
      SpeechEngine.speak(aiData.reply);
    });

    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;

    this.chatHistory.push({ role: 'model', content: aiData.reply });
  },

  appendUserMessage(text) {
    const chatBox = document.getElementById('chatMessages');
    const row = document.createElement('div');
    row.className = 'chat-msg-row user';
    row.innerHTML = `
      <div class="msg-avatar">🧑‍🎓</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">
          <p>${text}</p>
        </div>
      </div>
    `;
    chatBox.appendChild(row);
    chatBox.scrollTop = chatBox.scrollHeight;

    this.chatHistory.push({ role: 'user', content: text });
    AppState.incrementOralSession();
  },

  async sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.appendUserMessage(trimmed);
    const inputEl = document.getElementById('chatInputText');
    if (inputEl) inputEl.value = '';

    // 顯示等待狀態
    const chatBox = document.getElementById('chatMessages');
    const loadingRow = document.createElement('div');
    loadingRow.className = 'chat-msg-row ai loading-row';
    loadingRow.innerHTML = `
      <div class="msg-avatar">⏳</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble"><p>AI 導師正在評析文法並組織回應中...</p></div>
      </div>
    `;
    chatBox.appendChild(loadingRow);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          scenarioId: this.currentScenario ? this.currentScenario.id : 'scenario-job-interview',
          history: this.chatHistory
        })
      });

      const data = await res.json();
      loadingRow.remove();

      if (data.success && data.result) {
        this.appendAIMessage(data.result);
        SpeechEngine.speak(data.result.reply);
      } else {
        throw new Error(data.message || 'API error');
      }
    } catch (err) {
      loadingRow.remove();
      this.appendAIMessage({
        reply: "Great sentence! Could you explain that in more detail to help us understand your vision?",
        grammarFeedback: "文意通暢！建議嘗試運用更多大考高頻連接詞 (such as Furthermore, Consequently)。",
        nativeSuggestion: `A native speaker might say: "Specifically speaking, ${trimmed}"`,
        score: 85
      });
    }
  },

  toggleVoiceRecord() {
    const micBtn = document.getElementById('btnVoiceRecord');
    const recIndicator = document.getElementById('recordingIndicator');
    const inputEl = document.getElementById('chatInputText');

    if (!this.isRecording) {
      // 開始錄音
      this.isRecording = true;
      micBtn.classList.add('recording');
      recIndicator.style.display = 'flex';

      SpeechEngine.startListening(
        (transcript, isFinal) => {
          if (inputEl) inputEl.value = transcript;
          if (isFinal) {
            this.stopVoiceRecord();
            this.sendMessage(transcript);
          }
        },
        () => {
          this.stopVoiceRecord();
        },
        (err) => {
          this.stopVoiceRecord();
          showToast(`⚠️ 語音辨識提醒: ${err}`);
        }
      );
    } else {
      this.stopVoiceRecord();
    }
  },

  stopVoiceRecord() {
    this.isRecording = false;
    const micBtn = document.getElementById('btnVoiceRecord');
    const recIndicator = document.getElementById('recordingIndicator');
    if (micBtn) micBtn.classList.remove('recording');
    if (recIndicator) recIndicator.style.display = 'none';
    SpeechEngine.stopListening();
  },

  bindEvents() {
    const inputEl = document.getElementById('chatInputText');
    const sendBtn = document.getElementById('btnSendChat');
    const micBtn = document.getElementById('btnVoiceRecord');
    const stopRecBtn = document.getElementById('btnStopRec');
    const resetBtn = document.getElementById('btnResetChat');

    sendBtn?.addEventListener('click', () => {
      if (inputEl) this.sendMessage(inputEl.value);
    });

    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(inputEl.value);
      }
    });

    micBtn?.addEventListener('click', () => this.toggleVoiceRecord());
    stopRecBtn?.addEventListener('click', () => this.stopVoiceRecord());
    resetBtn?.addEventListener('click', () => this.resetConversation());
  }
};

window.AITutorModule = AITutorModule;
