# ReadBook

A browser-based EPUB reader with text-to-speech. No installation, no backend — open an EPUB and listen.

![Static web app](https://img.shields.io/badge/static-web%20app-blue) ![Zero dependencies](https://img.shields.io/badge/dependencies-zero-green)

## Features

- **EPUB 2 / EPUB 3** support — parses `container.xml → OPF → spine`
- **Text-to-speech** using the browser's native Web Speech API
- **Sentence highlighting** — current sentence is highlighted and auto-scrolled into view
- **Chapter navigation** with table of contents sidebar
- **Speed control** — 0.5× to 2.0×
- **Voice selection** — all system voices, sorted by language match

## Quick Start

```bash
git clone https://github.com/roy2100/readbook.git
cd readbook
python3 -m http.server 8080
# Open http://localhost:8080 in Chrome or Safari
```

No build step. No `npm install` required to run the app.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Previous chapter |
| `→` | Next chapter |
| `Esc` | Stop |

## Browser Compatibility

Requires Web Speech API support. Recommended: **Chrome** or **Safari on macOS** (access to high-quality system voices).

## Development

```bash
npm install      # install vitest (dev only)
npm test         # run all 89 tests
npm run test:watch  # watch mode
```

Tests use [Vitest](https://vitest.dev/) with jsdom. Coverage spans EPUB parsing, sentence segmentation, HTML escaping, and the TTS state machine.

## Architecture

```
epub-parser.js   EPUB unzip + OPF/spine/TOC parsing
highlighter.js   Sentence segmentation + DOM annotation + highlight state
tts.js           Web Speech API wrapper (sentence queue, pause/resume)
utils.js         normalizePath() for resolving image paths inside ZIP
app.js           UI wiring — events, chapter navigation, image resolution
```

See [CLAUDE.md](CLAUDE.md) for a detailed architecture description.
