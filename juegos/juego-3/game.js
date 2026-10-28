'use strict';
/* =====================================================================
   PAC-MAN 1980 – clon fiel en JavaScript / Canvas
   ---------------------------------------------------------------------
   ARQUITECTURA
     Maze            grilla 28x31, colisiones de celdas, BFS (ojos)
     Actor           movimiento por casillas con progreso continuo
       PacMan        entrada, giro anticipado, reversa a mitad de casilla
       Ghost         máquina de estados + elección de dirección
         Blinky / Pinky / Inky / Clyde   (targeting tile propio)
     ModeController  ciclo Scatter <-> Chase por nivel
     Renderer        maze offscreen, sprites vectoriales, HUD
     Input           teclado + gestos táctiles
     Game            bucle (paso fijo 1/60), puntos, frutas, niveles
   ===================================================================== */

/* ======================= 1. CONFIGURACIÓN ======================= */
const T = 16;                       // píxeles por casilla
const COLS = 28, ROWS = 31;
const HUD_TOP = 3, HUD_BOTTOM = 2;  // filas extra para marcador
const BASE_SPEED = 9.47;            // casillas/seg al 100 % (75.75 px/s en el original)
const TUNNEL_ROW = 14;
const TUNNEL_SLOWS_PACMAN = false;  // en el original solo los fantasmas se frenan
const STEP = 1 / 60;                // paso fijo de simulación

const UP = { x: 0, y: -1 }, LEFT = { x: -1, y: 0 }, DOWN = { x: 0, y: 1 }, RIGHT = { x: 1, y: 0 };
const DIR_ORDER = [UP, LEFT, DOWN, RIGHT];   // prioridad original en empates

const wrapX = x => (x + COLS) % COLS;

/* '#' muro · '.' punto · 'o' energizer · '-' puerta · ' ' vacío */
const MAP = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '######.##          ##.######',
  '######.## ###--### ##.######',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '######.## ######## ##.######',
  '######.##          ##.######',
  '######.## ######## ##.######',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
];

/* Frutas: índice por nivel y puntuaciones (100 – 5000) */
const FRUITS = [
  { name: 'Cereza', pts: 100 }, { name: 'Fresa', pts: 300 }, { name: 'Naranja', pts: 500 },
  { name: 'Manzana', pts: 700 }, { name: 'Melón', pts: 1000 }, { name: 'Galaxian', pts: 2000 },
  { name: 'Campana', pts: 3000 }, { name: 'Llave', pts: 5000 }
];
const fruitIndex = l => (l <= 2 ? l - 1 : l <= 12 ? 2 + Math.floor((l - 3) / 2) : 7);
const FRUIT_POS = { x: 14, y: 17.5 };          // debajo de la casa, en coordenadas de casilla
const FRUIT_TRIGGERS = [70, 170];              // puntos comidos que activan la fruta

