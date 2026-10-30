# -*- coding: utf-8 -*-
"""
PK PvP Manager: 雙人即時線上對決房間管理器
支援邀請碼創房、即時作答判定、攻防決策狀態機與戰鬥結算
"""
import time
import random
import threading

# 角色數值與技能定義 (與前端一致)
CHAR_STATS = {
    "aria": {
        "name": "疾風遊俠・艾莉亞",
        "title": "Aria the Swift",
        "affinity": "⚡ 爆速閃避型",
        "avatar": "🧝‍♀️",
        "maxHp": 100,
        "maxMp": 100,
        "baseAtk": 25,
        "skills": [
            {
                "id": "aria_s1",
                "name": "致命弱點 (Vital Strike)",
                "cost": 35,
                "desc": "鎖定詞彙破綻，造成 40 點致命打擊（無視敵方防禦）。",
                "damage": 40,
                "pierce": True
            },
            {
                "id": "aria_s2",
                "name": "風之低語 (Whisper of Wind)",
                "cost": 20,
                "desc": "微風指引，下回合答題時間延長 3 秒。",
                "time_bonus": True
            }
        ],
        "passive": "【疾風步】：防守時有 35% 機率完全閃避傷害！"
    },
    "leon": {
        "name": "聖殿騎士・雷恩",
        "title": "Leon the Templar",
        "affinity": "🛡️ 鐵壁防守型",
        "avatar": "🛡️",
        "maxHp": 150,
        "maxMp": 80,
        "baseAtk": 20,
        "skills": [
            {
                "id": "leon_s1",
                "name": "聖光制裁 (Holy Smite)",
                "cost": 30,
                "desc": "召喚聖光懲戒，造成 30 點傷害並為自身回復 20 HP。",
                "damage": 30,
                "heal": 20
            },
            {
                "id": "leon_s2",
                "name": "守護要塞 (Bastion Shield)",
                "cost": 25,
                "desc": "舉起金光神盾，立即獲得 35 點防禦護盾。",
                "shield": 35
            }
        ],
        "passive": "【聖盾誓約】：選擇防禦姿態時，傷害減免提升至 70%！"
    },
    "seraphina": {
        "name": "奧術學者・賽拉",
        "title": "Seraphina the Arcanist",
        "affinity": "🔮 魔法控場型",
        "avatar": "🔮",
        "maxHp": 90,
        "maxMp": 140,
        "baseAtk": 18,
        "skills": [
            {
                "id": "sera_s1",
                "name": "詞義風暴 (Spellstorm)",
                "cost": 45,
                "desc": "奧術重擊造成 48 點魔法傷害，並汲取敵方 15 MP。",
                "damage": 48,
                "drainMp": 15
            },
            {
                "id": "sera_s2",
                "name": "全知領域 (Omniscience)",
                "cost": 40,
                "desc": "啟動智慧之眼，下回合答題時自動替自己排除一個錯誤選項！",
                "eliminateOption": True
            }
        ],
        "passive": "【奧術湧動】：每回合開始自動恢復 12 點 MP！"
    },
    "bork": {
        "name": "戰狂獵手・巴克",
        "title": "Bork the Berserker",
        "affinity": "🩸 賣血狂暴型",
        "avatar": "🪓",
        "maxHp": 130,
        "maxMp": 90,
        "baseAtk": 28,
        "skills": [
            {
                "id": "bork_s1",
                "name": "嗜血強襲 (Blood Strike)",
                "cost": 30,
                "desc": "扣除自身 10 HP，對敵人造成 45 點重擊並吸血 15 HP。",
                "selfDmg": 10,
                "damage": 45,
                "heal": 15
            },
            {
                "id": "bork_s2",
                "name": "不滅狂怒 (Immortal Roar)",
                "cost": 55,
                "desc": "極限反擊！自身生命越低傷害越高（造成 35~80 點傷害）。",
                "berserkScale": True
            }
        ],
        "passive": "【血性覺醒】：選擇「放棄防禦扣血」時獲得雙倍怒氣 (MP +35)！"
    }
}

