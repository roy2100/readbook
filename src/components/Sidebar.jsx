import { useRef, useEffect } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { useIsMobile } from '../hooks/useIsMobile.js';

export default function Sidebar({ open, onClose, chapters, currentIndex, onChapterSelect }) {
  const activeRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  const toc = (
    <nav className="sidebar-toc">
      {chapters.length === 0 ? (
        <p className="sidebar-placeholder">请先打开 EPUB 文件</p>
      ) : (
        chapters.map((ch, i) => (
          <button
            key={i}
            ref={i === currentIndex ? activeRef : null}
            className={`toc-item${i === currentIndex ? ' active' : ''}`}
            onClick={() => onChapterSelect(i)}
            title={ch.title}
          >
            {ch.title}
          </button>
        ))
      )}
    </nav>
  );

  if (isMobile) {
    return (
      <Offcanvas show={open} onHide={onClose} placement="start" style={{ width: 'var(--sidebar-w)' }}>
        <Offcanvas.Header closeButton className="sidebar-header py-3">
          <Offcanvas.Title className="sidebar-title">目录</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">{toc}</Offcanvas.Body>
      </Offcanvas>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">目录</div>
      {toc}
    </aside>
  );
}
