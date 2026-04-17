/**
 * epub-parser.js
 * Parses an EPUB file (ZIP) into a structured book object.
 * Pipeline: container.xml → OPF → spine/manifest → chapter list
 */

export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(file);

  // Step 1: Find OPF path from META-INF/container.xml
  const containerXml = await readZipEntry(zip, 'META-INF/container.xml');
  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) throw new Error('无法找到 OPF 文件路径 (container.xml 解析失败)');

  // OPF directory prefix for resolving relative paths
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // Step 2: Parse OPF
  const opfXml = await readZipEntry(zip, opfPath);
  const opf = parseOpf(opfXml, opfDir);

  // Step 3: Build chapter list from spine + manifest
  const chapters = buildChapterList(opf);

  // Step 4: Extract TOC titles (EPUB 3 nav or EPUB 2 NCX)
  await attachTocTitles(zip, opf, opfDir, chapters);

  return {
    title: opf.metadata.title || file.name.replace('.epub', ''),
    author: opf.metadata.creator || '',
    language: opf.metadata.language || 'zh',
    chapters,
    zip,
    opfDir,
  };
}

// ── Read a zip entry as text, trying both raw path and decoded path ──
async function readZipEntry(zip, path) {
  let entry = zip.file(path);
  if (!entry) entry = zip.file(decodeURIComponent(path));
  if (!entry) throw new Error(`找不到文件: ${path}`);
  return entry.async('string');
}

// ── Extract OPF path from container.xml ──
export function extractOpfPath(xml) {
  const doc = parseXml(xml);
  const rootfile = doc.querySelector('rootfile');
  return rootfile ? rootfile.getAttribute('full-path') : null;
}

// ── Parse OPF document ──
export function parseOpf(xml, opfDir) {
  const doc = parseXml(xml);

  // Metadata
  const metadata = {
    title: getTagText(doc, 'dc\\:title, title') || '',
    creator: getTagText(doc, 'dc\\:creator, creator') || '',
    language: getTagText(doc, 'dc\\:language, language') || 'zh',
  };

  // Manifest: id → { href, mediaType }
  const manifest = {};
  doc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = decodeURIComponent(item.getAttribute('href') || '');
    const mediaType = item.getAttribute('media-type') || '';
    const properties = item.getAttribute('properties') || '';
    manifest[id] = { href, mediaType, properties, fullPath: opfDir + href };
  });

  // Spine: ordered item ids
  const spine = [];
  doc.querySelectorAll('spine itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref && manifest[idref]) spine.push(idref);
  });

  // Find nav item (EPUB 3) and ncx item (EPUB 2)
  const navId = Object.keys(manifest).find(id => manifest[id].properties.includes('nav'));
  const ncxId = Object.keys(manifest).find(id =>
    manifest[id].mediaType === 'application/x-dtbncx+xml' || id === 'ncx' || id === 'toc'
  );

  return { metadata, manifest, spine, navId, ncxId, opfDir };
}

// ── Build chapter list from spine ──
export function buildChapterList(opf) {
  return opf.spine.map((id, index) => ({
    id,
    index,
    href: opf.manifest[id].href,
    fullPath: opf.manifest[id].fullPath,
    title: `第 ${index + 1} 章`,  // placeholder, overwritten by TOC
  }));
}

// ── Attach human-readable titles from TOC ──
async function attachTocTitles(zip, opf, opfDir, chapters) {
  const titleMap = {};  // href → title

  // Try EPUB 3 nav first
  if (opf.navId) {
    try {
      const navHtml = await readZipEntry(zip, opf.manifest[opf.navId].fullPath);
      parseNavToc(navHtml, titleMap);
    } catch (_) {}
  }

  // Fall back to EPUB 2 NCX
  if (Object.keys(titleMap).length === 0 && opf.ncxId) {
    try {
      const ncxXml = await readZipEntry(zip, opf.manifest[opf.ncxId].fullPath);
      parseNcxToc(ncxXml, titleMap);
    } catch (_) {}
  }

  // Apply titles to chapters
  for (const ch of chapters) {
    // Match by bare filename (strip fragment and directory)
    const bareHref = ch.href.split('#')[0].split('/').pop();
    for (const [tocHref, title] of Object.entries(titleMap)) {
      if (tocHref.split('#')[0].split('/').pop() === bareHref) {
        ch.title = title;
        break;
      }
    }
  }
}

// ── Parse EPUB 3 nav document for TOC ──
export function parseNavToc(html, titleMap) {
  const doc = parseHtml(html);
  // Look for <nav epub:type="toc"> or just the first <nav>
  let nav = doc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"]');
  if (!nav) nav = doc.querySelector('nav');
  if (!nav) return;

  nav.querySelectorAll('a[href]').forEach(a => {
    const href = decodeURIComponent(a.getAttribute('href'));
    const title = a.textContent.trim();
    if (title) titleMap[href] = title;
  });
}

// ── Parse EPUB 2 NCX for TOC ──
export function parseNcxToc(xml, titleMap) {
  const doc = parseXml(xml);
  doc.querySelectorAll('navPoint').forEach(np => {
    const label = np.querySelector('navLabel text, text');
    const content = np.querySelector('content');
    if (label && content) {
      const href = decodeURIComponent(content.getAttribute('src') || '');
      const title = label.textContent.trim();
      if (href && title) titleMap[href] = title;
    }
  });
}

// ── Load a chapter's HTML content from the ZIP ──
export async function loadChapter(zip, chapter) {
  const raw = await readZipEntry(zip, chapter.fullPath);
  const doc = parseHtml(raw);

  // Remove script and style elements
  doc.querySelectorAll('script, style').forEach(el => el.remove());

  // Return cleaned body HTML
  const body = doc.body || doc.documentElement;
  return body ? body.innerHTML : raw;
}

// ── XML parser with fallback ──
function parseXml(xml) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xhtml+xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('XML parse error');
    return doc;
  } catch (_) {
    return new DOMParser().parseFromString(xml, 'text/html');
  }
}

// ── HTML parser ──
function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// ── Get text content of first matching element ──
function getTagText(doc, selector) {
  const el = doc.querySelector(selector);
  return el ? el.textContent.trim() : '';
}
