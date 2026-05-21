import { useState, useRef, useCallback } from 'react';
import { parseEpub, loadChapter } from '../lib/epub-parser.js';
import { normalizePath } from '../lib/utils.js';
import { saveBook, loadBook } from '../lib/bookStorage.js';

export function useBook() {
  const [book, setBook] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chapterHtml, setChapterHtml] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const bookRef = useRef(null);
  const htmlCache = useRef(new Map());

  const openFile = useCallback(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseEpub(new File([arrayBuffer], file.name, { type: file.type }));
    htmlCache.current.clear();
    bookRef.current = parsed;
    setBook(parsed);
    setCurrentIndex(0);
    setChapterHtml(null);
    saveBook(arrayBuffer).catch(() => {});
    return parsed;
  }, []);

  const goToChapter = useCallback(async (index) => {
    const currentBook = bookRef.current;
    if (!currentBook || index < 0 || index >= currentBook.chapters.length) return;

    setIsLoading(true);
    setCurrentIndex(index);

    try {
      const ch = currentBook.chapters[index];
      let html;
      if (htmlCache.current.has(index)) {
        html = htmlCache.current.get(index);
      } else {
        html = await loadChapter(currentBook.zip, ch);
        htmlCache.current.set(index, html);
      }
      setChapterHtml(html);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restoreBook = useCallback(async () => {
    const arrayBuffer = await loadBook();
    if (!arrayBuffer) return null;
    const file = new File([arrayBuffer], 'book.epub', { type: 'application/epub+zip' });
    const parsed = await parseEpub(file);
    htmlCache.current.clear();
    bookRef.current = parsed;
    setBook(parsed);
    setChapterHtml(null);
    return parsed;
  }, []);

  return { book, currentIndex, chapterHtml, isLoading, openFile, goToChapter, restoreBook };
}

export async function resolveImages(container, zip, opfDir, chapterHref) {
  const chapterDir = chapterHref.includes('/')
    ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
    : '';

  const imgs = container.querySelectorAll('img[src]');
  await Promise.allSettled(
    Array.from(imgs).map(async (img) => {
      const src = img.getAttribute('src');
      if (src.startsWith('data:') || src.startsWith('http')) return;
      const fullPath = normalizePath(opfDir + chapterDir + src);
      try {
        const blob = await zip.file(fullPath)?.async('blob');
        if (blob) img.src = URL.createObjectURL(blob);
        else img.remove();
      } catch (_) {
        img.remove();
      }
    })
  );
}
