/**
 * tts.js
 * Web Speech API wrapper with sentence-chunked queue,
 * Chrome stall workaround, and voice management.
 */

import { highlight, clearHighlight } from './highlighter.js';

export class TTSController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.queue = [];          // [{ text, el }]
    this.currentIndex = 0;
    this.rate = 1.0;
    this.voice = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedIndex = 0;     // sentence to resume from

    // Callbacks
    this.onStateChange = null;  // called with ('playing' | 'paused' | 'stopped' | 'ended')

    // Chrome: cancel paused state on visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isPaused) {
        // Nothing to do — paused by user, not browser
      }
    });
  }

  // ── Load a new set of sentences (call before play) ──
  load(sentences) {
    this.stop();
    this.queue = sentences;
    this.currentIndex = 0;
  }

  // ── Start or resume playback ──
  play() {
    if (this.queue.length === 0) return;

    // Chrome pause/resume bug workaround: re-speak from saved index instead of resume()
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

  // ── Pause playback ──
  pause() {
    if (!this.isPlaying) return;
    this.pausedIndex = this.currentIndex;
    this.isPlaying = false;
    this.isPaused = true;
    this.synth.cancel();  // Chrome: synth.pause() is unreliable
    clearHighlight();
    this._notify('paused');
  }

  // ── Stop and reset to beginning ──
  stop() {
    this.synth.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.pausedIndex = 0;
    clearHighlight();
    this._notify('stopped');
  }

  // ── Set playback rate (applied to next utterance) ──
  setRate(rate) {
    this.rate = parseFloat(rate);
    // If playing, restart current sentence at new rate
    if (this.isPlaying) {
      const idx = this.currentIndex;
      this.synth.cancel();
      this._speakFrom(idx);
    }
  }

  // ── Set voice ──
  setVoice(voiceURI) {
    const voices = this.synth.getVoices();
    this.voice = voices.find(v => v.voiceURI === voiceURI) || null;
    if (this.isPlaying) {
      const idx = this.currentIndex;
      this.synth.cancel();
      this._speakFrom(idx);
    }
  }

  // ── Get available voices, sorted by relevance ──
  getVoices(preferredLang) {
    const voices = this.synth.getVoices();
    const lang = (preferredLang || 'zh').toLowerCase().substring(0, 2);

    // Sort: local voices first, then by language match
    return voices.sort((a, b) => {
      const aLocal = a.localService ? 0 : 1;
      const bLocal = b.localService ? 0 : 1;
      const aLang = a.lang.toLowerCase().startsWith(lang) ? 0 : 1;
      const bLang = b.lang.toLowerCase().startsWith(lang) ? 0 : 1;
      return (aLocal + aLang) - (bLocal + bLang);
    });
  }

  // ── Internal: speak sentences starting at index ──
  _speakFrom(startIndex) {
    if (startIndex >= this.queue.length) {
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

    utt.onstart = () => {
      highlight(el);
    };

    utt.onend = () => {
      if (!this.isPlaying) return;  // stopped/paused during utterance
      this._speakFrom(startIndex + 1);
    };

    utt.onerror = (e) => {
      // 'interrupted' means we cancelled deliberately — do not advance
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('TTS error:', e.error, 'sentence:', startIndex);
      // Try to continue with next sentence on non-fatal errors
      if (this.isPlaying) this._speakFrom(startIndex + 1);
    };

    this.synth.speak(utt);
  }

  _notify(state) {
    if (this.onStateChange) this.onStateChange(state);
  }
}

// ── Initialize voices with voiceschanged event ──
export function initVoices(callback) {
  const synth = window.speechSynthesis;

  // Chrome loads voices asynchronously
  if (synth.getVoices().length > 0) {
    callback(synth.getVoices());
    return;
  }

  synth.addEventListener('voiceschanged', () => {
    callback(synth.getVoices());
  }, { once: true });
}
