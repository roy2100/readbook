import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractOpfPath,
  parseOpf,
  buildChapterList,
  parseNavToc,
  parseNcxToc,
  parseEpub,
  loadChapter,
} from '../src/lib/epub-parser.js';

// Mock JSZip — parseEpub needs it but tests shouldn't require real ZIP binaries
vi.mock('jszip', () => ({ default: { loadAsync: vi.fn() } }));
import JSZip from 'jszip';

// Build a fake in-memory zip from a { path: content } map
function fakeZip(entries) {
  return {
    file: (path) => {
      const content = entries[path] ?? entries[decodeURIComponent(path)] ?? null;
      if (!content) return null;
      return { async: () => Promise.resolve(content) };
    },
  };
}

// ── extractOpfPath ────────────────────────────────────────────────────────────

describe('extractOpfPath', () => {
  it('extracts full-path from a standard container.xml', () => {
    const xml = `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>`;
    expect(extractOpfPath(xml)).toBe('OEBPS/content.opf');
  });

  it('returns null when rootfile element is missing', () => {
    const xml = `<?xml version="1.0"?><container><rootfiles></rootfiles></container>`;
    expect(extractOpfPath(xml)).toBeNull();
  });

  it('returns null on empty XML', () => {
    expect(extractOpfPath('')).toBeNull();
  });

  it('returns null when full-path attribute is absent', () => {
    const xml = `<container><rootfiles><rootfile media-type="application/oebps-package+xml"/></rootfiles></container>`;
    expect(extractOpfPath(xml)).toBeNull();
  });

  it('handles OPF file at root (no directory prefix)', () => {
    const xml = `<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`;
    expect(extractOpfPath(xml)).toBe('content.opf');
  });

  it('does not throw on completely malformed XML', () => {
    expect(() => extractOpfPath('<<not xml at all>>')).not.toThrow();
  });
});

// ── parseOpf ─────────────────────────────────────────────────────────────────

const MINIMAL_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

describe('parseOpf', () => {
  it('extracts title, creator, language from metadata', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    expect(opf.metadata.title).toBe('Test Book');
    expect(opf.metadata.creator).toBe('Test Author');
    expect(opf.metadata.language).toBe('zh');
  });

  it('builds manifest with correct fullPath using opfDir', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    expect(opf.manifest['ch1'].href).toBe('Text/ch1.xhtml');
    expect(opf.manifest['ch1'].fullPath).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('normalizes ../ segments in manifest fullPath', () => {
    // EPUBs sometimes place chapter files in a sibling dir of the OPF,
    // referencing them with "../". Without normalizePath this produces
    // "OEBPS/../Text/ch1.xhtml" which JSZip cannot resolve.
    const xml = MINIMAL_OPF.replace('href="Text/ch1.xhtml"', 'href="../Text/ch1.xhtml"');
    const opf = parseOpf(xml, 'OEBPS/');
    expect(opf.manifest['ch1'].fullPath).toBe('Text/ch1.xhtml');
  });

  it('normalizes ./ segments in manifest fullPath', () => {
    const xml = MINIMAL_OPF.replace('href="Text/ch1.xhtml"', 'href="./Text/ch1.xhtml"');
    const opf = parseOpf(xml, 'OEBPS/');
    expect(opf.manifest['ch1'].fullPath).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('builds spine in document order', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    expect(opf.spine).toEqual(['ch1', 'ch2']);
  });

  it('silently drops spine items not in manifest', () => {
    const xml = MINIMAL_OPF.replace(
      '<itemref idref="ch2"/>',
      '<itemref idref="ch2"/><itemref idref="GHOST"/>'
    );
    const opf = parseOpf(xml, 'OEBPS/');
    expect(opf.spine).not.toContain('GHOST');
    expect(opf.spine).toHaveLength(2);
  });

  it('detects nav item by properties="nav"', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    expect(opf.navId).toBe('nav');
  });

  it('detects ncx item by media-type', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    expect(opf.ncxId).toBe('ncx');
  });

  it('handles OPF at root (empty opfDir)', () => {
    const opf = parseOpf(MINIMAL_OPF, '');
    expect(opf.manifest['ch1'].fullPath).toBe('Text/ch1.xhtml');
  });

  it('decodes URL-encoded hrefs in manifest', () => {
    const xml = MINIMAL_OPF.replace(
      'href="Text/ch1.xhtml"',
      'href="Text/Chapter%201.xhtml"'
    );
    const opf = parseOpf(xml, 'OEBPS/');
    expect(opf.manifest['ch1'].href).toBe('Text/Chapter 1.xhtml');
  });

  it('handles empty manifest and spine without throwing', () => {
    const xml = `<package><metadata/><manifest/><spine/></package>`;
    const opf = parseOpf(xml, '');
    expect(opf.spine).toHaveLength(0);
    expect(Object.keys(opf.manifest)).toHaveLength(0);
  });

  it('handles missing metadata fields gracefully', () => {
    const xml = `<package><metadata/><manifest/><spine/></package>`;
    const opf = parseOpf(xml, '');
    expect(opf.metadata.title).toBe('');
    expect(opf.metadata.creator).toBe('');
  });
});

