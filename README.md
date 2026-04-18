# ReadBook

A browser-based EPUB reader with text-to-speech. No backend — open an EPUB and listen.

![React](https://img.shields.io/badge/React-18-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![Tests](https://img.shields.io/badge/tests-105%20passing-green)

## Features

- **EPUB 2 / EPUB 3** support — parses `container.xml → OPF → spine`
- **Text-to-speech** using the browser's native Web Speech API
- **Sentence highlighting** — current sentence highlighted and auto-scrolled into view
- **Chapter navigation** with table of contents sidebar
- **Speed control** — 0.5× to 2.0×
- **Voice selection** — all system voices, sorted by language match
- **Mobile-first** — responsive layout with sidebar drawer on mobile, static sidebar on desktop

## Live Demo

Hosted on GitHub Pages: [https://roy2100.github.io/readbook/](https://roy2100.github.io/readbook/)

## Quick Start

```bash
git clone https://github.com/roy2100/readbook.git
cd readbook
npm install
npm run dev
# Open http://localhost:5173 in Chrome or Safari
```

## Browser Compatibility

Requires Web Speech API support. Recommended: **Chrome** or **Safari on macOS** (access to high-quality system voices including Siri voices).

## Development

```bash
npm install          # install dependencies
npm run dev          # dev server with HMR
npm run build        # production build → dist/
npm test             # run all 105 tests (single pass)
npm run test:watch   # watch mode
```

Tests use [Vitest](https://vitest.dev/) with jsdom. Coverage spans EPUB parsing, sentence segmentation, HTML escaping, and the TTS state machine.

## Architecture

```
epub-parser.js   EPUB unzip + OPF/spine/TOC parsing
highlighter.js   Sentence segmentation + DOM annotation + highlight state
tts.js           Web Speech API wrapper (sentence queue, pause/resume)
utils.js         normalizePath() for resolving image paths inside ZIP
App.jsx          Root component — wires state, chapter navigation, image resolution
components/      Sidebar, Reader, Controls, Header (React components)
hooks/           useBook, useIsMobile, useTts (custom hooks)
```

See [CLAUDE.md](CLAUDE.md) for a detailed architecture description.
