import os
import sys
import json
import base64
import logging
from flask import Flask, request, jsonify, render_template, send_from_directory
import requests
from dotenv import load_dotenv

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

DATA_DIR = os.path.join(BASE_DIR, "data")

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
    data = load_json("vocab.json")
    return jsonify({"success": True, "data": data})

@app.route("/api/articles", methods=["GET"])
def get_articles():
    data = load_json("articles.json")
    return jsonify({"success": True, "data": data})

@app.route("/api/quizzes", methods=["GET"])
def get_quizzes():
    data = load_json("quizzes.json")
    return jsonify({"success": True, "data": data})

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
            # 支援多個模型版本備援
            models_to_try = [GEMINI_MODEL, "gemini-2.5-flash", "gemini-1.5-flash", "gemini-3.6-flash"]
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

# -------------------------------------------------------------
# AI 多模態視覺 OCR：從圖片中自動識別並萃取所有英文單字與中文釋義
# -------------------------------------------------------------
@app.route("/api/ocr/extract_words", methods=["POST"])
def ocr_extract_words():
    """使用 Gemini 3.6 Flash 視覺模型從圖片辨識全部英文單字與繁體中文解釋"""
    image_b64 = None
    mime_type = "image/jpeg"

    if request.is_json:
        req_data = request.get_json(silent=True) or {}
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

    prompt = """
You are an expert English lexicographer and visual OCR recognition specialist.
The user has provided an image filled with English vocabulary words (e.g. textbook page, vocabulary list sheet, exam paper, flashcard set, or notebook notes).

Your job:
1. Examine the image carefully and extract EVERY English word and phrase present.
2. For each word, provide:
   - "word": Clean English word or phrase (strip any numbering or formatting artifacts).
   - "definition": Traditional Chinese (繁體中文) translation. If Chinese definitions exist in the image, transcribe and clean them; if the image only has English, translate accurately into Traditional Chinese.
   - "pos": Part of speech (e.g., n., v., adj., adv., phr., idiom).
   - "phonetic": IPA phonetic symbol (optional, e.g., /ˌpɝː.səˈvɪr.əns/).
   - "example": Short natural English example sentence (optional).
3. Return ONLY a valid JSON array of objects, with no markdown code blocks:
[
  {
    "word": "perseverance",
    "definition": "毅力；堅持不懈",
    "pos": "n.",
    "phonetic": "/ˌpɝː.səˈvɪr.əns/",
    "example": "Through hard work and perseverance, she reached her goal."
  }
]
If the image does not contain recognizable English words, return an empty array: [].
"""

    models_to_try = [GEMINI_MODEL, "gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash"]
    if "gemini-3.6-flash" in models_to_try:
        models_to_try.remove("gemini-3.6-flash")
    models_to_try.insert(0, "gemini-3.6-flash")

    last_error = ""
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
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }

        try:
            resp = requests.post(endpoint, json=payload, timeout=30)
            if resp.status_code == 200:
                resp_json = resp.json()
                candidates = resp_json.get("candidates", [])
                if candidates:
                    raw_text = candidates[0]["content"]["parts"][0]["text"].strip()
                    if raw_text.startswith("```"):
                        raw_text = raw_text.strip("`")
                        if raw_text.startswith("json"):
                            raw_text = raw_text[4:].strip()
                    parsed = json.loads(raw_text)
                    word_list = parsed if isinstance(parsed, list) else parsed.get("words", [])
                    return jsonify({
                        "success": True,
                        "words": word_list,
                        "count": len(word_list),
                        "model": model_name
                    })
            else:
                last_error = f"{model_name} HTTP {resp.status_code}: {resp.text[:120]}"
        except Exception as e:
            last_error = str(e)
            logging.warning(f"OCR model {model_name} failed: {e}")

    return jsonify({"success": False, "message": f"AI 圖片辨識失敗: {last_error}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5050))
    print("\n" + "=" * 62)
    print(" 🚀 Phoneme-Worms 英語學習平台已啟動！")
    print(f" 🌐 電腦瀏覽器請打開: http://localhost:{port}")
    print("=" * 62 + "\n")
    app.run(host="0.0.0.0", port=port, debug=True)
