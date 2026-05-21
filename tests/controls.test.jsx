import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Controls from '../src/components/Controls.jsx';

const noop = vi.fn();

function renderControls(props = {}) {
  return render(
    <Controls
      book={null}
      currentIndex={0}
      currentChapter={null}
      ttsState="stopped"
      rate={1}
      voiceURI=""
      voices={[]}
      readingMode={false}
      onPlay={noop}
      onPause={noop}
      onStop={noop}
      onPrev={noop}
      onNext={noop}
      onRateChange={noop}
      onVoiceChange={noop}
      onFileOpen={noop}
      onReadingModeToggle={noop}
      {...props}
    />
  );
}

describe('Controls', () => {
  it('wraps reading mode button text so mobile CSS can keep the icon compact', () => {
    renderControls();

    const button = screen.getByRole('button', { name: '阅读模式' });
    expect(button.querySelector('.reading-mode-btn-label')).toHaveTextContent('阅读模式');
  });
});
