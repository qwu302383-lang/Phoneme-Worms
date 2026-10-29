/**
 * PKBattleModule: 英語單字 PK 對決競技場
 * 包含自選角色與右上角偏向、自創與自選單字庫、贏家攻守決策 (普攻/技能 vs 防禦/扣血硬抗)
 */
const PKBattleModule = {
  // 角色資料庫 (包含右上角偏向標籤)
  characters: [
    {
      id: 'aria',
      name: '疾風遊俠・艾莉亞',
      title: 'Aria the Wind Ranger',
      affinity: '⚡ 敏捷爆擊型',
      affinityColor: '#f59e0b',
      avatar: '🧝‍♀️',
      roleDesc: '擅長高速節奏與致命爆擊，身形靈動難以捉摸。',
      maxHp: 100,
      maxMp: 100,
      baseAtk: 25,
      skills: [
        {
          id: 'aria_s1',
          name: '音速連擊 (Sonic Burst)',
          cost: 30,
          desc: '造成 35 點傷害，並增加下回合答題時間 3 秒。',
          damage: 35,
          effect: 'time_bonus'
        },
        {
          id: 'aria_s2',
          name: '致命弱點 (Vital Pierce)',
          cost: 60,
          desc: '無視防禦，造成 55 點極限爆擊傷害！',
          damage: 55,
          pierce: true
        }
      ],
      passive: '【疾風步】：選擇防禦時，有 35% 機率完全閃避傷害。'
    },
    {
      id: 'leon',
      name: '聖盾騎士・雷恩',
      title: 'Leon the Aegis Knight',
      affinity: '🛡️ 鐵壁防禦型',
      affinityColor: '#3b82f6',
      avatar: '🛡️',
      roleDesc: '極致的防禦專家，擅長護盾吸收與防守反擊。',
      maxHp: 150,
      maxMp: 80,
      baseAtk: 20,
      skills: [
        {
          id: 'leon_s1',
          name: '神聖護盾 (Aegis Barrier)',
          cost: 25,
          desc: '獲得 30 點吸收護盾，並反彈敵方下一次 30% 攻擊。',
          shield: 30,
          reflect: 0.3
        },
        {
          id: 'leon_s2',
          name: '正義審判 (Holy Smite)',
          cost: 50,
          desc: '造成 35 點神聖傷害，並回復自身 25 點生命值。',
          damage: 35,
          heal: 25
        }
      ],
      passive: '【聖潔壁壘】：選擇防禦時減免 70% 傷害（一般角色為 50%）。'
    },
    {
      id: 'seraphina',
      name: '奧術魔導・賽拉',
      title: 'Seraphina the Scholar',
      affinity: '🔮 魔法吸能型',
      affinityColor: '#8b5cf6',
      avatar: '🧙‍♀️',
      roleDesc: '精通詞彙奧術，能燃燒對手能量並發動大範圍法術。',
      maxHp: 90,
      maxMp: 140,
      baseAtk: 22,
      skills: [
        {
          id: 'sera_s1',
          name: '法力燃燒 (Mana Burn)',
          cost: 35,
          desc: '造成 30 點傷害，並吸取對手 25 點能量轉換給自己。',
          damage: 30,
          drainMp: 25
        },
        {
          id: 'sera_s2',
          name: '全知領域 (Omniscient Nova)',
          cost: 70,
          desc: '引爆奧術造成 60 點高額傷害，且下題自動剔除一個錯項！',
          damage: 60,
          eliminateOption: true
        }
      ],
      passive: '【魔力湧流】：每回合開始自動恢復 12 點 MP。'
    },
    {
      id: 'bork',
      name: '戰狂獵手・巴克',
      title: 'Bork the Berserker',
      affinity: '🩸 賣血狂暴型',
      affinityColor: '#ef4444',
      avatar: '🪓',
      roleDesc: '血量越少攻擊越狂暴，置之死地而後生的拼命三郎。',
      maxHp: 130,
      maxMp: 90,
      baseAtk: 28,
      skills: [
        {
          id: 'bork_s1',
          name: '嗜血強襲 (Blood Strike)',
          cost: 30,
          desc: '扣除自身 10 HP，對敵人造成 45 點重擊並吸血 15 HP。',
          selfDmg: 10,
          damage: 45,
          heal: 15
        },
        {
          id: 'bork_s2',
          name: '不滅狂怒 (Immortal Roar)',
          cost: 55,
          desc: '極限反擊！自身生命越低傷害越高（造成 35~80 點傷害）。',
          berserkScale: true
        }
      ],
      passive: '【血性覺醒】：選擇「放棄防禦扣血」時獲得雙倍怒氣 (MP +35)！'
    }
  ],

  // AI 敵方角色設定
  aiBosses: [
    {
      name: '詞根暗影・噬語魔',
      title: 'Shadow Lexicon',
      avatar: '😈',
      hp: 120,
      mp: 100,
      baseAtk: 22,
      accuracy: 0.72 // AI 答題正確率
    },
    {
      name: '核心機械蟲・AI-01',
      title: 'Phoneme Core-X',
      avatar: '🤖',
      hp: 140,
      mp: 120,
      baseAtk: 26,
      accuracy: 0.80
    }
  ],

  // 狀態管理
  selectedChar: null,
  activeDeck: [],
  customDecks: [],
  selectedDeckId: 'builtin_exam',
  
  // 戰鬥即時狀態
  battleActive: false,
  round: 1,
  player: { hp: 100, maxHp: 100, mp: 30, maxMp: 100, shield: 0 },
  enemy: { hp: 120, maxHp: 120, mp: 30, maxMp: 100, shield: 0 },
  currentQ: null,
  roundTimer: null,
  roundTimeLeft: 10,
  playerAnswered: false,
  playerCorrect: false,
  enemyCorrect: false,
  pendingActionPhase: null, // 'player_attack' | 'player_defend'
  eliminatedOptionsCount: 0,
  timeBonusActive: false,

  async init() {
    this.selectedChar = this.characters[0];
    this.loadCustomDecks();
    this.bindEvents();
    this.renderCharacterSelector();
    this.renderDeckSelector();
  },

  loadCustomDecks() {
    try {
      const stored = localStorage.getItem('pw_custom_pk_decks_v1');
      if (stored) {
        this.customDecks = JSON.parse(stored);
      } else {
        // 預設示範題庫
        this.customDecks = [
          {
            id: 'deck_demo_1',
            name: '大考核心衝刺單字庫',
            words: [
              { word: 'comprehensive', definition: '全面的；綜合的' },
              { word: 'implement', definition: '實施；貫徹；執行' },
              { word: 'perseverance', definition: '堅持不懈；毅力' },
              { word: 'subsequent', definition: '隨後的；接著發生的' },
              { word: 'sustainable', definition: '可持續的；永續的' },
              { word: 'accommodate', definition: '容納；提供住宿' },
              { word: 'fluctuate', definition: '波動；起伏' },
              { word: 'ambiguous', definition: '模稜兩可的' },
              { word: 'negotiate', definition: '談判；協商' },
              { word: 'deteriorate', definition: '惡化；退化' },
              { word: 'resilient', definition: '有韌性的；適應力強的' }
            ]
          }
        ];
        this.saveCustomDecks();
      }
    } catch (e) {
      this.customDecks = [];
    }
  },

  saveCustomDecks() {
    localStorage.setItem('pw_custom_pk_decks_v1', JSON.stringify(this.customDecks));
  },

  renderCharacterSelector() {
    const listEl = document.getElementById('pkCharList');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.characters.forEach(char => {
      const isSelected = (this.selectedChar && this.selectedChar.id === char.id);
      const card = document.createElement('div');
      card.className = `pk-char-card ${isSelected ? 'selected' : ''}`;
      card.id = `pk-char-${char.id}`;

      card.innerHTML = `
        <!-- 右上角角色的偏向標籤 -->
        <div class="char-affinity-badge" style="background:${char.affinityColor}20; color:${char.affinityColor}; border-color:${char.affinityColor}50;">
          ${char.affinity}
        </div>

        <div class="char-avatar-box">${char.avatar}</div>
        <div class="char-info">
          <h3 class="char-name">${char.name}</h3>
          <span class="char-title-sub">${char.title}</span>
          <p class="char-desc">${char.roleDesc}</p>
          
          <div class="char-stats-row">
            <span class="stat-tag hp">❤️ HP: ${char.maxHp}</span>
            <span class="stat-tag mp">💧 MP: ${char.maxMp}</span>
            <span class="stat-tag atk">⚔️ ATK: ${char.baseAtk}</span>
          </div>

          <div class="char-skills-preview">
            <div class="skill-mini-item">
              <span class="skill-tag">技能 1</span> <strong>${char.skills[0].name}</strong> (耗藍 ${char.skills[0].cost})
            </div>
            <div class="skill-mini-item">
              <span class="skill-tag">技能 2</span> <strong>${char.skills[1].name}</strong> (耗藍 ${char.skills[1].cost})
            </div>
            <div class="passive-mini-item">
              ${char.passive}
            </div>
          </div>
        </div>

        <div class="char-select-indicator">${isSelected ? '✓ 已選擇出戰' : '點擊選擇出戰'}</div>
      `;

      card.onclick = () => {
        this.selectedChar = char;
        document.querySelectorAll('.pk-char-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.querySelectorAll('.char-select-indicator').forEach(i => i.textContent = '點擊選擇出戰');
        card.querySelector('.char-select-indicator').textContent = '✓ 已選擇出戰';
        showToast(`已指派【${char.name}】出戰！`);
      };

      listEl.appendChild(card);
    });
  },

  renderDeckSelector() {
    const selectEl = document.getElementById('pkDeckSelect');
    if (!selectEl) return;
    selectEl.innerHTML = '';

    // 1. 內建題庫選項
    const optBuiltin = document.createElement('option');
    optBuiltin.value = 'builtin_exam';
    optBuiltin.textContent = '📚 內建大考與多益核心題庫 (15 單字)';
    selectEl.appendChild(optBuiltin);

    // 2. 生字本選項
    const starredWords = AppState.getStarredWords();
    const optWordbook = document.createElement('option');
    optWordbook.value = 'my_wordbook';
    optWordbook.textContent = `⭐ 個人生字收藏庫 (${starredWords.length} 單字)`;
    selectEl.appendChild(optWordbook);

    // 3. 自創題庫選項
    this.customDecks.forEach(deck => {
      const opt = document.createElement('option');
      opt.value = deck.id;
      opt.textContent = `⚔️ [自創] ${deck.name} (${deck.words.length} 單字)`;
      selectEl.appendChild(opt);
    });

    selectEl.value = this.selectedDeckId;
    selectEl.onchange = (e) => {
      this.selectedDeckId = e.target.value;
      this.updateDeckStatsInfo();
    };

    this.updateDeckStatsInfo();
  },

  updateDeckStatsInfo() {
    const infoEl = document.getElementById('pkDeckInfoText');
    if (!infoEl) return;

    if (this.selectedDeckId === 'builtin_exam') {
      infoEl.textContent = '包含全面性、實施、永續性、協商等大考檢定高頻詞彙，戰力均衡。';
    } else if (this.selectedDeckId === 'my_wordbook') {
      const count = AppState.getStarredWords().length;
      infoEl.textContent = count > 0 ? `將抽取您收藏的 ${count} 個生字進行攻防對答！` : '生字本目前為空，建議先收藏生詞或選擇其他題庫。';
    } else {
      const deck = this.customDecks.find(d => d.id === this.selectedDeckId);
      infoEl.textContent = deck ? `已載入自創題庫【${deck.name}】，共收錄 ${deck.words.length} 題！` : '';
    }
  },

  /**
   * 取得當前對戰題庫陣列
   */
  async getBattleWordList() {
    if (this.selectedDeckId === 'builtin_exam') {
      try {
        const res = await fetch('/api/vocab');
        const json = await res.json();
        if (json.success && json.data) return json.data;
      } catch (e) {}
      return [
        { word: 'comprehensive', definition: '全面的；綜合的' },
        { word: 'implement', definition: '實施；貫徹' },
        { word: 'perseverance', definition: '毅力；堅持不懈' },
        { word: 'collaborate', definition: '合作；協調' },
        { word: 'sustainable', definition: '永續的；可持續的' }
      ];
    } else if (this.selectedDeckId === 'my_wordbook') {
      const starred = AppState.getStarredWords();
      if (starred.length >= 2) return starred;
      // 生字本太少時自動混入內建
      return [
        ...starred,
        { word: 'innovation', definition: '創新；革新' },
        { word: 'resilient', definition: '具韌性的；有適應力的' }
      ];
    } else {
      const deck = this.customDecks.find(d => d.id === this.selectedDeckId);
      if (deck && deck.words.length > 0) return deck.words;
      return [{ word: 'victory', definition: '勝利' }, { word: 'courage', definition: '勇氣' }];
    }
  },

  /**
   * 開始對戰競技場
   */
  async startBattle() {
    const words = await this.getBattleWordList();
    if (words.length < 2) {
      alert("此題庫的單字數量不足（至少需 2 筆），請先新增單字或挑選其他題庫！");
      return;
    }

    this.activeDeck = [...words];
    const char = this.selectedChar;
    const enemyBoss = this.aiBosses[Math.floor(Math.random() * this.aiBosses.length)];

    // 重設數值
    this.player = {
      name: char.name,
      avatar: char.avatar,
      hp: char.maxHp,
      maxHp: char.maxHp,
      mp: 30, // 初始能量
      maxMp: char.maxMp,
      baseAtk: char.baseAtk,
      shield: 0,
      charObj: char
    };

    this.enemy = {
      name: enemyBoss.name,
      title: enemyBoss.title,
      avatar: enemyBoss.avatar,
      hp: enemyBoss.hp,
      maxHp: enemyBoss.hp,
      mp: 20,
      maxMp: enemyBoss.mp,
      baseAtk: enemyBoss.baseAtk,
      accuracy: enemyBoss.accuracy,
      shield: 0
    };

    this.round = 1;
    this.battleActive = true;
    this.eliminatedOptionsCount = 0;
    this.timeBonusActive = false;

    // 介面切換
    document.getElementById('pkLobbyScreen').style.display = 'none';
    document.getElementById('pkResultScreen').style.display = 'none';
    document.getElementById('pkArenaScreen').style.display = 'block';

    // 渲染對戰雙方資訊
    document.getElementById('pkPlayerAvatar').textContent = this.player.avatar;
    document.getElementById('pkPlayerName').textContent = this.player.name;
    document.getElementById('pkEnemyAvatar').textContent = this.enemy.avatar;
    document.getElementById('pkEnemyName').textContent = this.enemy.name;

    this.updateVitalsUI();
    this.addLog(`⚔️ 戰鬥開始！【${this.player.name}】VS【${this.enemy.name}】！`);

    // 啟動第一回合
    this.nextRound();
  },

  nextRound() {
    if (!this.battleActive) return;

    this.roundTimeLeft = this.timeBonusActive ? 13 : 10;
    this.timeBonusActive = false;
    this.playerAnswered = false;
    this.playerCorrect = false;
    this.enemyCorrect = false;

    // 觸發被動：賽拉奧術回魔
    if (this.player.charObj.id === 'seraphina') {
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + 12);
      this.updateVitalsUI();
    }

    // 重置護盾（每回合護盾重置或保留一半）
    this.player.shield = Math.floor(this.player.shield * 0.5);
    this.enemy.shield = Math.floor(this.enemy.shield * 0.5);
    this.updateVitalsUI();

    // 產生本回合題目
    this.generateRoundQuestion();

    // 隱藏決策區，顯示答題區
    document.getElementById('pkQuestionSection').style.display = 'block';
    document.getElementById('pkDecisionSection').style.display = 'none';
    document.getElementById('pkRoundNotice').textContent = `第 ${this.round} 回合`;

    this.startRoundTimer();
  },

  generateRoundQuestion() {
    const list = this.activeDeck;
    const target = list[Math.floor(Math.random() * list.length)];
    const distractors = list.filter(w => w.word !== target.word).sort(() => 0.5 - Math.random()).slice(0, 3);
    
    // 題型隨機：看英選中 (70%) 或 看中選英 (30%)
    const isEnToZh = Math.random() > 0.3;
    let questionText = '';
    let correctAnswer = '';
    let options = [];

    if (isEnToZh) {
      questionText = target.word;
      correctAnswer = target.definition;
      options = [target.definition, ...distractors.map(d => d.definition)].sort(() => 0.5 - Math.random());
    } else {
      questionText = target.definition;
      correctAnswer = target.word;
      options = [target.word, ...distractors.map(d => d.word)].sort(() => 0.5 - Math.random());
    }

    this.currentQ = {
      targetWord: target.word,
      text: questionText,
      answer: correctAnswer,
      options: options,
      isEnToZh: isEnToZh
    };

    // 渲染題目到對戰卡片
    document.getElementById('pkQuestionStem').textContent = questionText;
    document.getElementById('pkQuestionHint').textContent = isEnToZh ? '請選出正確的中文解釋：' : '請選出對應的英文單字：';

    // 發音
    document.getElementById('pkQuestionAudioBtn').onclick = () => {
      SpeechEngine.speak(target.word);
    };

    const optGrid = document.getElementById('pkQuestionOptions');
    optGrid.innerHTML = '';

    // 若有賽拉技能「全知領域」，自動排除一個錯誤選項
    let eliminateCount = this.eliminatedOptionsCount;
    this.eliminatedOptionsCount = 0;

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'pk-opt-btn';
      btn.innerHTML = `<span class="opt-key">${String.fromCharCode(65 + idx)}</span> <span class="opt-val">${opt}</span>`;

      if (eliminateCount > 0 && opt !== correctAnswer) {
        btn.disabled = true;
        btn.classList.add('eliminated');
        btn.title = '🔮 奧術全知領域已自動剔除此錯誤項！';
        eliminateCount--;
      }

      btn.onclick = () => {
        if (this.playerAnswered) return;
        this.submitAnswer(opt, btn);
      };

      optGrid.appendChild(btn);
    });
  },

  startRoundTimer() {
    if (this.roundTimer) clearInterval(this.roundTimer);
    const timerEl = document.getElementById('pkRoundTimer');
    const timerFill = document.getElementById('pkTimerBarFill');
    const maxTime = this.roundTimeLeft;

    timerEl.textContent = `${this.roundTimeLeft}s`;
    timerFill.style.width = '100%';

    this.roundTimer = setInterval(() => {
      this.roundTimeLeft--;
      timerEl.textContent = `${this.roundTimeLeft}s`;
      const pct = Math.max(0, (this.roundTimeLeft / maxTime) * 100);
      timerFill.style.width = `${pct}%`;

      if (this.roundTimeLeft <= 0) {
        clearInterval(this.roundTimer);
        if (!this.playerAnswered) {
          this.submitAnswer(null, null); // 逾時算錯
        }
      }
    }, 1000);
  },

  submitAnswer(selectedOpt, clickedBtn) {
    this.playerAnswered = true;
    if (this.roundTimer) clearInterval(this.roundTimer);

    const isCorrect = (selectedOpt === this.currentQ.answer);
    this.playerCorrect = isCorrect;

    // AI 同步答題模擬 (命中率為 enemy.accuracy)
    this.enemyCorrect = (Math.random() < this.enemy.accuracy);

    // 高亮選項按鈕
    const optButtons = document.querySelectorAll('.pk-opt-btn');
    optButtons.forEach(btn => {
      btn.disabled = true;
      const text = btn.querySelector('.opt-val')?.textContent;
      if (text === this.currentQ.answer) {
        btn.classList.add('correct');
      }
    });

    if (clickedBtn && !isCorrect) {
      clickedBtn.classList.add('incorrect');
    }

    // 發音
    SpeechEngine.speak(this.currentQ.targetWord);

    // 結算本回合攻防階段
    setTimeout(() => {
      this.enterDecisionPhase();
    }, 900);
  },

  /**
   * 進入決策階段：
   * 贏的人（答對）選擇【普攻】或【技能】！
   * 輸的人（答錯）選擇【防禦】或【扣血硬抗】！
   */
  enterDecisionPhase() {
    document.getElementById('pkQuestionSection').style.display = 'none';
    const decisionSection = document.getElementById('pkDecisionSection');
    decisionSection.style.display = 'block';

    const promptTitle = document.getElementById('pkDecisionPromptTitle');
    const promptDesc = document.getElementById('pkDecisionPromptDesc');
    const actionBtnsBox = document.getElementById('pkDecisionButtons');
    actionBtnsBox.innerHTML = '';

    const pWin = this.playerCorrect;
    const eWin = this.enemyCorrect;

    if (pWin && !eWin) {
      // 玩家贏，AI 輸！玩家攻擊！
      promptTitle.innerHTML = `🎉 本回合答對獲勝！請選擇您的攻勢：`;
      promptDesc.textContent = `對手【${this.enemy.name}】答錯露出破綻！您可發動普通攻擊或消耗能量釋放絕招！`;

      // 1. 普通攻擊按鈕
      const atkBtn = document.createElement('button');
      atkBtn.className = 'btn-action btn-attack';
      atkBtn.innerHTML = `
        <span class="act-icon">⚔️</span>
        <div class="act-text">
          <strong>普通攻擊 (Basic Attack)</strong>
          <span>造成基礎 ${this.player.baseAtk} 點傷害，並回復 10 MP</span>
        </div>
      `;
      atkBtn.onclick = () => this.executeCombat('player_basic_attack');
      actionBtnsBox.appendChild(atkBtn);

      // 2. 角色技能按鈕列表
      this.player.charObj.skills.forEach((skill, sIdx) => {
        const canAfford = (this.player.mp >= skill.cost);
        const skillBtn = document.createElement('button');
        skillBtn.className = `btn-action btn-skill ${canAfford ? '' : 'disabled'}`;
        skillBtn.innerHTML = `
          <span class="act-icon">🔥</span>
          <div class="act-text">
            <strong>${skill.name}</strong>
            <span>${skill.desc} <span class="mp-cost-pill">耗藍 ${skill.cost} MP</span></span>
          </div>
        `;
        if (canAfford) {
          skillBtn.onclick = () => this.executeCombat(`player_skill_${sIdx}`);
        } else {
          skillBtn.onclick = () => showToast("⚠️ 能量不足，無法釋放此技能！");
        }
        actionBtnsBox.appendChild(skillBtn);
      });

    } else if (!pWin && eWin) {
      // 玩家輸，AI 贏！玩家防守！
      promptTitle.innerHTML = `⚠️ 本回合答錯失利！請選擇您的防守姿態：`;
      promptDesc.textContent = `對手【${this.enemy.name}】答對發動猛烈進攻！您可以選擇穩妥防禦或用肉身抗傷換取怒氣！`;

      // 1. 採取防禦姿態
      const defBtn = document.createElement('button');
      defBtn.className = 'btn-action btn-defend';
      const defReductionText = (this.player.charObj.id === 'leon') ? '70% (聖盾天賦)' : '50%';
      defBtn.innerHTML = `
        <span class="act-icon">🛡️</span>
        <div class="act-text">
          <strong>採取防禦姿態 (Shield Defense)</strong>
          <span>傷害減免 ${defReductionText}，回復 10 MP，穩紮穩打</span>
        </div>
      `;
      defBtn.onclick = () => this.executeCombat('player_defend');
      actionBtnsBox.appendChild(defBtn);

      // 2. 放棄防禦扣血
      const takeHitBtn = document.createElement('button');
      takeHitBtn.className = 'btn-action btn-takehit';
      const rageGain = (this.player.charObj.id === 'bork') ? '+35 (戰狂被動)' : '+25';
      takeHitBtn.innerHTML = `
        <span class="act-icon">💥</span>
        <div class="act-text">
          <strong>放棄防禦，直接扣血！(Take Damage)</strong>
          <span>承受全額傷害，但瞬間激發怒氣獲得能量 ${rageGain} MP！</span>
        </div>
      `;
      takeHitBtn.onclick = () => this.executeCombat('player_take_hit');
      actionBtnsBox.appendChild(takeHitBtn);

    } else if (pWin && eWin) {
      // 雙方皆答對：勢均力敵 (Clash)
      promptTitle.innerHTML = `⚡ 雙方皆答對！劍拔弩張互拼！`;
      promptDesc.textContent = `雙方同時出手交鋒，互拼刀刃，各承受輕微傷害並激發鬥志！`;

      const clashBtn = document.createElement('button');
      clashBtn.className = 'btn-action btn-clash';
      clashBtn.innerHTML = `
        <span class="act-icon">⚡</span>
        <div class="act-text">
          <strong>刀光劍影・雙方交鋒！</strong>
          <span>雙方各扣 12 點體力，能量各 +15 MP！</span>
        </div>
      `;
      clashBtn.onclick = () => this.executeCombat('both_clash');
      actionBtnsBox.appendChild(clashBtn);

    } else {
      // 雙方皆答錯：僵持喘息 (Stumble)
      promptTitle.innerHTML = `💨 雙方皆答錯！僵持重整！`;
      promptDesc.textContent = `彼此皆未能抓住弱點，各自喘息重整旗鼓，進入下一輪對答！`;

      const stumbleBtn = document.createElement('button');
      stumbleBtn.className = 'btn-action btn-stumble';
      stumbleBtn.innerHTML = `
        <span class="act-icon">💨</span>
        <div class="act-text">
          <strong>重整旗鼓・再戰下輪！</strong>
          <span>各受 5 點消耗，調整心態繼續作答！</span>
        </div>
      `;
      stumbleBtn.onclick = () => this.executeCombat('both_stumble');
      actionBtnsBox.appendChild(stumbleBtn);
    }
  },

  /**
   * 執行戰鬥數值結算與動畫演出
   */
  executeCombat(actionType) {
    let pDmg = 0;
    let eDmg = 0;
    let logMsg = '';

    if (actionType === 'player_basic_attack') {
      // 玩家普攻
      let rawDmg = this.player.baseAtk;
      // AI 50% 機率選擇防禦
      const aiDefends = (Math.random() > 0.4);
      if (aiDefends) {
        rawDmg = Math.round(rawDmg * 0.5);
        this.showFloater('enemy', '🛡️ 防禦減半!', '#3b82f6');
      }
      eDmg = rawDmg;
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + 10);
      logMsg = `⚔️【${this.player.name}】發動普通攻擊，對【${this.enemy.name}】造成 ${eDmg} 點傷害！`;
      this.animateAttack('player');

    } else if (actionType.startsWith('player_skill_')) {
      // 玩家放技能
      const skillIdx = parseInt(actionType.split('_')[2], 10);
      const skill = this.player.charObj.skills[skillIdx];
      this.player.mp -= skill.cost;

      let rawDmg = skill.damage || 0;

      // 艾莉亞致命弱點 (無視防禦)
      if (skill.pierce) {
        eDmg = rawDmg;
        this.showFloater('enemy', '💥 破防必殺!', '#f59e0b');
      } else if (skill.berserkScale) {
        // 巴克狂暴計算：血越低傷害越高
        const missingHpPct = (1 - (this.player.hp / this.player.maxHp));
        rawDmg = Math.round(35 + missingHpPct * 45);
        eDmg = rawDmg;
        this.showFloater('enemy', `🩸 狂暴 ${rawDmg}!`, '#ef4444');
      } else {
        eDmg = rawDmg;
      }

      // 技能吸血
      if (skill.heal) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + skill.heal);
        this.showFloater('player', `+${skill.heal} HP 💖`, '#10b981');
      }
      // 技能自殘 (巴克)
      if (skill.selfDmg) {
        this.player.hp = Math.max(1, this.player.hp - skill.selfDmg);
      }
      // 護盾 (雷恩)
      if (skill.shield) {
        this.player.shield += skill.shield;
        this.showFloater('player', `+${skill.shield} 護盾 🛡️`, '#3b82f6');
      }
      // 吸藍 (賽拉)
      if (skill.drainMp) {
        this.enemy.mp = Math.max(0, this.enemy.mp - skill.drainMp);
        this.player.mp = Math.min(this.player.maxMp, this.player.mp + skill.drainMp);
      }
      // 時間獎勵 (艾莉亞)
      if (skill.effect === 'time_bonus') {
        this.timeBonusActive = true;
      }
      // 剔除選項 (賽拉)
      if (skill.eliminateOption) {
        this.eliminatedOptionsCount = 1;
      }

      logMsg = `🔥【${this.player.name}】施展大絕【${skill.name}】！造成重創 ${eDmg} 點傷害！`;
      this.animateAttack('player', true);

    } else if (actionType === 'player_defend') {
      // 玩家防守
      let rawDmg = this.enemy.baseAtk;

      // 艾莉亞閃避被動觸發檢查
      if (this.player.charObj.id === 'aria' && Math.random() < 0.35) {
        rawDmg = 0;
        this.showFloater('player', '💨 完全閃避!', '#f59e0b');
        logMsg = `💨【${this.player.name}】觸發【疾風步】，完美閃避了對手的攻擊！`;
      } else {
        const defRate = (this.player.charObj.id === 'leon') ? 0.3 : 0.5; // 雷恩只受 30%
        rawDmg = Math.round(rawDmg * defRate);
        pDmg = rawDmg;
        this.player.mp = Math.min(this.player.maxMp, this.player.mp + 10);
        logMsg = `🛡️【${this.player.name}】採取防禦姿態，減免傷害後僅受到 ${pDmg} 點傷害，並回復能量！`;
        this.showFloater('player', `-${pDmg} (防禦)`, '#3b82f6');
      }
      this.animateAttack('enemy');

    } else if (actionType === 'player_take_hit') {
      // 玩家扣血硬抗換怒氣
      let rawDmg = this.enemy.baseAtk;
      pDmg = rawDmg;
      const rage = (this.player.charObj.id === 'bork') ? 35 : 25;
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + rage);
      this.showFloater('player', `-${pDmg} HP 💥`, '#ef4444');
      this.showFloater('player', `+${rage} MP ⚡`, '#8b5cf6');
      logMsg = `💥【${this.player.name}】選擇硬抗傷害！承受 ${pDmg} 點傷害並激發強大怒氣 (+${rage} MP)！`;
      this.animateAttack('enemy');

    } else if (actionType === 'both_clash') {
      pDmg = 12;
      eDmg = 12;
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + 15);
      this.enemy.mp = Math.min(this.enemy.maxMp, this.enemy.mp + 15);
      logMsg = `⚡ 雙方刀光交錯！各自受到 12 點傷害，戰意升溫！`;
      this.showFloater('player', '-12', '#f59e0b');
      this.showFloater('enemy', '-12', '#f59e0b');

    } else if (actionType === 'both_stumble') {
      pDmg = 5;
      eDmg = 5;
      logMsg = `💨 雙方失誤僵持，體力微耗 5 點，準備下一回合！`;
    }

    // 結算扣血
    this.player.hp = Math.max(0, this.player.hp - pDmg);
    this.enemy.hp = Math.max(0, this.enemy.hp - eDmg);

    this.addLog(logMsg);
    this.updateVitalsUI();

    // 檢查戰鬥是否結束
    setTimeout(() => {
      if (this.player.hp <= 0 || this.enemy.hp <= 0) {
        this.concludeBattle();
      } else {
        this.round++;
        this.nextRound();
      }
    }, 1200);
  },

  animateAttack(side, isSpecial = false) {
    const el = document.getElementById(side === 'player' ? 'pkPlayerCard' : 'pkEnemyCard');
    if (el) {
      el.classList.add(isSpecial ? 'anim-special-attack' : 'anim-attack');
      setTimeout(() => {
        el.classList.remove('anim-attack', 'anim-special-attack');
      }, 500);
    }
  },

  showFloater(targetSide, text, color) {
    const card = document.getElementById(targetSide === 'player' ? 'pkPlayerCard' : 'pkEnemyCard');
    if (!card) return;

    const floater = document.createElement('div');
    floater.className = 'pk-damage-floater';
    floater.textContent = text;
    floater.style.color = color;
    card.appendChild(floater);

    setTimeout(() => floater.remove(), 1200);
  },

  updateVitalsUI() {
    // 玩家血條與魔力
    const pHpPct = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
    const pMpPct = Math.max(0, (this.player.mp / this.player.maxMp) * 100);
    document.getElementById('pkPlayerHpFill').style.width = `${pHpPct}%`;
    document.getElementById('pkPlayerHpText').textContent = `${this.player.hp} / ${this.player.maxHp}`;
    document.getElementById('pkPlayerMpFill').style.width = `${pMpPct}%`;
    document.getElementById('pkPlayerMpText').textContent = `${this.player.mp} / ${this.player.maxMp}`;

    // 敵方血條與魔力
    const eHpPct = Math.max(0, (this.enemy.hp / this.enemy.maxHp) * 100);
    const eMpPct = Math.max(0, (this.enemy.mp / this.enemy.maxMp) * 100);
    document.getElementById('pkEnemyHpFill').style.width = `${eHpPct}%`;
    document.getElementById('pkEnemyHpText').textContent = `${this.enemy.hp} / ${this.enemy.maxHp}`;
    document.getElementById('pkEnemyMpFill').style.width = `${eMpPct}%`;
    document.getElementById('pkEnemyMpText').textContent = `${this.enemy.mp} / ${this.enemy.maxMp}`;
  },

  addLog(msg) {
    const logBox = document.getElementById('pkBattleLog');
    if (!logBox) return;
    const p = document.createElement('p');
    p.className = 'log-line';
    p.textContent = msg;
    logBox.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight;
  },

  concludeBattle() {
    this.battleActive = false;
    if (this.roundTimer) clearInterval(this.roundTimer);

    document.getElementById('pkArenaScreen').style.display = 'none';
    const resultScreen = document.getElementById('pkResultScreen');
    resultScreen.style.display = 'block';

    const isWin = (this.player.hp > 0 && this.enemy.hp <= 0);
    const iconEl = document.getElementById('pkResIcon');
    const titleEl = document.getElementById('pkResTitle');
    const descEl = document.getElementById('pkResDesc');

    if (isWin) {
      iconEl.textContent = '🏆';
      titleEl.textContent = 'VICTORY 戰鬥大獲全勝！';
      descEl.textContent = `恭喜您率領【${this.player.name}】以深厚的英語單字實力擊潰【${this.enemy.name}】！`;
      this.addLog(`🏆 戰鬥結束！【${this.player.name}】榮獲輝煌勝利！`);
    } else {
      iconEl.textContent = '💀';
      titleEl.textContent = 'DEFEAT 戰鬥惜敗！';
      descEl.textContent = `【${this.enemy.name}】過於強大！再熟悉一下單字庫，整備防具再來挑戰！`;
      this.addLog(`💀 戰鬥結束！【${this.player.name}】倒下了，請再接再厲！`);
    }
  },

  exitToLobby() {
    this.battleActive = false;
    if (this.roundTimer) clearInterval(this.roundTimer);
    document.getElementById('pkArenaScreen').style.display = 'none';
    document.getElementById('pkResultScreen').style.display = 'none';
    document.getElementById('pkLobbyScreen').style.display = 'block';
  },

  // 自創題庫建立與管理
  openCreateDeckModal() {
    const modal = document.getElementById('pkCreateDeckModal');
    if (modal) modal.style.display = 'flex';
  },

  closeCreateDeckModal() {
    const modal = document.getElementById('pkCreateDeckModal');
    if (modal) modal.style.display = 'none';
  },

  saveNewCustomDeck() {
    const nameInput = document.getElementById('pkNewDeckName');
    const wordsInput = document.getElementById('pkNewDeckWordsText');
    const name = nameInput.value.trim();
    const rawText = wordsInput.value.trim();

    if (!name) {
      alert("請輸入題庫名稱！");
      return;
    }
    if (!rawText) {
      alert("請輸入至少 2 筆單字！");
      return;
    }

    // 解析格式：每行一個 "word - definition" 或 "word, definition"
    const lines = rawText.split('\n');
    const parsedWords = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // 支援多種分隔符號 - / , / 空格
      const match = trimmed.split(/[\-\,\:\t]+/);
      if (match.length >= 2) {
        parsedWords.push({
          word: match[0].trim(),
          definition: match.slice(1).join(' ').trim()
        });
      } else {
        parsedWords.push({
          word: trimmed,
          definition: '自訂詞彙'
        });
      }
    });

    if (parsedWords.length < 2) {
      alert("請至少輸入 2 筆有效單字！格式如：apple - 蘋果");
      return;
    }

    const newDeck = {
      id: `deck_${Date.now()}`,
      name: name,
      words: parsedWords
    };

    this.customDecks.push(newDeck);
    this.saveCustomDecks();
    this.selectedDeckId = newDeck.id;
    this.renderDeckSelector();
    this.closeCreateDeckModal();

    nameInput.value = '';
    wordsInput.value = '';
    showToast(`🎉 成功創立專屬 PK 題庫【${name}】！`);
  },

  bindEvents() {
    // 開始戰鬥按鈕
    document.getElementById('btnStartPKBattle')?.addEventListener('click', () => {
      this.startBattle();
    });

    // 逃跑/退出對戰
    document.getElementById('btnPkFlee')?.addEventListener('click', () => {
      if (confirm("確定要棄賽退出競技場嗎？")) {
        this.exitToLobby();
      }
    });

    // 結算頁按鈕
    document.getElementById('btnPkReplay')?.addEventListener('click', () => {
      this.startBattle();
    });
    document.getElementById('btnPkBackToLobby')?.addEventListener('click', () => {
      this.exitToLobby();
    });

    // 創立題庫彈窗
    document.getElementById('btnPkOpenCreateDeck')?.addEventListener('click', () => {
      this.openCreateDeckModal();
    });
    document.getElementById('btnPkCloseModal')?.addEventListener('click', () => {
      this.closeCreateDeckModal();
    });
    document.getElementById('btnPkCancelDeck')?.addEventListener('click', () => {
      this.closeCreateDeckModal();
    });
    document.getElementById('btnPkSaveDeck')?.addEventListener('click', () => {
      this.saveNewCustomDeck();
    });
  }
};

window.PKBattleModule = PKBattleModule;
