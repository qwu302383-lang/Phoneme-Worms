import os
import sys
import json
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

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5050))
    print("\n" + "=" * 62)
    print(" 🚀 Phoneme-Worms 英語學習平台已啟動！")
    print(f" 🌐 電腦瀏覽器請打開: http://localhost:{port}")
    print("=" * 62 + "\n")
    app.run(host="0.0.0.0", port=port, debug=True)
