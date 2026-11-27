import os
import re
import sys
import json
import time
import base64
import io
import logging
import secrets
import hashlib
import threading
from datetime import timedelta, datetime, timezone
from urllib.parse import urlencode
from flask import Flask, request, jsonify, render_template, send_from_directory, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
import requests
from dotenv import load_dotenv
from PIL import Image, ImageOps, ImageEnhance

# 設定編碼以防止 Windows 繁體中文控制台亂碼
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 讀取當前或上一層目錄的 .env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
from daily_content_manager import daily_manager
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(PARENT_DIR, ".env"))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# 載入 API KEY 與 MODEL 設定
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

# Google 登入（OAuth 2.0）設定
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "").strip()

DATA_DIR = os.path.join(BASE_DIR, "data")


def _get_secret_key():
    """取得 Flask session 簽章金鑰：優先用環境變數，否則在 data/ 產生並持久化。"""
    env_key = os.getenv("SECRET_KEY") or os.getenv("FLASK_SECRET_KEY")
    if env_key:
        return env_key
    key_path = os.path.join(DATA_DIR, ".secret_key")
    try:
        if os.path.exists(key_path):
            with open(key_path, "r", encoding="utf-8") as f:
                existing = f.read().strip()
                if existing:
                    return existing
        os.makedirs(DATA_DIR, exist_ok=True)
        new_key = secrets.token_hex(32)
        with open(key_path, "w", encoding="utf-8") as f:
            f.write(new_key)
        return new_key
    except Exception as exc:
        logging.warning(f"Secret key file unavailable, using in-memory key: {exc}")
        return secrets.token_hex(32)


app.secret_key = _get_secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=90),
)

# 部署在 Render 等反向代理後方時，讓 url_for(_external=True) 產生正確的 https 網址
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1, x_for=1)


@app.after_request
def _no_cache_html(response):
    """HTML 一律不快取，避免使用者看到改版前的舊畫面。"""
    if response.mimetype == "text/html":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/vocab", methods=["GET"])
def get_vocab():
    if request.args.get("all") == "1":
        data = load_json("vocab.json")
        return jsonify({"success": True, "data": data, "is_daily": False})
    refresh = request.args.get("refresh") in ["1", "true", "True"]
    data = daily_manager.get_daily_vocab(force_refresh=refresh)
    return jsonify({"success": True, "data": data, "is_daily": True, "date": daily_manager.get_today_str()})

@app.route("/api/articles", methods=["GET"])
def get_articles():
    if request.args.get("all") == "1":
        data = load_json("articles.json")
        return jsonify({"success": True, "data": data, "is_daily": False})
    refresh = request.args.get("refresh") in ["1", "true", "True"]
    data = daily_manager.get_daily_articles(force_refresh=refresh)
    return jsonify({"success": True, "data": data, "is_daily": True, "date": daily_manager.get_today_str()})

@app.route("/api/quizzes", methods=["GET"])
def get_quizzes():
    if request.args.get("all") == "1":
        data = load_json("quizzes.json")
        return jsonify({"success": True, "data": data, "is_daily": False})
    refresh = request.args.get("refresh") in ["1", "true", "True"]
    data = daily_manager.get_daily_quizzes(force_refresh=refresh)
    return jsonify({"success": True, "data": data, "is_daily": True, "date": daily_manager.get_today_str()})

@app.route("/api/daily/overview", methods=["GET"])
def get_daily_overview():
    refresh = request.args.get("refresh") in ["1", "true", "True"]
    overview = daily_manager.get_overview(force_refresh=refresh)
    return jsonify({"success": True, "data": overview})

@app.route("/api/daily/refresh", methods=["POST"])
def refresh_daily_pool():
    req = request.get_json(silent=True) or {}
    target = req.get("module", "all")
    if target in ["all", "vocab"]:
        daily_manager.get_daily_vocab(force_refresh=True)
    if target in ["all", "articles", "reading"]:
        daily_manager.get_daily_articles(force_refresh=True)
    if target in ["all", "quizzes", "quiz"]:
        daily_manager.get_daily_quizzes(force_refresh=True)
    overview = daily_manager.get_overview()
    return jsonify({"success": True, "data": overview, "message": "已成功更新為最新非重複學習池！"})