/* Tabla de dificultad (velocidades como fracción de BASE_SPEED) */
const FRIGHT_TIME = [0, 6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
function levelParams(l) {
  const p = {};
  if (l === 1)      Object.assign(p, { pac: .80, gh: .75, tun: .40, fp: .90, fg: .50, e1s: .80, e2s: .85 });
  else if (l <= 4)  Object.assign(p, { pac: .90, gh: .85, tun: .45, fp: .95, fg: .55, e1s: .90, e2s: .95 });
  else              Object.assign(p, { pac: 1.0, gh: .95, tun: .50, fp: 1.0, fg: .60, e1s: 1.0, e2s: 1.05 });
  if (l >= 21) p.pac = .90;
  p.fright = l >= 19 ? 0 : FRIGHT_TIME[l];
  p.flash = Math.min(p.fright, 2);                         // segundos de parpadeo final
  const e = l === 1 ? [20, 10] : l === 2 ? [30, 15] : l <= 5 ? [40, 20] : l <= 8 ? [50, 25] :
            l <= 11 ? [60, 30] : l <= 14 ? [80, 40] : l <= 18 ? [100, 50] : [120, 60];
  p.e1 = e[0]; p.e2 = e[1];                                // puntos restantes para Cruise Elroy 1 y 2
  p.schedule = l === 1 ? [7, 20, 7, 20, 5, 20, 5, Infinity]
             : l <= 4  ? [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity]
                       : [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
  p.limits = l === 1 ? { pinky: 0, inky: 30, clyde: 60 } : l === 2 ? { pinky: 0, inky: 0, clyde: 50 }
                     : { pinky: 0, inky: 0, clyde: 0 };
  p.idle = l < 5 ? 4 : 3;                                   // s sin comer para forzar salida
  return p;
}

/* ======================= 2. LABERINTO / GRILLA ======================= */
class Maze {
  constructor() { this.reset(); }
  reset() {
    this.cells = MAP.map(r => r.split(''));
    this.dotsLeft = 0;
    for (const row of this.cells) for (const c of row) if (c === '.' || c === 'o') this.dotsLeft++;
    this.totalDots = this.dotsLeft;
  }
  at(x, y) {
    if (y < 0 || y >= ROWS) return '#';
    if (x < 0 || x >= COLS) return y === TUNNEL_ROW ? ' ' : '#';   // túnel lateral
    return this.cells[y][x];
  }
  /* ¿puede el actor entrar en la casilla (x,y)? La puerta solo para fantasmas "leaving/eaten" */
  canWalk(actor, x, y) {
    const c = this.at(x, y);
    if (c === '#') return false;
    if (c === '-') return actor.canUseDoor();
    return true;
  }
  /* BFS: primer paso hacia (tx,ty). Lo usan los ojos y los fantasmas que salen de la casa */
  nextStep(actor, fx, fy, tx, ty) {
    if (fx === tx && fy === ty) return null;
    const key = (x, y) => y * COLS + x, prev = new Map([[key(fx, fy), null]]), q = [[fx, fy]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of DIR_ORDER) {
        const ny = y + d.y;
        if (ny < 0 || ny >= ROWS || !this.canWalk(actor, x + d.x, ny)) continue;
        const nx = wrapX(x + d.x), k = key(nx, ny);
        if (prev.has(k)) continue;
        prev.set(k, { x, y, d });
        if (nx === tx && ny === ty) {
          let cur = k, step = null;
          while (prev.get(cur)) { const pr = prev.get(cur); step = pr.d; cur = key(pr.x, pr.y); }
          return step;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
}

/* ======================= 3. ACTORES ======================= */
/* Posición = casilla (tx,ty) + dirección (dx,dy) + progreso p∈[0,1) hacia la casilla siguiente.
   Las decisiones de giro solo se toman con p === 0 (centro de casilla): movimiento continuo
   pero restringido a las intersecciones de la cuadrícula. */
class Actor {
  constructor() { this.tx = 0; this.ty = 0; this.dx = 0; this.dy = 0; this.p = 0; }
  place(tx, ty, dx, dy) { this.tx = tx; this.ty = ty; this.dx = dx; this.dy = dy; this.p = 0; }
  get px() { return this.tx + 0.5 + this.dx * this.p; }          // centro en unidades de casilla
  get py() { return this.ty + 0.5 + this.dy * this.p; }
  get nearTile() { const f = this.p >= 0.5 ? 1 : 0; return { x: wrapX(this.tx + this.dx * f), y: this.ty + this.dy * f }; }
  canUseDoor() { return false; }
  chooseDirection(game) {}
  onTile(game) {}
  advance(dist, game) {
    for (let guard = 0; dist > 1e-9 && guard < 24; guard++) {
      if (this.p === 0) {
        this.chooseDirection(game);
        if (this.dx === 0 && this.dy === 0) return;
      }
      const step = Math.min(dist, 1 - this.p);
      this.p += step; dist -= step;
      if (this.p >= 1 - 1e-9) {                                 // llegó al centro de la casilla siguiente
        this.tx = wrapX(this.tx + this.dx); this.ty += this.dy; this.p = 0;   // teletransporte lateral
        this.onTile(game);
      }
    }
  }
}

class PacMan extends Actor {
  constructor() { super(); this.want = null; this.face = LEFT; }
  speed(g) {
    let s = g.frightTimer > 0 ? g.params.fp : g.params.pac;
    if (TUNNEL_SLOWS_PACMAN && g.inTunnel(this)) s = Math.min(s, g.params.tun);
    return s * BASE_SPEED;
  }
  setWant(d) {
    this.want = d;
    // Reversa inmediata a mitad de casilla
    if (this.p > 0 && (this.dx || this.dy) && d.x === -this.dx && d.y === -this.dy) {
      this.tx = wrapX(this.tx + this.dx); this.ty += this.dy;
      this.p = 1 - this.p; this.dx = -this.dx; this.dy = -this.dy;
      this.face = { x: this.dx, y: this.dy };
    }
  }
  chooseDirection(g) {
    const m = g.maze, w = this.want;
    if (w && m.canWalk(this, this.tx + w.x, this.ty + w.y)) { this.dx = w.x; this.dy = w.y; }
    else if (!(this.dx || this.dy) || !m.canWalk(this, this.tx + this.dx, this.ty + this.dy)) { this.dx = 0; this.dy = 0; }
    if (this.dx || this.dy) this.face = { x: this.dx, y: this.dy };   // sin paradas salvo choque con muro
  }
}

/* ======================= 4. FANTASMAS ======================= */
class Ghost extends Actor {
  constructor(name, color, scatter, globalLimit) {
    super();
    this.name = name; this.color = color; this.scatter = scatter;
    this.globalLimit = globalLimit; this.dotLimit = 0; this.counter = 0;
    this.state = 'house';        // house | leaving | active | eaten
    this.frightened = false; this.reverse = false; this.justEaten = false;
  }
  canUseDoor() { return this.state === 'leaving' || this.state === 'eaten'; }

  speed(g) {
    const P = g.params;
    let s;
    if (this.state === 'eaten') s = 1.8;                         // ojos: a toda velocidad
    else if (this.state === 'house' || this.state === 'leaving') s = 0.5;
    else if (g.inTunnel(this)) s = P.tun;                        // túnel: reducción de velocidad
    else if (this.frightened) s = P.fg;
    else s = this.cruiseSpeed(g);
    return s * BASE_SPEED;
  }
  cruiseSpeed(g) { return g.params.gh; }

  chooseDirection(g) {
    if (this.state === 'house') { this.dx = 0; this.dy = this.ty >= 14 ? -1 : 1; return; }   // rebote
    if (this.state === 'leaving') return this.followPath(g, 13, 11);
    if (this.state === 'eaten') return this.followPath(g, 13, 14);
    this.chooseNormal(g);
  }
  followPath(g, tx, ty) {
    const s = g.maze.nextStep(this, this.tx, this.ty, tx, ty);
    if (s) { this.dx = s.x; this.dy = s.y; }
  }
  onTile(g) {
    if (this.state === 'leaving' && this.tx === 13 && this.ty === 11) { this.state = 'active'; this.dx = -1; this.dy = 0; }
    else if (this.state === 'eaten' && this.tx === 13 && this.ty === 14) { this.state = 'leaving'; this.frightened = false; }
  }
  /* Elige dirección en la casilla actual: sin reversa, minimizando distancia² a la casilla objetivo */
  chooseNormal(g) {
    const m = g.maze, moving = this.dx || this.dy;
    if (this.reverse) {                                          // cambio de modo / susto => dar la vuelta
      this.reverse = false;
      if (moving) { this.dx = -this.dx; this.dy = -this.dy; return; }
    }
    const opts = [];
    for (const d of DIR_ORDER) {
      if (moving && d.x === -this.dx && d.y === -this.dy) continue;
      if (!m.canWalk(this, this.tx + d.x, this.ty + d.y)) continue;
      if (!this.frightened && d.y === -1 && g.noUpZone(this.tx, this.ty)) continue;   // zonas sin giro hacia arriba
      opts.push({ d, nx: wrapX(this.tx + d.x), ny: this.ty + d.y });
    }
    if (!opts.length) { this.dx = -this.dx; this.dy = -this.dy; return; }
    let best = opts[0];
    if (this.frightened) best = opts[Math.floor(Math.random() * opts.length)];    // semialeatorio
    else {
      const t = this.target(g); let bd = Infinity;
      for (const o of opts) {
        const dd = (o.nx - t.x) ** 2 + (o.ny - t.y) ** 2;
        if (dd < bd) { bd = dd; best = o; }
      }
    }
    this.dx = best.d.x; this.dy = best.d.y;
  }
  target(g) { return g.mode === 'scatter' ? this.scatter : this.chaseTarget(g); }
  chaseTarget(g) { return g.pacTile(); }
}

class Blinky extends Ghost {                       // objetivo directo + Cruise Elroy
  chaseTarget(g) { return g.pacTile(); }
  target(g) { return (g.mode === 'scatter' && g.elroyLevel === 0) ? this.scatter : this.chaseTarget(g); }
  cruiseSpeed(g) { return [g.params.gh, g.params.e1s, g.params.e2s][g.elroyLevel]; }
}
class Pinky extends Ghost {                        // 4 casillas por delante (con el bug original hacia arriba)
  chaseTarget(g) {
    const t = g.pacTile(), f = g.pac.face;
    let x = t.x + 4 * f.x, y = t.y + 4 * f.y;
    if (f.y === -1) x -= 4;
    return { x, y };
  }
}
class Inky extends Ghost {                         // vector Blinky -> (Pac + 2 casillas), duplicado
  chaseTarget(g) {
    const t = g.pacTile(), f = g.pac.face;
    let px = t.x + 2 * f.x, py = t.y + 2 * f.y;
    if (f.y === -1) px -= 2;
    const b = g.blinky;
    return { x: 2 * px - b.tx, y: 2 * py - b.ty };
  }
}
class Clyde extends Ghost {                        // lejos: como Blinky · cerca (<8): a su esquina
  chaseTarget(g) {
    const t = g.pacTile();
    return ((this.tx - t.x) ** 2 + (this.ty - t.y) ** 2) > 64 ? t : this.scatter;
  }
}

/* ======================= 5. CICLO SCATTER / CHASE ======================= */
class ModeController {
  constructor(schedule) { this.schedule = schedule; this.i = 0; this.t = 0; }
  get mode() { return this.i % 2 === 0 ? 'scatter' : 'chase'; }
  update(dt) {                                      // devuelve true si el modo cambió
    if (this.i >= this.schedule.length - 1) return false;
    this.t += dt;
    if (this.t >= this.schedule[this.i]) { this.t = 0; this.i++; return true; }
    return false;
  }
}

/* ======================= 6. RENDER ======================= */
function wallAt(x, y) {
  if (y < 0 || y >= ROWS) return true;
  if (x < 0 || x >= COLS) return y !== TUNNEL_ROW;
  return MAP[y][x] === '#';
}
function buildMaze(color) {                         // laberinto pre-renderizado (offscreen)
  const c = document.createElement('canvas');
  c.width = COLS * T; c.height = ROWS * T;
  const g = c.getContext('2d'), th = 3;
  g.fillStyle = color;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (wallAt(x, y)) g.fillRect(x * T, y * T, T, T);
  g.fillStyle = '#000';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!wallAt(x, y)) continue;
    const l = wallAt(x - 1, y) ? 0 : th, r = wallAt(x + 1, y) ? 0 : th,
          u = wallAt(x, y - 1) ? 0 : th, d = wallAt(x, y + 1) ? 0 : th;
    g.fillRect(x * T + l, y * T + u, T - l - r, T - u - d);
  }
  g.fillStyle = color;                              // esquinas cóncavas
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!wallAt(x, y)) continue;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if (wallAt(x + sx, y) && wallAt(x, y + sy) && !wallAt(x + sx, y + sy))
        g.fillRect(sx > 0 ? (x + 1) * T - th : x * T, sy > 0 ? (y + 1) * T - th : y * T, th, th);
    }
  }
  g.fillStyle = '#ffb8de';                          // puerta de la casa
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAP[y][x] === '-') g.fillRect(x * T, y * T + T / 2 - 2, T, 4);
  return c;
}

