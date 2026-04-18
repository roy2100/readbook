const SENTENCE_CLASS = 'tts-sentence';
const ACTIVE_CLASS = 'active';

export function segmentSentences(text) {
  const parts = text.split(/(?<=[。！？…!?])\s*|(?<=(?<!\d)\.(?!\d))\s+/u);
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}

function getParagraphs(container) {
  const result = [];
  const blockSelectors = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, div:not(:has(> p, > div))';
  const blocks = container.querySelectorAll(blockSelectors);
  if (blocks.length > 0) {
    blocks.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 0) result.push({ el, text });
    });
  } else {
    const text = container.textContent.trim();
    if (text.length > 0) result.push({ el: container, text });
  }
  return result;
}

export function annotateChapter(container) {
  const sentences = [];
  const paragraphs = getParagraphs(container);

  for (const { el, text } of paragraphs) {
    const segs = segmentSentences(text);
    if (segs.length === 0) continue;

    const spans = segs.map((seg, i) => {
      const idx = sentences.length + i;
      return `<span class="${SENTENCE_CLASS}" data-tts-idx="${idx}">${escapeHtml(seg)}</span>`;
    });

    el.innerHTML = spans.join(' ');

    const addedSpans = el.querySelectorAll('[data-tts-idx]');
    addedSpans.forEach((span, i) => {
      sentences.push({ text: segs[i], el: span });
    });
  }

  return sentences;
}

let currentActive = null;

export function highlight(el) {
  if (currentActive) currentActive.classList.remove(ACTIVE_CLASS);
  currentActive = el;
  if (el) {
    el.classList.add(ACTIVE_CLASS);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function clearHighlight() {
  if (currentActive) {
    currentActive.classList.remove(ACTIVE_CLASS);
    currentActive = null;
  }
}

export function escapeHtml(text) {
  return text
    .replace(/&(?![a-zA-Z#]\w+;)/g, '&amp;')  // skip already-valid entities
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