@app.route("/api/scenarios", methods=["GET"])
def get_scenarios():
    data = load_json("scenarios.json")
    return jsonify({"success": True, "data": data})

@app.route("/api/dict/lookup", methods=["POST"])
def dict_lookup():
    """查詢單字釋義與例句（先查本地資料庫，再智慧匹配）"""
    req = request.get_json(silent=True) or {}
    query_word = req.get("word", "").strip().lower()
    if not query_word:
        return jsonify({"success": False, "message": "Word is required"}), 400

    vocab_list = load_json("vocab.json")
    for item in vocab_list:
        if item["word"].lower() == query_word:
            return jsonify({
                "success": True,
                "found": True,
                "word": item["word"],
                "phonetic": item.get("phonetic", ""),
                "pos": item.get("pos", ""),
                "definition": item.get("definition", ""),
                "englishDef": item.get("englishDef", ""),
                "example": item.get("example", ""),
                "exampleTranslation": item.get("exampleTranslation", ""),
                "collocations": item.get("collocations", [])
            })

    # 若本地庫無完整卡片，亦嘗試從文章字彙庫中比對
    articles = load_json("articles.json")
    for art in articles:
        vocab_map = art.get("vocabulary", {})
        for w, mean in vocab_map.items():
            if w.lower() == query_word:
                return jsonify({
                    "success": True,
                    "found": True,
                    "word": w,
                    "phonetic": "",
                    "pos": "vocabulary",
                    "definition": mean,
                    "englishDef": "",
                    "example": f"Appeared in reading: {art.get('title')}",
                    "exampleTranslation": "",
                    "collocations": []
                })

    return jsonify({
        "success": True,
        "found": False,
        "word": query_word,
        "definition": "（暫無內建離線釋義，建議可使用 AI 導師詢問或加入生字本）"
    })