function disc(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function drawFruitIcon(g, idx, X, Y) {
  const r = T * 0.5;
  g.lineWidth = 1.5; g.lineCap = 'round';
  switch (idx) {
    case 0: disc(g, X - r * .55, Y + r * .5, r * .5, '#ff1a1a'); disc(g, X + r * .6, Y + r * .55, r * .5, '#ff1a1a');
      g.strokeStyle = '#3cb043'; g.beginPath(); g.moveTo(X - r * .55, Y + r * .1); g.quadraticCurveTo(X - r * .1, Y - r, X + r * .4, Y - r * .9);
      g.moveTo(X + r * .6, Y + r * .1); g.lineTo(X + r * .4, Y - r * .9); g.stroke(); break;
    case 1: g.fillStyle = '#ff2a3c'; g.beginPath(); g.moveTo(X - r * .9, Y - r * .4); g.quadraticCurveTo(X, Y - r * .9, X + r * .9, Y - r * .4);
      g.quadraticCurveTo(X + r * .5, Y + r, X, Y + r); g.quadraticCurveTo(X - r * .5, Y + r, X - r * .9, Y - r * .4); g.fill();
      g.fillStyle = '#3cb043'; g.fillRect(X - r * .5, Y - r * .85, r, r * .35); break;
    case 2: disc(g, X, Y + r * .1, r * .85, '#ffa000'); g.fillStyle = '#3cb043'; g.fillRect(X - 1, Y - r, 3, r * .4); break;
    case 3: disc(g, X - r * .35, Y + r * .1, r * .6, '#e60000'); disc(g, X + r * .35, Y + r * .1, r * .6, '#e60000');
      g.strokeStyle = '#3cb043'; g.beginPath(); g.moveTo(X, Y - r * .5); g.lineTo(X + r * .3, Y - r); g.stroke(); break;
    case 4: disc(g, X, Y, r * .9, '#7ed957'); g.strokeStyle = '#2f8f2f'; g.beginPath();
      g.arc(X, Y, r * .5, 0, Math.PI * 2); g.moveTo(X - r * .9, Y); g.lineTo(X + r * .9, Y); g.stroke(); break;
    case 5: g.fillStyle = '#ffee00'; g.beginPath(); g.moveTo(X, Y - r); g.lineTo(X + r * .5, Y); g.lineTo(X - r * .5, Y); g.fill();
      g.fillStyle = '#2f6bff'; g.beginPath(); g.moveTo(X - r, Y - r * .6); g.lineTo(X, Y + r * .8); g.lineTo(X + r, Y - r * .6);
      g.lineTo(X + r * .5, Y - r * .6); g.lineTo(X, Y + r * .1); g.lineTo(X - r * .5, Y - r * .6); g.fill();
      g.fillStyle = '#ff2a3c'; g.fillRect(X - 1, Y - r * .9, 3, r * .8); break;
    case 6: g.fillStyle = '#ffee00'; g.beginPath(); g.arc(X, Y - r * .1, r * .8, Math.PI, 0); g.lineTo(X + r * .95, Y + r * .6);
      g.lineTo(X - r * .95, Y + r * .6); g.fill(); disc(g, X, Y + r * .85, r * .22, '#ffffff'); break;
    default: disc(g, X, Y - r * .5, r * .42, '#00e5ff'); g.fillStyle = '#00e5ff'; g.fillRect(X - 1.5, Y - r * .2, 3, r * 1.3);
      g.fillRect(X, Y + r * .5, r * .55, 3); g.fillRect(X, Y + r * .95 - 3, r * .4, 3);
  }
}

class Renderer {
  constructor(game) {
    this.g = game; this.c = game.ctx;
    this.mazeBlue = buildMaze('#2121de'); this.mazeWhite = buildMaze('#ffffff');
  }
  X(tx) { return tx * T; }
  Y(ty) { return (ty + HUD_TOP) * T; }
  wrapped(x, fn) { fn(x); if (x < T) fn(x + COLS * T); else if (x > (COLS - 1) * T) fn(x - COLS * T); }
  text(s, x, y, color, size = 16, align = 'left') {
    const c = this.c; c.font = `bold ${size}px "Courier New", monospace`;
    c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }
  render() {
    const g = this.g, c = this.c;
    c.fillStyle = '#000'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    const flashWhite = g.state === 'clear' && Math.floor(g.stateT * 5) % 2 === 1;
    c.drawImage(flashWhite ? this.mazeWhite : this.mazeBlue, 0, HUD_TOP * T);
    if (g.state !== 'clear') this.dots();
    if (g.fruit.active) drawFruitIcon(c, g.fruit.idx, this.X(FRUIT_POS.x), this.Y(FRUIT_POS.y));
    if (g.state !== 'title' && g.state !== 'clear' && g.state !== 'dying') for (const gh of g.ghosts) if (!gh.justEaten) this.ghost(gh);
    if (g.state !== 'title') this.pac();
    for (const p of g.popups) this.text(p.text, this.X(p.x), this.Y(p.y), p.color, 11, 'center');
    this.hud();
    const cx = COLS * T / 2, cy = this.Y(17.5);
    if (g.state === 'ready') this.text('READY!', cx, cy, '#ffff00', 16, 'center');
    if (g.state === 'gameover') { this.text('GAME  OVER', cx, cy, '#ff0000', 16, 'center'); this.text('toca o pulsa una tecla', cx, cy + 22, '#ffffff', 11, 'center'); }
    if (g.state === 'title') {
      this.text('PAC-MAN', cx, this.Y(9.5), '#ffff00', 34, 'center');
      if (Math.floor(g.animT * 2) % 2 === 0) this.text('TOCA O PULSA UNA TECLA', cx, cy, '#ffffff', 13, 'center');
    }
    if (g.paused) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); this.text('PAUSA', cx, cy, '#ffff00', 22, 'center'); }
  }
  dots() {
    const g = this.g, c = this.c, cells = g.maze.cells, blink = Math.floor(g.animT * 3) % 2 === 0;
    c.fillStyle = '#ffb8ae';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = cells[y][x];
      if (k === '.') c.fillRect(x * T + T / 2 - 1.5, (y + HUD_TOP) * T + T / 2 - 1.5, 3, 3);
      else if (k === 'o' && blink) { c.beginPath(); c.arc(x * T + T / 2, (y + HUD_TOP) * T + T / 2, T * 0.42, 0, Math.PI * 2); c.fill(); }
    }
  }
  pac() {
    const g = this.g, c = this.c, p = g.pac, r = T * 0.8;
    const X = this.X(p.px), Y = this.Y(p.py);
    let a = Math.atan2(p.face.y, p.face.x), m;
    if (g.state === 'dying') {
      a = -Math.PI / 2; m = Math.max(0, Math.min(1, (g.stateT - 0.4) / 1.2)) * Math.PI;
      if (m >= Math.PI) return;
      if (g.stateT < 0.4) m = 0.1;
    } else if (g.state === 'clear') { m = 0.35; }
    else m = (p.dx || p.dy) ? 0.05 + Math.abs(Math.sin(g.pacAnim * 14)) * 0.65 : 0.35;
    this.wrapped(X, x => {
      c.fillStyle = '#ffff00'; c.beginPath(); c.moveTo(x, Y);
      c.arc(x, Y, r, a + m, a - m + Math.PI * 2); c.closePath(); c.fill();
    });
  }
  ghost(gh) {
    const g = this.g, c = this.c, r = T * 0.8;
    const X = this.X(gh.px), Y = this.Y(gh.py);
    const dirx = gh.dx, diry = gh.dy;
    this.wrapped(X, x => {
      if (gh.state !== 'eaten') {
        let body = gh.color, fear = gh.frightened;
        if (fear) body = (g.frightTimer < g.params.flash && Math.floor(g.frightTimer * 5) % 2 === 0) ? '#ffffff' : '#2121de';
        c.fillStyle = body; c.beginPath(); c.arc(x, Y, r, Math.PI, 0);
        c.lineTo(x + r, Y + r);
        const seg = 6, w = 2 * r / seg, fr = Math.floor(g.animT * 8) % 2;
        for (let i = 1; i <= seg; i++) c.lineTo(x + r - i * w, ((i + fr) % 2 === 0) ? Y + r - 3 : Y + r);
        c.closePath(); c.fill();
        if (fear) {
          const face = body === '#ffffff' ? '#ff0000' : '#ffb8ae';
          c.fillStyle = face; c.fillRect(x - 5, Y - 4, 3, 3); c.fillRect(x + 2, Y - 4, 3, 3);
          c.strokeStyle = face; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 7, Y + 5);
          for (let i = 0; i < 5; i++) c.lineTo(x - 7 + (i + 1) * 2.8, Y + (i % 2 === 0 ? 2 : 5));
          c.stroke(); return;
        }
      }
      for (const s of [-1, 1]) {                        // ojos (también los de "eaten")
        disc(c, x + s * 4.5, Y - 3, 3.4, '#ffffff');
        disc(c, x + s * 4.5 + dirx * 1.8, Y - 3 + diry * 1.8, 1.8, '#1b3cff');
      }
    });
  }
  hud() {
    const g = this.g, c = this.c;
    if (Math.floor(g.animT * 2) % 2 === 0 || g.state === 'gameover') this.text('1UP', 3 * T, 0.7 * T, '#ffffff', 15);
    this.text(String(g.score), 7 * T, 1.7 * T, '#ffffff', 15, 'right');
    this.text('HIGH SCORE', 14 * T, 0.7 * T, '#ffffff', 15, 'center');
    this.text(String(g.high), 17 * T, 1.7 * T, '#ffffff', 15, 'right');
    const by = (ROWS + HUD_TOP + 1) * T;                // fila inferior: vidas + frutas del nivel
    for (let i = 0; i < Math.max(0, g.lives - 1); i++) {
      c.fillStyle = '#ffff00'; c.beginPath(); c.moveTo(2 * T + i * 2 * T, by);
      c.arc(2 * T + i * 2 * T, by, T * 0.75, Math.PI + 0.45, Math.PI - 0.45 + Math.PI * 2); c.fill();
    }
    for (let l = Math.max(1, g.level - 6), i = 0; l <= g.level; l++, i++) drawFruitIcon(c, fruitIndex(l), (COLS - 2 - i * 2) * T, by);
  }
}

