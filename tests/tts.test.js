import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSController } from '../tts.js';

// ── Mock Web Speech API ───────────────────────────────────────────────────────

// Lightweight SpeechSynthesisUtterance mock
class MockUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

let mockSynth;

beforeEach(() => {
  mockSynth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
  };

  // jsdom does not implement speechSynthesis — install mock
  Object.defineProperty(window, 'speechSynthesis', {
    value: mockSynth,
    writable: true,
    configurable: true,
  });

  global.SpeechSynthesisUtterance = MockUtterance;
});

// ── Mock highlighter (uses scrollIntoView not available in jsdom) ──
vi.mock('../highlighter.js', () => ({
  highlight: vi.fn(),
  clearHighlight: vi.fn(),
  annotateChapter: vi.fn(() => []),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSentences(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    text: `Sentence ${i + 1}.`,
    el: document.createElement('span'),
  }));
}

function getLastUtterance() {
  const calls = mockSynth.speak.mock.calls;
  return calls.length > 0 ? calls[calls.length - 1][0] : null;
}

// ── Initial state ─────────────────────────────────────────────────────────────

describe('TTSController — initial state', () => {
  it('starts with isPlaying and isPaused both false', () => {
    const tts = new TTSController();
    expect(tts.isPlaying).toBe(false);
    expect(tts.isPaused).toBe(false);
  });

  it('starts with empty queue and index 0', () => {
    const tts = new TTSController();
    expect(tts.queue).toHaveLength(0);
    expect(tts.currentIndex).toBe(0);
  });
});

// ── load ──────────────────────────────────────────────────────────────────────

describe('TTSController.load', () => {
  it('populates the queue', () => {
    const tts = new TTSController();
    const sentences = makeSentences(3);
    tts.load(sentences);
    expect(tts.queue).toHaveLength(3);
  });

  it('calls stop() before loading (resets state)', () => {
    const tts = new TTSController();
    const spy = vi.spyOn(tts, 'stop');
    tts.load(makeSentences());
    expect(spy).toHaveBeenCalledOnce();
  });

  it('resets currentIndex to 0', () => {
    const tts = new TTSController();
    tts.load(makeSentences(5));
    tts.currentIndex = 4;
    tts.load(makeSentences(2));
    expect(tts.currentIndex).toBe(0);
  });
});

// ── play ──────────────────────────────────────────────────────────────────────

describe('TTSController.play', () => {
  it('does nothing on empty queue', () => {
    const tts = new TTSController();
    tts.play();
    expect(tts.isPlaying).toBe(false);
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });

  it('sets isPlaying to true and calls synth.speak', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    expect(tts.isPlaying).toBe(true);
    expect(mockSynth.speak).toHaveBeenCalledOnce();
  });

  it('notifies "playing" state', () => {
    const tts = new TTSController();
    const states = [];
    tts.onStateChange = s => states.push(s);
    tts.load(makeSentences());
    tts.play();
    expect(states).toContain('playing');
  });

  it('does not double-start when already playing', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.play();  // second call should be a no-op
    expect(mockSynth.speak).toHaveBeenCalledOnce();
  });
});

// ── pause ─────────────────────────────────────────────────────────────────────

describe('TTSController.pause', () => {
  it('does nothing when not playing', () => {
    const tts = new TTSController();
    tts.pause();
    expect(tts.isPaused).toBe(false);
    expect(mockSynth.cancel).not.toHaveBeenCalled();
  });

  it('sets isPlaying false and isPaused true', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.pause();
    expect(tts.isPlaying).toBe(false);
    expect(tts.isPaused).toBe(true);
  });

  it('calls synth.cancel (Chrome workaround)', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.pause();
    expect(mockSynth.cancel).toHaveBeenCalled();
  });

  it('saves currentIndex to pausedIndex', () => {
    const tts = new TTSController();
    tts.load(makeSentences(5));
    tts.play();
    tts.currentIndex = 3;  // simulate mid-playback
    tts.pause();
    expect(tts.pausedIndex).toBe(3);
  });

  it('notifies "paused" state', () => {
    const tts = new TTSController();
    const states = [];
    tts.onStateChange = s => states.push(s);
    tts.load(makeSentences());
    tts.play();
    tts.pause();
    expect(states).toContain('paused');
  });
});

// ── resume after pause ────────────────────────────────────────────────────────