@app.route("/api/ai/chat", methods=["POST"])
def ai_chat():
    """AI 口說與情境導師：支援 Gemini API 與智慧降級離線回覆"""
    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    scenario_id = data.get("scenarioId", "scenario-job-interview")
    chat_history = data.get("history", [])

    if not user_message:
        return jsonify({"success": False, "message": "Message is required"}), 400

    scenarios = load_json("scenarios.json")
    selected_scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
    role_name = selected_scenario["role"] if selected_scenario else "English Exam Tutor"
    scenario_title = selected_scenario["name"] if selected_scenario else "General English"

    system_instruction = f"""
You are an elite English speaking and exam coach (Role: {role_name}) for a student preparing for TOEIC / High School GSAT / IELTS.
Current Scenario: {scenario_title}.

You must evaluate the student's input and respond in valid JSON format ONLY, without markdown code fences:
{{
  "reply": "Your natural in-character English response (1-3 sentences) engaging the conversation and asking a follow-up question.",
  "grammarFeedback": "Detailed feedback in Traditional Chinese (繁體中文). Point out any grammatical issues, awkward phrasing, or tense/preposition errors in the user's message. If no errors, say '文法完全正確，表達很流暢！'",
  "nativeSuggestion": "A more natural, authentic native-speaker phrasing or higher-level vocabulary alternative for what the user tried to say (with Traditional Chinese explanation).",
  "score": "A number between 70 and 100 evaluating the user's turn",
  "recommendedWords": ["2-3 target exam words related to this topic"]
}}
Be encouraging, professional, and pedagogically insightful.
"""

    if GEMINI_API_KEY:
        try:
            # 支援多個模型版本備援（優先使用穩定快速的 Lite 模型）
            models_to_try = [GEMINI_MODEL, "gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]
            models_to_try = list(dict.fromkeys([m for m in models_to_try if m]))
            for model_name in models_to_try:
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
                
                contents = []
                for turn in chat_history[-6:]:
                    role = "user" if turn.get("role") == "user" else "model"
                    contents.append({
                        "role": role,
                        "parts": [{"text": turn.get("content", "")}]
                    })
                contents.append({
                    "role": "user",
                    "parts": [{"text": user_message}]
                })

                payload = {
                    "contents": contents,
                    "systemInstruction": {
                        "parts": [{"text": system_instruction}]
                    },
                    "generationConfig": {
                        "temperature": 0.7,
                        "responseMimeType": "application/json"
                    }
                }

                resp = requests.post(endpoint, json=payload, timeout=12)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    candidates = resp_json.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
                        # 清理可能被包裹的 ```json
                        if raw_text.startswith("```"):
                            raw_text = raw_text.strip("`")
                            if raw_text.startswith("json"):
                                raw_text = raw_text[4:].strip()
                        parsed = json.loads(raw_text)
                        return jsonify({"success": True, "result": parsed, "model": model_name})
        except Exception as e:
            logging.warning(f"Gemini API request failed: {e}")

    # 智慧模擬降級回覆（確保離線或 API 故障時依然流暢體驗）
    fallback_result = {
        "reply": f"That's an interesting perspective! When considering {scenario_title}, could you elaborate further on how this impacts long-term development?",
        "grammarFeedback": "整體文意通順！注意動詞與介系詞的精準搭配，在檢定考試中多使用多元句型（如分詞構句或倒裝）更能提高分數。",
        "nativeSuggestion": f"你可以嘗試換種更有說服力的方式表達：'From a strategic perspective, {user_message[:30]}...'",
        "score": 85,
        "recommendedWords": ["furthermore", "strategic", "perspective"]
    }
    return jsonify({"success": True, "result": fallback_result, "offlineFallback": True})

# -------------------------------------------------------------
# 雙人線上對決 (PvP 邀請碼對戰系統) API
# -------------------------------------------------------------
from pk_pvp_manager import pvp_manager

@app.route("/api/pk/pvp/create_room", methods=["POST"])
def pk_pvp_create_room():
    data = request.get_json(silent=True) or {}
    host_name = data.get("hostName", "玩家 1")
    char_id = data.get("charId", "aria")
    deck_words = data.get("deckWords", [])
    deck_name = data.get("deckName", "精選對戰題庫")

    res = pvp_manager.create_room(host_name, char_id, deck_words, deck_name)
    return jsonify(res)

@app.route("/api/pk/pvp/join_room", methods=["POST"])
def pk_pvp_join_room():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    guest_name = data.get("guestName", "玩家 2")
    char_id = data.get("charId", "leon")

    res = pvp_manager.join_room(room_code, guest_name, char_id)
    return jsonify(res)

@app.route("/api/pk/pvp/start_battle", methods=["POST"])
def pk_pvp_start_battle():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    player_id = data.get("playerId", "")

    res = pvp_manager.start_battle(room_code, player_id)
    return jsonify(res)

@app.route("/api/pk/pvp/room_state", methods=["GET"])
def pk_pvp_room_state():
    room_code = request.args.get("code", "")
    player_id = request.args.get("playerId", "")

    res = pvp_manager.get_room_state(room_code, player_id)
    return jsonify(res)

@app.route("/api/pk/pvp/submit_answer", methods=["POST"])
def pk_pvp_submit_answer():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    player_id = data.get("playerId", "")
    answer = data.get("answer", "")
    time_taken = data.get("timeTaken", 0)

    res = pvp_manager.submit_answer(room_code, player_id, answer, time_taken)
    return jsonify(res)

@app.route("/api/pk/pvp/submit_action", methods=["POST"])
def pk_pvp_submit_action():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    player_id = data.get("playerId", "")
    action = data.get("action", "")

    res = pvp_manager.submit_action(room_code, player_id, action)
    return jsonify(res)

@app.route("/api/pk/pvp/rematch", methods=["POST"])
def pk_pvp_rematch():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    player_id = data.get("playerId", "")

    res = pvp_manager.rematch(room_code, player_id)
    return jsonify(res)

@app.route("/api/pk/pvp/leave_room", methods=["POST"])
def pk_pvp_leave_room():
    data = request.get_json(silent=True) or {}
    room_code = data.get("roomCode", "")
    player_id = data.get("playerId", "")

    res = pvp_manager.leave_room(room_code, player_id)
    return jsonify(res)

def robust_json_parse(raw_text):
    """強健 JSON 解析器，支援 Markdown 剝離與結尾括號自動補齊修復"""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 嘗試尋找最後一個完整閉合的物件 '}' 並自動封閉陣列 ']'
        last_brace = text.rfind("}")
        if last_brace != -1:
            repaired = text[:last_brace + 1].strip()
            if not repaired.endswith("]"):
                repaired += "]"
            if not repaired.startswith("["):
                repaired = "[" + repaired
            try:
                return json.loads(repaired)
            except Exception:
                pass
        return []

# -------------------------------------------------------------
# AI 多模態視覺 OCR：從圖片中自動識別並萃取所有英文單字與中文釋義
# -------------------------------------------------------------
# 依實測穩定度排序：Lite 系列回應快（約 3 秒）且不易壅塞，Flash 系列作為高精度備援。
OCR_MODEL_CHAIN = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-flash-latest",
]

