# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (single pass)
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run tests/epub-parser.test.js

# Serve locally (no build step needed)
python3 -m http.server 8080
```

## Architecture

This is a zero-build, pure ES-module web app. There is no bundler, no transpilation, and no framework. All files are loaded directly by the browser via `<script type="module">`.

**Data flow:**

```
File input → epub-parser.js → app.js → highlighter.js
                                    ↘ tts.js → highlighter.js
```

1. `epub-parser.js` unzips the EPUB (via CDN JSZip), walks `container.xml → OPF → spine/manifest`, and returns a `book` object with a chapter list. Internal parsing functions (`extractOpfPath`, `parseOpf`, `buildChapterList`, `parseNavToc`, `parseNcxToc`) are exported for testing.
2. `app.js` is the wiring layer. It owns all DOM event listeners, chapter navigation state, and the HTML cache (`htmlCache` Map). It imports from all other modules.
3. `highlighter.js` has two roles: (a) `annotateChapter()` walks the loaded chapter DOM and wraps each sentence in `<span class="tts-sentence">` elements, returning `[{ text, el }]` pairs; (b) `highlight(el)` / `clearHighlight()` manage the single active highlight.
4. `tts.js` wraps Web Speech API. It takes the sentence array from `highlighter.js`, queues utterances one-at-a-time (Chrome silently stalls on long utterances), and uses `synth.cancel()` instead of `synth.pause()` for pause/resume — storing `pausedIndex` to re-speak from the right sentence.
5. `utils.js` holds the pure `normalizePath()` function used by `app.js` to resolve image paths inside the ZIP.

**Key constraints:**
- JSZip is loaded from CDN and available as a global `JSZip` — it is not imported as an ES module.
- `DOMParser` is used for all XML/HTML parsing (EPUB content is XHTML; fallback to `text/html` on parse error).
- The app is entirely client-side; no server is required beyond a static file server.

## Testing

Tests run under Vitest with `environment: 'jsdom'`. `window.speechSynthesis` and `SpeechSynthesisUtterance` do not exist in jsdom and must be mocked in each TTS test file. The `highlighter.js` module is vi-mocked in `tts.test.js` because `scrollIntoView` is not implemented in jsdom.

Test files live in `tests/` and map to source modules 1-to-1.
