// Zdog in Herdr. Zdog draws through a browser canvas (a 2D context); a mod has no canvas, so ZCtx is one that only
// remembers what was drawn, and zdogView turns that into filled polygons Herdr paints natively
// (window.paint_path). Herdr's own strokes have flat ends and pointed corners, and Zdog's roundness is its round,
// thick strokes, so every stroke becomes filled shapes too: a stroked and filled convex shape (a box face, an
// ellipse) one polygon grown by half the stroke with round corners; a line, a capsule per segment; a dot, a circle.
import { div, PathBuilder } from "gpui-kit";

const TAU = Math.PI * 2;

// the part of CanvasRenderingContext2D Zdog uses; points are scaled by zoom and moved to the middle (half) on the way in
class ZCtx {
  constructor(zoom, half) {
    this.zoom = zoom; this.half = half; this.ops = [];
    this.path = []; this.cur = null;
    this.lineCap = "round"; this.lineJoin = "round"; this.lineWidth = 1; this.fillStyle = "#000000"; this.strokeStyle = "#000000";
  }
  pt(x, y) { return [x * this.zoom + this.half, y * this.zoom + this.half]; }
  beginPath() { this.path = []; this.cur = null; }
  moveTo(x, y) { this.cur = { pts: [this.pt(x, y)], closed: false }; this.path.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.pts.push(this.pt(x, y)); }
  bezierCurveTo(ax, ay, bx, by, x, y) {
    if (!this.cur) this.moveTo(ax, ay);
    const [x0, y0] = this.cur.pts[this.cur.pts.length - 1];
    const [a0, a1] = this.pt(ax, ay), [b0, b1] = this.pt(bx, by), [c0, c1] = this.pt(x, y);
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, u = 1 - t;
      this.cur.pts.push([u * u * u * x0 + 3 * u * u * t * a0 + 3 * u * t * t * b0 + t * t * t * c0,
        u * u * u * y0 + 3 * u * u * t * a1 + 3 * u * t * t * b1 + t * t * t * c1]);
    }
  }
  // as a canvas does: clockwise unless ccw; a whole turn or more is a full circle
  arc(x, y, r, a0, a1, ccw = false) {
    const full = Math.abs(a1 - a0) >= TAU - 1e-9;
    const turn = (d) => ((d % TAU) + TAU) % TAU;
    const sweep = full ? (ccw ? -TAU : TAU) : ccw ? -turn(a0 - a1) : turn(a1 - a0);
    const n = Math.max(6, Math.ceil((Math.abs(sweep) / TAU) * 32));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n, p = [x + r * Math.cos(a), y + r * Math.sin(a)];
      if (i === 0 && !this.cur) this.moveTo(...p); else this.lineTo(...p);
    }
  }
  closePath() { if (this.cur) this.cur.closed = true; }
  stroke() { this.ops.push({ kind: "stroke", path: this.path, color: this.strokeStyle, width: this.lineWidth * this.zoom, cap: this.lineCap }); }
  fill() { this.ops.push({ kind: "fill", path: this.path, color: this.fillStyle }); }
  save() {} restore() {} translate() {} scale() {} clearRect() {} setLineDash() {}
}

// ---------- geometry ----------
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
// the convex hull, counterclockwise (positive area); a line gives its two ends, a dot one point
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
// points around a whole circle of radius r px: enough to look round, few enough for the script's frame budget
const steps = (r) => Math.min(40, Math.max(10, Math.round(r)));
// a convex polygon (counterclockwise) grown by r, round at every corner: one point a circle, two a capsule
function grow(poly, r) {
  if (r <= 0.01) return poly;
  if (poly.length === 1) {
    const [x, y] = poly[0], n = steps(r);
    return Array.from({ length: n }, (_, i) => [x + r * Math.cos((TAU * i) / n), y + r * Math.sin((TAU * i) / n)]);
  }
  const out = [], n = poly.length;
  const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return Math.atan2(-dx / l, dy / l); };
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n], v = poly[i], next = poly[(i + 1) % n];
    const a1 = normal(prev, v), a2 = normal(v, next);
    const d = ((a2 - a1) % TAU + TAU) % TAU, k = Math.max(1, Math.ceil((d / TAU) * steps(r)));
    for (let j = 0; j <= k; j++) { const a = a1 + (d * j) / k; out.push([v[0] + r * Math.cos(a), v[1] + r * Math.sin(a)]); }
  }
  return out;
}
// one stroke of one subpath: a dot, or a capsule (round ends) / band (flat ends) per segment
function strokeShapes(sub, width, cap, out, color) {
  const r = width / 2, pts = sub.closed ? [...sub.pts, sub.pts[0]] : sub.pts;
  const moved = pts.some((p) => Math.abs(p[0] - pts[0][0]) > 0.01 || Math.abs(p[1] - pts[0][1]) > 0.01);
  if (!moved) { if (cap !== "butt") out.push({ pts: grow([pts[0]], r), color }); return; }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) continue;
    if (cap === "butt") {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = (-dy / l) * r, ny = (dx / l) * r;
      out.push({ pts: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], color });
    } else out.push({ pts: grow(hull([a, b]), r), color });
  }
}
// what Zdog drew -> filled polygons in drawing order
function polygons(ops) {
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i], next = ops[i + 1];
    if (op.kind === "stroke" && next?.kind === "fill" && next.path === op.path && next.color === op.color && op.path.length === 1 && op.cap !== "butt") {
      // stroked and filled: when the shape is convex, its hull grown by half the stroke is the whole of it
      const pts = op.path[0].pts, h = hull(pts), ha = Math.abs(area(h));
      if (ha < 1 || Math.abs(area(pts)) >= ha * 0.985) { out.push({ pts: grow(h, op.width / 2), color: op.color }); i++; continue; }
    }
    if (op.kind === "fill") { for (const s of op.path) if (s.pts.length > 2) out.push({ pts: s.pts, color: op.color }); }
    else for (const s of op.path) strokeShapes(s, op.width, op.cap, out, op.color);
  }
  return out;
}

// A Zdog scene (an Anchor and what is in it, Zdog's units) as filled polygons, size px square, zoom px per unit,
// centered: [{ pts, color }] in drawing order (keep them to draw a still scene again without Zdog)
export function zdogPolygons(scene, size, zoom) {
  const ctx = new ZCtx(zoom, size / 2);
  scene.updateGraph();
  scene.renderGraphCanvas(ctx);
  return polygons(ctx.ops).filter((p) => p.pts.length >= 3);
}

// the polygons as one element, size px square: a path element per polygon, stacked
export function polygonsView(polys, size) {
  const el = div().relative().size(size).flex_none();
  for (const p of polys) el.child(window.paint_path(PathBuilder.fill().add_polygon(p.pts, true).build(), p.color).absolute().top(0).left(0).size(size));
  return el;
}
