// Returns true if line segment (x1,y1)→(x2,y2) intersects circle at (cx,cy,r)
function lineCircleIntersects(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t1 = (-b - Math.sqrt(disc)) / (2 * a);
  const t2 = (-b + Math.sqrt(disc)) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// Returns { fruits, slicedCount } after checking a blade stroke
export function applySlice(fruits, blade) {
  if (blade.length < 2) return { fruits, slicedCount: 0 };
  const prev = blade[blade.length - 2];
  const curr = blade[blade.length - 1];
  let slicedCount = 0;

  const updated = fruits.map(f => {
    if (f.sliced) return f;
    if (lineCircleIntersects(prev.x, prev.y, curr.x, curr.y, f.x, f.y, f.radius)) {
      slicedCount++;
      return { ...f, sliced: true };
    }
    return f;
  });

  return { fruits: updated, slicedCount };
}

// Blade trail: keep only the last N points
export function updateBlade(blade, point, maxLen = 18) {
  const next = [...blade, point];
  return next.length > maxLen ? next.slice(next.length - maxLen) : next;
}