# 單一模型請求逾時（秒）。Lite 模型正常 3~10 秒內回應，逾時即換下一個模型。
OCR_REQUEST_TIMEOUT = 45


def _build_ocr_models():
    """建立 OCR 模型嘗試順序：穩定快速的 Lite 優先，.env 指定模型排最後作為補充。"""
    chain = list(OCR_MODEL_CHAIN)
    if GEMINI_MODEL and GEMINI_MODEL not in chain:
        chain.append(GEMINI_MODEL)
    return chain


def _prepare_ocr_image(image_b64):
    """圖片前處理：修正 EXIF 方向、放大過小的截圖、輕度增強對比與銳利度。

    回傳 (base64_jpeg, mime_type)。小圖放大是關鍵：手機截圖或縮圖上的細字
    若不放大，模型幾乎無法辨識。
    """
    raw_bytes = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)

    # 透明背景一律填白，避免轉存 JPEG 後透明區域變黑影響辨識
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.split()[-1])
        img = canvas
    elif img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    max_side = max(img.width, img.height)
    # 小圖先放大到約 1600px（最多 3 倍），讓細小字體有足夠像素可供辨識
    if max_side < 1600:
        scale = min(3.0, 1600.0 / max_side)
        if scale > 1.05:
            new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
    # 超大圖縮至 2048px 內，兼顧細節與上傳速度
    if max(img.size) > 2048:
        img.thumbnail((2048, 2048), Image.Resampling.LANCZOS)

    # 輕度自動對比 + 銳化，提升細字邊緣清晰度（過度處理反而有害）
    img = ImageOps.autocontrast(img, cutoff=1)
    img = ImageEnhance.Sharpness(img).enhance(1.4)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8"), "image/jpeg"


def _extract_candidate_text(candidate):
    """從候選回應中取出正式輸出文字（排除 thinking 思考片段）。"""
    texts = []
    for part in (candidate.get("content", {}) or {}).get("parts", []) or []:
        if part.get("thought"):
            continue
        text = part.get("text")
        if text:
            texts.append(text)
    return "\n".join(texts).strip()


def _normalize_ocr_words(items):
    """清理辨識結果：去除編號/項目符號、過濾非英文項目、依單字去重。"""
    cleaned, seen = [], set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()
        # 去掉 "1." "2)" "•" "-" 等編號與項目符號
        word = re.sub(r"^[\s\d\.\)\(、•·\-–—:：]+", "", word).strip()
        if not word or not re.search(r"[A-Za-z]", word):
            continue
        key = re.sub(r"\s+", " ", word.lower())
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({
            "word": word,
            "definition": str(item.get("definition") or "").strip(),
            "pos": str(item.get("pos") or "").strip(),
            "phonetic": str(item.get("phonetic") or "").strip(),
        })
    return cleaned