// ── buildChapterList ──────────────────────────────────────────────────────────

describe('buildChapterList', () => {
  it('produces chapters in spine order with placeholder titles', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    const chapters = buildChapterList(opf);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].href).toBe('Text/ch1.xhtml');
    expect(chapters[0].title).toBe('第 1 章');
    expect(chapters[1].title).toBe('第 2 章');
  });

  it('includes the correct fullPath for each chapter', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    const chapters = buildChapterList(opf);
    expect(chapters[0].fullPath).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('returns empty array for empty spine', () => {
    const xml = `<package><metadata/><manifest/><spine/></package>`;
    const opf = parseOpf(xml, '');
    expect(buildChapterList(opf)).toHaveLength(0);
  });

  it('assigns sequential index values', () => {
    const opf = parseOpf(MINIMAL_OPF, 'OEBPS/');
    const chapters = buildChapterList(opf);
    chapters.forEach((ch, i) => expect(ch.index).toBe(i));
  });
});

// ── parseNavToc ───────────────────────────────────────────────────────────────

describe('parseNavToc', () => {
  const NAV_HTML = `<!DOCTYPE html>
  <html xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="Text/ch1.xhtml">第一章</a></li>
        <li><a href="Text/ch2.xhtml#intro">第二章</a></li>
      </ol>
    </nav>
  </body></html>`;

  it('extracts href → title pairs from EPUB 3 nav', () => {
    const map = {};
    parseNavToc(NAV_HTML, map);
    expect(map['Text/ch1.xhtml']).toBe('第一章');
  });

  it('includes fragment identifiers in the key', () => {
    const map = {};
    parseNavToc(NAV_HTML, map);
    expect(map['Text/ch2.xhtml#intro']).toBe('第二章');
  });

  it('falls back to first <nav> when epub:type is missing', () => {
    const html = `<html><body><nav><ol><li><a href="ch1.xhtml">Ch 1</a></li></ol></nav></body></html>`;
    const map = {};
    parseNavToc(html, map);
    expect(map['ch1.xhtml']).toBe('Ch 1');
  });

  it('does nothing when no <nav> element exists', () => {
    const map = {};
    parseNavToc('<html><body><p>No nav here</p></body></html>', map);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('skips anchors with empty text', () => {
    const html = `<html><body><nav><a href="ch1.xhtml">  </a></nav></body></html>`;
    const map = {};
    parseNavToc(html, map);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

// ── parseNcxToc ───────────────────────────────────────────────────────────────

describe('parseNcxToc', () => {
  const NCX_XML = `<?xml version="1.0"?>
  <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
    <navMap>
      <navPoint id="np1">
        <navLabel><text>序章</text></navLabel>
        <content src="Text/preface.xhtml"/>
      </navPoint>
      <navPoint id="np2">
        <navLabel><text>第一章</text></navLabel>
        <content src="Text/ch1.xhtml#section1"/>
      </navPoint>
    </navMap>
  </ncx>`;

  it('extracts titles from EPUB 2 NCX navPoints', () => {
    const map = {};
    parseNcxToc(NCX_XML, map);
    expect(map['Text/preface.xhtml']).toBe('序章');
    expect(map['Text/ch1.xhtml#section1']).toBe('第一章');
  });

  it('does not throw on empty NCX', () => {
    const map = {};
    expect(() => parseNcxToc('<ncx><navMap/></ncx>', map)).not.toThrow();
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('skips navPoints missing content or label', () => {
    const xml = `<ncx><navMap>
      <navPoint><navLabel><text>OK</text></navLabel><content src="ch1.xhtml"/></navPoint>
      <navPoint><navLabel><text>No content</text></navLabel></navPoint>
      <navPoint><content src="ch3.xhtml"/></navPoint>
    </navMap></ncx>`;
    const map = {};
    parseNcxToc(xml, map);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map['ch1.xhtml']).toBe('OK');
  });
});

// ── parseEpub ─────────────────────────────────────────────────────────────────

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const FULL_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试书籍</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

const NAV_HTML_FULL = `<!DOCTYPE html>
<html xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="Text/ch1.xhtml">第一章</a></li>
      <li><a href="Text/ch2.xhtml">第二章</a></li>
    </ol>
  </nav>
</body></html>`;

const OPF_WITH_NCX = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>NCX 书籍</dc:title>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

const NCX_XML_FULL = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint>
      <navLabel><text>序章</text></navLabel>
      <content src="Text/ch1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

describe('parseEpub', () => {
  beforeEach(() => {
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': FULL_OPF,
      'OEBPS/nav.xhtml': NAV_HTML_FULL,
    }));
  });

  it('returns title, author, language from metadata', async () => {
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.title).toBe('测试书籍');
    expect(book.author).toBe('测试作者');
    expect(book.language).toBe('zh');
  });

  it('falls back to filename when title metadata is empty', async () => {
    const opf = FULL_OPF.replace('<dc:title>测试书籍</dc:title>', '');
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': opf,
      'OEBPS/nav.xhtml': NAV_HTML_FULL,
    }));
    const book = await parseEpub(new File([], 'my-novel.epub'));
    expect(book.title).toBe('my-novel');
  });

  it('builds chapter list in spine order', async () => {
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters[0].href).toBe('Text/ch1.xhtml');
    expect(book.chapters[1].href).toBe('Text/ch2.xhtml');
  });

  it('attaches TOC titles from EPUB 3 nav document', async () => {
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.chapters[0].title).toBe('第一章');
    expect(book.chapters[1].title).toBe('第二章');
  });

  it('falls back to NCX titles when no nav item exists', async () => {
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': OPF_WITH_NCX,
      'OEBPS/toc.ncx': NCX_XML_FULL,
    }));
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.chapters[0].title).toBe('序章');
  });

  it('keeps placeholder title when neither nav nor NCX is available', async () => {
    const opfNoToc = FULL_OPF.replace(
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      ''
    );
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': opfNoToc,
    }));
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.chapters[0].title).toBe('第 1 章');
  });

  it('matches TOC title by bare filename across different directory prefixes', async () => {
    // Nav uses bare "ch1.xhtml", spine has "Text/ch1.xhtml" — should still match
    const navCrossDir = NAV_HTML_FULL
      .replace('href="Text/ch1.xhtml"', 'href="ch1.xhtml"')
      .replace('href="Text/ch2.xhtml"', 'href="ch2.xhtml"');
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      'OEBPS/content.opf': FULL_OPF,
      'OEBPS/nav.xhtml': navCrossDir,
    }));
    const book = await parseEpub(new File([], 'test.epub'));
    expect(book.chapters[0].title).toBe('第一章');
  });

  it('returns zip object and opfDir for downstream use', async () => {
    const book = await parseEpub(new File([], 'test.epub'));
    expect(typeof book.zip.file).toBe('function');
    expect(book.opfDir).toBe('OEBPS/');
  });

  it('throws when container.xml is missing from the ZIP', async () => {
    JSZip.loadAsync.mockResolvedValue(fakeZip({}));
    await expect(parseEpub(new File([], 'test.epub')))
      .rejects.toThrow('META-INF/container.xml');
  });

  it('throws when container.xml has no OPF path', async () => {
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': '<container><rootfiles/></container>',
    }));
    await expect(parseEpub(new File([], 'test.epub')))
      .rejects.toThrow('OPF');
  });

  it('throws when the OPF file itself is missing from the ZIP', async () => {
    JSZip.loadAsync.mockResolvedValue(fakeZip({
      'META-INF/container.xml': CONTAINER_XML,
      // content.opf intentionally omitted
    }));
    await expect(parseEpub(new File([], 'test.epub')))
      .rejects.toThrow('OEBPS/content.opf');
  });
});

