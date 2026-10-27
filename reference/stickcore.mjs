// stickcore.mjs – Stichgenerierung und Bernina-Dateien (EXP, INF, BMP)
// Einheiten: 0,1 mm. Koordinaten wie SVG (y nach unten); EXP dreht beim Schreiben um.

// ---------- Hilfsfunktionen ----------
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Konvexes Polygon nach innen versetzen (vereinfachter Ansatz über Kantenverschiebung)
export function inset(poly, d) {
  const n = poly.length, lines = [];
  // Umlaufsinn bestimmen, damit "innen" stimmt
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const s = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], L = dist(a, b);
    const nx = -(b[1] - a[1]) / L * s, ny = (b[0] - a[0]) / L * s;
    lines.push([[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]]);
  }
  return lines.map((l, i) => {
    const [p1, p2] = lines[(i - 1 + n) % n], [p3, p4] = l;
    const d1 = [p2[0] - p1[0], p2[1] - p1[1]], d2 = [p4[0] - p3[0], p4[1] - p3[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return p3;
    const t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
  });
}

// ---------- Stichplan ----------
export class Plan {
  constructor() { this.cmds = []; this.pos = null; this.dir = [1, 0]; }
  stitchTo(p, maxLen = 30) {
    if (!this.pos) { this.cmds.push({ t: 'stitch', x: p[0], y: p[1] }); this.pos = p; return; }
    const d = dist(this.pos, p); if (d < 0.5) return;
    const n = Math.max(1, Math.ceil(d / maxLen)), a = this.pos;
    for (let i = 1; i <= n; i++) { const q = lerp(a, p, i / n); this.cmds.push({ t: 'stitch', x: q[0], y: q[1] }); }
    this.dir = [(p[0] - a[0]) / d, (p[1] - a[1]) / d];
    this.pos = p;
  }
  jumpTo(p) { this.cmds.push({ t: 'jump', x: p[0], y: p[1] }); this.pos = p; }
  trim() { this.cmds.push({ t: 'trim' }); }
  color() { this.cmds.push({ t: 'color' }); }
  // Fadenstück nähen: Anfahren, Verriegeln, Stiche, Verriegeln
  sew(path, maxLen = 30) {
    const [p0, p1] = path;
    if (!this.pos || dist(this.pos, p0) > 0.5) { if (this.pos) this.jumpTo(p0); this.cmds.push({ t: 'stitch', x: p0[0], y: p0[1] }); this.pos = p0; }
    const u = [(p1[0] - p0[0]) / dist(p0, p1), (p1[1] - p0[1]) / dist(p0, p1)];
    const a = [p0[0] + u[0] * 4, p0[1] + u[1] * 4];                 // Verriegelung 0,4 mm
    for (const q of [a, p0, a, p0]) this.cmds.push({ t: 'stitch', x: q[0], y: q[1] });
    for (const q of path.slice(1)) this.stitchTo(q, maxLen);
    const e = this.pos, b = [e[0] - this.dir[0] * 4, e[1] - this.dir[1] * 4];
    for (const q of [b, e, b, e]) this.cmds.push({ t: 'stitch', x: q[0], y: q[1] });
  }
}

// ---------- Füllstich (Tatami) ----------
// spacing: Reihenabstand, len: Stichlänge, angle: Stichrichtung in Grad,
// pull: Zugausgleich je Seite, stagger: Versatz der Einstiche (4 = Viertel-Versatz)
export function tatami(poly, { spacing = 4, len = 30, angle = 0, pull = 2, stagger = 4 } = {}) {
  const a = angle * Math.PI / 180, P = poly.map(p => rot(p, -a));
  const ys = P.map(p => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const path = [];
  let row = 0;
  for (let y = y0 + spacing / 2; y < y1; y += spacing, row++) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
    }
    if (xs.length < 2) continue;
    const xa = Math.min(...xs) - pull, xb = Math.max(...xs) + pull;
    const phase = (row % stagger) * len / stagger, pts = [xa];
    for (let x = Math.ceil((xa - phase) / len) * len + phase; x < xb; x += len)
      if (x - xa > 5 && xb - x > 5) pts.push(x);                   // keine Mini-Stiche am Rand
    pts.push(xb);
    if (row % 2) pts.reverse();
    for (const x of pts) path.push(rot([x, y], a));
  }
  return path;
}

// Kontur ablaufen (z. B. als Unterlage)
export const contour = poly => [...poly, poly[0]];

// Komplette Fläche: Unterlage + Deckschicht; raised = 3D-Effekt (zusätzliche Unterlagen)
export function fillArea(poly, { density = 4, angle = 0, raised = 0 } = {}) {
  const inner = inset(poly, 5);
  let path = contour(inner);                                          // Kantenlauf 0,5 mm innen
  path = path.concat(tatami(inner, { spacing: 20, angle: angle + 90, pull: 0 }));   // lockere Querunterlage
  for (let i = 0; i < raised; i++)                                    // 3D: weitere Lagen, abwechselnd gedreht
    path = path.concat(tatami(inset(poly, 4), { spacing: 10, angle: angle + (i % 2 ? 90 : 0), pull: 0 }));
  return path.concat(tatami(poly, { spacing: density, angle }));
}