@app.route("/api/ocr/extract_words", methods=["POST"])
def ocr_extract_words():
    """使用 Gemini 視覺多模態模型精準識別圖片內全部英文單字與中文釋義。

    會依序嘗試多個模型（Lite 優先），遇到 503/429/逾時或辨識為空時自動換下一個，
    避免單一模型忙碌時整個功能失效。
    """
    image_b64 = None
    mime_type = "image/jpeg"
    req_kind = ""

    if request.is_json:
        req_data = request.get_json(silent=True) or {}
        req_kind = str(req_data.get("kind", "") or "").strip().lower()
        raw_b64 = req_data.get("image", "")
        if "base64," in raw_b64:
            header, content = raw_b64.split("base64,", 1)
            image_b64 = content.strip()
            if "image/png" in header:
                mime_type = "image/png"
            elif "image/webp" in header:
                mime_type = "image/webp"
            elif "image/gif" in header:
                mime_type = "image/gif"
        else:
            image_b64 = raw_b64.strip()
    elif "image" in request.files:
        f = request.files["image"]
        mime_type = f.content_type or "image/jpeg"
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    if not image_b64:
        return jsonify({"success": False, "message": "請上傳欲辨識的單字圖片！"}), 400

    if not GEMINI_API_KEY:
        return jsonify({
            "success": False,
            "message": "系統未設定 GEMINI_API_KEY，請於 .env 配置後使用！"
        }), 500

    # 圖片預先最佳化：修正方向、放大過小的截圖、增強對比與銳利度
    try:
        image_b64, mime_type = _prepare_ocr_image(image_b64)
    except Exception as img_err:
        logging.warning(f"Image preprocess skipped: {img_err}")

    prompt = """
You are an expert English lexicographer and high-precision visual OCR recognition engine.
The user has provided an image containing English vocabulary (e.g. textbook page, vocabulary list, exam paper, worksheet, flashcard set, multi-column glossary, or handwritten notes).

EXHAUSTIVE EXTRACTION MANDATE:
1. Scan EVERY region of the image from top to bottom, including all columns, sidebars, footnotes, word boxes, "Vocabulary" sections, and tables.
2. Extract 100% of ALL distinct English vocabulary words and phrases visible. Do NOT summarize, skip, truncate, or sample.
3. Include words even if they only appear inside example sentences or a reading passage when the image looks like a vocabulary/lesson page. Skip pure grammar labels, page numbers, and publisher names.
4. For each vocabulary item, provide:
   - "word": The clean English word or phrase, lowercase unless it is a proper noun (strip numbering like "1.", "2.", "•").
   - "definition": Accurate Traditional Chinese (繁體中文) translation. If Chinese definitions exist in the image, transcribe and clean them; if the image only has English, translate accurately into Traditional Chinese.
   - "pos": Part of speech (e.g., n., v., adj., adv., phr., idiom).
   - "phonetic": IPA phonetic symbol (e.g., /kəmˈpliːt/). Leave as "" if unknown.
5. Keep each definition short (2-12 Chinese characters). Do NOT generate example sentences.
6. Return ONLY a valid JSON array of objects with NO markdown formatting:
[
  {
    "word": "perseverance",
    "definition": "毅力；堅持不懈",
    "pos": "n.",
    "phonetic": "/ˌpɝː.səˈvɪr.əns/"
  }
]
If the image truly contains no English vocabulary, return an empty array: [].
"""

    if req_kind == "phrase":
        prompt += """
FOCUS MODE: PHRASES (片語).
The user is building a PHRASE book, not a single-word list.
- Prioritise multi-word expressions: phrasal verbs (look forward to), collocations (make progress), idioms (once in a blue moon), fixed phrases (in charge of), and prepositional phrases.
- Keep the whole phrase together in the "word" field (do not split it into separate words).
- If a section contains only single words, still include them so nothing is missed.
"""

    models_to_try = _build_ocr_models()
    last_error = ""

    # 兩輪嘗試：第一輪依序跑完所有模型；若全部失敗（例如同時忙碌），稍候再跑一輪
    for round_idx in range(2):
        for model_name in models_to_try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": image_b64
                            }
                        }
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 8192,
                    "responseMimeType": "application/json"
                }
            }

            try:
                resp = requests.post(endpoint, json=payload, timeout=OCR_REQUEST_TIMEOUT)
            except requests.exceptions.Timeout:
                last_error = f"{model_name} 回應逾時（>{OCR_REQUEST_TIMEOUT}s）"
                logging.warning(f"OCR model {model_name} timeout")
                continue
            except Exception as e:
                last_error = f"{model_name}: {e}"
                logging.warning(f"OCR model {model_name} failed: {e}")
                continue

            if resp.status_code != 200:
                last_error = f"{model_name} HTTP {resp.status_code}: {resp.text[:120]}"
                logging.warning(last_error)
                # 429/503 代表模型忙碌，直接換下一個模型
                continue

            try:
                resp_json = resp.json()
            except Exception:
                last_error = f"{model_name} 回應格式錯誤"
                continue

            candidates = resp_json.get("candidates", [])
            if not candidates:
                last_error = f"{model_name} 未回傳辨識結果"
                continue

            raw_text = _extract_candidate_text(candidates[0])
            parsed = robust_json_parse(raw_text)
            raw_words = parsed if isinstance(parsed, list) else (parsed.get("words", []) if isinstance(parsed, dict) else [])
            word_list = _normalize_ocr_words(raw_words)

            if word_list:
                return jsonify({
                    "success": True,
                    "words": word_list,
                    "count": len(word_list),
                    "model": model_name
                })

            # 200 但沒有辨識到單字 → 換下一個模型再試（避免單一模型漏看）
            last_error = f"{model_name} 未辨識到單字"

        if round_idx == 0:
            time.sleep(1.5)

    return jsonify({
        "success": False,
        "message": "AI 圖片辨識暫時無法完成（模型忙碌或逾時）。請稍等 10~30 秒後再按一次「重新辨識圖片單字」。",
        "detail": last_error
    }), 503


