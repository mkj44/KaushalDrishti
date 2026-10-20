export const ROOM = { W: 12, D: 8, H: 2.6 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ mapping */

/**
 * Turn detections in normalised image coordinates (x across, y = floor contact
 * point down the frame) into an approximate floor plan. Rows near the top of
 * the frame are further away and compressed, so we widen them back out.
 */
export function horizonOf(items = []) {
  if (!items.length) return 0.3;
  return Math.max(0, Math.min(0.45, Math.min(...items.map((i) => i.y)) - 0.06));
}

export function layoutToWorld(items = [], horizon = horizonOf(items)) {
  if (!items.length) return [];
  const { W, D } = ROOM;
  const place = (it) => {
    const yn = Math.min(1, Math.max(0, (it.y - horizon) / (1 - horizon)));
    const spread = 1 + 0.55 * (1 - yn);
    const x = clamp(((it.x - 0.5) * W * spread) / 1.25, -W / 2 + 0.6, W / 2 - 0.6);
    const z = clamp(-D / 2 + 0.7 + yn * (D - 1.4), -D / 2 + 0.6, D / 2 - 0.6);
    return [x, z];
  };

  const world = items.map((it) => ({ ...it, pos: place(it) }));
  const chairs = world.filter((w) => w.category === 'chair');
  const tables = world.filter((w) => w.category === 'table' || w.category === 'bench');

  return world.map((w) => {
    if (w.category === 'person') {
      const near = chairs.find((c) => Math.hypot(c.pos[0] - w.pos[0], c.pos[1] - w.pos[1]) < 0.9);
      return { ...w, seated: Boolean(near), pos: near ? near.pos : w.pos };
    }
    if (w.category === 'table' || w.category === 'bench') {
      return { ...w, size: clamp(w.w * ROOM.W * 1.1, 1.1, 3.2) };
    }
    if (['monitor', 'laptop', 'keyboard'].includes(w.category)) {
      let best = null;
      let bestD = 1.6;
      tables.forEach((t) => {
        const d = Math.hypot(t.pos[0] - w.pos[0], t.pos[1] - w.pos[1]);
        if (d < bestD) { best = t; bestD = d; }
      });
      return { ...w, onTable: Boolean(best), pos: best ? [w.pos[0], best.pos[1]] : w.pos };
    }
    return w;
  });
}

/** Illustrative classroom for the overview hero: rows of desks, mostly occupied. */
export function demoClassroom(present = 14) {
  const items = [];
  const cols = [-4, -1.4, 1.4, 4];
  const rows = [-1.6, 0.3, 2.2];
  let seat = 0;
  rows.forEach((z) => {
    cols.forEach((x) => {
      items.push({ category: 'table', pos: [x, z - 0.55], size: 2.0 });
      [-0.5, 0.5].forEach((dx) => {
        const pos = [x + dx, z];
        items.push({ category: 'chair', pos });
        if (seat < present) items.push({ category: 'person', pos, seated: true });
        seat += 1;
      });
      items.push({ category: 'monitor', pos: [x, z - 0.55], onTable: true });
    });
  });
  items.push({ category: 'person', pos: [-3.6, -3.1], seated: false }); // instructor
  return items;
}

