import { highlight, clearHighlight } from './highlighter.js';

function retainUtterance(utterance) {
  window.speechUtterances = window.speechUtterances || [];
  window.speechUtterances.push(utterance);
}

function releaseUtterance(utterance) {
  if (!window.speechUtterances) return;
  window.speechUtterances = window.speechUtterances.filter(u => u !== utterance);
}

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
    this.chapterIndex = null;
    this.sessionId = 0;
    this.onStateChange = null;
    this.currentUtterance = null;
  }

  load(sentences, context = {}) {
    this.stop();
    this.queue = sentences;
    this.currentIndex = 0;
    this.chapterIndex = context.chapterIndex ?? null;
    this.sessionId += 1;
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
    this._releaseCurrentUtterance();
    this.isPlaying = true;
    this.isPaused = false;
    this._speakFrom(index);
    this._notify('playing');
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedIndex = this.currentIndex;
    this.isPlaying = false;
    this.isPaused = true;
    this.synth.cancel();
    this._releaseCurrentUtterance();
    clearHighlight();
    this._notify('paused');
  }

  stop() {
    this.synth.cancel();
    this._releaseCurrentUtterance();
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
      this._releaseCurrentUtterance();
      this._speakFrom(idx);
    }
  }

  setVoice(voiceURI) {
    const voices = this.synth.getVoices();
    this.voice = voices.find(v => v.voiceURI === voiceURI) || null;
    if (this.isPlaying) {
      const idx = this.currentIndex;
      this.synth.cancel();
      this._releaseCurrentUtterance();
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

  _releaseCurrentUtterance() {
    if (!this.currentUtterance) return;
    releaseUtterance(this.currentUtterance);
    this.currentUtterance = null;
  }

  _speakFrom(startIndex) {
    if (startIndex >= this.queue.length) {
      this._releaseCurrentUtterance();
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
      if (this.currentUtterance !== utt) return;
      this._releaseCurrentUtterance();
      if (!this.isPlaying) return;
      this._speakFrom(startIndex + 1);
    };

    utt.onerror = (e) => {
      if (this.currentUtterance !== utt) return;
      this._releaseCurrentUtterance();
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('TTS error:', e.error, 'sentence:', startIndex);
      if (this.isPlaying) this._speakFrom(startIndex + 1);
    };

    this.currentUtterance = utt;
    retainUtterance(utt);
    this.synth.speak(utt);
  }

  _notify(state) {
    if (!this.onStateChange) return;
    this.onStateChange(state, {
      state,
      chapterIndex: this.chapterIndex,
      sessionId: this.sessionId,
    });
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
