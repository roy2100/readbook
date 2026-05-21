import { highlight, clearHighlight } from './highlighter.js';

export class TTSController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.queue = [];
    this.currentIndex = 0;
    this.rate = 1.0;
    this.voice = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedIndex = 0;
    this.onStateChange = null;
    this._keepAliveTimer = null;
  }

  load(sentences) {
    this.stop();
    this.queue = sentences;
    this.currentIndex = 0;
  }

  play() {
    if (this.queue.length === 0) return;

    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this._speakFrom(this.pausedIndex);
      this._notify('playing');
      return;
    }

    if (this.isPlaying) return;

    this.isPlaying = true;
    this.isPaused = false;
    this._speakFrom(this.currentIndex);
    this._notify('playing');
  }

  playFrom(index) {
    if (this.queue.length === 0 || index < 0 || index >= this.queue.length) return;
    this.synth.cancel();
    this.isPlaying = true;
    this.isPaused = false;
    this._speakFrom(index);
    this._notify('playing');
  }

  pause() {
    if (!this.isPlaying) return;
    this._stopKeepAlive();
    this.pausedIndex = this.currentIndex;
    this.isPlaying = false;
    this.isPaused = true;
    this.synth.cancel();
    clearHighlight();
    this._notify('paused');
  }

  stop() {
    this._stopKeepAlive();
    this.synth.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.pausedIndex = 0;
    clearHighlight();
    this._notify('stopped');
  }

  setRate(rate) {
    this.rate = parseFloat(rate);
    if (this.isPlaying) {
      const idx = this.currentIndex;
      this.synth.cancel();
      this._speakFrom(idx);
    }
  }

  setVoice(voiceURI) {
    const voices = this.synth.getVoices();
    this.voice = voices.find(v => v.voiceURI === voiceURI) || null;
    if (this.isPlaying) {
      const idx = this.currentIndex;
      this.synth.cancel();
      this._speakFrom(idx);
    }
  }

  getVoices(preferredLang) {
    const voices = this.synth.getVoices();
    const lang = (preferredLang || 'zh').toLowerCase().substring(0, 2);
    return voices.sort((a, b) => {
      const aScore = (a.localService ? 0 : 1) + (a.lang.toLowerCase().startsWith(lang) ? 0 : 1);
      const bScore = (b.localService ? 0 : 1) + (b.lang.toLowerCase().startsWith(lang) ? 0 : 1);
      return aScore - bScore;
    });
  }

  _startKeepAlive() {
    this._stopKeepAlive();
    // Chrome freezes speechSynthesis in background tabs; restart if it stalls.
    this._keepAliveTimer = setInterval(() => {
      if (this.isPlaying && !this.synth.speaking && !this.synth.pending) {
        this._speakFrom(this.currentIndex);
      }
    }, 5000);
  }

  _stopKeepAlive() {
    if (this._keepAliveTimer !== null) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }
  }

  _speakFrom(startIndex) {
    if (startIndex >= this.queue.length) {
      this._stopKeepAlive();
      this.isPlaying = false;
      clearHighlight();
      this._notify('ended');
      return;
    }

    this.currentIndex = startIndex;
    const { text, el } = this.queue[startIndex];

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = this.rate;
    if (this.voice) utt.voice = this.voice;

    utt.onstart = () => highlight(el);

    utt.onend = () => {
      if (!this.isPlaying) return;
      this._speakFrom(startIndex + 1);
    };

    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('TTS error:', e.error, 'sentence:', startIndex);
      if (this.isPlaying) this._speakFrom(startIndex + 1);
    };

    this.synth.speak(utt);
    if (this._keepAliveTimer === null) this._startKeepAlive();
  }

  _notify(state) {
    if (this.onStateChange) this.onStateChange(state);
  }
}

export function initVoices(callback) {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) {
    callback(synth.getVoices());
    return;
  }
  synth.addEventListener('voiceschanged', () => callback(synth.getVoices()), { once: true });
}
