# -*- coding: utf-8 -*-
"""
DailyContentManager: 每日非重複內容池管理核心
負責單字卡、閱讀測驗、文法克漏字之每日輪播、去重及動態換池。
"""
import os
import json
import random
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")
STATE_FILE = os.path.join(DATA_DIR, "daily_pool_state.json")

class DailyContentManager:
    def __init__(self):
        self._ensure_state_file()

    def get_today_str(self):
        """獲取今天日期 (YYYY-MM-DD)"""
        return datetime.now().strftime("%Y-%m-%d")

    def _ensure_state_file(self):
        if not os.path.exists(STATE_FILE):
            initial_state = {
                "vocab": {"served_ids": [], "daily_pools": {}},
                "articles": {"served_ids": [], "daily_pools": {}},
                "quizzes": {"served_ids": [], "daily_pools": {}}
            }
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(initial_state, f, ensure_ascii=False, indent=2)

    def _load_state(self):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {
                "vocab": {"served_ids": [], "daily_pools": {}},
                "articles": {"served_ids": [], "daily_pools": {}},
                "quizzes": {"served_ids": [], "daily_pools": {}}
            }

    def _save_state(self, state):
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[DailyContentManager] Error saving state: {e}")

    def _load_data_file(self, filename):
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    # ==================== 單字卡 (Vocab) ====================
    def get_daily_vocab(self, date_str=None, force_refresh=False, pool_size=10):
        if not date_str:
            date_str = self.get_today_str()

        all_vocab = self._load_data_file("vocab.json")
        if not all_vocab:
            return []

        state = self._load_state()
        v_state = state.setdefault("vocab", {"served_ids": [], "daily_pools": {}})
        served_ids = set(v_state.setdefault("served_ids", []))
        daily_pools = v_state.setdefault("daily_pools", {})

        # 如果已有今日池且非強制換池
        if not force_refresh and date_str in daily_pools and daily_pools[date_str]:
            saved_ids = daily_pools[date_str]
            selected = [v for v in all_vocab if v.get("id") in saved_ids]
            if len(selected) >= min(pool_size, len(all_vocab)):
                return selected

        # 挑選未服務過的單字
        unserved = [v for v in all_vocab if v.get("id") not in served_ids]

        # 若未使用的數量不足 pool_size，重置循環（但保留上一池以避免完全重複）
        if len(unserved) < pool_size:
            served_ids.clear()
            # 如果有前一池，先把前一池加入已服務避免立即重複
            last_ids = daily_pools.get(date_str, [])
            for lid in last_ids:
                served_ids.add(lid)
            unserved = [v for v in all_vocab if v.get("id") not in served_ids]
            if len(unserved) < pool_size:
                unserved = list(all_vocab)

        # 隨機或按日期洗牌選出 pool_size 個
        random.seed(f"{date_str}-{len(served_ids)}-vocab")
        shuffled = list(unserved)
        random.shuffle(shuffled)
        chosen = shuffled[:pool_size]

        chosen_ids = [v["id"] for v in chosen]
        daily_pools[date_str] = chosen_ids
        for cid in chosen_ids:
            served_ids.add(cid)

        v_state["served_ids"] = list(served_ids)
        self._save_state(state)
        return chosen

    # ==================== 閱讀測驗 (Articles) ====================
    def get_daily_articles(self, date_str=None, force_refresh=False, pool_size=2):
        if not date_str:
            date_str = self.get_today_str()

        all_articles = self._load_data_file("articles.json")
        if not all_articles:
            return []

        state = self._load_state()
        a_state = state.setdefault("articles", {"served_ids": [], "daily_pools": {}})
        served_ids = set(a_state.setdefault("served_ids", []))
        daily_pools = a_state.setdefault("daily_pools", {})

        if not force_refresh and date_str in daily_pools and daily_pools[date_str]:
            saved_ids = daily_pools[date_str]
            selected = [a for a in all_articles if a.get("id") in saved_ids]
            if len(selected) >= min(pool_size, len(all_articles)):
                return selected

        unserved = [a for a in all_articles if a.get("id") not in served_ids]
        if len(unserved) < pool_size:
            served_ids.clear()
            last_ids = daily_pools.get(date_str, [])
            for lid in last_ids:
                served_ids.add(lid)
            unserved = [a for a in all_articles if a.get("id") not in served_ids]
            if len(unserved) < pool_size:
                unserved = list(all_articles)

        random.seed(f"{date_str}-{len(served_ids)}-articles")
        shuffled = list(unserved)
        random.shuffle(shuffled)
        chosen = shuffled[:pool_size]

        chosen_ids = [a["id"] for a in chosen]
        daily_pools[date_str] = chosen_ids
        for cid in chosen_ids:
            served_ids.add(cid)

        a_state["served_ids"] = list(served_ids)
        self._save_state(state)
        return chosen

    # ==================== 文法克漏字 (Quizzes) ====================
    def get_daily_quizzes(self, date_str=None, force_refresh=False, pool_size=5):
        if not date_str:
            date_str = self.get_today_str()

        all_quizzes = self._load_data_file("quizzes.json")
        if not all_quizzes:
            return []

        state = self._load_state()
        q_state = state.setdefault("quizzes", {"served_ids": [], "daily_pools": {}})
        served_ids = set(q_state.setdefault("served_ids", []))
        daily_pools = q_state.setdefault("daily_pools", {})

        if not force_refresh and date_str in daily_pools and daily_pools[date_str]:
            saved_ids = daily_pools[date_str]
            selected = [q for q in all_quizzes if q.get("id") in saved_ids]
            if len(selected) >= min(pool_size, len(all_quizzes)):
                return selected

        unserved = [q for q in all_quizzes if q.get("id") not in served_ids]
        if len(unserved) < pool_size:
            served_ids.clear()
            last_ids = daily_pools.get(date_str, [])
            for lid in last_ids:
                served_ids.add(lid)
            unserved = [q for q in all_quizzes if q.get("id") not in served_ids]
            if len(unserved) < pool_size:
                unserved = list(all_quizzes)

        random.seed(f"{date_str}-{len(served_ids)}-quizzes")
        shuffled = list(unserved)
        random.shuffle(shuffled)
        chosen = shuffled[:pool_size]

        chosen_ids = [q["id"] for q in chosen]
        daily_pools[date_str] = chosen_ids
        for cid in chosen_ids:
            served_ids.add(cid)

        q_state["served_ids"] = list(served_ids)
        self._save_state(state)
        return chosen

    # ==================== 首頁學習總覽 (Daily Overview) ====================
    def get_overview(self, date_str=None, force_refresh=False):
        if not date_str:
            date_str = self.get_today_str()

        vocab = self.get_daily_vocab(date_str, force_refresh=force_refresh, pool_size=10)
        articles = self.get_daily_articles(date_str, force_refresh=force_refresh, pool_size=2)
        quizzes = self.get_daily_quizzes(date_str, force_refresh=force_refresh, pool_size=5)

        featured_article = articles[0] if articles else None
        
        return {
            "date": date_str,
            "vocab": {
                "count": len(vocab),
                "items": vocab,
                "preview": [{"word": v["word"], "definition": v["definition"], "pos": v.get("pos", "")} for v in vocab[:4]]
            },
            "article": {
                "count": len(articles),
                "items": articles,
                "featured": featured_article
            },
            "quiz": {
                "count": len(quizzes),
                "items": quizzes,
                "first_question": quizzes[0]["question"] if quizzes else ""
            }
        }

daily_manager = DailyContentManager()
