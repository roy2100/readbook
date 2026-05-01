import JSZip from 'jszip';
import { normalizePath } from './utils.js';

export async function parseEpub(file) {
  const zip = await JSZip.loadAsync(file);

  const containerXml = await readZipEntry(zip, 'META-INF/container.xml');
  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) throw new Error('无法找到 OPF 文件路径 (container.xml 解析失败)');

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  const opfXml = await readZipEntry(zip, opfPath);
  const opf = parseOpf(opfXml, opfDir);

  const chapters = buildChapterList(opf);
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

async function readZipEntry(zip, path) {
  let entry = zip.file(path);
  if (!entry) entry = zip.file(decodeURIComponent(path));
  if (!entry) throw new Error(`找不到文件: ${path}`);
  return entry.async('string');
}

export function extractOpfPath(xml) {
  const doc = parseXml(xml);
  const rootfile = doc.querySelector('rootfile');
  return rootfile ? rootfile.getAttribute('full-path') : null;
}

export function parseOpf(xml, opfDir) {
  const doc = parseXml(xml);

  const metadata = {
    title: getTagText(doc, 'dc\\:title, title') || '',
    creator: getTagText(doc, 'dc\\:creator, creator') || '',
    language: getTagText(doc, 'dc\\:language, language') || 'zh',
  };

  const manifest = {};
  doc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = decodeURIComponent(item.getAttribute('href') || '');
    const mediaType = item.getAttribute('media-type') || '';
    const properties = item.getAttribute('properties') || '';
    manifest[id] = { href, mediaType, properties, fullPath: normalizePath(opfDir + href) };
  });

  const spine = [];
  doc.querySelectorAll('spine itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref && manifest[idref]) spine.push(idref);
  });

  const navId = Object.keys(manifest).find(id => manifest[id].properties.includes('nav'));
  const ncxId = Object.keys(manifest).find(id =>
    manifest[id].mediaType === 'application/x-dtbncx+xml' || id === 'ncx' || id === 'toc'
  );

  return { metadata, manifest, spine, navId, ncxId, opfDir };
}

export function buildChapterList(opf) {
  return opf.spine.map((id, index) => ({
    id,
    index,
    href: opf.manifest[id].href,
    fullPath: opf.manifest[id].fullPath,
    title: `第 ${index + 1} 章`,
  }));
}

async function attachTocTitles(zip, opf, opfDir, chapters) {
  const titleMap = {};

  if (opf.navId) {
    try {
      const navHtml = await readZipEntry(zip, opf.manifest[opf.navId].fullPath);
      parseNavToc(navHtml, titleMap);
    } catch (_) {}
  }

  if (Object.keys(titleMap).length === 0 && opf.ncxId) {
    try {
      const ncxXml = await readZipEntry(zip, opf.manifest[opf.ncxId].fullPath);
      parseNcxToc(ncxXml, titleMap);
    } catch (_) {}
  }

  for (const ch of chapters) {
    const bareHref = ch.href.split('#')[0].split('/').pop();
    for (const [tocHref, title] of Object.entries(titleMap)) {
      if (tocHref.split('#')[0].split('/').pop() === bareHref) {
        ch.title = title;
        break;
      }
    }
  }
}

export function parseNavToc(html, titleMap) {
  const doc = parseHtml(html);
  let nav = doc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"]');
  if (!nav) nav = doc.querySelector('nav');
  if (!nav) return;

  nav.querySelectorAll('a[href]').forEach(a => {
    const href = decodeURIComponent(a.getAttribute('href'));
    const title = a.textContent.trim();
    if (title) titleMap[href] = title;
  });
}

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

export async function loadChapter(zip, chapter) {
  const raw = await readZipEntry(zip, chapter.fullPath);
  const doc = parseHtml(raw);
  doc.querySelectorAll('script, style').forEach(el => el.remove());
  const body = doc.body;
  if (body && body.innerHTML.trim()) return body.innerHTML;

  // Fallback: try XHTML parser (handles namespace-heavy EPUB 3 files better)
  try {
    const xhtmlDoc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
    if (!xhtmlDoc.querySelector('parsererror')) {
      xhtmlDoc.querySelectorAll('script, style').forEach(el => el.remove());
      const xhtmlBody = xhtmlDoc.body;
      if (xhtmlBody && xhtmlBody.innerHTML.trim()) return xhtmlBody.innerHTML;
    }
  } catch (_) {}

  // Last resort: strip outer HTML structure and return body content
  const stripped = raw
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .trim();
  return stripped;
}

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

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function getTagText(doc, selector) {
  const el = doc.querySelector(selector);
  return el ? el.textContent.trim() : '';
}