DEFAULT_VOCAB = [
    {"word": "comprehensive", "definition": "全面的；綜合的"},
    {"word": "implement", "definition": "實施；貫徹；執行"},
    {"word": "perseverance", "definition": "毅力；堅持不懈"},
    {"word": "collaborate", "definition": "合作；協同工作"},
    {"word": "sustainable", "definition": "永續的；可持續的"},
    {"word": "innovation", "definition": "創新；革新"},
    {"word": "resilient", "definition": "具韌性的；有適應力的"},
    {"word": "accommodate", "definition": "容納；為...提供住宿"},
    {"word": "fluctuate", "definition": "波動；起伏不定"},
    {"word": "ambiguous", "definition": "模稜兩可的；含糊不清的"},
    {"word": "negotiate", "definition": "談判；協商"},
    {"word": "deteriorate", "definition": "惡化；退化"},
    {"word": "crucial", "definition": "至關重要的；關鍵的"},
    {"word": "perspective", "definition": "觀點；遠景"},
    {"word": "inevitable", "definition": "不可避免的；必然的"}
]

class PKPvPManager:
    def __init__(self):
        self.rooms = {}
        self.lock = threading.Lock()

    def _generate_room_code(self):
        """生成 6 位隨機邀請碼，如 PW-8924"""
        for _ in range(50):
            code = f"PW-{random.randint(1000, 9999)}"
            if code not in self.rooms:
                return code
        return f"PW-{int(time.time()) % 10000:04d}"

    def _clean_expired_rooms(self):
        """清除超過 45 分鐘無活動的房間"""
        now = time.time()
        expired = [c for c, r in self.rooms.items() if now - r.get("lastActive", now) > 2700]
        for c in expired:
            del self.rooms[c]

    def create_room(self, host_name, char_id, deck_words=None, deck_name="核心字彙庫"):
        with self.lock:
            self._clean_expired_rooms()
            code = self._generate_room_code()
            p1_token = f"p1_{int(time.time() * 1000)}_{random.randint(100, 999)}"

            if not char_id or char_id not in CHAR_STATS:
                char_id = "aria"
            char_data = CHAR_STATS[char_id]

            if not deck_words or len(deck_words) < 2:
                deck_words = DEFAULT_VOCAB[:]

            room = {
                "code": code,
                "createdAt": time.time(),
                "lastActive": time.time(),
                "state": "WAITING",  # WAITING, READY, QUESTION, DECISION, RESOLUTION, GAME_OVER, ABANDONED
                "deckName": deck_name or "自選題庫",
                "deckWords": deck_words,
                "round": 0,
                "roundStartTime": 0,
                "roundDuration": 10,
                "currentQ": None,
                "decision": None,
                "resolutionData": None,
                "resolutionUntil": 0,
                "winner": None,
                "p1": {
                    "token": p1_token,
                    "name": (host_name or "玩家 1").strip()[:16],
                    "charId": char_id,
                    "char": char_data,
                    "hp": char_data["maxHp"],
                    "maxHp": char_data["maxHp"],
                    "mp": 30,
                    "maxMp": char_data["maxMp"],
                    "shield": 0,
                    "answer": None,
                    "answerTime": None,
                    "action": None,
                    "eliminated": False,
                    "timeBonus": False
                },
                "p2": None,
                "logs": [f"🎉 房間【{code}】已成功建立！等待挑戰者輸入邀請碼連線..."]
            }
            self.rooms[code] = room
            return {
                "success": True,
                "roomCode": code,
                "playerId": p1_token,
                "room": self._format_room_view(room, p1_token)
            }

    def join_room(self, room_code, guest_name, char_id):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            self._clean_expired_rooms()
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": f"找不到房間【{room_code}】，請確認邀請碼是否正確！"}
            if room["state"] != "WAITING" and room["p2"] is not None:
                return {"success": False, "message": "此房間已經滿員或正在戰鬥中！"}

            p2_token = f"p2_{int(time.time() * 1000)}_{random.randint(100, 999)}"
            if not char_id or char_id not in CHAR_STATS:
                char_id = "leon"
            char_data = CHAR_STATS[char_id]

            room["p2"] = {
                "token": p2_token,
                "name": (guest_name or "玩家 2").strip()[:16],
                "charId": char_id,
                "char": char_data,
                "hp": char_data["maxHp"],
                "maxHp": char_data["maxHp"],
                "mp": 30,
                "maxMp": char_data["maxMp"],
                "shield": 0,
                "answer": None,
                "answerTime": None,
                "action": None,
                "eliminated": False,
                "timeBonus": False
            }
            room["state"] = "READY"
            room["lastActive"] = time.time()
            msg = f"⚔️ 挑戰者【{room['p2']['name']}】({char_data['name']}) 成功加入！等待房主開始對戰。"
            room["logs"].append(msg)

            return {
                "success": True,
                "roomCode": room_code,
                "playerId": p2_token,
                "room": self._format_room_view(room, p2_token)
            }

    def start_battle(self, room_code, player_id):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": "房間不存在！"}
            if room["p1"]["token"] != player_id:
                return {"success": False, "message": "只有房主可以發起戰鬥！"}
            if not room["p2"]:
                return {"success": False, "message": "對手尚未加入房間，無法開始！"}

            self._setup_round_question(room)
            room["lastActive"] = time.time()
            return {"success": True, "room": self._format_room_view(room, player_id)}

    def _setup_round_question(self, room):
        room["round"] += 1
        p1 = room["p1"]
        p2 = room["p2"]

        p1["answer"] = None
        p1["answerTime"] = None
        p1["action"] = None
        p2["answer"] = None
        p2["answerTime"] = None
        p2["action"] = None

        # 被動：賽拉奧術回魔
        if p1["charId"] == "seraphina":
            p1["mp"] = min(p1["maxMp"], p1["mp"] + 12)
        if p2["charId"] == "seraphina":
            p2["mp"] = min(p2["maxMp"], p2["mp"] + 12)

        # 每回合護盾半衰
        p1["shield"] = p1["shield"] // 2
        p2["shield"] = p2["shield"] // 2

        deck = room["deckWords"]
        target = random.choice(deck)
        distractors = [w for w in deck if w["word"] != target["word"]]
        random.shuffle(distractors)
        distractors = distractors[:3]

        is_en_to_zh = random.random() > 0.3
        if is_en_to_zh:
            stem = target["word"]
            answer = target["definition"]
            opts = [target["definition"]] + [d["definition"] for d in distractors]
        else:
            stem = target["definition"]
            answer = target["word"]
            opts = [target["word"]] + [d["word"] for d in distractors]
        random.shuffle(opts)

        # 答題時長（若有時間加成天賦）
        p1_time = 13 if p1.get("timeBonus") else 10
        p2_time = 13 if p2.get("timeBonus") else 10
        base_time = max(p1_time, p2_time)
        p1["timeBonus"] = False
        p2["timeBonus"] = False

        room["currentQ"] = {
            "targetWord": target["word"],
            "stem": stem,
            "answer": answer,
            "options": opts,
            "isEnToZh": is_en_to_zh
        }
        room["roundDuration"] = base_time
        room["roundStartTime"] = time.time()
        room["state"] = "QUESTION"
        room["decision"] = None
        room["resolutionData"] = None
        room["logs"].append(f"🔔 第 {room['round']} 回合開始！請在 {base_time} 秒內作答！")

    def submit_answer(self, room_code, player_id, answer, time_taken=0):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": "房間不存在！"}
            if room["state"] != "QUESTION":
                return {"success": False, "message": "目前非答題階段！"}

            p = self._get_player_by_token(room, player_id)
            if not p:
                return {"success": False, "message": "非本房間玩家！"}

            p["answer"] = answer
            p["answerTime"] = time_taken
            room["lastActive"] = time.time()

            # 檢查雙方是否都已作答
            self._check_and_progress_room(room)
            return {"success": True, "room": self._format_room_view(room, player_id)}

    def submit_action(self, room_code, player_id, action):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": "房間不存在！"}
            if room["state"] != "DECISION":
                return {"success": False, "message": "目前非攻防決策階段！"}

            p = self._get_player_by_token(room, player_id)
            if not p:
                return {"success": False, "message": "非本房間玩家！"}

            p["action"] = action
            room["lastActive"] = time.time()

            self._check_and_progress_room(room)
            return {"success": True, "room": self._format_room_view(room, player_id)}

    def get_room_state(self, room_code, player_id):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": "房間不存在！"}

            room["lastActive"] = time.time()
            self._check_and_progress_room(room)
            return {"success": True, "room": self._format_room_view(room, player_id)}

    def rematch(self, room_code, player_id):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": False, "message": "房間不存在！"}

            # 重設雙方生命與魔力
            for p_key in ["p1", "p2"]:
                if room.get(p_key):
                    char = room[p_key]["char"]
                    room[p_key]["hp"] = char["maxHp"]
                    room[p_key]["mp"] = 30
                    room[p_key]["shield"] = 0
                    room[p_key]["answer"] = None
                    room[p_key]["action"] = None
                    room[p_key]["eliminated"] = False
                    room[p_key]["timeBonus"] = False

            room["round"] = 0
            room["winner"] = None
            room["state"] = "READY"
            room["logs"].append("🔄 雙方已重置狀態，即將展開全新對決！")
            room["lastActive"] = time.time()
            return {"success": True, "room": self._format_room_view(room, player_id)}

    def leave_room(self, room_code, player_id):
        room_code = (room_code or "").strip().upper()
        with self.lock:
            room = self.rooms.get(room_code)
            if not room:
                return {"success": True}
            p = self._get_player_by_token(room, player_id)
            name = p["name"] if p else "玩家"
            room["state"] = "ABANDONED"
            room["logs"].append(f"🏳️【{name}】已退出或棄賽！房間已終止。")
            return {"success": True}

    def _get_player_by_token(self, room, token):
        if room["p1"] and room["p1"]["token"] == token:
            return room["p1"]
        if room["p2"] and room["p2"]["token"] == token:
            return room["p2"]
        return None

    def _check_and_progress_room(self, room):
        now = time.time()
        # 1. 處理答題階段逾時與切換
        if room["state"] == "QUESTION":
            elapsed = now - room["roundStartTime"]
            time_is_up = (elapsed >= room["roundDuration"] + 1.2)

            if time_is_up:
                if room["p1"]["answer"] is None:
                    room["p1"]["answer"] = "__TIMEOUT__"
                if room["p2"]["answer"] is None:
                    room["p2"]["answer"] = "__TIMEOUT__"

            both_answered = (room["p1"]["answer"] is not None and room["p2"]["answer"] is not None)
            if both_answered:
                # 判定答題正誤
                target_ans = room["currentQ"]["answer"]
                p1_corr = (room["p1"]["answer"] == target_ans)
                p2_corr = (room["p2"]["answer"] == target_ans)

                room["decision"] = {
                    "p1Correct": p1_corr,
                    "p2Correct": p2_corr,
                    "answer": target_ans,
                    "targetWord": room["currentQ"]["targetWord"],
                    "phase": "DECISION"
                }
                room["state"] = "DECISION"
                room["decisionStartTime"] = now
                room["logs"].append(
                    f"📝 答題結算：【{room['p1']['name']}】{'答對 ✓' if p1_corr else '答錯 ✗'}，"
                    f"【{room['p2']['name']}】{'答對 ✓' if p2_corr else '答錯 ✗'}！"
                )

        # 2. 處理決策階段
        elif room["state"] == "DECISION":
            dec = room["decision"]
            p1_corr = dec["p1Correct"]
            p2_corr = dec["p2Correct"]

            elapsed_dec = now - room.get("decisionStartTime", now)
            dec_timeout = (elapsed_dec > 12.0)

            # 確定誰需要做動作
            need_p1 = True
            need_p2 = True

            if dec_timeout:
                # 逾時自動補充預設動作
                if room["p1"]["action"] is None:
                    room["p1"]["action"] = "player_basic_attack" if p1_corr else "player_defend"
                if room["p2"]["action"] is None:
                    room["p2"]["action"] = "player_basic_attack" if p2_corr else "player_defend"

            all_actions_ready = (
                (room["p1"]["action"] is not None) and
                (room["p2"]["action"] is not None)
            )

            if all_actions_ready:
                self._resolve_combat(room)

        # 3. 處理結算展示等待 (RESOLUTION)
        elif room["state"] == "RESOLUTION":
            if now >= room["resolutionUntil"]:
                # 檢查是否有一方血量歸零
                if room["p1"]["hp"] <= 0 or room["p2"]["hp"] <= 0:
                    room["state"] = "GAME_OVER"
                    if room["p1"]["hp"] > 0 and room["p2"]["hp"] <= 0:
                        room["winner"] = room["p1"]["token"]
                        room["logs"].append(f"🏆【{room['p1']['name']}】擊潰對手，榮獲最終勝利！")
                    elif room["p2"]["hp"] > 0 and room["p1"]["hp"] <= 0:
                        room["winner"] = room["p2"]["token"]
                        room["logs"].append(f"🏆【{room['p2']['name']}】擊潰對手，榮獲最終勝利！")
                    else:
                        room["winner"] = "DRAW"
                        room["logs"].append("⚖️ 勢均力敵！雙方同時倒下，戰成平手！")
                else:
                    self._setup_round_question(room)

    def _resolve_combat(self, room):
        p1 = room["p1"]
        p2 = room["p2"]
        dec = room["decision"]
        p1_corr = dec["p1Correct"]
        p2_corr = dec["p2Correct"]

        p1_dmg_taken = 0
        p2_dmg_taken = 0
        p1_heal = 0
        p2_heal = 0
        p1_shield_add = 0
        p2_shield_add = 0
        log_line = ""

        # 情境 A: P1 答對贏，P2 答錯輸 -> P1 攻，P2 守
        if p1_corr and not p2_corr:
            dmg, heal, shield, log_line = self._calc_attack_defense(p1, p2, p1["action"], p2["action"])
            p2_dmg_taken = dmg
            p1_heal = heal
            p1_shield_add = shield

        # 情境 B: P2 答對贏，P1 答錯輸 -> P2 攻，P1 守
        elif p2_corr and not p1_corr:
            dmg, heal, shield, log_line = self._calc_attack_defense(p2, p1, p2["action"], p1["action"])
            p1_dmg_taken = dmg
            p2_heal = heal
            p2_shield_add = shield

        # 情境 C: 雙方皆答對 -> 互拼交鋒
        elif p1_corr and p2_corr:
            p1_dmg_taken = 12
            p2_dmg_taken = 12
            p1["mp"] = min(p1["maxMp"], p1["mp"] + 15)
            p2["mp"] = min(p2["maxMp"], p2["mp"] + 15)
            log_line = f"⚡ 雙方皆答對！刀光交錯！【{p1['name']}】與【{p2['name']}】各受 12 傷害，各得 15 MP！"

        # 情境 D: 雙方皆答錯 -> 僵持重整
        else:
            p1_dmg_taken = 5
            p2_dmg_taken = 5
            log_line = "💨 雙方皆答錯！各自失誤僵持，體力微耗 5 點，進入下輪！"

        # 護盾抵扣與扣血
        p1_actual = self._apply_damage(p1, p1_dmg_taken)
        p2_actual = self._apply_damage(p2, p2_dmg_taken)

        if p1_heal > 0:
            p1["hp"] = min(p1["maxHp"], p1["hp"] + p1_heal)
        if p2_heal > 0:
            p2["hp"] = min(p2["maxHp"], p2["hp"] + p2_heal)

        if p1_shield_add > 0:
            p1["shield"] += p1_shield_add
        if p2_shield_add > 0:
            p2["shield"] += p2_shield_add

        room["logs"].append(log_line)
        room["resolutionData"] = {
            "p1Damage": p1_dmg_taken,
            "p2Damage": p2_dmg_taken,
            "p1Heal": p1_heal,
            "p2Heal": p2_heal,
            "p1Shield": p1_shield_add,
            "p2Shield": p2_shield_add,
            "log": log_line
        }
        room["state"] = "RESOLUTION"
        room["resolutionUntil"] = time.time() + 2.5

    def _calc_attack_defense(self, atk_player, def_player, atk_act, def_act):
        """計算攻擊方與防守方的傷害與效果"""
        raw_dmg = 0
        heal = 0
        shield = 0
        is_pierce = False
        skill_name = "普通攻擊"

        # 攻擊方行為
        if atk_act == "player_basic_attack":
            raw_dmg = atk_player["char"]["baseAtk"]
            atk_player["mp"] = min(atk_player["maxMp"], atk_player["mp"] + 10)
        elif atk_act.startswith("player_skill_"):
            try:
                s_idx = int(atk_act.split("_")[2])
                skill = atk_player["char"]["skills"][s_idx]
                skill_name = skill["name"]
                atk_player["mp"] = max(0, atk_player["mp"] - skill["cost"])

                if skill.get("pierce"):
                    raw_dmg = skill["damage"]
                    is_pierce = True
                elif skill.get("berserkScale"):
                    missing_pct = 1.0 - (atk_player["hp"] / atk_player["maxHp"])
                    raw_dmg = round(35 + missing_pct * 45)
                else:
                    raw_dmg = skill.get("damage", 0)

                if skill.get("heal"):
                    heal = skill["heal"]
                if skill.get("selfDmg"):
                    atk_player["hp"] = max(1, atk_player["hp"] - skill["selfDmg"])
                if skill.get("shield"):
                    shield = skill["shield"]
                if skill.get("drainMp"):
                    drain = skill["drainMp"]
                    def_player["mp"] = max(0, def_player["mp"] - drain)
                    atk_player["mp"] = min(atk_player["maxMp"], atk_player["mp"] + drain)
                if skill.get("time_bonus"):
                    atk_player["timeBonus"] = True
                if skill.get("eliminateOption"):
                    atk_player["eliminated"] = True
            except Exception:
                raw_dmg = atk_player["char"]["baseAtk"]

        # 防守方行為
        final_dmg = raw_dmg
        def_text = ""

        if is_pierce:
            def_text = f"💥 破防打擊！對【{def_player['name']}】造成 {final_dmg} 點致命真實傷害！"
        elif def_act == "player_defend":
            # 艾莉亞閃避被動
            if def_player["charId"] == "aria" and random.random() < 0.35:
                final_dmg = 0
                def_text = f"💨【{def_player['name']}】觸發【疾風步】，完美閃避了攻擊！"
            else:
                def_rate = 0.3 if def_player["charId"] == "leon" else 0.5
                final_dmg = round(raw_dmg * def_rate)
                def_player["mp"] = min(def_player["maxMp"], def_player["mp"] + 10)
                def_text = f"🛡️【{def_player['name']}】防禦姿態減傷，僅受到 {final_dmg} 點傷害，並回復 10 MP！"
        else:
            # 扣血硬抗
            rage = 35 if def_player["charId"] == "bork" else 25
            def_player["mp"] = min(def_player["maxMp"], def_player["mp"] + rage)
            def_text = f"💥【{def_player['name']}】放棄防禦扣血！承受全額 {final_dmg} 點重創，爆發怒氣 (+{rage} MP)！"

        log_msg = f"⚔️【{atk_player['name']}】釋放【{skill_name}】！{def_text}"
        return final_dmg, heal, shield, log_msg

    def _apply_damage(self, player, dmg):
        """扣除護盾與血量"""
        rem_dmg = dmg
        if player["shield"] > 0:
            if player["shield"] >= rem_dmg:
                player["shield"] -= rem_dmg
                rem_dmg = 0
            else:
                rem_dmg -= player["shield"]
                player["shield"] = 0
        player["hp"] = max(0, player["hp"] - rem_dmg)
        return rem_dmg

    def _format_room_view(self, room, player_id):
        """將房間狀態格式化給特定玩家，遮蔽作答中的題目答案"""
        is_p1 = (room["p1"]["token"] == player_id)
        me = room["p1"] if is_p1 else room["p2"]
        opp = room["p2"] if is_p1 else room["p1"]

        # 答題時隱藏答案
        client_q = None
        if room["currentQ"]:
            show_ans = (room["state"] in ["DECISION", "RESOLUTION", "GAME_OVER"])
            client_q = {
                "targetWord": room["currentQ"]["targetWord"],
                "stem": room["currentQ"]["stem"],
                "options": room["currentQ"]["options"],
                "isEnToZh": room["currentQ"]["isEnToZh"],
                "answer": room["currentQ"]["answer"] if show_ans else None
            }

        elapsed = time.time() - room.get("roundStartTime", time.time())
        time_left = max(0, int(room.get("roundDuration", 10) - elapsed))

        return {
            "code": room["code"],
            "state": room["state"],
            "round": room["round"],
            "roundDuration": room["roundDuration"],
            "timeLeft": time_left if room["state"] == "QUESTION" else 0,
            "deckName": room["deckName"],
            "currentQ": client_q,
            "decision": room["decision"],
            "resolutionData": room["resolutionData"],
            "isHost": is_p1,
            "winner": room["winner"],
            "logs": room["logs"][-12:],
            "me": {
                "token": me["token"] if me else "",
                "name": me["name"] if me else "",
                "charId": me["charId"] if me else "",
                "char": me["char"] if me else None,
                "hp": me["hp"] if me else 0,
                "maxHp": me["maxHp"] if me else 0,
                "mp": me["mp"] if me else 0,
                "maxMp": me["maxMp"] if me else 0,
                "shield": me["shield"] if me else 0,
                "hasAnswered": (me["answer"] is not None) if me else False,
                "hasAction": (me["action"] is not None) if me else False,
                "eliminated": me.get("eliminated", False) if me else False
            } if me else None,
            "opponent": {
                "name": opp["name"] if opp else "等待對手加入...",
                "charId": opp["charId"] if opp else "",
                "char": opp["char"] if opp else None,
                "hp": opp["hp"] if opp else 0,
                "maxHp": opp["maxHp"] if opp else 0,
                "mp": opp["mp"] if opp else 0,
                "maxMp": opp["maxMp"] if opp else 0,
                "shield": opp["shield"] if opp else 0,
                "hasAnswered": (opp["answer"] is not None) if opp else False,
                "hasAction": (opp["action"] is not None) if opp else False
            } if opp else None
        }

pvp_manager = PKPvPManager()
