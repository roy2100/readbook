function UploadInput({ onFileOpen, className, children }) {
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) { onFileOpen(file); e.target.value = ''; }
  };
  return (
    <label className={className}>
      {children}
      <input type="file" accept=".epub" onChange={handleChange} hidden />
    </label>
  );
}

export default function Controls({
  book, currentIndex, currentChapter, ttsState,
  rate, voiceURI, voices,
  onPlay, onPause, onStop, onPrev, onNext,
  onRateChange, onVoiceChange, onFileOpen,
}) {
  const isPlaying = ttsState === 'playing';
  const isStopped = ttsState === 'stopped' || ttsState === 'ended';
  const noBook = !book;
  const isPrevDisabled = noBook || currentIndex === 0;
  const isNextDisabled = noBook || currentIndex >= (book?.chapters.length ?? 1) - 1;

  return (
    <footer className="controls">

      {/* Row 1: chapter nav + open */}
      <div className="controls-row controls-row-1">
        <div className="controls-nav">
          <button className="ctrl-btn" onClick={onPrev} disabled={isPrevDisabled} title="上一章">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="chapter-indicator" title={currentChapter?.title ?? ''}>
            {currentChapter?.title ?? '—'}
          </span>
          <button className="ctrl-btn" onClick={onNext} disabled={isNextDisabled} title="下一章">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
        <UploadInput onFileOpen={onFileOpen} className="upload-btn-mobile">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          打开 EPUB
        </UploadInput>
      </div>

      {/* Row 2: playback */}
      <div className="controls-row controls-row-2">
        <button
          className={`ctrl-btn ctrl-btn-play${isPlaying ? ' playing' : ''}`}
          onClick={isPlaying ? onPause : onPlay}
          disabled={noBook}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
        </button>
        <button className="ctrl-btn" onClick={onStop} disabled={noBook || isStopped} title="停止">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        </button>
      </div>

      {/* Row 3: speed + voice */}
      <div className="controls-row controls-row-3">
        <label className="ctrl-label">
          <span>速度</span>
          <select value={rate} onChange={e => onRateChange(parseFloat(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
              <option key={r} value={r}>{r === 1 ? '1.0×' : `${r}×`}</option>
            ))}
          </select>
        </label>
        <label className="ctrl-label">
          <span>音色</span>
          <select value={voiceURI} onChange={e => onVoiceChange(e.target.value)}>
            <option value="">默认</option>
            {voices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </label>
      </div>

    </footer>
  );
}
