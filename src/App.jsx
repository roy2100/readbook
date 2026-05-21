import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Reader from './components/Reader.jsx';
import Controls from './components/Controls.jsx';
import Toast from './components/Toast.jsx';
import { useBook } from './hooks/useBook.js';
import { useTTS } from './hooks/useTTS.js';
import { useToast } from './hooks/useToast.js';
import { useVoices } from './hooks/useVoices.js';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [rate, setRateState] = useState(() => {
    const saved = parseFloat(localStorage.getItem('tts-rate'));
    return isNaN(saved) ? 1 : saved;
  });
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem('tts-voice') ?? '');

  const pendingAutoPlay = useRef(false);
  const handledEndedSession = useRef(null);

  const { chapterIndex } = useParams();
  const navigate = useNavigate();

  const { toast, showToast } = useToast();
  const { book, currentIndex, chapterHtml, isLoading, openFile, goToChapter, restoreBook } = useBook();
  const { ttsState, ttsInfo, load, play, pause, stop, setRate, setVoice, getVoices, playFrom } = useTTS();
  const allVoices = useVoices();

  const currentChapter = book?.chapters[currentIndex] ?? null;
  const voices = book ? getVoices(book.language) : allVoices;

  // URL param drives chapter loading — fires on route change or book change
  useEffect(() => {
    if (!book) return;
    const idx = parseInt(chapterIndex ?? '0', 10);
    if (!isNaN(idx)) goToChapter(idx);
  }, [chapterIndex, book]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileOpen = useCallback(async (file) => {
    navigate('/0', { replace: true }); // reset URL before parsing
    showToast('正在解析 EPUB…');
    try {
      const parsed = await openFile(file);
      document.title = `${parsed.title} — ReadBook`;
      showToast(`《${parsed.title}》已加载`);
    } catch (err) {
      showToast('解析失败：' + err.message, true);
    }
  }, [openFile, navigate, showToast]);

  const handleChapterSelect = useCallback((index) => {
    stop();
    setSidebarOpen(false);
    navigate('/' + index, { replace: true });
  }, [navigate, stop]);

  const handleSentencesReady = useCallback((sentences) => {
    load(sentences, { chapterIndex: currentIndex });
    if (pendingAutoPlay.current === currentIndex) {
      pendingAutoPlay.current = false;
      play();
    }
  }, [currentIndex, load, play]);

  const handleSentenceClick = useCallback((index) => {
    playFrom(index);
  }, [playFrom]);

  // Restore book from IndexedDB on mount
  useEffect(() => {
    const savedIdx = parseInt(chapterIndex ?? '0', 10);
    restoreBook()
      .then((parsed) => {
        if (!parsed) return;
        navigate('/' + (isNaN(savedIdx) ? 0 : savedIdx), { replace: true });
        document.title = `${parsed.title} — ReadBook`;
        showToast(`已恢复《${parsed.title}》`);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply saved rate to TTS controller on mount
  useEffect(() => { setRate(rate); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply saved voice once voices are loaded
  useEffect(() => {
    if (allVoices.length > 0 && voiceURI) setVoice(voiceURI);
  }, [allVoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRateChange = useCallback((newRate) => {
    setRateState(newRate);
    setRate(newRate);
    localStorage.setItem('tts-rate', newRate);
  }, [setRate]);

  const handleVoiceChange = useCallback((uri) => {
    setVoiceURI(uri);
    setVoice(uri);
    localStorage.setItem('tts-voice', uri);
  }, [setVoice]);

  // Auto-advance to next chapter when TTS finishes
  useEffect(() => {
    if (ttsState !== 'ended' || !book) return;
    if (ttsInfo?.chapterIndex !== currentIndex) return;
    if (handledEndedSession.current === ttsInfo.sessionId) return;
    if (currentIndex >= book.chapters.length - 1) return;
    handledEndedSession.current = ttsInfo.sessionId;
    pendingAutoPlay.current = currentIndex + 1;
    navigate('/' + (currentIndex + 1), { replace: true });
  }, [ttsState, ttsInfo, book, currentIndex, navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!book) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          ttsState === 'playing' ? pause() : play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > 0) { stop(); navigate('/' + (currentIndex - 1), { replace: true }); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < book.chapters.length - 1) { stop(); navigate('/' + (currentIndex + 1), { replace: true }); }
          break;
        case 'Escape':
          stop();
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [book, ttsState, currentIndex, play, pause, stop, navigate]);

  return (
    <div className="app">
      <Header
        title={book?.title ?? 'ReadBook'}
        onMenuClick={() => setSidebarOpen(true)}
        onFileOpen={handleFileOpen}
      />

      <div className="main">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chapters={book?.chapters ?? []}
          currentIndex={currentIndex}
          onChapterSelect={handleChapterSelect}
        />
        <Reader
          chapterHtml={chapterHtml}
          book={book}
          currentChapter={currentChapter}
          isLoading={isLoading}
          onSentencesReady={handleSentencesReady}
          onSentenceClick={readingMode ? null : handleSentenceClick}
        />
      </div>

      <Controls
        book={book}
        currentIndex={currentIndex}
        currentChapter={currentChapter}
        ttsState={ttsState}
        rate={rate}
        voiceURI={voiceURI}
        voices={voices}
        readingMode={readingMode}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onPrev={() => { stop(); navigate('/' + (currentIndex - 1), { replace: true }); }}
        onNext={() => { stop(); navigate('/' + (currentIndex + 1), { replace: true }); }}
        onRateChange={handleRateChange}
        onVoiceChange={handleVoiceChange}
        onFileOpen={handleFileOpen}
        onReadingModeToggle={() => setReadingMode(m => !m)}
      />

      {toast && <Toast message={toast.message} isError={toast.isError} />}
    </div>
  );
}
