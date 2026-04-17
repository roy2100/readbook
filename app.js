/**
 * app.js
 * Main application: wires together EPUB parser, TTS controller,
 * highlighter, and all UI events.
 */

import { parseEpub, loadChapter } from './epub-parser.js';
import { TTSController, initVoices } from './tts.js';
import { annotateChapter } from './highlighter.js';
import { normalizePath } from './utils.js';

// ── State ──
let book = null;
let currentChapterIndex = 0;
const htmlCache = new Map();  // index → raw HTML string (avoids re-fetching from ZIP)

const tts = new TTSController();

// ── DOM refs ──
const fileInput       = document.getElementById('file-input');
const bookTitle       = document.getElementById('book-title');
const tocList         = document.getElementById('toc-list');
const readerContent   = document.getElementById('reader-content');
const chapterIndicator = document.getElementById('chapter-indicator');
const btnPlay         = document.getElementById('btn-play');
const iconPlay        = document.getElementById('icon-play');
const iconPause       = document.getElementById('icon-pause');
const btnStop         = document.getElementById('btn-stop');
const btnPrev         = document.getElementById('btn-prev');
const btnNext         = document.getElementById('btn-next');
const speedSelect     = document.getElementById('speed-select');
const voiceSelect     = document.getElementById('voice-select');
const toast           = document.getElementById('toast');

// ── File upload ──
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showToast('正在解析 EPUB…');

  try {
    book = await parseEpub(file);
    htmlCache.clear();
    tts.stop();

    bookTitle.textContent = book.title;
    document.title = `${book.title} — ReadBook`;

    renderToc();
    await goToChapter(0);

    setControlsEnabled(true);
    showToast(`《${book.title}》已加载`);
  } catch (err) {
    console.error(err);
    showToast('解析失败: ' + err.message, true);
  }

  // Reset input so same file can be re-loaded
  fileInput.value = '';
});

// ── Render table of contents ──
function renderToc() {
  tocList.innerHTML = '';
  book.chapters.forEach((ch, i) => {
    const btn = document.createElement('button');
    btn.className = 'toc-item';
    btn.textContent = ch.title;
    btn.title = ch.title;
    btn.addEventListener('click', () => {
      tts.stop();
      goToChapter(i);
    });
    tocList.appendChild(btn);
  });
}

// ── Navigate to a chapter ──
async function goToChapter(index) {
  if (!book || index < 0 || index >= book.chapters.length) return;

  tts.stop();
  currentChapterIndex = index;

  // Update TOC active state
  tocList.querySelectorAll('.toc-item').forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
    if (i === index) btn.scrollIntoView({ block: 'nearest' });
  });

  // Update chapter indicator
  const ch = book.chapters[index];
  chapterIndicator.textContent = ch.title;
  chapterIndicator.title = ch.title;

  // Update prev/next buttons
  btnPrev.disabled = index === 0;
  btnNext.disabled = index === book.chapters.length - 1;

  // Show loading state
  readerContent.innerHTML = '<div class="loading-chapter">加载中…</div>';
  readerContent.scrollTop = 0;

  try {
    const sentences = await loadAndAnnotate(index);
    tts.load(sentences);

    // Auto-scroll reader to top
    document.getElementById('reader').scrollTop = 0;
  } catch (err) {
    console.error(err);
    readerContent.innerHTML = `<p style="color:#c00;font-family:sans-serif">加载章节失败: ${err.message}</p>`;
  }
}

async function loadAndAnnotate(index) {
  const ch = book.chapters[index];

  let html;
  if (htmlCache.has(index)) {
    html = htmlCache.get(index);
  } else {
    html = await loadChapter(book.zip, ch);
    htmlCache.set(index, html);
  }

  readerContent.innerHTML = html;

  // Re-render images using object URLs from zip (best-effort)
  await resolveImages(readerContent, book.zip, book.opfDir, ch.href);

  // Annotate for TTS
  const sentences = annotateChapter(readerContent);
  return sentences;
}

// ── Resolve relative image paths inside chapter HTML ──
async function resolveImages(container, zip, opfDir, chapterHref) {
  const chapterDir = chapterHref.includes('/')
    ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
    : '';

  const imgs = container.querySelectorAll('img[src]');
  const promises = Array.from(imgs).map(async (img) => {
    const src = img.getAttribute('src');
    if (src.startsWith('data:') || src.startsWith('http')) return;

    // Resolve relative to chapter directory, then to opfDir
    let fullPath = opfDir + chapterDir + src;
    // Normalize: collapse ../ segments
    fullPath = normalizePath(fullPath);

    try {
      const blob = await zip.file(fullPath)?.async('blob');
      if (blob) img.src = URL.createObjectURL(blob);
      else img.remove();
    } catch (_) {
      img.remove();
    }
  });

  await Promise.allSettled(promises);
}


// ── TTS state callback → update UI ──
tts.onStateChange = (state) => {
  const playing = state === 'playing';
  const stopped = state === 'stopped' || state === 'ended';

  iconPlay.style.display  = playing ? 'none' : '';
  iconPause.style.display = playing ? '' : 'none';

  btnStop.disabled = stopped;

  if (state === 'ended') {
    // Auto-advance to next chapter
    if (currentChapterIndex < book.chapters.length - 1) {
      setTimeout(() => goToChapter(currentChapterIndex + 1).then(() => tts.play()), 800);
    }
  }
};

// ── Play/Pause button ──
btnPlay.addEventListener('click', () => {
  if (tts.isPlaying) {
    tts.pause();
  } else {
    tts.play();
  }
});

// ── Stop button ──
btnStop.addEventListener('click', () => tts.stop());

// ── Previous chapter ──
btnPrev.addEventListener('click', () => {
  tts.stop();
  goToChapter(currentChapterIndex - 1);
});

// ── Next chapter ──
btnNext.addEventListener('click', () => {
  tts.stop();
  goToChapter(currentChapterIndex + 1);
});

// ── Speed control ──
speedSelect.addEventListener('change', () => {
  tts.setRate(speedSelect.value);
});

// ── Voice control ──
voiceSelect.addEventListener('change', () => {
  tts.setVoice(voiceSelect.value);
});

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (!book) return;
  // Ignore if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (tts.isPlaying) tts.pause(); else tts.play();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      tts.stop();
      goToChapter(currentChapterIndex - 1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      tts.stop();
      goToChapter(currentChapterIndex + 1);
      break;
    case 'Escape':
      tts.stop();
      break;
  }
});

// ── Initialize voice list ──
initVoices((voices) => {
  const preferredLang = book?.language || 'zh';
  const sorted = tts.getVoices(preferredLang);

  voiceSelect.innerHTML = '<option value="">默认</option>';
  sorted.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
});

// ── Enable/disable controls ──
function setControlsEnabled(enabled) {
  btnPlay.disabled = !enabled;
  btnStop.disabled = !enabled;
  btnPrev.disabled = !enabled || currentChapterIndex === 0;
  btnNext.disabled = !enabled || (book && currentChapterIndex === book.chapters.length - 1);
}

// ── Toast notification ──
let toastTimer = null;
function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.style.background = isError ? '#c00' : '#1a1a1a';
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}