# -------------------------------------------------------------
# 使用者帳號與雲端同步（登入後生字本 / 片語本永久保存）
# -------------------------------------------------------------
USERS_FILE = os.path.join(DATA_DIR, "users.json")
USER_DATA_DIR = os.path.join(DATA_DIR, "user_data")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_\u4e00-\u9fff]{2,24}$")
MAX_STATE_ITEMS = 5000
_state_lock = threading.RLock()


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _atomic_write_json(path, data):
    """以暫存檔 + os.replace 原子寫入，避免寫到一半損毀。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def _load_users():
    with _state_lock:
        if not os.path.exists(USERS_FILE):
            return {}
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception as exc:
            logging.warning(f"Failed to load users: {exc}")
            return {}


def _save_users(users):
    with _state_lock:
        _atomic_write_json(USERS_FILE, users)


def _user_state_path(user_key):
    digest = hashlib.sha256(user_key.encode("utf-8")).hexdigest()[:32]
    return os.path.join(USER_DATA_DIR, f"{digest}.json")


def _user_backup_path(user_key):
    digest = hashlib.sha256(user_key.encode("utf-8")).hexdigest()[:32]
    return os.path.join(USER_DATA_DIR, f"{digest}.bak.json")


def _empty_state():
    return {"wordbook": [], "phrases": [], "mastered": [], "stats": {}, "updatedAt": _now_iso()}


def _load_user_state(user_key):
    path = _user_state_path(user_key)
    if not os.path.exists(path):
        return _empty_state()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        logging.warning(f"Failed to load user state: {exc}")
        return _empty_state()
    state = _empty_state()
    if isinstance(data, dict):
        for field in ("wordbook", "phrases", "mastered"):
            if isinstance(data.get(field), list):
                state[field] = data[field]
        if isinstance(data.get("stats"), dict):
            state["stats"] = data["stats"]
        if data.get("updatedAt"):
            state["updatedAt"] = data["updatedAt"]
    return state


def _clean_entries(items):
    """清洗單字／片語清單，限制欄位長度與筆數，避免惡意或異常資料。"""
    cleaned = []
    if not isinstance(items, list):
        return cleaned
    for item in items[:MAX_STATE_ITEMS]:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()[:200]
        if not word:
            continue
        cleaned.append({
            "word": word,
            "phonetic": str(item.get("phonetic") or "")[:120],
            "pos": str(item.get("pos") or "")[:40],
            "definition": str(item.get("definition") or "")[:1000],
            "example": str(item.get("example") or "")[:2000],
            "exampleTranslation": str(item.get("exampleTranslation") or "")[:2000],
            "dateAdded": str(item.get("dateAdded") or "")[:40],
            "kind": str(item.get("kind") or "")[:20],
        })
    return cleaned


def _merge_entry_lists(existing, incoming):
    """以單字為鍵合併兩份清單：先保留既有資料，再以非空欄位補上新資料。"""
    merged, order = {}, []
    for item in (existing or []) + (incoming or []):
        if not isinstance(item, dict):
            continue
        word = str(item.get("word", "")).strip()
        if not word:
            continue
        key = word.lower()
        if key not in merged:
            merged[key] = dict(item)
            order.append(key)
            continue
        base = merged[key]
        for field, value in item.items():
            if value not in (None, ""):
                base[field] = value
            elif field not in base:
                base[field] = value
    return [merged[key] for key in order]


def _merge_states(existing, incoming):
    """合併兩份使用者狀態，確保任何一邊的收藏都不會被覆蓋消失。"""
    result = _empty_state()
    result["wordbook"] = _merge_entry_lists(existing.get("wordbook"), incoming.get("wordbook"))
    result["phrases"] = _merge_entry_lists(existing.get("phrases"), incoming.get("phrases"))

    mastered = []
    for value in (existing.get("mastered") or []) + (incoming.get("mastered") or []):
        text = str(value)
        if text and text not in mastered:
            mastered.append(text)
    result["mastered"] = mastered[:MAX_STATE_ITEMS]

    stats = {}
    for source in (existing.get("stats") or {}, incoming.get("stats") or {}):
        if not isinstance(source, dict):
            continue
        for key, value in source.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                stats[key] = max(stats.get(key, 0), value)
            elif isinstance(value, str):
                stats[key] = value
    result["stats"] = stats
    result["updatedAt"] = _now_iso()
    return result


def _current_user_key():
    key = session.get("user")
    if not key:
        return None
    return key if key in _load_users() else None


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not USERNAME_RE.match(username):
        return jsonify({"success": False, "message": "帳號需為 2~24 個字元（中英文字母、數字或底線）"}), 400
    if len(password) < 4:
        return jsonify({"success": False, "message": "密碼至少需要 4 個字元"}), 400

    user_key = username.lower()
    users = _load_users()
    if user_key in users:
        return jsonify({"success": False, "message": "此帳號已被註冊，請直接登入"}), 409

    users[user_key] = {
        "username": username,
        "passwordHash": generate_password_hash(password),
        "createdAt": _now_iso(),
    }
    _save_users(users)

    session.permanent = True
    session["user"] = user_key
    return jsonify({"success": True, "username": username, "state": _load_user_state(user_key)})


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify({"success": False, "message": "請輸入帳號與密碼"}), 400

    user_key = username.lower()
    user = _load_users().get(user_key)
    if not user or not check_password_hash(user.get("passwordHash", ""), password):
        return jsonify({"success": False, "message": "帳號或密碼錯誤"}), 401

    session.permanent = True
    session["user"] = user_key
    return jsonify({
        "success": True,
        "username": user.get("username", username),
        "state": _load_user_state(user_key),
    })


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"success": True})


# -------------------------------------------------------------
# Google 登入（OAuth 2.0 / OpenID Connect）
# -------------------------------------------------------------
def _google_configured():
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def _google_redirect_uri():
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    return url_for("auth_google_callback", _external=True)


@app.route("/api/auth/google/start", methods=["GET"])
def auth_google_start():
    if not _google_configured():
        return redirect(url_for("index", auth_error="google_not_configured"))

    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": _google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@app.route("/api/auth/google/callback", methods=["GET"])
def auth_google_callback():
    if request.args.get("error"):
        return redirect(url_for("index", auth_error="google_cancelled"))

    expected_state = session.pop("oauth_state", None)
    if not expected_state or request.args.get("state") != expected_state:
        return redirect(url_for("index", auth_error="google_state"))

    code = request.args.get("code", "")
    if not code:
        return redirect(url_for("index", auth_error="google_no_code"))

    try:
        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": _google_redirect_uri(),
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
        token_data = token_resp.json()
    except Exception as exc:
        logging.warning(f"Google token exchange failed: {exc}")
        return redirect(url_for("index", auth_error="google_token"))

    id_token = token_data.get("id_token")
    if not id_token:
        logging.warning(f"Google token response missing id_token: {token_data}")
        return redirect(url_for("index", auth_error="google_token"))

    # 向 Google 驗證 id_token 的簽章與 audience，避免偽造
    try:
        info = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=20,
        ).json()
    except Exception as exc:
        logging.warning(f"Google tokeninfo failed: {exc}")
        return redirect(url_for("index", auth_error="google_token"))

    if info.get("aud") != GOOGLE_CLIENT_ID:
        return redirect(url_for("index", auth_error="google_audience"))
    if str(info.get("email_verified", "")).lower() not in ("true", "1"):
        return redirect(url_for("index", auth_error="google_email"))

    sub = info.get("sub")
    if not sub:
        return redirect(url_for("index", auth_error="google_token"))

    email = str(info.get("email") or "")[:120]
    user_key = f"google:{sub}"
    users = _load_users()
    if user_key not in users:
        display = str(info.get("name") or email or "Google 使用者").strip()[:40]
        users[user_key] = {
            "username": display,
            "email": email,
            "provider": "google",
            "googleSub": sub,
            "createdAt": _now_iso(),
        }
        _save_users(users)

    session.permanent = True
    session["user"] = user_key
    return redirect(url_for("index", login="google"))


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user_key = _current_user_key()
    if not user_key:
        return jsonify({"success": True, "loggedIn": False})
    user = _load_users().get(user_key, {})
    return jsonify({
        "success": True,
        "loggedIn": True,
        "username": user.get("username", user_key),
        "state": _load_user_state(user_key),
    })


@app.route("/api/user/state", methods=["GET"])
def get_user_state():
    user_key = _current_user_key()
    if not user_key:
        return jsonify({"success": False, "message": "請先登入"}), 401
    return jsonify({"success": True, "state": _load_user_state(user_key)})


@app.route("/api/user/state", methods=["PUT"])
def put_user_state():
    user_key = _current_user_key()
    if not user_key:
        return jsonify({"success": False, "message": "請先登入"}), 401

    data = request.get_json(silent=True) or {}
    incoming = {
        "wordbook": _clean_entries(data.get("wordbook")),
        "phrases": _clean_entries(data.get("phrases")),
        "mastered": [str(v) for v in (data.get("mastered") or []) if str(v)][:MAX_STATE_ITEMS]
        if isinstance(data.get("mastered"), list) else [],
        "stats": data.get("stats") if isinstance(data.get("stats"), dict) else {},
    }
    # merge=True：登入 / 首次同步時聯集兩邊資料，避免任何一邊的收藏消失
    # merge=False（預設）：以本次送出的資料為準，刪除與清空才會真正生效
    merge_mode = bool(data.get("merge"))

    with _state_lock:
        existing = _load_user_state(user_key)
        if merge_mode:
            new_state = _merge_states(existing, incoming)
        else:
            new_state = {
                "wordbook": incoming["wordbook"],
                "phrases": incoming["phrases"],
                "mastered": incoming["mastered"],
                "stats": incoming["stats"],
                "updatedAt": _now_iso(),
            }
        # 覆寫前先保留上一版備份，誤刪時仍可救回
        if existing.get("wordbook") or existing.get("phrases"):
            _atomic_write_json(_user_backup_path(user_key), existing)
        _atomic_write_json(_user_state_path(user_key), new_state)

    return jsonify({"success": True, "state": new_state, "updatedAt": new_state["updatedAt"]})


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5050))
    print("\n" + "=" * 62)
    print(" 🚀 Phoneme-Worms 英語學習平台已啟動！")
    print(f" 🌐 電腦瀏覽器請打開: http://localhost:{port}")
    print("=" * 62 + "\n")
    app.run(host="0.0.0.0", port=port, debug=True)
