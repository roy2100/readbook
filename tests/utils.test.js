import { describe, it, expect } from 'vitest';
import { normalizePath } from '../utils.js';

describe('normalizePath', () => {
  it('passes through a clean path unchanged', () => {
    expect(normalizePath('OEBPS/Text/chapter1.xhtml')).toBe('OEBPS/Text/chapter1.xhtml');
  });

  it('resolves a single ../ segment', () => {
    expect(normalizePath('OEBPS/Text/../Images/cover.jpg')).toBe('OEBPS/Images/cover.jpg');
  });

  it('resolves multiple ../ segments', () => {
    expect(normalizePath('a/b/c/../../file.png')).toBe('a/file.png');
  });

  it('strips ./ segments', () => {
    expect(normalizePath('OEBPS/./Text/ch1.xhtml')).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('combines opfDir + chapterDir + relative src correctly', () => {
    // Simulates: opfDir='OEBPS/' + chapterDir='Text/' + src='../Images/fig.png'
    expect(normalizePath('OEBPS/Text/../Images/fig.png')).toBe('OEBPS/Images/fig.png');
  });

  it('handles empty string gracefully', () => {
    expect(normalizePath('')).toBe('');
  });

  it('stack underflow: excessive ../ yields empty prefix (does not throw)', () => {
    // Three ../ from a one-level path — pops past root, stack becomes empty
    const result = normalizePath('a/../../file.png');
    // Stack: push 'a', pop (→ []), pop (→ undefined pushed nothing), push 'file.png'
    // Result should not contain 'undefined'
    expect(result).not.toContain('undefined');
  });

  it('path starting with ../ does not throw', () => {
    // Pop on empty stack returns undefined silently in JS — must not crash
    expect(() => normalizePath('../escape.xhtml')).not.toThrow();
  });

  it('all-dotdot path produces empty string, not "undefined"', () => {
    const result = normalizePath('../..');
    expect(result).not.toContain('undefined');
  });
});
