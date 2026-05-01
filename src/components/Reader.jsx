import { useRef, useEffect } from 'react';
import { annotateChapter } from '../lib/highlighter.js';
import { resolveImages } from '../hooks/useBook.js';

export default function Reader({ chapterHtml, book, currentChapter, isLoading, onSentencesReady, onSentenceClick }) {
  const readerRef = useRef(null);
  const contentRef = useRef(null);
  const onReadyRef = useRef(onSentencesReady);
  useEffect(() => { onReadyRef.current = onSentencesReady; });
  const onSentenceClickRef = useRef(onSentenceClick);
  useEffect(() => { onSentenceClickRef.current = onSentenceClick; });

  useEffect(() => {
    if (readerRef.current) readerRef.current.scrollTop = 0;
  }, [chapterHtml]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleClick = (e) => {
      if (!onSentenceClickRef.current) return;
      const span = e.target.closest('.tts-sentence');
      if (!span) return;
      const idx = parseInt(span.dataset.ttsIdx, 10);
      if (!isNaN(idx)) onSentenceClickRef.current(idx);
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [chapterHtml]);

  useEffect(() => {
    if (!chapterHtml || !contentRef.current || !book || !currentChapter) return;
    let cancelled = false;

    resolveImages(contentRef.current, book.zip, book.opfDir, currentChapter.href).then(() => {
      if (cancelled) return;
      const sentences = annotateChapter(contentRef.current);
      onReadyRef.current(sentences);
    });

    return () => { cancelled = true; };
  }, [chapterHtml, book, currentChapter]);

  return (
    <main className={`reader${onSentenceClick ? ' reader-tts-clickable' : ''}`} ref={readerRef}>
      {isLoading ? (
        <div className="reader-loading">加载中…</div>
      ) : chapterHtml !== null ? (
        <div
          ref={contentRef}
          className="reader-content"
          dangerouslySetInnerHTML={{ __html: chapterHtml }}
        />
      ) : (
        <div className="reader-welcome">
          <div className="welcome-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <h2>EPUB 朗读器</h2>
          <p>点击底部「打开 EPUB」按钮，选择电子书文件开始阅读</p>
          <ul>
            <li>支持 EPUB 2 / EPUB 3 格式</li>
            <li>中英文语音朗读</li>
            <li>句子高亮跟读</li>
            <li>调节速度与音色</li>
          </ul>
        </div>
      )}
    </main>
  );
}