describe('TTSController — resume after pause', () => {
  it('resumes from pausedIndex, not from 0', () => {
    const tts = new TTSController();
    const sentences = makeSentences(5);
    tts.load(sentences);
    tts.play();
    tts.currentIndex = 3;
    tts.pause();                // pausedIndex = 3

    mockSynth.speak.mockClear();
    tts.play();                 // should resume from 3

    expect(tts.isPlaying).toBe(true);
    expect(tts.isPaused).toBe(false);
    // _speakFrom(3) calls synth.speak with sentences[3]
    const utt = getLastUtterance();
    expect(utt.text).toBe(sentences[3].text);
  });

  it('sets isPlaying true and isPaused false on resume', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.pause();
    tts.play();
    expect(tts.isPlaying).toBe(true);
    expect(tts.isPaused).toBe(false);
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────

describe('TTSController.stop', () => {
  it('resets all state flags to false', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.stop();
    expect(tts.isPlaying).toBe(false);
    expect(tts.isPaused).toBe(false);
  });

  it('resets currentIndex and pausedIndex to 0', () => {
    const tts = new TTSController();
    tts.load(makeSentences(5));
    tts.play();
    tts.currentIndex = 4;
    tts.stop();
    expect(tts.currentIndex).toBe(0);
    expect(tts.pausedIndex).toBe(0);
  });

  it('calls synth.cancel', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    tts.play();
    tts.stop();
    expect(mockSynth.cancel).toHaveBeenCalled();
  });

  it('notifies "stopped" state', () => {
    const tts = new TTSController();
    const states = [];
    tts.onStateChange = s => states.push(s);
    tts.load(makeSentences());
    tts.play();
    tts.stop();
    expect(states).toContain('stopped');
  });
});

// ── _speakFrom end of queue ───────────────────────────────────────────────────

describe('TTSController._speakFrom — queue exhausted', () => {
  it('emits "ended" when startIndex >= queue length', () => {
    const tts = new TTSController();
    const states = [];
    tts.onStateChange = s => states.push(s);
    const sentences = makeSentences(2);
    tts.load(sentences);
    tts.isPlaying = true;  // simulate mid-play

    tts._speakFrom(2);  // past end

    expect(states).toContain('ended');
    expect(tts.isPlaying).toBe(false);
  });

  it('does not call synth.speak when queue is exhausted', () => {
    const tts = new TTSController();
    tts.load(makeSentences(2));
    tts.isPlaying = true;
    mockSynth.speak.mockClear();
    tts._speakFrom(5);
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });
});

// ── onend auto-advance ────────────────────────────────────────────────────────

describe('TTSController — auto-advance on utterance end', () => {
  it('advances to next sentence when utterance ends', () => {
    const tts = new TTSController();
    tts.load(makeSentences(3));
    tts.play();  // speaks sentence 0

    const utt = getLastUtterance();  // capture before clearing
    mockSynth.speak.mockClear();
    tts.isPlaying = true;  // ensure still playing
    utt.onend();  // simulate utterance ending

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    expect(tts.currentIndex).toBe(1);
  });

  it('does not advance if stopped during utterance', () => {
    const tts = new TTSController();
    tts.load(makeSentences(3));
    tts.play();
    const utt = getLastUtterance();
    tts.stop();            // stop before onend fires
    mockSynth.speak.mockClear();
    utt.onend();           // onend fires after stop — should be ignored
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });
});

// ── setRate ───────────────────────────────────────────────────────────────────

describe('TTSController.setRate', () => {
  it('updates the rate property', () => {
    const tts = new TTSController();
    tts.setRate('1.5');
    expect(tts.rate).toBe(1.5);
  });

  it('restarts current sentence when playing', () => {
    const tts = new TTSController();
    tts.load(makeSentences(3));
    tts.play();
    tts.currentIndex = 2;
    mockSynth.speak.mockClear();
    tts.setRate('2');
    expect(mockSynth.cancel).toHaveBeenCalled();
    expect(mockSynth.speak).toHaveBeenCalledOnce();
  });

  it('does not restart when not playing', () => {
    const tts = new TTSController();
    tts.load(makeSentences());
    mockSynth.speak.mockClear();
    tts.setRate('0.5');
    expect(mockSynth.speak).not.toHaveBeenCalled();
  });
});

// ── getVoices ─────────────────────────────────────────────────────────────────

describe('TTSController.getVoices', () => {
  it('returns empty array when no voices available', () => {
    const tts = new TTSController();
    mockSynth.getVoices.mockReturnValue([]);
    expect(tts.getVoices('zh')).toHaveLength(0);
  });

  it('sorts preferred-language local voices first', () => {
    const voices = [
      { name: 'Remote EN', lang: 'en-US', localService: false, voiceURI: 'v1' },
      { name: 'Remote ZH', lang: 'zh-CN', localService: false, voiceURI: 'v2' },
      { name: 'Local ZH',  lang: 'zh-TW', localService: true,  voiceURI: 'v3' },
      { name: 'Local EN',  lang: 'en-GB', localService: true,  voiceURI: 'v4' },
    ];
    mockSynth.getVoices.mockReturnValue([...voices]);

    const tts = new TTSController();
    const sorted = tts.getVoices('zh');

    // Local ZH should be first (local + lang match = score 0)
    expect(sorted[0].name).toBe('Local ZH');
  });

  it('does not throw when preferredLang is undefined', () => {
    mockSynth.getVoices.mockReturnValue([]);
    const tts = new TTSController();
    expect(() => tts.getVoices(undefined)).not.toThrow();
  });
});
