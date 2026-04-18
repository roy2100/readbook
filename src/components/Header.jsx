export default function Header({ title, onMenuClick, onFileOpen }) {
  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) { onFileOpen(file); e.target.value = ''; }
  };

  return (
    <header className="header">
      <button className="header-menu-btn" onClick={onMenuClick} aria-label="打开目录">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <h1 className="header-title">{title}</h1>

      <label className="header-upload">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        打开 EPUB
        <input type="file" accept=".epub" onChange={handleChange} hidden />
      </label>
    </header>
  );
}
