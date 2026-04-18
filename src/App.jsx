import { useState, useCallback, useEffect } from 'react';
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
  const [rate, setRateState] = useState(1);
  const [voiceURI, setVoiceURI] = useState('');

  const { toast, showToast } = useToast();
  const { book, currentIndex, chapterHtml, isLoading, openFile, goToChapter } = useBook();
  const { ttsState, load, play, pause, stop, setRate, setVoice, getVoices } = useTTS();
  const allVoices = useVoices();

  const currentChapter = book?.chapters[currentIndex] ?? null;

  // Sort voices by book language preference
  const voices = book ? getVoices(book.language) : allVoices;

  const handleFileOpen = useCallback(async (file) => {
    showToast('正在解析 EPUB…');
    try {
      const parsed = await openFile(file);
      await goToChapter(0);
      document.title = `${parsed.title} — ReadBook`;
      showToast(`《${parsed.title}》已加载`);
    } catch (err) {
      showToast('解析失败：' + err.message, true);
    }
  }, [openFile, goToChapter, showToast]);

  const handleChapterSelect = useCallback(async (index) => {
    stop();
    setSidebarOpen(false);
    await goToChapter(index);
  }, [goToChapter, stop]);

  const handleSentencesReady = useCallback((sentences) => {
    load(sentences);
  }, [load]);

  const handleRateChange = useCallback((newRate) => {
    setRateState(newRate);
    setRate(newRate);
  }, [setRate]);

  const handleVoiceChange = useCallback((uri) => {
    setVoiceURI(uri);
    setVoice(uri);
  }, [setVoice]);

  // Auto-advance to next chapter when TTS finishes
  useEffect(() => {
    if (ttsState !== 'ended' || !book) return;
    if (currentIndex >= book.chapters.length - 1) return;
    const timer = setTimeout(async () => {
      await goToChapter(currentIndex + 1);
      play();
    }, 800);
    return () => clearTimeout(timer);
  }, [ttsState, book, currentIndex, goToChapter, play]);

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
          stop(); goToChapter(currentIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          stop(); goToChapter(currentIndex + 1);
          break;
        case 'Escape':
          stop();
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [book, ttsState, currentIndex, play, pause, stop, goToChapter]);

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
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onPrev={() => { stop(); goToChapter(currentIndex - 1); }}
        onNext={() => { stop(); goToChapter(currentIndex + 1); }}
        onRateChange={handleRateChange}
        onVoiceChange={handleVoiceChange}
        onFileOpen={handleFileOpen}
      />

      {toast && <Toast message={toast.message} isError={toast.isError} />}
    </div>
  );
}