/* ======================= 7. ENTRADA ======================= */
class Input {
  constructor(game, canvas) {
    const map = { ArrowUp: UP, KeyW: UP, ArrowLeft: LEFT, KeyA: LEFT, ArrowDown: DOWN, KeyS: DOWN, ArrowRight: RIGHT, KeyD: RIGHT };
    window.addEventListener('keydown', e => {
      if (map[e.code]) { e.preventDefault(); game.onDirection(map[e.code]); }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); game.onAction(); }
      else if (e.code === 'KeyP') game.togglePause();
    });
    let sx = 0, sy = 0, moved = false;
    canvas.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx, dy) > 18) {
        game.onDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP));
        sx = t.clientX; sy = t.clientY; moved = true;
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => { if (!moved) game.onAction(); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('mousedown', () => game.onAction());
  }
}

/* ======================= 8. JUEGO ======================= */
class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    canvas.width = COLS * T; canvas.height = (ROWS + HUD_TOP + HUD_BOTTOM) * T;
    this.maze = new Maze();
    this.state = 'title'; this.stateT = 0; this.timer = 0; this.paused = false;
    this.animT = 0; this.pacAnim = 0;
    this.score = 0; this.lives = 3; this.level = 1; this.extraGiven = false;
    this.high = this.loadHigh();
    this.popups = []; this.fruit = { active: false, timer: 0, idx: 0 };
    this.frightTimer = 0; this.ghostCombo = 0; this.pacPause = 0;
    this.params = levelParams(1); this.modeCtl = new ModeController(this.params.schedule);
    this.dotsEaten = 0; this.idleTimer = 0; this.useGlobal = false; this.globalCounter = 0; this.elroyOff = false;
    this.createActors(); this.resetActors();
    this.renderer = new Renderer(this);
  }
  /* ---------- utilidades ---------- */
  get mode() { return this.modeCtl.mode; }
  get elroyLevel() {
    if (this.elroyOff) return 0;
    const d = this.maze.dotsLeft;
    return d <= this.params.e2 ? 2 : d <= this.params.e1 ? 1 : 0;
  }
  pacTile() { const t = this.pac.nearTile; return { x: t.x, y: t.y }; }
  inTunnel(a) { return a.ty === TUNNEL_ROW && (a.tx <= 5 || a.tx >= 22); }
  noUpZone(x, y) { return (y === 11 || y === 23) && (x === 12 || x === 15); }
  setState(s, t = 0) { this.state = s; this.timer = t; this.stateT = 0; }
  loadHigh() { try { return parseInt(localStorage.getItem('pacman-high') || '0', 10) || 0; } catch (e) { return 0; } }
  saveHigh() { try { localStorage.setItem('pacman-high', String(this.high)); } catch (e) { /* sin almacenamiento */ } }
  addScore(n) {
    this.score += n; if (this.score > this.high) this.high = this.score;
    if (!this.extraGiven && this.score >= 10000) { this.extraGiven = true; this.lives++; }
  }
  /* ---------- creación / reinicios ---------- */
  createActors() {
    this.pac = new PacMan();
    this.blinky = new Blinky('blinky', '#ff0000', { x: 25, y: -3 }, 0);
    this.pinky = new Pinky('pinky', '#ffb8ff', { x: 2, y: -3 }, 7);
    this.inky = new Inky('inky', '#00ffff', { x: 27, y: 31 }, 17);
    this.clyde = new Clyde('clyde', '#ffb852', { x: 0, y: 31 }, 32);
    this.ghosts = [this.blinky, this.pinky, this.inky, this.clyde];
  }
  resetActors() {
    this.pac.place(13, 23, -1, 0); this.pac.want = null; this.pac.face = LEFT;
    this.blinky.place(13, 11, -1, 0); this.blinky.state = 'active';
    this.pinky.place(13, 14, 0, -1); this.inky.place(11, 14, 0, -1); this.clyde.place(15, 14, 0, -1);
    for (const g of [this.pinky, this.inky, this.clyde]) g.state = 'house';
    for (const g of this.ghosts) { g.frightened = false; g.reverse = false; g.justEaten = false; }
    this.frightTimer = 0; this.pacPause = 0;
  }
  newGame() {
    this.score = 0; this.lives = 3; this.level = 1; this.extraGiven = false;
    this.startLevel();
  }
  startLevel() {
    this.maze.reset();
    this.params = levelParams(this.level);
    this.modeCtl = new ModeController(this.params.schedule);
    this.dotsEaten = 0; this.idleTimer = 0; this.useGlobal = false; this.globalCounter = 0; this.elroyOff = false;
    this.fruit.active = false; this.popups = [];
    this.resetActors();
    const L = this.params.limits;
    this.pinky.dotLimit = L.pinky; this.inky.dotLimit = L.inky; this.clyde.dotLimit = L.clyde;
    for (const g of this.ghosts) g.counter = 0;
    this.setState('ready', 2.2);
  }
  /* ---------- entrada ---------- */
  onAction() { if (this.state === 'title' || this.state === 'gameover') this.newGame(); }
  onDirection(d) {
    if (this.state === 'title' || this.state === 'gameover') return this.newGame();
    this.pac.setWant(d);
  }
  togglePause() { if (this.state === 'playing' || this.state === 'ready') this.paused = !this.paused; }

  /* ---------- BUCLE DE ACTUALIZACIÓN (paso fijo) ---------- */
  update(dt) {
    if (this.paused) return;
    this.animT += dt; this.stateT += dt;
    this.popups = this.popups.filter(p => (p.t -= dt) > 0);
    switch (this.state) {
      case 'ready': if ((this.timer -= dt) <= 0) this.setState('playing'); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'freeze':
        if ((this.timer -= dt) <= 0) { this.ghosts.forEach(g => (g.justEaten = false)); this.setState('playing'); }
        break;
      case 'dying': if ((this.timer -= dt) <= 0) this.loseLife(); break;
      case 'clear': if ((this.timer -= dt) <= 0) { this.level++; this.startLevel(); } break;
    }
  }
  updatePlaying(dt) {
    // 1) temporizadores de modo
    if (this.frightTimer > 0) {
      if ((this.frightTimer -= dt) <= 0) { this.frightTimer = 0; this.ghosts.forEach(g => (g.frightened = false)); }
    } else if (this.modeCtl.update(dt)) {
      this.ghosts.forEach(g => { if (g.state === 'active') g.reverse = true; });
    }
    // 2) liberación de fantasmas
    this.idleTimer += dt;
    this.releaseCheck();
    // 3) Pac-Man (pausa de 1 frame por punto / 3 por energizer)
    if (this.pacPause > 0) this.pacPause -= dt;
    else { this.pac.advance(this.pac.speed(this) * dt, this); if (this.pac.dx || this.pac.dy) this.pacAnim += dt; }
    this.eat();
    // 4) fantasmas
    for (const g of this.ghosts) g.advance(g.speed(this) * dt, this);
    // 5) colisiones, fruta, fin de nivel
    this.collisions();
    if (this.fruit.active && (this.fruit.timer -= dt) <= 0) this.fruit.active = false;
    if (this.state === 'playing' && this.maze.dotsLeft === 0) { this.frightTimer = 0; this.setState('clear', 2.4); }
  }
  /* ---------- puntos, energizers, frutas ---------- */
  eat() {
    const t = this.pac.nearTile, c = this.maze.at(t.x, t.y);
    if (c !== '.' && c !== 'o') return;
    this.maze.cells[t.y][t.x] = ' ';
    this.maze.dotsLeft--; this.dotsEaten++;
    this.idleTimer = 0;
    if (this.useGlobal) this.globalCounter++;
    else { const w = this.waitingGhost(); if (w) w.counter++; }
    if (c === '.') { this.addScore(10); this.pacPause = 1 / 60; }
    else { this.addScore(50); this.pacPause = 3 / 60; this.startFright(); }
    if (FRUIT_TRIGGERS.includes(this.dotsEaten)) this.fruit = { active: true, timer: 9 + Math.random(), idx: fruitIndex(this.level) };
  }
  startFright() {
    this.ghostCombo = 0;
    const ft = this.params.fright;
    for (const g of this.ghosts) {
      if (g.state === 'eaten') continue;
      if (ft > 0) g.frightened = true;
      if (g.state === 'active') g.reverse = true;
    }
    this.frightTimer = ft;
  }
  waitingGhost() { return [this.pinky, this.inky, this.clyde].find(g => g.state === 'house'); }
  releaseCheck() {
    const g = this.waitingGhost();
    if (!g) return;
    let ok = this.useGlobal ? this.globalCounter >= g.globalLimit : g.counter >= g.dotLimit;
    if (!ok && this.idleTimer >= this.params.idle) ok = true;
    if (!ok) return;
    g.state = 'leaving'; this.idleTimer = 0;
    if (g === this.clyde) { this.elroyOff = false; if (this.useGlobal && this.globalCounter >= 32) this.useGlobal = false; }
  }
  /* ---------- colisiones AABB ---------- */
  collisions() {
    const p = this.pac, HALF = 0.4;                        // caja de 0.8 casillas
    const hit = (ax, ay, bx, by) => Math.abs(ax - bx) < HALF * 2 && Math.abs(ay - by) < HALF * 2;
    for (const g of this.ghosts) {
      if (g.state === 'eaten' || g.state === 'house' || !hit(p.px, p.py, g.px, g.py)) continue;
      if (g.frightened) {
        const pts = 200 << Math.min(this.ghostCombo++, 3);   // 200, 400, 800, 1600
        this.addScore(pts);
        g.state = 'eaten'; g.frightened = false; g.justEaten = true;
        this.popups.push({ x: g.px, y: g.py, text: String(pts), color: '#00ffff', t: 0.9 });
        this.setState('freeze', 0.9);
        return;
      }
      this.setState('dying', 1.9);                          // Pac-Man muere
      return;
    }
    if (this.fruit.active && hit(p.px, p.py, FRUIT_POS.x, FRUIT_POS.y)) {
      const f = FRUITS[this.fruit.idx];
      this.addScore(f.pts); this.fruit.active = false;
      this.popups.push({ x: FRUIT_POS.x, y: FRUIT_POS.y, text: String(f.pts), color: '#ffb8ff', t: 2 });
    }
  }
  loseLife() {
    this.lives--;
    if (this.lives <= 0) { this.saveHigh(); this.setState('gameover'); return; }
    this.resetActors();
    this.modeCtl = new ModeController(this.params.schedule);
    this.useGlobal = true; this.globalCounter = 0; this.elroyOff = true; this.idleTimer = 0;
    this.fruit.active = false;
    this.setState('ready', 2);
  }
  render() { this.renderer.render(); }
}

/* ======================= 9. BUCLE PRINCIPAL ======================= */
function main() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  new Input(game, canvas);
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= STEP) { game.update(STEP); acc -= STEP; }     // simulación a paso fijo
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', main);
else module.exports = { Game, Maze, MAP, levelParams };
