export const FRUIT_TYPES = [
  { name: 'watermelon', emoji: '🍉', color: '#e74c3c', radius: 36 },
  { name: 'orange',     emoji: '🍊', color: '#e67e22', radius: 28 },
  { name: 'lemon',      emoji: '🍋', color: '#f1c40f', radius: 26 },
  { name: 'apple',      emoji: '🍎', color: '#c0392b', radius: 28 },
  { name: 'grape',      emoji: '🍇', color: '#8e44ad', radius: 26 },
  { name: 'strawberry', emoji: '🍓', color: '#e84393', radius: 24 },
  { name: 'pineapple',  emoji: '🍍', color: '#f39c12', radius: 30 },
];

// difficulty: 0 = start, 1 = max (clamped inside). Scales speed only — gravity stays constant.
export function spawnFruit(canvasWidth, canvasHeight, difficulty = 0) {
  const d = Math.min(1, Math.max(0, difficulty));
  const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
  const x = type.radius + Math.random() * (canvasWidth - type.radius * 2);
  const speedMult = 1 + d * 0.6;                          // up to 1.6× faster at max
  const speedY = -(canvasHeight * 0.017 + Math.random() * canvasHeight * 0.008) * speedMult;
  const speedX = (Math.random() - 0.5) * (4 + d * 2);    // slightly wider arc at high difficulty

  return {
    id: Math.random().toString(36).slice(2),
    ...type,
    x,
    y: canvasHeight + type.radius,
    speedX,
    speedY,
    gravity: 0.35,
    rotation: 0,
    rotSpeed: (Math.random() - 0.5) * 0.1,
    sliced: false,
    halves: null,       // populated on slice
    opacity: 1,
  };
}

export function updateFruits(fruits, canvasHeight) {
  return fruits
    .map(f => {
      if (f.sliced) {
        // fade out halves after slicing
        return { ...f, opacity: f.opacity - 0.025 };
      }
      return {
        ...f,
        x: f.x + f.speedX,
        y: f.y + f.speedY,
        speedY: f.speedY + f.gravity,
        rotation: f.rotation + f.rotSpeed,
      };
    })
    .filter(f => {
      if (f.sliced) return f.opacity > 0;
      return f.y < canvasHeight + f.radius * 2;
    });
}
