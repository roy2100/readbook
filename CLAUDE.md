# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server with HMR
npm run dev

# Production build → dist/
npm run build

# Run all tests (single pass)
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run tests/epub-parser.test.js
```

## Architecture

This is a **React 18 + Vite** app with mobile-first CSS. UI components use React Bootstrap (Offcanvas, Button, Form.Select, Toast).

**Data flow:**

```
File input → epub-parser.js → useBook hook → App.jsx → Reader component
                                                     ↘ useTts hook → tts.js → highlighter.js
```

### Source layout

```
src/
  lib/
    epub-parser.js   EPUB unzip + OPF/spine/TOC parsing
    highlighter.js   Sentence segmentation + DOM annotation + highlight state
    tts.js           Web Speech API wrapper
    utils.js         normalizePath() for ZIP image paths
  components/
    Header.jsx       App header with title + upload button
    Sidebar.jsx      TOC list — Offcanvas on mobile, static <aside> on desktop
    Reader.jsx       Chapter content area (dangerouslySetInnerHTML + useEffect)
    Controls.jsx     Playback controls footer
  hooks/
    useBook.js       EPUB open/load state + bookRef for synchronous access
    useIsMobile.js   matchMedia hook (breakpoint 768px)
    useTts.js        TTS play/pause/stop state wired to tts.js
  styles/
    index.css        Mobile-first app shell layout (custom CSS + Bootstrap utilities)
  App.jsx            Root — owns all state, wires hooks to components
```

### Key module details

1. **`epub-parser.js`** unzips the EPUB (via npm `jszip`), walks `container.xml → OPF → spine/manifest`, and returns a `book` object. Exports `extractOpfPath`, `parseOpf`, `buildChapterList`, `parseNavToc`, `parseNcxToc`, `parseEpub`, `loadChapter` for testing.

2. **`App.jsx`** is the wiring layer. It owns chapter navigation state and the HTML cache (`htmlCache` Map). Uses `bookRef` (useRef) alongside `book` state so the ref is available synchronously in callbacks after `openFile`.

3. **`highlighter.js`** has two roles: (a) `annotateChapter()` walks the loaded chapter DOM and wraps each sentence in `<span class="tts-sentence">` elements, returning `[{ text, el }]` pairs; (b) `highlight(el)` / `clearHighlight()` manage the single active highlight.

4. **`tts.js`** wraps Web Speech API. Queues utterances one-at-a-time (Chrome silently stalls on long utterances). Uses `synth.cancel()` instead of `synth.pause()` for pause/resume, storing `pausedIndex` to re-speak from the right sentence.

5. **`Sidebar.jsx`** uses `useIsMobile()` to switch between Bootstrap `<Offcanvas>` on mobile and a static `<aside>` on desktop.

### Layout

- **Mobile**: `.app { display: flex; flex-direction: column; }` — 3-row footer (nav / play / speed+voice)
- **Desktop** (≥768px): `.app { display: grid; grid-template-rows: header 1fr footer; }`, `.main { display: grid; grid-template-columns: sidebar 1fr; }`
- Play button is a 62px circle on mobile, rectangular on desktop

### Key constraints

- `DOMParser` is used for all XML/HTML parsing (EPUB content is XHTML; fallback to `text/html` on parse error).
- `dangerouslySetInnerHTML` renders chapter HTML inside `<Reader>`; a `useEffect` runs `annotateChapter()` after each render.
- Deployed to GitHub Pages via `.github/workflows/deploy.yml`; `vite.config.js` sets `base: '/readbook/'`.

## Testing

Tests run under Vitest with `environment: 'jsdom'`. 105 tests across 4 files.

- `window.speechSynthesis` and `SpeechSynthesisUtterance` do not exist in jsdom — mocked in `tts.test.js`.
- `highlighter.js` is vi-mocked in `tts.test.js` because `scrollIntoView` is not implemented in jsdom.
- `jszip` is vi-mocked in `epub-parser.test.js` so tests run without real ZIP binaries. A `fakeZip(entries)` helper builds an in-memory fake.

Test files live in `tests/` and map to source modules 1-to-1.
