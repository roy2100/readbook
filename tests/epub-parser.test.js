import { describe, it, expect } from 'vitest';
import {
  extractOpfPath,
  parseOpf,
  buildChapterList,
  parseNavToc,
  parseNcxToc,
} from '../src/lib/epub-parser.js';

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
