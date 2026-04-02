import { useRef, useCallback } from 'react';

// Creates an AudioContext lazily on first use (browsers require a user gesture first).
// Every play function fails silently so missing assets or blocked autoplay never crash the game.

function getCtx(ctxRef) {
  try {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  } catch {
    return null;
  }
}

// Helper: play a simple oscillator envelope
function playTone(ctx, { type = 'sine', freq = 440, freqEnd = freq,
                          gain = 0.3, attack = 0.01, decay = 0.2 }) {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freqEnd, now + attack + decay);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + attack + decay + 0.05);
  } catch { /* ignore */ }
}

export function useSounds() {
  const ctxRef = useRef(null);

  // Quick upward swoosh — satisfying slice feedback
  const playSlice = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    playTone(ctx, { type: 'sawtooth', freq: 300, freqEnd: 900, gain: 0.18, attack: 0.005, decay: 0.12 });
  }, []);

  // Low thud — for when a bomb is hit (future feature placeholder)
  const playBomb = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    playTone(ctx, { type: 'sine', freq: 80, freqEnd: 30, gain: 0.5, attack: 0.01, decay: 0.35 });
    playTone(ctx, { type: 'square', freq: 60, freqEnd: 20, gain: 0.25, attack: 0.01, decay: 0.4 });
  }, []);

  // Three ascending pings — combo reward
  const playCombo = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    [0, 0.1, 0.2].forEach((delay, i) => {
      try {
        const now = ctx.currentTime + delay;
        const freq = 500 + i * 200;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.25, now + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } catch { /* ignore */ }
    });
  }, []);

  // Descending sad melody — game over
  const playGameOver = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    [0, 0.18, 0.36, 0.54].forEach((delay, i) => {
      try {
        const now = ctx.currentTime + delay;
        const freqs = [523, 392, 330, 262]; // C5 G4 E4 C4
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqs[i], now);
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.3, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(env);
        env.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } catch { /* ignore */ }
    });
  }, []);

  return { playSlice, playBomb, playCombo, playGameOver };
}
