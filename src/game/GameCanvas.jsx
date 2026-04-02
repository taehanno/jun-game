import React, { useRef, useState, useCallback, useEffect } from 'react';
import { spawnFruit, updateFruits } from './fruits';
import { applySlice, updateBlade } from './sliceEngine';
import { useGameLoop } from './useGameLoop';

const MAX_LIVES = 3;
const SPAWN_INTERVAL_START = 1200; // ms at the beginning
const SPAWN_INTERVAL_MIN  =  600;  // ms floor — never faster than this
const DIFFICULTY_RAMP_MS  = 90_000; // reach max difficulty after 90 s

// ── Bomb ────────────────────────────────────────────────────────────────────
function drawBomb(ctx, bomb) {
  ctx.save();
  ctx.globalAlpha = bomb.opacity;
  ctx.translate(bomb.x, bomb.y);
  ctx.rotate(bomb.rotation);

  // Red glow
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 22;

  // Dark sphere body
  const grad = ctx.createRadialGradient(
    -bomb.radius * 0.3, -bomb.radius * 0.3, 2,
     0, 0, bomb.radius
  );
  grad.addColorStop(0, '#555');
  grad.addColorStop(0.65, '#1c1c1c');
  grad.addColorStop(1, '#000');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2);
  ctx.fill();

  // Red warning ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff3300';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2);
  ctx.stroke();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(-bomb.radius * 0.32, -bomb.radius * 0.32, bomb.radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // Fuse — curved gold line
  ctx.strokeStyle = '#c8a000';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bomb.radius * 0.15, -bomb.radius);
  ctx.bezierCurveTo(
    bomb.radius * 0.65, -bomb.radius * 1.35,
    bomb.radius * 0.05, -bomb.radius * 1.65,
    bomb.radius * 0.35, -bomb.radius * 1.95
  );
  ctx.stroke();

  // Spark at fuse tip
  ctx.fillStyle = '#fff176';
  ctx.shadowColor = '#ffcc00';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(bomb.radius * 0.35, -bomb.radius * 1.95, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Particles ────────────────────────────────────────────────────────────────
// Returns an array of new particle objects for a burst at (x, y).
function makeParticles(x, y, colors, count = 10) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    const maxTtl = 380 + Math.random() * 320;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,   // slight upward bias
      color: colors[Math.floor(Math.random() * colors.length)],
      r: 2.5 + Math.random() * 4,
      ttl: maxTtl,
      maxTtl,
    };
  });
}

