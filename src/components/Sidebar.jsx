import { useRef, useEffect } from 'react';

export default function Sidebar({ open, onClose, chapters, currentIndex, onChapterSelect }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentIndex]);

  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-header">目录</div>
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
      </aside>
      <div
        className={`sidebar-overlay${open ? ' visible' : ''}`}
        onClick={onClose}
      />
    </>
  );
}