// ---------- Satinsäule zwischen zwei geraden Schienen ----------
export function satin(railA, railB, { spacing = 4, pull = 2 } = {}) {
  const L = Math.max(dist(...railA), dist(...railB));
  const out = (p, q, d) => { const l = dist(p, q); return [p[0] + (p[0] - q[0]) / l * d, p[1] + (p[1] - q[1]) / l * d]; };
  const zig = (sp, pc, ins) => {
    const n = Math.ceil(L / (sp / 2)), pts = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(...railA, i / n), b = lerp(...railB, i / n);
      pts.push(i % 2 ? out(b, a, pc - ins) : out(a, b, pc - ins));
    }
    return pts;
  };
  const mid = t => lerp(lerp(...railA, t), lerp(...railB, t), 0.5);
  const under = [mid(0), mid(1), ...zig(30, 0, 4).reverse()];        // Mittellauf + Zickzack-Unterlage
  return under.concat(zig(spacing, pull, 0));
}

// ---------- Dateien schreiben ----------
export function writeEXP(cmds) {
  const out = []; let px = null, py = null;
  for (const c of cmds) {
    if (c.t === 'trim') { out.push(0x80, 0x80, 0x07, 0x00); continue; }
    if (c.t === 'color') { out.push(0x80, 0x01, 0x00, 0x00); continue; }
    const tx = Math.round(c.x), ty = Math.round(c.y);
    if (px === null) { px = tx; py = ty; out.push(0, 0); continue; }   // erster Stich = Ursprung
    const dx = tx - px, dy = ty - py, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 127));
    const x0 = px, y0 = py;
    for (let i = 1; i <= n; i++) {
      const nx = x0 + Math.round(dx * i / n), ny = y0 + Math.round(dy * i / n);
      if (c.t === 'jump') out.push(0x80, 0x04);
      out.push((nx - px) & 0xFF, (-(ny - py)) & 0xFF);                // Y nach oben
      px = nx; py = ny;
    }
  }
  return new Uint8Array(out);
}

export function writeINF(threads) {        // threads: [{rgb:[r,g,b], name, chart}]
  const enc = new TextEncoder(), body = [];
  const u16 = v => body.push((v >> 8) & 255, v & 255);
  threads.forEach((t, i) => {
    const n = enc.encode(t.name), c = enc.encode(t.chart);
    u16(11 + n.length + c.length); u16(i); body.push(...t.rgb); u16(i + 1);
    body.push(...n, 0, ...c, 0);
  });
  const head = [0, 0, 0, 1, 0, 0, 0, 8], len = body.length + 4, cnt = threads.length;
  return new Uint8Array([...head, len >>> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255,
    cnt >>> 24, (cnt >> 16) & 255, (cnt >> 8) & 255, cnt & 255, ...body]);
}

export function writeBMP(cmds, threads, scale = 4, margin = 10) {
  const pts = cmds.filter(c => c.x !== undefined);
  const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
  const W = Math.ceil((Math.max(...pts.map(p => p.x)) - minX) / scale) + 2 * margin;
  const H = Math.ceil((Math.max(...pts.map(p => p.y)) - minY) / scale) + 2 * margin;
  const px = new Uint8Array(W * H * 3).fill(255);
  const plot = (x, y, [r, g, b]) => { if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; } };
  let ci = 0, last = null;
  for (const c of cmds) {
    if (c.t === 'color') { ci++; last = null; continue; }
    if (c.t === 'trim') { last = null; continue; }
    const p = [Math.round((c.x - minX) / scale) + margin, Math.round((c.y - minY) / scale) + margin];
    if (c.t === 'stitch' && last) {                                    // Linie zeichnen
      const n = Math.max(Math.abs(p[0] - last[0]), Math.abs(p[1] - last[1]), 1);
      for (let i = 0; i <= n; i++) plot(Math.round(last[0] + (p[0] - last[0]) * i / n), Math.round(last[1] + (p[1] - last[1]) * i / n), threads[Math.min(ci, threads.length - 1)].rgb);
    }
    last = c.t === 'stitch' ? p : null;
  }
  const rowLen = Math.ceil(W * 3 / 4) * 4, size = 54 + rowLen * H, f = new Uint8Array(size), v = new DataView(f.buffer);
  f[0] = 0x42; f[1] = 0x4D; v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, W, true); v.setInt32(22, H, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
  v.setUint32(34, rowLen * H, true); v.setInt32(38, 3780, true); v.setInt32(42, 3780, true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {         // BMP: unten nach oben, BGR
    const s = (y * W + x) * 3, d = 54 + (H - 1 - y) * rowLen + x * 3;
    f[d] = px[s + 2]; f[d + 1] = px[s + 1]; f[d + 2] = px[s];
  }
  return f;
}
