/**
 * highlighter.js
 * Annotates chapter content with per-sentence spans and manages highlight state.
 */

const SENTENCE_CLASS = 'tts-sentence';
const ACTIVE_CLASS = 'active';

// ── Segment text into sentences (supports CJK and Latin) ──
export function segmentSentences(text) {
  // Split on CJK sentence endings OR Latin sentence endings (. ! ?)
  // Lookbehind: require the char before '.' is not a digit, to avoid splitting "3.14"
  const parts = text.split(/(?<=[。！？…!?])\s*|(?<=(?<!\d)\.(?!\d))\s+/u);
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}

// ── Walk text nodes in a DOM element and return paragraph-text pairs ──
function getParagraphs(container) {
  const result = [];
  const blockSelectors = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, div:not(:has(> p, > div))';

  // Try block-level elements first
  const blocks = container.querySelectorAll(blockSelectors);
  if (blocks.length > 0) {
    blocks.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 0) result.push({ el, text });
    });
  } else {
    // Fallback: treat the whole container as one block
    const text = container.textContent.trim();
    if (text.length > 0) result.push({ el: container, text });
  }

  return result;
}

// ── Annotate a container: wrap each sentence in a span ──
// Returns array of { text, el } for TTS consumption
export function annotateChapter(container) {
  const sentences = [];
  const paragraphs = getParagraphs(container);

  for (const { el, text } of paragraphs) {
    const segs = segmentSentences(text);
    if (segs.length === 0) continue;

    // Build annotated HTML
    const spans = segs.map((seg, i) => {
      const idx = sentences.length + i;
      return `<span class="${SENTENCE_CLASS}" data-tts-idx="${idx}">${escapeHtml(seg)}</span>`;
    });

    // Preserve a minimal version of the original element by replacing its text content
    // Keep original element structure but annotate text portions
    el.innerHTML = spans.join(' ');

    // Collect sentence objects
    const addedSpans = el.querySelectorAll(`[data-tts-idx]`);
    addedSpans.forEach((span, i) => {
      sentences.push({ text: segs[i], el: span });
    });
  }

  return sentences;
}

// ── Highlight the given sentence element, clear previous ──
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

// ── HTML escape for safe innerHTML insertion ──
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