// ── loadChapter ───────────────────────────────────────────────────────────────

describe('loadChapter', () => {
  it('returns the body innerHTML of a chapter file', async () => {
    const zip = fakeZip({
      'OEBPS/Text/ch1.xhtml': '<html><body><p>Hello World</p></body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/ch1.xhtml' });
    expect(html).toContain('<p>Hello World</p>');
  });

  it('strips <script> elements', async () => {
    const zip = fakeZip({
      'OEBPS/Text/ch1.xhtml': '<html><body><p>Text</p><script>alert(1)</script></body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/ch1.xhtml' });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('<p>Text</p>');
  });

  it('strips <style> elements', async () => {
    const zip = fakeZip({
      'OEBPS/Text/ch1.xhtml': '<html><head><style>body{color:red}</style></head><body><p>Text</p></body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/ch1.xhtml' });
    expect(html).not.toMatch(/<style/i);
    expect(html).toContain('<p>Text</p>');
  });

  it('returns empty string for an empty body', async () => {
    const zip = fakeZip({
      'OEBPS/Text/empty.xhtml': '<html><body></body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/empty.xhtml' });
    expect(html).toBe('');
  });

  it('returns empty string for a whitespace-only body', async () => {
    const zip = fakeZip({
      'OEBPS/Text/spaces.xhtml': '<html><body>  \n\t  </body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/spaces.xhtml' });
    expect(html).toBe('');
  });

  it('loads chapter from ZIP when fullPath was normalized from ../ href', async () => {
    // After parseOpf normalizes "OEBPS/../Text/ch1.xhtml" → "Text/ch1.xhtml",
    // the chapter file must be found at the resolved path.
    const zip = fakeZip({
      'Text/ch1.xhtml': '<html><body><p>Cross-dir chapter</p></body></html>',
    });
    const html = await loadChapter(zip, { fullPath: 'Text/ch1.xhtml' });
    expect(html).toContain('<p>Cross-dir chapter</p>');
  });

  it('falls back to last-resort extraction when body is empty but content exists outside body', async () => {
    // Simulate a degenerate file: body is empty but there is raw markup that
    // the regex stripping pass can recover.
    const zip = fakeZip({
      'OEBPS/Text/odd.xhtml': '<html><head></head><body></body></html>\n<p>Recovered</p>',
    });
    // The HTML parser moves the orphan <p> into body during parse, so this
    // case actually resolves at the first strategy. The test verifies the
    // content is always surfaced regardless of which strategy handles it.
    const html = await loadChapter(zip, { fullPath: 'OEBPS/Text/odd.xhtml' });
    expect(html).toContain('Recovered');
  });

  it('throws when the chapter file is not found in the ZIP', async () => {
    const zip = fakeZip({});
    await expect(loadChapter(zip, { fullPath: 'OEBPS/Text/missing.xhtml' }))
      .rejects.toThrow('OEBPS/Text/missing.xhtml');
  });
});
