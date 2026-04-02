import { useEffect, useRef } from 'react';

export function useGameLoop(callback) {
  const rafRef = useRef(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let lastTime = 0;
    const loop = (timestamp) => {
      const delta = timestamp - lastTime;
      lastTime = timestamp;
      callbackRef.current(delta);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
}
