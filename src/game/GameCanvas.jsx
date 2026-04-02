import React, { useRef, useState, useCallback, useEffect } from 'react';
import { spawnFruit, updateFruits } from './fruits';
import { applySlice, updateBlade } from './sliceEngine';
import { useGameLoop } from './useGameLoop';

const MAX_LIVES = 3;
const SPAWN_INTERVAL_START = 1200; // ms at the beginning
const SPAWN_INTERVAL_MIN  =  600;  // ms floor — never faster than this
const DIFFICULTY_RAMP_MS  = 90_000; // reach max difficulty after 90 s

function drawFruit(ctx, fruit) {
  ctx.save();
  ctx.globalAlpha = fruit.opacity;
  ctx.translate(fruit.x, fruit.y);
  ctx.rotate(fruit.rotation);

  if (fruit.sliced) {
    // draw two half-circles
    ctx.fillStyle = fruit.color;
    ctx.beginPath();
    ctx.arc(0, -6, fruit.radius, 0, Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 6, fruit.radius, Math.PI, Math.PI * 2);
    ctx.fill();
    // shine line
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-fruit.radius, 0);
    ctx.lineTo(fruit.radius, 0);
    ctx.stroke();
  } else {
    // shadow
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = fruit.color;
    ctx.beginPath();
    ctx.arc(0, 0, fruit.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(-fruit.radius * 0.3, -fruit.radius * 0.3, fruit.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // emoji label
    ctx.font = `${fruit.radius * 1.1}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fruit.emoji, 0, 0);
  }

  ctx.restore();
}

function drawBlade(ctx, blade) {
  if (blade.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < blade.length; i++) {
    const alpha = i / blade.length;
    const width = alpha * 5;
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = `hsl(${200 + i * 5}, 90%, 80%)`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(blade[i - 1].x, blade[i - 1].y);
    ctx.lineTo(blade[i].x, blade[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHUD(ctx, score, lives, w) {
  // Score
  ctx.save();
  ctx.font = 'bold 28px Segoe UI';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillText(`Score: ${score}`, 16, 42);

  // Lives (hearts)
  ctx.font = '28px serif';
  ctx.textAlign = 'right';
  const hearts = '❤️'.repeat(lives) + '🖤'.repeat(MAX_LIVES - lives);
  ctx.fillText(hearts, w - 16, 42);
  ctx.restore();
}

export default function GameCanvas() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    fruits: [],
    blade: [],
    score: 0,
    lives: MAX_LIVES,
    spawnTimer: 0,
    elapsed: 0,       // ms since gameplay started
    phase: 'start', // 'start' | 'playing' | 'over'
    sliceFlash: [],   // { x, y, text, ttl }
  });
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(MAX_LIVES);
  const [phase, setPhase] = useState('start');
  const isPointerDown = useRef(false);

  const getCanvasSize = () => {
    const canvas = canvasRef.current;
    return canvas ? { w: canvas.width, h: canvas.height } : { w: 800, h: 600 };
  };

  const startGame = useCallback(() => {
    stateRef.current.phase = 'playing';
    setPhase('playing');
  }, []);

  const resetGame = useCallback(() => {
    isPointerDown.current = false;
    stateRef.current = {
      fruits: [],
      blade: [],
      score: 0,
      lives: MAX_LIVES,
      spawnTimer: 0,
      elapsed: 0,
      phase: 'start',
      sliceFlash: [],
    };
    setDisplayScore(0);
    setDisplayLives(MAX_LIVES);
    setPhase('start');
  }, []);

  // Restart skips the title screen and goes straight back into gameplay.
  const restartGame = useCallback(() => {
    isPointerDown.current = false;
    stateRef.current = {
      fruits: [],
      blade: [],
      score: 0,
      lives: MAX_LIVES,
      spawnTimer: 0,
      elapsed: 0,
      phase: 'playing',
      sliceFlash: [],
    };
    setDisplayScore(0);
    setDisplayLives(MAX_LIVES);
    setPhase('playing');
  }, []);

  useGameLoop((delta) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = { w: canvas.width, h: canvas.height };
    const s = stateRef.current;

    if (s.phase !== 'playing') return;

    // Difficulty: 0→1 linearly over DIFFICULTY_RAMP_MS
    s.elapsed += delta;
    const difficulty = Math.min(1, s.elapsed / DIFFICULTY_RAMP_MS);
    const spawnInterval = SPAWN_INTERVAL_START - difficulty * (SPAWN_INTERVAL_START - SPAWN_INTERVAL_MIN);

    // Spawn
    s.spawnTimer += delta;
    if (s.spawnTimer >= spawnInterval) {
      s.spawnTimer = 0;
      s.fruits.push(spawnFruit(w, h, difficulty));
    }

    // Check missed fruits: count unsliced fruits before and after updateFruits removes
    // ones that fell off the bottom — the difference is how many were missed.
    const unslicedBefore = s.fruits.filter(f => !f.sliced).length;
    s.fruits = updateFruits(s.fruits, h);
    const unslicedAfter = s.fruits.filter(f => !f.sliced).length;
    const removedUnsliced = unslicedBefore - unslicedAfter;
    if (removedUnsliced > 0) {
      s.lives = Math.max(0, s.lives - removedUnsliced);
      setDisplayLives(s.lives);
      if (s.lives === 0) {
        s.phase = 'over';
        setPhase('over');
      }
    }

    // Blade trail fade
    if (!isPointerDown.current && s.blade.length > 0) {
      s.blade = s.blade.slice(2);
    }

    // Score flash TTL
    s.sliceFlash = s.sliceFlash
      .map(f => ({ ...f, ttl: f.ttl - delta, y: f.y - 1.2 }))
      .filter(f => f.ttl > 0);

    // Draw
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(1, '#16213e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    s.fruits.forEach(f => drawFruit(ctx, f));
    drawBlade(ctx, s.blade);

    // Score flash
    s.sliceFlash.forEach(f => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.ttl / 300);
      ctx.font = 'bold 22px Segoe UI';
      ctx.fillStyle = '#ffe066';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });

    drawHUD(ctx, s.score, s.lives, w);
  });

  // Pointer events
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  };

  const onPointerDown = (e) => {
    if (stateRef.current.phase !== 'playing') return;
    isPointerDown.current = true;
    stateRef.current.blade = [getPos(e)];
  };

  const onPointerMove = (e) => {
    if (!isPointerDown.current || stateRef.current.phase !== 'playing') return;
    const pos = getPos(e);
    stateRef.current.blade = updateBlade(stateRef.current.blade, pos);
    const { fruits, slicedCount } = applySlice(stateRef.current.fruits, stateRef.current.blade);
    stateRef.current.fruits = fruits;
    if (slicedCount > 0) {
      stateRef.current.score += slicedCount * 10;
      setDisplayScore(stateRef.current.score);
      stateRef.current.sliceFlash.push({ x: pos.x, y: pos.y, text: `+${slicedCount * 10}`, ttl: 700 });
    }
  };

  const onPointerUp = () => { isPointerDown.current = false; };

  // Resize canvas to window
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      />
      {phase === 'start' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)',
          color: '#fff',
          userSelect: 'none',
        }}>
          <div style={{ fontSize: 72, marginBottom: 4, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}>
            🍉🍊🍋
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 8vw, 58px)',
            fontWeight: 900,
            letterSpacing: 2,
            background: 'linear-gradient(90deg,#ffe066,#ff6b6b,#a29bfe)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: '12px 0 8px',
          }}>
            Jun's Slice Game
          </h1>
          <p style={{ fontSize: 18, color: '#a8d8ea', marginBottom: 40 }}>
            ✂️ Swipe across fruits to slice them before they fall!
          </p>
          <button
            onClick={startGame}
            style={{
              padding: '16px 52px', fontSize: 22, fontWeight: 800,
              background: 'linear-gradient(135deg,#e74c3c,#e67e22)',
              color: '#fff', border: 'none', borderRadius: 14,
              cursor: 'pointer',
              boxShadow: '0 6px 24px rgba(231,76,60,0.55)',
              letterSpacing: 1,
              transition: 'transform 0.1s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            🎮 Start!
          </button>
        </div>
      )}
      {phase === 'over' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.72)',
          color: '#fff',
        }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🍉</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, letterSpacing: 1 }}>Game Over</h1>
          <p style={{ fontSize: 24, margin: '12px 0 32px', color: '#ffe066' }}>
            Final Score: {displayScore}
          </p>
          <button
            onClick={restartGame}
            style={{
              padding: '14px 40px', fontSize: 20, fontWeight: 700,
              background: 'linear-gradient(135deg,#e74c3c,#e67e22)',
              color: '#fff', border: 'none', borderRadius: 12,
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(231,76,60,0.5)',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  );
}
