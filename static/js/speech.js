/**
 * SpeechEngine: 封裝瀏覽器原生 Web Speech API (TTS 語音播放與 STT 語音辨識)
 */
const SpeechEngine = {
  synth: window.speechSynthesis || null,
  recognition: null,
  currentUtterance: null,
  isListening: false,
  preferredAccent: 'en-US',

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = this.preferredAccent;
      this.recognition.interimResults = true;
      this.recognition.continuous = false;
    }
  },

  setAccent(accent) {
    this.preferredAccent = accent || 'en-US';
    if (this.recognition) {
      this.recognition.lang = this.preferredAccent;
    }
  },

  /**
   * 朗讀文本 (TTS)
   * @param {string} text - 朗讀英文文本
   * @param {string} lang - 語言代碼 (如 'en-US', 'en-GB')
   * @param {function} onEndCallback - 播放結束回呼
   */
  speak(text, lang = null, onEndCallback = null) {
    if (!this.synth) {
      console.warn("Speech synthesis not supported in this browser.");
      if (onEndCallback) onEndCallback();
      return;
    }

    // 停止上一段播放
    this.synth.cancel();

    // 清理括號或特殊格式
    const cleanText = text.replace(/[\/\#\*\_\`]/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang || this.preferredAccent;
    utterance.rate = 0.95; // 稍微放慢，發音更清晰
    utterance.pitch = 1.0;

    // 尋找最適配的發音音色
    const voices = this.synth.getVoices();
    const targetVoice = voices.find(v => v.lang.startsWith(utterance.lang) && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("English")));
    if (targetVoice) {
      utterance.voice = targetVoice;
    }

    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = (e) => {
      console.error("SpeechSynthesis error:", e);
      this.currentUtterance = null;
      if (onEndCallback) onEndCallback();
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  },

  stopSpeak() {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  },

  /**
   * 開啟語音辨識 (STT)
   */
  startListening(onTranscript, onEnd, onError) {
    if (!this.recognition) {
      if (onError) onError("您的瀏覽器暫不支援 Web Speech API 語音輸入，建議使用 Chrome 或 Edge。");
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.recognition.lang = this.preferredAccent;
    this.isListening = true;

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (onTranscript) {
        onTranscript(finalTranscript || interimTranscript, Boolean(finalTranscript));
      }
    };

    this.recognition.onerror = (event) => {
      console.error("SpeechRecognition error:", event.error);
      this.isListening = false;
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onEnd) onEnd();
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error("Recognition start exception:", e);
    }
  },

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }
};

window.SpeechEngine = SpeechEngine;