function drawParticles(ctx, particles) {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.ttl / p.maxTtl);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Fruit ────────────────────────────────────────────────────────────────────
function drawFruit(ctx, fruit) {
  if (fruit.isBomb) { drawBomb(ctx, fruit); return; }

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
  ctx.save();

  // ── Score pill (top-left) ──────────────────────────────────
  const scoreText = String(score).padStart(5, '0');
  ctx.font = "bold 26px 'Fredoka One', cursive";
  const scoreW = ctx.measureText(scoreText).width;
  const pillW = scoreW + 64;
  const pillH = 44;
  const pillX = 14;
  const pillY = 12;

  // pill background
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  // star icon
  ctx.font = '20px serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('⭐', pillX + 12, pillY + pillH / 2);
  // score value
  ctx.font = "bold 22px 'Fredoka One', cursive";
  ctx.fillStyle = '#ffe066';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.fillText(scoreText, pillX + 40, pillY + pillH / 2);

  // ── Lives pills (top-right) ────────────────────────────────
  const heartSize = 32;
  const gap = 6;
  const totalW = MAX_LIVES * heartSize + (MAX_LIVES - 1) * gap;
  const heartsX = w - 14 - totalW;
  const heartsY = pillY;

  // pill background behind hearts
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(heartsX - 10, heartsY, totalW + 20, pillH, pillH / 2);
  ctx.fill();

  ctx.font = `${heartSize - 4}px serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < MAX_LIVES; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.25;
    ctx.fillText('❤️', heartsX + i * (heartSize + gap), pillY + pillH / 2);
  }

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
    sliceFlash: [],   // { x, y, text, ttl, color? }
    combo: 0,
    comboTimer: 0,
    particles: [],    // { x, y, vx, vy, color, r, ttl, maxTtl }
  });
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(MAX_LIVES);
  const [phase, setPhase] = useState('start');
  const [gameOverReason, setGameOverReason] = useState('missed'); // 'missed' | 'bomb'
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
      combo: 0,
      comboTimer: 0,
      particles: [],
    };
    setDisplayScore(0);
    setDisplayLives(MAX_LIVES);
    setGameOverReason('missed');
    setPhase('start');
  }, []);

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
      combo: 0,
      comboTimer: 0,
      particles: [],
    };
    setDisplayScore(0);
    setDisplayLives(MAX_LIVES);
    setGameOverReason('missed');
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

    // Check missed fruits: bombs falling off are ignored (no penalty for missing a bomb).
    const unslicedBefore = s.fruits.filter(f => !f.sliced && !f.isBomb).length;
    s.fruits = updateFruits(s.fruits, h);
    const unslicedAfter = s.fruits.filter(f => !f.sliced && !f.isBomb).length;
    const removedUnsliced = unslicedBefore - unslicedAfter;
    if (removedUnsliced > 0) {
      s.lives = Math.max(0, s.lives - removedUnsliced);
      setDisplayLives(s.lives);
      if (s.lives === 0) {
        s.phase = 'over';
        setPhase('over');
      }
    }

    // Combo timer — reset streak if player stops slicing for 1.5 s
    if (s.comboTimer > 0) {
      s.comboTimer -= delta;
      if (s.comboTimer <= 0) s.combo = 0;
    }

    // Blade trail fade
    if (!isPointerDown.current && s.blade.length > 0) {
      s.blade = s.blade.slice(2);
    }

    // Score flash TTL
    s.sliceFlash = s.sliceFlash
      .map(f => ({ ...f, ttl: f.ttl - delta, y: f.y - 1.2 }))
      .filter(f => f.ttl > 0);

    // Particles physics + TTL
    s.particles = s.particles
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.18, ttl: p.ttl - delta }))
      .filter(p => p.ttl > 0);

    // Draw
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(1, '#16213e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    s.fruits.forEach(f => drawFruit(ctx, f));
    drawParticles(ctx, s.particles);
    drawBlade(ctx, s.blade);

    // Score / combo flash
    s.sliceFlash.forEach(f => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.ttl / 300);
      ctx.font = `bold ${f.big ? 32 : 22}px Segoe UI`;
      ctx.fillStyle = f.color || '#ffe066';
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
    const prevFruits = stateRef.current.fruits;
    stateRef.current.blade = updateBlade(stateRef.current.blade, pos);
    const { fruits, slicedCount } = applySlice(prevFruits, stateRef.current.blade);
    stateRef.current.fruits = fruits;

    if (slicedCount > 0) {
      const s = stateRef.current;

      // Find what was just sliced (was unsliced before, sliced now)
      const justSliced = fruits.filter((f, i) => f.sliced && !prevFruits[i].sliced);
      const bombHit = justSliced.find(f => f.isBomb);

      // Spawn particles for each sliced object
      justSliced.forEach(f => {
        if (f.isBomb) {
          // Explosion: red, orange, black burst
          s.particles.push(...makeParticles(f.x, f.y,
            ['#ff3300','#ff7700','#ffcc00','#222','#fff'], 18));
        } else {
          // Juice splash: fruit color + white
          s.particles.push(...makeParticles(f.x, f.y,
            [f.color, '#fff', f.color], 10));
        }
      });

      if (bombHit) {
        // Bomb slice → instant game over
        s.phase = 'over';
        setGameOverReason('bomb');
        setPhase('over');
        return;
      }

      // Normal fruit scoring
      const fruitSliced = justSliced.filter(f => !f.isBomb).length;
      s.combo += fruitSliced;
      s.comboTimer = 1500;

      const basePoints = fruitSliced * 10;
      const comboBonus = s.combo >= 3 ? s.combo * 5 : 0;
      const total = basePoints + comboBonus;
      s.score += total;
      setDisplayScore(s.score);

      s.sliceFlash.push({ x: pos.x, y: pos.y - 20, text: `+${total}`, ttl: 700 });

      if (s.combo >= 3) {
        const labels = { 3: '🔥 COMBO!', 5: '⚡ SUPER!', 7: '🌟 AMAZING!', 10: '👑 LEGENDARY!' };
        const label = labels[s.combo] ?? (s.combo > 10 ? '👑 LEGENDARY!' : null);
        if (label) {
          s.sliceFlash.push({ x: pos.x, y: pos.y - 60, text: label, ttl: 900, color: '#ff6b6b', big: true });
        }
      }
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
          background: 'radial-gradient(ellipse at 50% 40%, #0f3460 0%, #16213e 55%, #1a1a2e 100%)',
          color: '#fff',
          userSelect: 'none',
        }}>
          {/* floating fruit row */}
          <div style={{ fontSize: 56, marginBottom: 8, animation: 'floatY 2.4s ease-in-out infinite',
                        filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' }}>
            🍉 🍊 🍋 🍎 🍇
          </div>

          {/* title */}
          <h1 style={{
            fontFamily: "'Fredoka One', cursive",
            fontSize: 'clamp(38px, 9vw, 68px)',
            letterSpacing: 3,
            background: 'linear-gradient(90deg, #ffe066 0%, #ff6b6b 45%, #a29bfe 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 3s linear infinite',
            margin: '4px 0 6px',
            lineHeight: 1.1,
          }}>
            Jun's Slice Game
          </h1>

          <p style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: 'clamp(14px, 3vw, 18px)',
            color: '#a8d8ea',
            marginBottom: 36,
            animation: 'fadeSlideUp 0.6s 0.2s both',
          }}>
            ✂️ Swipe across fruits before they fall!
          </p>

          {/* how-to hints */}
          <div style={{
            display: 'flex', gap: 16, marginBottom: 40,
            animation: 'fadeSlideUp 0.6s 0.35s both',
          }}>
            {[['🍉','Slice fruits'], ['⭐','Earn points'], ['❤️','3 lives']].map(([icon, label]) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                borderRadius: 14, padding: '10px 16px',
                fontSize: 13, color: 'rgba(255,255,255,0.8)',
                textAlign: 'center', minWidth: 80,
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                {label}
              </div>
            ))}
          </div>

          <button
            className="arcade-btn"
            onClick={startGame}
            style={{ background: 'linear-gradient(135deg,#e74c3c,#e67e22)',
                     animation: 'fadeSlideUp 0.6s 0.45s both, pulse 2s 1s ease-in-out infinite' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            🎮 Play Now!
          </button>
        </div>
      )}
      {phase === 'over' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5,5,20,0.82)',
          backdropFilter: 'blur(6px)',
          color: '#fff',
          userSelect: 'none',
        }}>
          <div className="overlay-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* trophy / result emoji */}
            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8,
                          filter: `drop-shadow(0 4px 16px ${gameOverReason === 'bomb' ? 'rgba(255,50,0,0.7)' : 'rgba(255,200,0,0.5)'})` }}>
              {gameOverReason === 'bomb' ? '💥' : displayScore >= 200 ? '🏆' : displayScore >= 80 ? '🥈' : '🍉'}
            </div>

            <h1 style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: 'clamp(32px, 8vw, 52px)',
              letterSpacing: 2,
              color: gameOverReason === 'bomb' ? '#ff4400' : '#ff6b6b',
              marginBottom: 6,
              textShadow: `0 2px 12px ${gameOverReason === 'bomb' ? 'rgba(255,68,0,0.5)' : 'rgba(255,107,107,0.4)'}`,
            }}>
              {gameOverReason === 'bomb' ? 'BOOM!' : 'Game Over!'}
            </h1>

            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              {gameOverReason === 'bomb'
                ? '💣 You hit a bomb! Watch out next time!'
                : displayScore >= 200 ? '🌟 Incredible slicing skills!'
                : displayScore >= 80  ? '👍 Nice job! Keep practising!'
                :                       '😅 The fruits got away this time!'}
            </p>

            {/* score badge */}
            <div style={{
              background: 'rgba(255,224,102,0.1)',
              border: '2px solid rgba(255,224,102,0.35)',
              borderRadius: 18, padding: '14px 36px', marginBottom: 28,
            }}>
              <div style={{ fontSize: 12, letterSpacing: 2, color: 'rgba(255,224,102,0.7)',
                            textTransform: 'uppercase', marginBottom: 4 }}>Final Score</div>
              <div style={{
                fontFamily: "'Fredoka One', cursive",
                fontSize: 'clamp(36px, 8vw, 52px)',
                color: '#ffe066',
                lineHeight: 1,
                textShadow: '0 0 20px rgba(255,224,102,0.5)',
              }}>
                {displayScore}
              </div>
            </div>

            {/* buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', alignItems: 'center' }}>
              <button
                className="arcade-btn"
                onClick={restartGame}
                style={{ background: 'linear-gradient(135deg,#e74c3c,#e67e22)', width: '100%' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                🔄 Play Again
              </button>
              <button className="arcade-btn-secondary" onClick={resetGame}>
                🏠 Main Menu
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
