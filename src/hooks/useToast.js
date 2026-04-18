import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, isError = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, isError });
    timerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  return { toast, showToast };
}
