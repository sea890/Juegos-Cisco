(function () {
  'use strict';

  /* ==========================================================================
     BIT BLOCKS - bloques que caen
     Tablero de 10 x 20 (mas 2 filas ocultas arriba), 7 piezas, bolsa de 7,
     rotacion con "kicks" (SRS), caida fuerte y suave, sombra, siguiente x3.
     ========================================================================== */

  /* ---------- Configuracion ---------- */
  const W = 240, H = 256;                 // tamano logico del lienzo
  const COLS = 10, ROWS = 22, HIDDEN = 2, VIS = ROWS - HIDDEN;
  const CELL = 12;
  const BX = 8, BY = 8;                   // esquina del tablero visible
  const BW = COLS * CELL, BH = VIS * CELL;
  const PX = BX + BW + 10;                // columna lateral
  const PW = W - PX - 6;

  const LOCK_DELAY = 0.5;                 // tiempo para deslizar la pieza antes de fijarla
  const MAX_LOCK_RESETS = 15;
  const DAS = 0.17, ARR = 0.045;          // repeticion al mantener izquierda / derecha
  const SOFT_INTERVAL = 0.035;            // velocidad de la caida suave
  const CLEAR_TIME = 0.45;
  const LINES_PER_LEVEL = 10;
  const MAX_LEVEL = 20;
  const LINE_POINTS = [0, 100, 300, 500, 800];
  const LINE_NAMES = ['', '', 'DOBLE', 'TRIPLE', '4 LINEAS!'];
  const RESTART_DELAY = 0.7;

  const PAPER = '#f4f4f4', INK = '#202020', MUTED = '#8c8c8c', GRID = '#d9d9d9';

  /* ---------- Elementos de la pagina ---------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const soundBtn = document.getElementById('btn-sound');
  const pauseBtn = document.getElementById('btn-pause');
  const padLeft = document.getElementById('pad-left');
  const padRight = document.getElementById('pad-right');
  const padRotate = document.getElementById('pad-rotate');
  const padDown = document.getElementById('pad-down');
  const padDrop = document.getElementById('pad-drop');
  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  /* ---------- Almacenamiento (puede fallar en modo privado) ---------- */
  const store = {
    get(k) {
      try { return window.localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { window.localStorage.setItem(k, v); } catch (e) { /* ignorar */ }
    }
  };

  /* ---------- Piezas ---------- */
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const BASE = {
    I: ['....', 'XXXX', '....', '....'],
    O: ['XX', 'XX'],
    T: ['.X.', 'XXX', '...'],
    S: ['.XX', 'XX.', '...'],
    Z: ['XX.', '.XX', '...'],
    J: ['X..', 'XXX', '...'],
    L: ['..X', 'XXX', '...']
  };

  // SHAPES[tipo][rotacion] = lista de celdas [x, y]
  const SHAPES = (function () {
    const out = {};
    TYPES.forEach((t) => {
      let m = BASE[t].map((r) => r.split('').map((c) => (c === 'X' ? 1 : 0)));
      const states = [];
      for (let s = 0; s < 4; s++) {
        const cells = [];
        m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
        states.push(cells);
        const n = m.length;
        const old = m;
        m = old.map((row, y) => row.map((_, x) => old[n - 1 - x][y]));
      }
      out[t] = states;
    });
    return out;
  })();

  // Desplazamientos de rotacion (SRS). Estan en coordenadas con "y" hacia arriba;
  // al usarlos se invierte la "y".
  const KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };

  /* ---------- Dibujo de las piezas (cada tipo con su textura) ---------- */
  function makeTile(kind, size, ghost) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (ghost) {
      g.fillStyle = MUTED;
      for (let i = 0; i < size; i += 2) {
        g.fillRect(i, 0, 1, 1);
        g.fillRect(i, size - 1, 1, 1);
        g.fillRect(0, i, 1, 1);
        g.fillRect(size - 1, i, 1, 1);
      }
      return c;
    }
    const u = size >= 12 ? 2 : 1;          // tamano de cada "punto" de la textura
    const inner = size - 2;
    const units = Math.floor(inner / u);
    g.fillStyle = INK;
    g.fillRect(0, 0, size, size);          // marco
    g.fillStyle = PAPER;
    g.fillRect(1, 1, inner, inner);        // fondo claro
    g.fillStyle = INK;
    const dot = (i, j) => g.fillRect(1 + i * u, 1 + j * u, u, u);
    if (kind === 'I') {                    // macizo con brillo
      g.fillRect(1, 1, inner, inner);
      g.fillStyle = PAPER;
      g.fillRect(2, 2, u, u);
    } else if (kind === 'O') {             // marco grueso
      const k = size >= 12 ? 3 : 2;
      g.fillRect(k, k, size - 2 * k, size - 2 * k);
    } else if (kind === 'T') {             // tablero de ajedrez
      for (let j = 0; j < units; j++) for (let i = 0; i < units; i++) if ((i + j) % 2 === 0) dot(i, j);
    } else if (kind === 'S') {             // rayas horizontales
      for (let j = 0; j < units; j += 2) for (let i = 0; i < units; i++) dot(i, j);
    } else if (kind === 'Z') {             // rayas verticales
      for (let i = 0; i < units; i += 2) for (let j = 0; j < units; j++) dot(i, j);
    } else if (kind === 'J') {             // diagonales
      for (let j = 0; j < units; j++) for (let i = 0; i < units; i++) if ((i + j) % 3 === 0) dot(i, j);
    } else if (kind === 'L') {             // puntos
      for (let j = 0; j < units; j += 2) for (let i = 0; i < units; i += 2) dot(i, j);
    }
    return c;
  }

  const TILE = {}, TILE_S = {};
  TYPES.forEach((t) => { TILE[t] = makeTile(t, CELL); TILE_S[t] = makeTile(t, 8); });
  const GHOST = makeTile('', CELL, true);

  // Fondo fijo del tablero (marco y puntos de la cuadricula)
  const boardBg = (function () {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = INK;
    g.fillRect(BX - 2, BY - 2, BW + 4, BH + 4);
    g.fillStyle = PAPER;
    g.fillRect(BX, BY, BW, BH);
    g.fillStyle = GRID;
    for (let r = 0; r < VIS; r++) {
      for (let col = 0; col < COLS; col++) g.fillRect(BX + col * CELL + 5, BY + r * CELL + 5, 2, 2);
    }
    return c;
  })();

  /* ---------- Estado ---------- */
  let scale = 1;
  let state = 'ready';                     // 'ready' | 'running' | 'over'
  let paused = false;
  let muted = store.get('bitblocks-muted') === '1';
  let best = parseInt(store.get('bitblocks-best'), 10) || 0;
  let newRecord = false;

  let board = emptyBoard();
  let piece = null;
  let bag = [];
  let queue = [];
  let score = 0, lines = 0, level = 1;
  let dropAcc = 0, lockTimer = 0, lockResets = 0, lowestY = 0;
  let clearing = null;                     // { rows, t }
  let overAt = 0;
  let fx = [];                             // efectos: estelas y textos
  let toast = null;                        // { txt, t }
  let shake = { t: 0, dur: 0.1, mag: 0 };
  let clock = 0;                           // reloj de animacion (se detiene en pausa)
  const history = [];                      // piezas generadas (para pruebas)

  // Entrada
  let leftDown = false, rightDown = false, hDir = 0, hTimer = 0, hRepeating = false;
  let softHeld = false;

  function emptyBoard() {
    const b = [];
    for (let r = 0; r < ROWS; r++) b.push(new Array(COLS).fill(null));
    return b;
  }

  /* ---------- Sonido (sintetizado) ---------- */
  let actx = null;
  function audio() {
    if (actx === false) return null;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = false; return null; }
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  const sfx = {
    move() { tone(200, 0.025, 'square', 0.02); },
    rotate() { tone(340, 0.04, 'square', 0.03); },
    lock() { tone(130, 0.08, 'triangle', 0.09, 0, 70); },
    drop() { tone(170, 0.12, 'triangle', 0.1, 0, 50); },
    clear(n) {
      const base = [0, 440, 523, 659, 784][n] || 440;
      for (let i = 0; i <= n; i++) tone(base * Math.pow(1.26, i), 0.1, 'square', 0.05, i * 0.07);
    },
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.05, i * 0.08)); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.05, i * 0.17)); },
    blip() { tone(600, 0.05, 'square', 0.04); }
  };

  /* ---------- Reglas del juego ---------- */
  function cellsOf(p, rot) {
    return SHAPES[p.type][rot === undefined ? p.rot : rot];
  }

  function collides(p, dx, dy, rot) {
    const cells = cellsOf(p, rot);
    for (let i = 0; i < cells.length; i++) {
      const x = p.x + cells[i][0] + dx;
      const y = p.y + cells[i][1] + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
    return false;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function drawFromBag() {
    if (!bag.length) bag = shuffle(TYPES.slice());
    return bag.pop();
  }

  function fillQueue() {
    while (queue.length < 4) queue.push(drawFromBag());
  }

  function gravityInterval() {
    return Math.max(0.03, 0.8 * Math.pow(0.83, level - 1));
  }

  function spawn() {
    fillQueue();
    const type = queue.shift();
    fillQueue();
    history.push(type);
    piece = { type, rot: 0, x: type === 'O' ? 4 : 3, y: 0 };
    dropAcc = 0; lockTimer = 0; lockResets = 0;
    if (collides(piece, 0, 0)) { piece = null; gameOver(); return; }
    if (!collides(piece, 0, 1)) piece.y++;
    lowestY = piece.y;
  }

  function startGame() {
    board = emptyBoard();
    bag = []; queue = [];
    score = 0; lines = 0; level = 1;
    newRecord = false;
    clearing = null; fx = []; toast = null;
    paused = false;
    state = 'running';
    softHeld = false;
    hTimer = 0; hRepeating = false;
    hDir = leftDown && !rightDown ? -1 : rightDown && !leftDown ? 1 : 0;
    spawn();
    sfx.blip();
    syncUi();
  }

  function gameOver() {
    state = 'over';
    overAt = clock;
    softHeld = false;
    saveBest();
    sfx.over();
    syncUi();
  }

  function saveBest() {
    if (score > best) { best = score; newRecord = true; }
    if (best) store.set('bitblocks-best', String(best));
  }

  function canAct() {
    return state === 'running' && !paused && !!piece && !clearing;
  }

  // Cada vez que la pieza se mueve o gira estando apoyada, se reinicia la espera de fijado
  function afterMove() {
    if (!collides(piece, 0, 1)) {
      lockTimer = 0;
    } else if (lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  }

  function moveHoriz(dir) {
    if (!canAct() || collides(piece, dir, 0)) return false;
    piece.x += dir;
    afterMove();
    sfx.move();
    return true;
  }

  function rotate(dir) {
    if (!canAct()) return false;
    const from = piece.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    let kicks = [[0, 0]];
    if (piece.type === 'I') kicks = KICKS_I[from + '>' + to];
    else if (piece.type !== 'O') kicks = KICKS_JLSTZ[from + '>' + to];
    for (let i = 0; i < kicks.length; i++) {
      const dx = kicks[i][0], dy = -kicks[i][1];
      if (!collides(piece, dx, dy, to)) {
        piece.x += dx; piece.y += dy; piece.rot = to;
        if (piece.y > lowestY) { lowestY = piece.y; lockResets = 0; }
        afterMove();
        sfx.rotate();
        return true;
      }
    }
    return false;
  }

  function ghostY() {
    let d = 0;
    while (!collides(piece, 0, d + 1)) d++;
    return piece.y + d;
  }

  function hardDrop() {
    if (!canAct()) return;
    const startCells = cellsOf(piece).map((c) => [piece.x + c[0], piece.y + c[1]]);
    let n = 0;
    while (!collides(piece, 0, 1)) { piece.y++; n++; }
    if (n > 0) fx.push({ kind: 'trail', cells: startCells, n, t: 0.2, dur: 0.2 });
    score += 2 * n;
    shake = { t: 0.09, dur: 0.09, mag: 1 };
    sfx.drop();
    lockPiece();
  }

  function pressSoft() {
    softHeld = true;
    if (canAct() && !collides(piece, 0, 1)) {       // un paso inmediato para que un toque responda
      piece.y++;
      score++;
      dropAcc = 0;
      if (piece.y > lowestY) { lowestY = piece.y; lockResets = 0; }
    }
  }

  function lockPiece() {
    let allHidden = true;
    cellsOf(piece).forEach((c) => {
      const x = piece.x + c[0], y = piece.y + c[1];
      if (y >= 0) board[y][x] = piece.type;
      if (y >= HIDDEN) allHidden = false;
    });
    piece = null;
    if (allHidden) { sfx.lock(); gameOver(); return; }
    const full = [];
    for (let r = 0; r < ROWS; r++) if (board[r].every(Boolean)) full.push(r);
    if (full.length) {
      clearing = { rows: full, t: CLEAR_TIME };
      sfx.clear(full.length);
      if (full.length === 4) shake = { t: 0.35, dur: 0.35, mag: 3 };
    } else {
      sfx.lock();
      spawn();
    }
  }

  function finishClear() {
    const n = clearing.rows.length;
    const set = {};
    clearing.rows.forEach((r) => { set[r] = true; });
    const kept = board.filter((_, r) => !set[r]);
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
    board = kept;

    const pts = LINE_POINTS[n] * level;
    score += pts;
    lines += n;
    const midRow = clearing.rows.reduce((s, r) => s + r, 0) / n;
    const label = LINE_NAMES[n];
    fx.push({
      kind: 'pop',
      lines: label ? [label, '+' + pts] : ['+' + pts],
      x: BX + BW / 2,
      y: BY + Math.max(1, midRow - HIDDEN - 3) * CELL,
      t: 1, dur: 1
    });
    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));
    if (newLevel > level) {
      level = newLevel;
      showToast('NIVEL ' + level);
      setTimeout(sfx.level, 250);
    }
    if (score > best) { best = score; newRecord = true; }
    clearing = null;
    spawn();
  }

  /* ---------- Actualizacion ---------- */
  function showToast(txt) {
    toast = { txt, t: 1.3 };
  }

  function horizontal(dt) {
    if (!hDir) return;
    hTimer += dt;
    let threshold = hRepeating ? ARR : DAS;
    let guard = 0;
    while (hTimer >= threshold && guard++ < 12) {
      hTimer -= threshold;
      hRepeating = true;
      threshold = ARR;
      if (!moveHoriz(hDir)) { hTimer = 0; break; }
    }
  }

  function update(dt) {
    clock += dt;
    if (shake.t > 0) shake.t = Math.max(0, shake.t - dt);
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
    fx.forEach((f) => { f.t -= dt; });
    fx = fx.filter((f) => f.t > 0);
    if (state !== 'running') return;

    if (clearing) {
      clearing.t -= dt;
      if (clearing.t <= 0) finishClear();
      return;
    }
    if (!piece) return;

    horizontal(dt);

    if (collides(piece, 0, 1)) {
      dropAcc = 0;
      lockTimer += softHeld ? dt * 4 : dt;
      if (lockTimer >= LOCK_DELAY) lockPiece();
    } else {
      lockTimer = 0;
      const g = gravityInterval();
      const interval = softHeld ? Math.min(g, SOFT_INTERVAL) : g;
      dropAcc += dt;
      let steps = 0;
      while (dropAcc >= interval && !collides(piece, 0, 1) && steps++ < 25) {
        piece.y++;
        dropAcc -= interval;
        if (softHeld) score++;
        if (piece.y > lowestY) { lowestY = piece.y; lockResets = 0; }
      }
      if (collides(piece, 0, 1)) dropAcc = 0;
    }
    if (score > best) { best = score; newRecord = true; }
  }

  /* ---------- Dibujo ---------- */
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = align || 'left';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function pad6(n) {
    return String(Math.min(n, 9999999)).padStart(6, '0');
  }

  function drawPiecePreview(type, cx, cy) {
    const cells = SHAPES[type][0];
    let minX = 9, maxX = 0, minY = 9, maxY = 0;
    cells.forEach((c) => {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    });
    const w = (maxX - minX + 1) * 8, h = (maxY - minY + 1) * 8;
    const ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2);
    cells.forEach((c) => ctx.drawImage(TILE_S[type], ox + (c[0] - minX) * 8, oy + (c[1] - minY) * 8));
  }

  function drawPanel() {
    text('SIGUIENTE', PX, BY, 8, MUTED);
    for (let i = 0; i < 3; i++) {
      if (queue[i]) drawPiecePreview(queue[i], PX + PW / 2, BY + 28 + i * 26);
    }
    const row = (label, value, y, big) => {
      text(label, PX, y, 8, MUTED);
      text(value, PX, y + 12, big ? 10 : 8, INK);
    };
    row('PUNTOS', pad6(score), 108, true);
    row('NIVEL', String(level), 142, false);
    row('LINEAS', String(lines), 172, false);
    row('MEJOR', pad6(best), 202, false);
  }

  function drawBoard() {
    ctx.drawImage(boardBg, 0, 0);

    // piezas fijas
    for (let r = HIDDEN; r < ROWS; r++) {
      const isClearing = clearing && clearing.rows.indexOf(r) >= 0;
      for (let c = 0; c < COLS; c++) {
        const k = board[r][c];
        if (!k) continue;
        const x = BX + c * CELL, y = BY + (r - HIDDEN) * CELL;
        if (isClearing) {
          const p = 1 - clearing.t / CLEAR_TIME;
          if (Math.abs(c - 4.5) < p * 5.6) continue;      // se abre desde el centro
          if (Math.floor(clock * 18) % 2 === 0) {
            ctx.fillStyle = INK;
            ctx.fillRect(x, y, CELL, CELL);
          } else {
            ctx.drawImage(TILE[k], x, y);
          }
        } else {
          ctx.drawImage(TILE[k], x, y);
        }
      }
    }

    // estelas de la caida fuerte
    fx.forEach((f) => {
      if (f.kind !== 'trail') return;
      ctx.globalAlpha = 0.45 * (f.t / f.dur);
      ctx.fillStyle = MUTED;
      f.cells.forEach((c) => {
        const y = c[1] - HIDDEN;
        const top = Math.max(0, y);
        const h = (y + f.n) - top;
        if (h > 0) ctx.fillRect(BX + c[0] * CELL + 3, BY + top * CELL, CELL - 6, h * CELL);
      });
      ctx.globalAlpha = 1;
    });

    // sombra y pieza actual
    if (piece && state === 'running') {
      const gy = ghostY();
      if (gy > piece.y) {
        cellsOf(piece).forEach((c) => {
          const y = gy + c[1];
          if (y >= HIDDEN) ctx.drawImage(GHOST, BX + (piece.x + c[0]) * CELL, BY + (y - HIDDEN) * CELL);
        });
      }
      cellsOf(piece).forEach((c) => {
        const y = piece.y + c[1];
        if (y >= HIDDEN) ctx.drawImage(TILE[piece.type], BX + (piece.x + c[0]) * CELL, BY + (y - HIDDEN) * CELL);
      });
    }
  }

  function veil(alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PAPER;
    ctx.fillRect(BX, BY, BW, BH);
    ctx.globalAlpha = 1;
  }

  function centered(str, y, size, color) {
    text(str, BX + BW / 2, y, size, color || INK, 'center');
  }

  function drawOverlay() {
    if (state === 'ready') {
      veil(0.92);
      centered('BIT', 58, 16);
      centered('BLOCKS', 80, 16);
      // muestra de las 7 texturas
      TYPES.forEach((t, i) => ctx.drawImage(TILE[t], BX + (BW - 7 * CELL - 6 * 2) / 2 + i * (CELL + 2), 116));
      centered(isTouch ? 'TOCA PARA' : 'ESPACIO PARA', 160, 8, MUTED);
      centered('EMPEZAR', 174, 8, MUTED);
    } else if (paused) {
      veil(1);
      centered('PAUSA', 100, 16);
      centered(isTouch ? 'TOCA PARA' : 'P PARA', 134, 8, MUTED);
      centered('SEGUIR', 148, 8, MUTED);
    } else if (state === 'over') {
      veil(0.9);
      centered('FIN DEL', 52, 16);
      centered('JUEGO', 74, 16);
      centered('PUNTOS', 112, 8, MUTED);
      centered(pad6(score), 126, 10);
      if (newRecord && score > 0) {
        if (Math.floor(clock * 3) % 2 === 0) centered('NUEVO RECORD!', 150, 8);
      } else {
        centered('MEJOR ' + pad6(best), 150, 8, MUTED);
      }
      if (clock - overAt > RESTART_DELAY) {
        centered(isTouch ? 'TOCA PARA' : 'ESPACIO PARA', 182, 8, MUTED);
        centered('REINICIAR', 196, 8, MUTED);
      }
    }
  }

  function drawFx() {
    fx.forEach((f) => {
      if (f.kind !== 'pop') return;
      const p = 1 - f.t / f.dur;
      const y = Math.round(f.y - p * 14);
      if (f.t < 0.25 && Math.floor(clock * 20) % 2 === 0) return;     // parpadea al final
      f.lines.forEach((ln, i) => {
        text(ln, f.x + 1, y + i * 11 + 1, 8, PAPER, 'center');
        text(ln, f.x - 1, y + i * 11 + 1, 8, PAPER, 'center');
        text(ln, f.x, y + i * 11, 8, INK, 'center');
      });
    });
    if (toast) {
      const w = toast.txt.length * 8 + 12;
      const x = Math.round(BX + (BW - w) / 2), y = BY + 8;
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, w, 18);
      text(toast.txt, BX + BW / 2, y + 5, 8, PAPER, 'center');
    }
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake.t > 0) {
      const m = shake.mag * (shake.t / shake.dur);
      ctx.translate(Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m));
    }
    drawBoard();
    drawFx();
    drawOverlay();
    ctx.restore();

    drawPanel();
  }

  /* ---------- Interfaz ---------- */
  function syncUi() {
    if (soundBtn) {
      soundBtn.classList.toggle('is-off', muted);
      soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
    if (pauseBtn) {
      pauseBtn.classList.toggle('is-paused', paused);
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    }
  }

  function toggleMute() {
    muted = !muted;
    store.set('bitblocks-muted', muted ? '1' : '0');
    syncUi();
    showToast(muted ? 'SONIDO NO' : 'SONIDO SI');
    if (!muted) sfx.blip();
  }

  function releaseAll() {
    leftDown = false; rightDown = false; hDir = 0; hTimer = 0; hRepeating = false;
    softHeld = false;
  }

  function setPaused(v) {
    if (v && state !== 'running') return;
    if (paused === v) return;
    paused = v;
    if (v) { releaseAll(); saveBest(); }
    syncUi();
  }

  function tryStart() {
    if (state === 'running') return;
    if (state === 'over' && clock - overAt < RESTART_DELAY) return;
    startGame();
  }

  function pressDir(d) {
    if (d < 0) leftDown = true; else rightDown = true;
    hDir = d; hTimer = 0; hRepeating = false;
    moveHoriz(d);
  }

  function releaseDir(d) {
    if (d < 0) leftDown = false; else rightDown = false;
    if (hDir === d) {
      hDir = d < 0 ? (rightDown ? 1 : 0) : (leftDown ? -1 : 0);
      hTimer = 0; hRepeating = false;
    }
  }

  /* ---------- Teclado ---------- */
  const KEY = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    soft: ['ArrowDown', 'KeyS'],
    cw: ['ArrowUp', 'KeyX', 'KeyW'],
    ccw: ['KeyZ'],
    hard: ['Space']
  };
  const is = (list, code) => list.indexOf(code) >= 0;

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowUp' || k === 'Space') e.preventDefault();
    if (k === 'KeyP' || k === 'Escape') {
      if (!e.repeat) setPaused(!paused);
      return;
    }
    if (k === 'KeyM') {
      if (!e.repeat) toggleMute();
      return;
    }
    if (e.repeat) return;
    if (state !== 'running') {
      if (k === 'Space' || k === 'Enter' || is(KEY.cw, k)) tryStart();
      return;
    }
    if (paused) return;
    if (is(KEY.left, k)) pressDir(-1);
    else if (is(KEY.right, k)) pressDir(1);
    else if (is(KEY.soft, k)) pressSoft();
    else if (is(KEY.cw, k)) rotate(1);
    else if (is(KEY.ccw, k)) rotate(-1);
    else if (is(KEY.hard, k)) hardDrop();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.code;
    if (is(KEY.left, k)) releaseDir(-1);
    else if (is(KEY.right, k)) releaseDir(1);
    else if (is(KEY.soft, k)) softHeld = false;
  });

  /* ---------- Toque / mouse ---------- */
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (paused) setPaused(false);
    else if (state !== 'running') tryStart();
  });

  function onTap(el, fn) {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
      el.blur();             // que el teclado siga controlando el juego
    });
  }

  // Boton que se mantiene presionado; soporta multitoque
  function holdButton(el, onDown, onUp) {
    if (!el) return;
    const up = () => {
      el.classList.remove('is-down');
      if (onUp) onUp();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
      el.classList.add('is-down');
      onDown();
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onTap(soundBtn, toggleMute);
  onTap(pauseBtn, () => setPaused(!paused));

  // Los botones tambien sirven para empezar o reiniciar
  const startOr = (fn) => () => {
    if (paused) { setPaused(false); return; }
    if (state !== 'running') { tryStart(); return; }
    fn();
  };
  holdButton(padLeft, startOr(() => pressDir(-1)), () => releaseDir(-1));
  holdButton(padRight, startOr(() => pressDir(1)), () => releaseDir(1));
  holdButton(padDown, startOr(pressSoft), () => { softHeld = false; });
  holdButton(padRotate, startOr(() => rotate(1)));
  holdButton(padDrop, startOr(hardDrop));

  /* ---------- Tamano, pausa automatica y bucle ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || W;
    scale = Math.max(1, Math.round((cssW * dpr) / W));
    const bw = W * scale, bh = H * scale;
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);

  window.addEventListener('blur', () => {
    releaseAll();
    if (state === 'running') setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseAll();
      if (state === 'running') setPaused(true);
    }
  });

  let last = null;
  function frame(t) {
    if (last === null) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- Inicio ---------- */
  resize();
  syncUi();
  requestAnimationFrame(frame);
})();
