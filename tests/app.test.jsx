import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App.jsx';

// vi.mock is hoisted before imports — variables used inside factories must be
// created with vi.hoisted() so they exist when the factories first execute.

const state = vi.hoisted(() => ({
  ttsState: 'stopped',
  currentIndex: 0,
  book: null,
}));

// Captures the onSentencesReady prop passed to <Reader> so tests can call it
const captured = vi.hoisted(() => ({ onSentencesReady: null }));

const mocks = vi.hoisted(() => ({
  goToChapter: vi.fn(() => Promise.resolve()),
  play: vi.fn(),
  load: vi.fn(),
  stop: vi.fn(),
  navigate: vi.fn(),
}));

// Tracks current chapterIndex as if the router were updating it on navigate
const routeState = vi.hoisted(() => ({ chapterIndex: undefined }));

// ── Mock react-router-dom ─────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useParams: () => ({ chapterIndex: routeState.chapterIndex }),
  useNavigate: () => (path, opts) => {
    mocks.navigate(path, opts);
    const match = String(path).match(/^\/(\d+)$/);
    if (match) routeState.chapterIndex = match[1];
  },
}));

// ── Mock child components (render nothing, remove external dependencies) ──────

vi.mock('../src/components/Header.jsx',   () => ({ default: () => null }));
vi.mock('../src/components/Sidebar.jsx',  () => ({ default: () => null }));
vi.mock('../src/components/Controls.jsx', () => ({ default: () => null }));
vi.mock('../src/components/Toast.jsx',    () => ({ default: () => null }));

vi.mock('../src/components/Reader.jsx', () => ({
  default: ({ onSentencesReady }) => {
    captured.onSentencesReady = onSentencesReady;
    return null;
  },
}));

// ── Mock hooks ────────────────────────────────────────────────────────────────

vi.mock('../src/hooks/useBook.js', () => ({
  useBook: () => ({
    book: state.book,
    currentIndex: state.currentIndex,
    chapterHtml: null,
    isLoading: false,
    openFile: vi.fn(),
    goToChapter: mocks.goToChapter,
    restoreBook: vi.fn(() => Promise.resolve(null)),
  }),
  resolveImages: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/hooks/useTTS.js', () => ({
  useTTS: () => ({
    ttsState: state.ttsState,
    load: mocks.load,
    play: mocks.play,
    pause: vi.fn(),
    stop: mocks.stop,
    setRate: vi.fn(),
    setVoice: vi.fn(),
    getVoices: vi.fn(() => []),
    playFrom: vi.fn(),
  }),
}));

vi.mock('../src/hooks/useVoices.js', () => ({ useVoices: () => [] }));
vi.mock('../src/hooks/useToast.js', () => ({
  useToast: () => ({ toast: null, showToast: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBook(numChapters = 3) {
  return {
    title: 'Test Book',
    language: 'zh',
    chapters: Array.from({ length: numChapters }, (_, i) => ({
      label: `Chapter ${i + 1}`,
      href: `ch${i + 1}.xhtml`,
    })),
    zip: {},
    opfDir: '',
  };
}

function makeSentences(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    text: `Sentence ${i + 1}.`,
    el: document.createElement('span'),
  }));
}

beforeEach(() => {
  state.ttsState = 'stopped';
  state.currentIndex = 0;
  state.book = makeBook(3);
  routeState.chapterIndex = undefined;
  captured.onSentencesReady = null;
  mocks.goToChapter.mockReset();
  mocks.goToChapter.mockImplementation(() => Promise.resolve());
  mocks.play.mockReset();
  mocks.load.mockReset();
  mocks.stop.mockReset();
  mocks.navigate.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App — auto-advance to next chapter', () => {
  describe('chapter navigation on TTS end', () => {
    it('navigates to next chapter URL when ttsState becomes "ended"', () => {
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'ended';
      rerender(<App />);

      expect(mocks.navigate).toHaveBeenCalledWith('/1', expect.any(Object));
    });

    it('navigates from any non-last chapter (currentIndex = 1 → /2)', () => {
      state.currentIndex = 1;
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'ended';
      rerender(<App />);

      expect(mocks.navigate).toHaveBeenCalledWith('/2', expect.any(Object));
    });

    it('does NOT navigate when on the last chapter', () => {
      state.currentIndex = 2; // last of 3
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'ended';
      rerender(<App />);

      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('does NOT navigate when book is null', () => {
      state.book = null;
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'ended';
      rerender(<App />);

      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('does NOT navigate when ttsState is "playing" or "paused"', () => {
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'playing';
      rerender(<App />);
      state.ttsState = 'paused';
      rerender(<App />);

      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('handles single-chapter book: no navigation when the only chapter ends', () => {
      state.book = makeBook(1);
      state.currentIndex = 0;
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      state.ttsState = 'ended';
      rerender(<App />);

      expect(mocks.navigate).not.toHaveBeenCalled();
    });
  });

  describe('auto-play after chapter navigation (pendingAutoPlay)', () => {
    it('calls play() after onSentencesReady fires following a chapter end', () => {
      const { rerender } = render(<App />);
      mocks.navigate.mockClear();

      // Step 1: chapter ends → pendingAutoPlay = true, navigate to next chapter
      state.ttsState = 'ended';
      rerender(<App />);
      expect(mocks.navigate).toHaveBeenCalledWith('/1', expect.any(Object));

      // Step 2: Reader annotates new chapter, calls onSentencesReady
      act(() => captured.onSentencesReady(makeSentences()));

      expect(mocks.load).toHaveBeenCalled();
      expect(mocks.play).toHaveBeenCalledOnce();
    });

    it('passes the new sentences to load()', () => {
      const { rerender } = render(<App />);

      state.ttsState = 'ended';
      rerender(<App />);

      const sentences = makeSentences(4);
      act(() => captured.onSentencesReady(sentences));

      expect(mocks.load).toHaveBeenCalledWith(sentences);
    });

    it('does NOT call play() when sentences arrive without a prior chapter end', () => {
      render(<App />);

      // Normal chapter load — no "ended" state, no pendingAutoPlay
      act(() => captured.onSentencesReady(makeSentences()));

      expect(mocks.load).toHaveBeenCalled();
      expect(mocks.play).not.toHaveBeenCalled();
    });

    it('calls play() only once even if onSentencesReady fires multiple times', () => {
      const { rerender } = render(<App />);

      state.ttsState = 'ended';
      rerender(<App />);

      const sentences = makeSentences();
      act(() => captured.onSentencesReady(sentences)); // pendingAutoPlay cleared here
      act(() => captured.onSentencesReady(sentences)); // second call — flag already false

      expect(mocks.play).toHaveBeenCalledTimes(1);
    });

    it('does NOT call play() when last chapter ends (no navigation, no autoplay)', () => {
      state.currentIndex = 2; // last chapter
      const { rerender } = render(<App />);

      state.ttsState = 'ended';
      rerender(<App />);

      act(() => captured.onSentencesReady(makeSentences()));

      expect(mocks.play).not.toHaveBeenCalled();
    });
  });
});
