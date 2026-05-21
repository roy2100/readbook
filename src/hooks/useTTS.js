import { useRef, useState, useCallback, useEffect } from 'react';
import { TTSController } from '../lib/tts.js';

export function useTTS() {
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = new TTSController();
  }
  const [ttsState, setTtsState] = useState('stopped');
  const [ttsInfo, setTtsInfo] = useState({
    state: 'stopped',
    chapterIndex: null,
    sessionId: 0,
  });

  useEffect(() => {
    const ctrl = controllerRef.current;
    ctrl.onStateChange = (state, info) => {
      setTtsState(state);
      setTtsInfo(info);
    };
    return () => {
      ctrl.stop();
      ctrl.onStateChange = null;
    };
  }, []);

  const load    = useCallback((sentences, context) => controllerRef.current.load(sentences, context), []);
  const play    = useCallback(() => controllerRef.current.play(), []);
  const pause   = useCallback(() => controllerRef.current.pause(), []);
  const stop    = useCallback(() => controllerRef.current.stop(), []);
  const setRate = useCallback((rate) => controllerRef.current.setRate(rate), []);
  const setVoice = useCallback((uri) => controllerRef.current.setVoice(uri), []);
  const getVoices = useCallback((lang) => controllerRef.current.getVoices(lang), []);
  const playFrom = useCallback((index) => controllerRef.current.playFrom(index), []);

  return { ttsState, ttsInfo, load, play, pause, stop, setRate, setVoice, getVoices, playFrom };
}
