import { useRef, useState, useCallback, useEffect } from 'react';
import { TTSController } from '../lib/tts.js';

export function useTTS() {
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = new TTSController();
  }
  const [ttsState, setTtsState] = useState('stopped');

  useEffect(() => {
    const ctrl = controllerRef.current;
    ctrl.onStateChange = setTtsState;
    return () => {
      ctrl.stop();
      ctrl.onStateChange = null;
    };
  }, []);

  const load    = useCallback((sentences) => controllerRef.current.load(sentences), []);
  const play    = useCallback(() => controllerRef.current.play(), []);
  const pause   = useCallback(() => controllerRef.current.pause(), []);
  const stop    = useCallback(() => controllerRef.current.stop(), []);
  const setRate = useCallback((rate) => controllerRef.current.setRate(rate), []);
  const setVoice = useCallback((uri) => controllerRef.current.setVoice(uri), []);
  const getVoices = useCallback((lang) => controllerRef.current.getVoices(lang), []);
  const playFrom = useCallback((index) => controllerRef.current.playFrom(index), []);

  return { ttsState, load, play, pause, stop, setRate, setVoice, getVoices, playFrom };
}
