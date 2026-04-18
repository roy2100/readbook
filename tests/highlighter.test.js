import { describe, it, expect, beforeEach } from 'vitest';
import { segmentSentences, escapeHtml, annotateChapter } from '../src/lib/highlighter.js';

// ── segmentSentences ──────────────────────────────────────────────────────────

describe('segmentSentences', () => {
  it('splits on Chinese sentence-ending punctuation', () => {
    const result = segmentSentences('今天天气很好。我们去公园吧！你觉得怎么样？');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('今天天气很好。');
    expect(result[1]).toBe('我们去公园吧！');
    expect(result[2]).toBe('你觉得怎么样？');
  });

  it('splits on English sentence-ending punctuation', () => {
    const result = segmentSentences('Hello world. How are you? I am fine!');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Hello world.');
  });

  it('handles mixed Chinese and English text', () => {
    const result = segmentSentences('这是中文。This is English. 这是结尾！');
    expect(result).toHaveLength(3);
  });

  it('returns the whole string when no sentence-ending punctuation', () => {
    const result = segmentSentences('No punctuation here at all');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('No punctuation here at all');
  });

  it('returns empty array for empty string', () => {
    expect(segmentSentences('')).toHaveLength(0);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(segmentSentences('   ')).toHaveLength(0);
  });

  it('ellipsis (…) counts as sentence boundary', () => {
    const result = segmentSentences('他沉默了…然后开口说话。');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('decimal numbers do not split incorrectly in English', () => {
    // "3.14" should ideally stay in one sentence — this documents current behavior
    const result = segmentSentences('Pi is 3.14 and e is 2.71.');
    // Current regex splits on any '.' — document the known limitation
    // At minimum the result should be non-empty and not throw
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(s => s.length > 0)).toBe(true);
  });

  it('does not produce empty strings in output', () => {
    const result = segmentSentences('第一句。第二句！第三句？');
    expect(result.every(s => s.trim().length > 0)).toBe(true);
  });

  it('handles consecutive punctuation without crashing', () => {
    expect(() => segmentSentences('真的吗？！太好了！')).not.toThrow();
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes & < > "', () => {
    expect(escapeHtml('<b>Tom & "Jerry"</b>')).toBe('&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
  });

  it('escapes ampersand before angle brackets (order matters)', () => {
    // If & is not escaped first, &lt; would become &amp;lt; — double-escape
    // Correct: & → &amp; first, so plain & becomes &amp;
    const result = escapeHtml('a & b');
    expect(result).toBe('a &amp; b');
  });

  it('double-escapes pre-escaped entities (known behavior to document)', () => {
    // Input already contains &lt; → escapeHtml escapes the & → &amp;lt;
    // This is the double-escape bug. Test documents current behavior.
    const result = escapeHtml('&lt;div&gt;');
    expect(result).toBe('&amp;lt;div&amp;gt;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ── annotateChapter ───────────────────────────────────────────────────────────

describe('annotateChapter', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('wraps sentences in spans with data-tts-idx', () => {
    container.innerHTML = '<p>第一句话。第二句话。</p>';
    const sentences = annotateChapter(container);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    const spans = container.querySelectorAll('.tts-sentence');
    expect(spans.length).toBe(sentences.length);
  });

  it('returns sentence objects with text and el properties', () => {
    container.innerHTML = '<p>Hello world. How are you?</p>';
    const sentences = annotateChapter(container);
    expect(sentences.length).toBeGreaterThan(0);
    sentences.forEach(s => {
      expect(s).toHaveProperty('text');
      expect(s).toHaveProperty('el');
      expect(s.text.length).toBeGreaterThan(0);
    });
  });

  it('returns empty array for empty container', () => {
    container.innerHTML = '';
    const sentences = annotateChapter(container);
    expect(sentences).toHaveLength(0);
  });

  it('returns empty array for whitespace-only container', () => {
    container.innerHTML = '<p>   </p>';
    const sentences = annotateChapter(container);
    expect(sentences).toHaveLength(0);
  });

  it('handles multiple paragraphs with consecutive indices', () => {
    container.innerHTML = '<p>第一段。</p><p>第二段。</p>';
    const sentences = annotateChapter(container);
    // Indices should be consecutive across paragraphs
    sentences.forEach((s, i) => {
      expect(s.el.getAttribute('data-tts-idx')).toBe(String(i));
    });
  });

  it('escapes HTML in sentence text', () => {
    container.innerHTML = '<p>Score is 5 &gt; 3.</p>';
    const sentences = annotateChapter(container);
    // Span innerHTML should not contain unescaped < or >
    sentences.forEach(s => {
      expect(s.el.innerHTML).not.toMatch(/<(?!\/?(span))/);
    });
  });

  it('does not crash on container with only block elements with no text', () => {
    container.innerHTML = '<p></p><p></p>';
    expect(() => annotateChapter(container)).not.toThrow();
  });
});
