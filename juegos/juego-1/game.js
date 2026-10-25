(() => {
  'use strict';

  /* =========================================================
     BIT RUNNER
     Runner infinito en blanco y negro, dibujado 100% con código.
     Ciudad de día -> a los 500 puntos la ciudad cae en ruinas.
     Truco para probar: abre index.html?puntos=480
     ========================================================= */

  /* ---------- Configuración ---------- */
  const W = 600;            // ancho lógico
  const H = 150;            // alto lógico
  const GROUND_Y = 126;     // línea del suelo

  const FONT = '"Press Start 2P", monospace';

  const GRAVITY = 1800;     // px/s²
  const JUMP_V = 450;       // px/s
  const MIN_JUMP_V = 170;   // salto corto al soltar la tecla
  const FAST_FALL = 3;      // multiplicador de gravedad al presionar ↓ en el aire
  const START_SPEED = 300;  // px/s
  const MAX_SPEED = 720;
  const ACCEL = 5;          // px/s²
  const SCORE_RATE = 0.035; // puntos por px recorrido
  const PLAYER_X = 34;
  const RESTART_DELAY = 400; // ms

  const RUIN_SCORE = 500;   // puntos para pasar al modo apocalíptico
  const THEME_TIME = 1.8;   // segundos que dura la transición

  const LASER_SPEED = 900;     // px/s
  const LASER_COOLDOWN = 0.28; // segundos entre disparos
  const MAX_LASERS = 3;        // rayos simultáneos en pantalla
  const DRONE_BONUS = 50;      // puntos por cada dron derribado
  const AIR_SCORE = 1000;      // puntos para la escena de aviones destruidos
  const AIR_TIME = 2.0;        // segundos que tardan en aparecer los restos

  // Energía del láser: cada disparo cuesta y, si se agota, se sobrecalienta
  const ENERGY_MAX = 100;
  const SHOT_COST = 18;        // energía por disparo
  const ENERGY_REGEN = 22;     // energía recuperada por segundo
  const ENERGY_UNLOCK = 36;    // tras agotarse, no dispara hasta recuperar esto

  const PLANE_BONUS = 75;      // puntos por derribar un avión en picada
  const JET_BONUS = 100;       // puntos por derribar un jet (aguanta 2 disparos)

  /* ---------- Paletas (escala de grises) ---------- */
  const PALETTE = {
    day:  { paper: 244, ink: 32,  mist: 222, muted: 140 },
    ruin: { paper: 16,  ink: 233, mist: 40,  muted: 122 }
  };
  let INK = '#202020';
  let PAPER = '#f4f4f4';
  let MIST = '#dedede';
  let MUTED = '#8c8c8c';

  const soundBtn = document.getElementById('btn-sound');
  const pauseBtn = document.getElementById('btn-pause');
  const padFire = document.getElementById('pad-fire');
  const padJump = document.getElementById('pad-jump');
  const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  let appliedTheme = -1;

  const gray = (v) => {
    const n = Math.round(v);
    return 'rgb(' + n + ',' + n + ',' + n + ')';
  };
  const mixV = (a, b, t) => a + (b - a) * t;

  function applyTheme(t, force) {
    if (!force && Math.abs(t - appliedTheme) < 0.003) return;
    appliedTheme = t;
    PAPER = gray(mixV(PALETTE.day.paper, PALETTE.ruin.paper, t));
    INK = gray(mixV(PALETTE.day.ink, PALETTE.ruin.ink, t));
    MIST = gray(mixV(PALETTE.day.mist, PALETTE.ruin.mist, t));
    MUTED = gray(mixV(PALETTE.day.muted, PALETTE.ruin.muted, t));
    const root = document.documentElement.style;
    root.setProperty('--paper', PAPER);
    root.setProperty('--ink', INK);
    root.setProperty('--muted', MUTED);
    document.body.style.background = PAPER;
  }

  /* ---------- Canvas ---------- */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let uiK = 1;          // tamaño de los textos: crece en pantallas chicas para leerse bien
  let compact = false;  // pantalla angosta (teléfono vertical): HUD en dos columnas

  const fs = (n) => Math.round(n * uiK) + 'px ' + FONT;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || W;
    scale = Math.max(1, Math.round((cssW * dpr) / W));
    uiK = Math.min(2, Math.max(1, 880 / cssW));
    compact = uiK > 1.3;
    if (canvas.width !== W * scale || canvas.height !== H * scale) {
      canvas.width = W * scale;
      canvas.height = H * scale;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  /* ---------- Sprites (pixel art) ---------- */
  const BOT_TOP = [
    '........##......',
    '........##......',
    '..############..',
    '..############..',
    '..#######..###..',
    '..#######..###..',
    '..############..',
    '..############..',
    '..############..',
    '....########....',
    '...##########...',
    '...##########...',
    '...##.####.##...',
    '...##########...',
    '....########....'
  ];

  const BOT_LEGS_STAND = [
    '....##....##....',
    '....##....##....',
    '....##....##....',
    '...###....###...'
  ];
  const BOT_LEGS_A = [
    '....##....##....',
    '....##....##....',
    '....##..........',
    '...###..........'
  ];
  const BOT_LEGS_B = [
    '....##....##....',
    '....##....##....',
    '..........##....',
    '..........###...'
  ];

  const BOT_DUCK_TOP = [
    '...##############...',
    '...##############...',
    '...#########..####..',
    '...#########..####..',
    '...##############...',
    '..################..',
    '..##.##########.##..',
    '..################..',
    '....############....'
  ];
  const BOT_DUCK_A = '..###..........###..';
  const BOT_DUCK_B = '....###......###....';

  const DRONE_BODY = [
    '....############....',
    '....##.######.##....',
    '....############....',
    '......########......',
    '.....##......##.....',
    '....###......###....'
  ];
  const DRONE_TOP_A = [
    '..######....######..',
    '........####........',
    '......########......'
  ];
  const DRONE_TOP_B = [
    '....................',
    '........####........',
    '####..########..####'
  ];

  // Arma láser: '#' cuerpo, 'o' celdas de energía, 'e' lente del emisor
  const GUN = [
    '...##....##.',
    '.##########.',
    '.##ooo#####e',
    '.##ooo#####e',
    '.##########.',
    '..###...##..',
    '..###.......',
    '..##........'
  ];

  // Convierte filas de texto en rectángulos (une píxeles contiguos en horizontal)
  function compile(rows) {
    const rects = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] === '#') {
          const start = x;
          while (row[x] === '#') x++;
          rects.push([start, y, x - start, 1]);
        } else {
          x++;
        }
      }
    });
    return { w: rows[0].length, h: rows.length, rects };
  }

  const SPR = {
    stand: compile(BOT_TOP.concat(BOT_LEGS_STAND)),
    runA: compile(BOT_TOP.concat(BOT_LEGS_A)),
    runB: compile(BOT_TOP.concat(BOT_LEGS_B)),
    duckA: compile(BOT_DUCK_TOP.concat([BOT_DUCK_A])),
    duckB: compile(BOT_DUCK_TOP.concat([BOT_DUCK_B])),
    droneA: compile(DRONE_TOP_A.concat(DRONE_BODY)),
    droneB: compile(DRONE_TOP_B.concat(DRONE_BODY))
  };

  function drawSprite(sprite, x, y, color) {
    ctx.fillStyle = color || INK;
    const ox = Math.round(x);
    const oy = Math.round(y);
    for (const [rx, ry, rw, rh] of sprite.rects) {
      ctx.fillRect(ox + rx, oy + ry, rw, rh);
    }
  }

  /* ---------- Obstáculos dibujados por código ---------- */
  function drawCrate(x, y, s) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = PAPER;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = INK;
    for (let i = 0; i < s - 4; i++) {
      ctx.fillRect(x + 2 + i, y + 2 + i, 1, 1);
      ctx.fillRect(x + s - 3 - i, y + 2 + i, 1, 1);
    }
  }

  function drawTower(x, y, w, h) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, w, 3);                 // tapa
    ctx.fillRect(x + 2, y + 3, w - 4, h - 3); // cuerpo
    ctx.fillRect(x, y + h - 3, w, 3);         // base
    ctx.fillStyle = PAPER;
    for (let yy = 7; yy < h - 7; yy += 7) {   // ventanas
      ctx.fillRect(x + 4, y + yy, w - 8, 2);
    }
  }

  function makeObstacle(kind) {
    switch (kind) {
      case 'crate':    return { kind, w: 14, h: 14 };
      case 'crateBig': return { kind, w: 22, h: 22 };
      case 'tower':    return { kind, w: 14, h: 32 };
      case 'group2':   return { kind: 'group', n: 2, w: 26, h: 12 };
      case 'group3':   return { kind: 'group', n: 3, w: 40, h: 12 };
      case 'jet':      return { kind: 'jet', w: JET_SPR.w, h: JET_SPR.h, extra: 115, hp: 2, maxHp: 2, pts: JET_BONUS };
      default:         return { kind: 'drone', w: 20, h: 9, extra: 60, hp: 1, maxHp: 1, pts: DRONE_BONUS };
    }
  }

  const DRONE_LIFTS = [12, 26, 44]; // altura del borde inferior sobre el suelo

  function drawObstacle(o, now) {
    switch (o.kind) {
      case 'crate':    drawCrate(o.x, o.y, 14); break;
      case 'crateBig': drawCrate(o.x, o.y, 22); break;
      case 'tower':    drawTower(o.x, o.y, o.w, o.h); break;
      case 'group':
        for (let i = 0; i < o.n; i++) drawCrate(o.x + i * 14, o.y, 12);
        break;
      case 'drone': {
        const frame = Math.floor(now / 70) % 2 === 0 ? SPR.droneA : SPR.droneB;
        drawSprite(frame, o.x, o.y);
        break;
      }
      case 'jet': {
        const hurt = now < (o.hurt || 0);
        const jx = Math.round(o.x);
        const jy = Math.round(o.y);
        drawSprite(JET_SPR, jx, jy, hurt ? MUTED : INK);
        ctx.fillStyle = MUTED; // postquemador parpadeando
        ctx.fillRect(jx + o.w, jy + 4, 2 + (Math.floor(now / 50) % 2) * 2, 1);
        if (o.hp < o.maxHp) {  // dañado: sale humo de la cola
          ctx.fillRect(jx + o.w - 4 + Math.floor(Math.random() * 6), jy - 1 - Math.floor(Math.random() * 3), 1, 1);
          ctx.fillRect(jx + o.w - 2 + Math.floor(Math.random() * 6), jy - 1 - Math.floor(Math.random() * 4), 1, 1);
        }
        break;
      }
    }
  }

  function obstacleBox(o) {
    if (o.kind === 'drone' || o.kind === 'jet') return { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 3 };
    return { x: o.x + 1, y: o.y + 1, w: o.w - 2, h: o.h - 1 };
  }

  /* ---------- Utilidades ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n) => String(n).padStart(5, '0');

  // Generador pseudoaleatorio con semilla (la ciudad siempre sale igual)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Ciudad de fondo (parallax) ---------- */
  const CITY_P = 1200; // ancho del patrón que se repite

  function makeCity(cfg) {
    const rng = mulberry32(cfg.seed);
    const list = [];
    let x = 0;
    while (x < CITY_P) {
      let w = cfg.wMin + Math.floor(rng() * (cfg.wMax - cfg.wMin + 1));
      w -= w % 2;
      if (CITY_P - x - w < cfg.wMin) w = CITY_P - x;
      const h = cfg.hMin + Math.floor(rng() * (cfg.hMax - cfg.hMin + 1));
      list.push({
        x, w, h,
        roof: Math.floor(rng() * 4),
        seed: Math.floor(rng() * 1e9)
      });
      x += w;
    }
    return list;
  }

  // Edificio entero: cuerpo, azotea y ventanas (huecos transparentes)
  function drawIntact(c, b, color, near) {
    const top = GROUND_Y - b.h;
    const mid = b.x + (b.w >> 1);
    c.fillStyle = color;
    c.fillRect(b.x, top, b.w, b.h);
    switch (b.roof) {
      case 1: // antena
        c.fillRect(mid, top - 9, 2, 9);
        c.fillRect(mid - 3, top - 3, 8, 3);
        break;
      case 2: // azotea escalonada
        c.fillRect(b.x + 4, top - 5, b.w - 8, 5);
        c.fillRect(b.x + 8, top - 9, b.w - 16, 4);
        break;
      case 3: // tanque de agua
        c.fillRect(b.x + 5, top - 6, 1, 6);
        c.fillRect(b.x + 14, top - 6, 1, 6);
        c.fillRect(b.x + 3, top - 12, 14, 6);
        c.fillRect(b.x + 2, top - 13, 16, 1);
        break;
      default:
        c.fillRect(b.x + 2, top - 2, b.w - 4, 2);
    }
    const r = mulberry32(b.seed);
    for (let gy = top + 5; gy + 4 <= GROUND_Y - 6; gy += 8) {
      for (let gx = b.x + 3; gx + 3 <= b.x + b.w - 3; gx += 6) {
        if (r() < 0.8) c.clearRect(gx, gy, 3, 4);
      }
    }
    if (near) c.clearRect(mid - 2, GROUND_Y - 7, 4, 7); // puerta
  }

  // Edificio destruido: techo roto, huecos, grietas, varillas y escombros
  function drawRuined(c, b, color, near) {
    const r = mulberry32(b.seed ^ 0x5bd1e995);
    const top0 = GROUND_Y - b.h;
    const cols = b.w >> 1;
    const stump = r() < 0.2;
    const maxCut = Math.round(b.h * (stump ? 0.8 : 0.2 + r() * 0.35));

    // Perfil del techo roto
    const prof = [];
    let j = r() * maxCut;
    for (let i = 0; i < cols; i++) {
      j += (r() - 0.5) * 12;
      j = Math.max(0, Math.min(maxCut, j));
      prof.push(Math.round(j));
    }
    c.fillStyle = color;
    for (let i = 0; i < cols; i++) {
      const colH = b.h - prof[i];
      c.fillRect(b.x + i * 2, GROUND_Y - colH, 2, colH);
    }
    const colTop = (x) => top0 + prof[Math.min(cols - 1, Math.max(0, (x - b.x) >> 1))];

    // Varillas de hierro expuestas
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(r() * cols);
      c.fillRect(b.x + i * 2, top0 + prof[i] - 3 - Math.floor(r() * 5), 1, 6);
    }

    // Ventanas (algunas reventadas)
    for (let gy = top0 + 5; gy + 4 <= GROUND_Y - 6; gy += 8) {
      for (let gx = b.x + 3; gx + 3 <= b.x + b.w - 3; gx += 6) {
        if (gy < colTop(gx) + 3 || gy < colTop(gx + 2) + 3) continue;
        const roll = r();
        if (roll < 0.62) c.clearRect(gx, gy, 3, 4);
        else if (roll < 0.78) c.clearRect(gx, gy, 5, 8);
      }
    }

    // Trozos arrancados de la fachada
    for (let k = 0; k < 3; k++) {
      const cx = b.x + Math.floor(r() * (b.w - 4)) - 1;
      const cy = top0 + Math.floor(r() * b.h * 0.7);
      c.clearRect(cx, cy, 3 + Math.floor(r() * 7), 4 + Math.floor(r() * 9));
    }

    // Grietas
    for (let k = 0; k < 2; k++) {
      let cx = b.x + 3 + Math.floor(r() * (b.w - 6));
      let cy = top0 + Math.floor(r() * b.h * 0.5);
      const len = 10 + Math.floor(r() * 16);
      for (let s = 0; s < len; s++) {
        c.clearRect(cx, cy, 1, 1);
        cy += 1;
        if (r() < 0.45) cx += r() < 0.5 ? -1 : 1;
      }
    }

    // Ventanas encendidas por el fuego (solo la capa cercana)
    if (near) {
      const rows = Math.floor((b.h - 11) / 8);
      const colsW = Math.floor((b.w - 6) / 6);
      c.fillStyle = '#b8b8b8';
      for (let k = 0; k < 2; k++) {
        if (rows < 1 || colsW < 1 || r() > 0.6) continue;
        const gy = top0 + 5 + 8 * Math.floor(r() * rows);
        const gx = b.x + 3 + 6 * Math.floor(r() * colsW);
        if (gy >= colTop(gx) + 3 && gy >= colTop(gx + 2) + 3) c.fillRect(gx, gy, 3, 4);
      }
    }

    // Escombros al pie del edificio
    c.fillStyle = color;
    for (let k = 0; k < 9; k++) {
      const ry = GROUND_Y - 1 - Math.floor(r() * 3);
      const rh = Math.min(1 + Math.floor(r() * 3), GROUND_Y - ry);
      c.fillRect(b.x - 4 + Math.floor(r() * (b.w + 8)), ry, 2 + Math.floor(r() * 4), rh);
    }

    return top0 + Math.min.apply(null, prof); // y de la parte más alta que queda
  }

  // Columna de humo que sube de un edificio en ruinas
  function drawSmoke(c, x, y, color, phase) {
    c.fillStyle = color;
    for (let s = 0; s < 22; s++) {
      const yy = y - 3 - s * 3;
      if (yy < 4) break;
      const xx = x + Math.round(3 * Math.sin(s * 0.5 + phase * 6));
      const sz = 2 + (s > 8 ? 1 : 0) + (s > 15 ? 1 : 0);
      c.fillRect(xx - (sz >> 1), yy, sz, 2);
    }
  }

  function renderLayer(layer, ruined) {
    const cv = document.createElement('canvas');
    cv.width = CITY_P;
    cv.height = H;
    const c = cv.getContext('2d');
    const color = ruined ? layer.ruin : layer.day;
    const smokeRng = mulberry32(layer.cfg.seed + 99);
    const smokes = [];
    for (const b of layer.buildings) {
      if (!ruined) {
        drawIntact(c, b, color, layer.near);
      } else {
        const topY = drawRuined(c, b, color, layer.near);
        if (smokeRng() < 0.2) smokes.push([b.x + (b.w >> 1), topY, smokeRng()]);
      }
    }
    for (const [sx, sy, ph] of smokes) drawSmoke(c, sx, sy, layer.smoke, ph);
    return cv;
  }

  /* ---------- Aviones: pixel art rotado con vecino más cercano ---------- */
  // Avión de lado mirando a la derecha. Cada tramo es [fila, x1, x2].
  const PLANE_W = 33;
  const PLANE_H = 13;
  const PLANE_SPANS = [
    [0, 3, 4], [1, 3, 5], [2, 3, 6], [3, 3, 7], [4, 4, 9], // aleta de cola
    [4, 21, 25],                                           // cabina
    [5, 2, 30],
    [6, 0, 32],                                            // fuselaje y nariz
    [7, 2, 30],
    [8, 6, 26],
    [9, 11, 19], [10, 10, 17], [11, 9, 15], [12, 8, 13]    // ala
  ];
  const PLANE_GRID = Array.from({ length: PLANE_H }, () => new Array(PLANE_W).fill(0));
  for (const [y, x1, x2] of PLANE_SPANS) {
    for (let x = x1; x <= x2; x++) PLANE_GRID[y][x] = 1;
  }

  // Dibuja el avión girado (ángulo hacia abajo) y escalado en un canvas pequeño
  function buildPlaneSprite(angleDeg, sc, color) {
    const a = (angleDeg * Math.PI) / 180;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const dw = Math.ceil((Math.abs(PLANE_W * cs) + Math.abs(PLANE_H * sn)) * sc) + 2;
    const dh = Math.ceil((Math.abs(PLANE_W * sn) + Math.abs(PLANE_H * cs)) * sc) + 2;
    const cv = document.createElement('canvas');
    cv.width = dw;
    cv.height = dh;
    const c = cv.getContext('2d');
    c.fillStyle = color;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const dx = x + 0.5 - dw / 2;
        const dy = y + 0.5 - dh / 2;
        const sx = Math.floor((dx * cs + dy * sn) / sc + PLANE_W / 2);
        const sy = Math.floor((-dx * sn + dy * cs) / sc + PLANE_H / 2);
        if (sx >= 0 && sx < PLANE_W && sy >= 0 && sy < PLANE_H && PLANE_GRID[sy][sx]) {
          c.fillRect(x, y, 1, 1);
        }
      }
    }
    return { cv, w: dw, h: dh };
  }

  // [grande, pequeño] x [0, 20, 40, 60, 80 grados de picada]
  const PLANE_SCALES = [1.3, 0.9];
  const PLANE_SPR = PLANE_SCALES.map((sc) =>
    [0, 20, 40, 60, 80].map((ang) => buildPlaneSprite(ang, sc, '#7c7c7c'))
  );

  // Jet enemigo: el mismo avión reducido y mirando a la izquierda
  function gridSprite(sc, mirror) {
    const w = Math.round(PLANE_W * sc);
    const h = Math.round(PLANE_H * sc);
    const rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        let sx = Math.floor((x + 0.5) / sc);
        if (mirror) sx = PLANE_W - 1 - sx;
        const sy = Math.floor((y + 0.5) / sc);
        row += PLANE_GRID[sy][sx] ? '#' : '.';
      }
      rows.push(row);
    }
    return compile(rows);
  }
  const JET_SPR = gridSprite(0.7, true);

  // Restos de aviones estrellados entre las ruinas (capa cercana)
  function renderProps(L) {
    const cv = document.createElement('canvas');
    cv.width = CITY_P;
    cv.height = H;
    const c = cv.getContext('2d');
    const r = mulberry32(L.cfg.seed + 777);
    const color = '#787878';
    const noseIn = buildPlaneSprite(80, 1.1, color);  // clavado de nariz, cola al aire
    const belly = buildPlaneSprite(0, 0.95, color);   // tumbado sobre el suelo
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(70 + i * 220 + r() * 70);
      const flip = r() < 0.5 ? -1 : 1;
      const spr = i % 2 === 0 ? noseIn : belly;
      const oy = GROUND_Y + 1 - spr.h;
      c.save();
      c.translate(x, 0);
      c.scale(flip, 1);
      c.drawImage(spr.cv, -(spr.w >> 1), oy);
      c.restore();
      // quemaduras y agujeros
      for (let k = 0; k < 12; k++) {
        c.clearRect(
          Math.floor(x - spr.w / 2 + r() * spr.w),
          Math.floor(oy + r() * spr.h),
          1 + Math.floor(r() * 2), 1
        );
      }
      // escombros al pie
      c.fillStyle = color;
      for (let k = 0; k < 8; k++) {
        const ry = GROUND_Y - Math.floor(r() * 4);
        c.fillRect(x - 12 + Math.floor(r() * 24), ry, 2 + Math.floor(r() * 4), Math.min(1 + Math.floor(r() * 3), GROUND_Y + 1 - ry));
      }
    }
    return cv;
  }

  /* ---------- Aviones destruidos del fondo (desde los 1000 puntos) ---------- */
  function makePuff(x, y, life, s0, s1, vy) {
    return { type: 'puff', x, y, t: 0, life, s0, s1, vy };
  }

  function makeBoom(x, y, r, dur, n) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rand(20, 80);
      parts.push({
        x: 0, y: 0,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 50,
        s: Math.random() < 0.3 ? 2 : 1
      });
    }
    return { type: 'boom', x, y, t: 0, r, dur, parts };
  }

  // Punto del fuselaje donde sale el fuego y el humo
  function planeRear(p) {
    const sc = PLANE_SCALES[p.small ? 1 : 0];
    const a = p.state === 'dive' ? (p.pitch * Math.PI) / 180 : 0;
    const lx = -(PLANE_W / 2 - 9) * sc;
    return { x: p.x + p.dir * lx * Math.cos(a), y: p.y + lx * Math.sin(a) };
  }

  function spawnPlane() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const small = Math.random() < 0.45;
    planes.push({
      x: dir > 0 ? -40 : W + 40,
      y: rand(14, 40),
      vx: dir * rand(70, 105) * (small ? 0.75 : 1),
      dir, small,
      state: 'fly',
      t: 0, dt: 0, pitch: 0, trailT: 0,
      hitX: rand(190, 410),
      fate: Math.random() < 0.65 ? 'dive' : 'split',
      crashY: GROUND_Y - rand(32, 60)
    });
  }

  function crashBoom(x, y, now, fresh) {
    fresh.push(makeBoom(x, y, 26, 0.9, 14));
    fresh.push({ type: 'plume', x, y, t: 0, dur: 3.2, acc: 0 });
    skyFlash = 1;
    shakeUntil = Math.max(shakeUntil, now + 120);
    sfxFarBoom();
  }

  // El avión recibe un impacto: cae en picada o se parte en pedazos
  function hitPlane(p, now, fresh) {
    sfxHit();
    skyFlash = Math.max(skyFlash, 0.5);
    fresh.push(makeBoom(p.x, p.y, 11, 0.45, 6));
    if (p.fate === 'dive') {
      p.state = 'dive';
      p.dt = 0;
      p.pitch = 12;
    } else {
      for (let i = 0; i < 6; i++) {
        fresh.push({
          type: 'chunk',
          x: p.x + p.dir * rand(-12, 12),
          y: p.y + rand(-3, 4),
          vx: p.vx * rand(0.2, 0.6) + rand(-35, 35),
          vy: rand(-45, 10),
          w: 3 + Math.floor(rand(0, 6)),
          h: 2 + Math.floor(rand(0, 2)),
          t: 0,
          trailT: 0,
          crashY: p.crashY + rand(-6, 14)
        });
      }
      p.dead = true;
    }
  }

  function updateAir(dt, now, worldSpeed) {
    // Aparición de los restos y llegada de aviones
    const target = airOn ? 1 : 0;
    if (airT < target) airT = Math.min(target, airT + dt / AIR_TIME);
    skyFlash = Math.max(0, skyFlash - dt * 4);
    if (airOn) {
      airTimer -= dt;
      if (airTimer <= 0 && planes.length < 3) {
        spawnPlane();
        airTimer = rand(2.2, 4.2);
      }
    }

    const fresh = [];
    for (const p of planes) {
      p.t += dt;
      if (p.state === 'fly') {
        p.x += p.vx * dt;
        if (p.dir * (p.x - p.hitX) >= 0) hitPlane(p, now, fresh);
      } else {
        p.dt += dt;
        p.pitch = Math.min(80, 12 + p.dt * 60);
        const a = (p.pitch * Math.PI) / 180;
        const sp = 90 + p.dt * 120;
        p.x += p.dir * Math.cos(a) * sp * dt;
        p.y += Math.sin(a) * sp * dt;
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.04;
          const rr = planeRear(p);
          fresh.push(makePuff(rr.x, rr.y, rand(1.2, 1.8), 2, 6, rand(-10, -2)));
        }
        if (p.y >= p.crashY) {
          crashBoom(p.x, p.crashY, now, fresh);
          p.dead = true;
        }
      }
    }
    planes = planes.filter((p) => !p.dead && p.x > -90 && p.x < W + 90);

    for (const f of bgFx) {
      f.t += dt;
      f.x -= worldSpeed * dt * 0.16;
      if (f.type === 'puff') {
        f.y += f.vy * dt;
      } else if (f.type === 'chunk') {
        f.vy += 260 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.trailT -= dt;
        if (f.trailT <= 0) {
          f.trailT = 0.05;
          fresh.push(makePuff(f.x, f.y, rand(0.8, 1.3), 2, 5, rand(-8, 0)));
        }
        if (f.y >= f.crashY) {
          f.dead = true;
          fresh.push(makeBoom(f.x, f.crashY, 11, 0.5, 6));
        }
      } else if (f.type === 'boom') {
        for (const q of f.parts) {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vy += 140 * dt;
        }
      } else if (f.type === 'plume') {
        f.acc += dt;
        while (f.acc >= 0.07) {
          f.acc -= 0.07;
          if (f.t < f.dur) {
            fresh.push(makePuff(f.x + rand(-2, 2), f.y - 4, rand(1.8, 2.6), 3, 9, rand(-22, -12)));
          }
        }
      }
    }
    bgFx = bgFx.filter((f) => !f.dead && f.t < (
      f.type === 'puff' ? f.life :
      f.type === 'boom' ? f.dur :
      f.type === 'plume' ? f.dur + 0.1 : 4));
    bgFx = bgFx.concat(fresh);
    if (bgFx.length > 260) bgFx = bgFx.slice(bgFx.length - 260);
  }

  function disc(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }

  // Todo esto se dibuja DETRÁS de la ciudad: los edificios tapan los impactos
  function drawAir() {
    if (skyFlash > 0.01) {
      ctx.globalAlpha = Math.min(1, skyFlash) * 0.14;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, GROUND_Y);
      ctx.globalAlpha = 1;
    }
    if (!planes.length && !bgFx.length) return;

    // Humo
    ctx.fillStyle = '#5a5a5a';
    for (const f of bgFx) {
      if (f.type !== 'puff') continue;
      const k = f.t / f.life;
      const s = Math.max(1, Math.round(f.s0 + (f.s1 - f.s0) * k));
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.fillRect(Math.round(f.x - s / 2), Math.round(f.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;

    // Trozos de avión cayendo, dando vueltas
    for (const f of bgFx) {
      if (f.type !== 'chunk') continue;
      const flip = Math.floor(f.t / 0.12) % 2 === 0;
      const cx = Math.round(f.x);
      const cy = Math.round(f.y);
      ctx.fillStyle = '#707070';
      ctx.fillRect(cx, cy, flip ? f.w : f.h, flip ? f.h : f.w);
      ctx.fillStyle = INK;
      ctx.fillRect(cx - 1, cy + (Math.random() < 0.5 ? 0 : 1), 1, 1); // brasa
    }

    // Aviones
    for (const p of planes) {
      if (p.dead) continue;
      const ai = p.state === 'dive' ? Math.min(4, Math.round(p.pitch / 20)) : 0;
      const s = PLANE_SPR[p.small ? 1 : 0][ai];
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.scale(p.dir, 1);
      ctx.drawImage(s.cv, -(s.w >> 1), -(s.h >> 1));
      ctx.restore();
      if (p.state === 'dive') { // motor en llamas
        const rr = planeRear(p);
        const rx = Math.round(rr.x);
        const ry = Math.round(rr.y);
        ctx.fillStyle = INK;
        ctx.fillRect(rx - 1, ry - 1, 3, 3);
        ctx.fillStyle = '#b0b0b0';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(rx + Math.floor(Math.random() * 7) - 3, ry + Math.floor(Math.random() * 7) - 3, 2, 2);
        }
      }
    }

    // Explosiones (al final: brillan sobre el humo)
    ctx.fillStyle = INK;
    for (const f of bgFx) {
      if (f.type !== 'boom') continue;
      const k = f.t / f.dur;
      const ease = 1 - Math.pow(1 - k, 2);
      const cx = Math.round(f.x);
      const cy = Math.round(f.y);

      ctx.globalAlpha = 0.2 * (1 - k); // resplandor
      disc(cx, cy, Math.round(f.r * 1.5 * ease) + 2);

      if (f.t < 0.14) { // núcleo
        ctx.globalAlpha = 1 - (f.t / 0.14) * 0.4;
        disc(cx, cy, Math.round(f.r * 0.7));
      }

      ctx.globalAlpha = 1 - k * k; // onda en anillo
      const R = Math.round(3 + f.r * ease);
      const th = Math.max(1, Math.round(5 * (1 - k)));
      const ri = R - th;
      for (let dy = -R; dy <= R; dy++) {
        const outer = Math.floor(Math.sqrt(R * R - dy * dy));
        if (Math.abs(dy) < ri) {
          const inner = Math.floor(Math.sqrt(ri * ri - dy * dy));
          ctx.fillRect(cx - outer, cy + dy, outer - inner, 1);
          ctx.fillRect(cx + inner, cy + dy, outer - inner, 1);
        } else {
          ctx.fillRect(cx - outer, cy + dy, outer * 2, 1);
        }
      }

      ctx.globalAlpha = 1 - k; // brasas
      for (const q of f.parts) ctx.fillRect(Math.round(cx + q.x), Math.round(cy + q.y), q.s, q.s);
    }
    ctx.globalAlpha = 1;
  }

  const LAYERS = [
    { // lejana
      par: 0.10, near: false,
      day: '#e3e3e3', ruin: '#202020', smoke: '#282828',
      cfg: { seed: 1337, wMin: 26, wMax: 46, hMin: 38, hMax: 80 }
    },
    { // cercana
      par: 0.28, near: true,
      day: '#cfcfcf', ruin: '#313131', smoke: '#3d3d3d',
      cfg: { seed: 2024, wMin: 30, wMax: 58, hMin: 26, hMax: 62 }
    }
  ];
  for (const L of LAYERS) {
    L.buildings = makeCity(L.cfg);
    L.dayImg = renderLayer(L, false);
    L.ruinImg = renderLayer(L, true);
    L.propsImg = L.near ? renderProps(L) : null;
    L.off = 0;
  }

  // Dibuja la franja visible de una capa (con vuelta al inicio del patrón)
  function blit(img, off, alpha) {
    ctx.globalAlpha = alpha;
    if (off + W <= CITY_P) {
      ctx.drawImage(img, off, 0, W, H, 0, 0, W, H);
    } else {
      const w1 = CITY_P - off;
      ctx.drawImage(img, off, 0, w1, H, 0, 0, w1, H);
      ctx.drawImage(img, 0, 0, W - w1, H, w1, 0, W - w1, H);
    }
  }

  function drawCity(e) {
    for (const L of LAYERS) {
      const off = Math.floor(L.off) % CITY_P;
      if (e < 0.999) blit(L.dayImg, off, 1 - e);
      if (e > 0.001) blit(L.ruinImg, off, e);
      if (L.propsImg && airT > 0.001) blit(L.propsImg, off, airT);
    }
    ctx.globalAlpha = 1;
  }

  // Luna pálida que aparece en el modo apocalíptico
  function drawMoon(e) {
    if (e < 0.01) return;
    const cx = 500;
    const cy = 46;
    const R = 15;
    ctx.globalAlpha = e * 0.35;
    ctx.fillStyle = INK;
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2, 1);
    }
    ctx.fillStyle = PAPER;
    ctx.fillRect(cx - 6, cy - 5, 4, 3);
    ctx.fillRect(cx + 3, cy + 2, 5, 4);
    ctx.fillRect(cx - 3, cy + 7, 3, 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- Estado ---------- */
  let state = 'ready'; // 'ready' | 'running' | 'over'
  let speed = START_SPEED;
  let distance = 0;
  let score = 0;
  let best = 0;
  let overAt = 0;
  let blinkUntil = 0;
  let shakeUntil = 0;
  let nextGap = 0;
  let runTimer = 0;
  let runFrame = 0;
  let duckHeld = false;
  let themeT = 0;       // 0 = día, 1 = ruinas
  let themeTarget = 0;
  let lasers = [];      // rayos en vuelo
  let fx = [];          // explosiones y chispas
  let shootHeld = false;
  let shootCd = 0;
  let muzzleUntil = 0;
  let bonus = 0;        // puntos extra por drones derribados
  let airOn = false;    // escena de aviones activa (>= 1000 puntos)
  let airT = 0;         // 0..1: aparición de los restos de aviones
  let airTimer = 0;     // tiempo para el siguiente avión
  let skyFlash = 0;     // destello del cielo por explosiones
  let planes = [];      // aviones en vuelo (fondo)
  let bgFx = [];        // humo, trozos y explosiones del fondo
  let energy = ENERGY_MAX; // energía del láser
  let locked = false;   // sobrecalentado: no dispara hasta recuperar energía
  let flashUntil = 0;   // parpadeo de la barra al intentar disparar sin energía
  let kills = 0;        // enemigos derribados en esta partida
  let paused = false;
  let toast = { text: '', until: 0 }; // aviso corto en pantalla

  const player ={ py: 0, vy: 0, onGround: true, ducking: false, fastFall: false };
  let obstacles = [];
  let groundOff = 0;

  // Puntaje inicial opcional para probar: index.html?puntos=480
  let START_SCORE = 0;
  try {
    START_SCORE = Math.max(0, parseInt(new URLSearchParams(window.location.search).get('puntos'), 10) || 0);
  } catch (e) { /* ignorar */ }

  try {
    best = parseInt(localStorage.getItem('bitrunner-best'), 10) || 0;
  } catch (e) { /* sin almacenamiento */ }

  /* ---------- Fondo: polvo, ceniza, suelo ---------- */
  const dust = [];
  for (let i = 0; i < 6; i++) {
    dust.push({
      x: Math.random() * W,
      y: 14 + Math.random() * 62,
      w: 8 + Math.floor(Math.random() * 3) * 4
    });
  }

  function drawDust() {
    ctx.fillStyle = MIST;
    for (const d of dust) ctx.fillRect(Math.round(d.x), Math.round(d.y), d.w, 1);
  }

  const ash = [];
  for (let i = 0; i < 30; i++) {
    ash.push({
      x: Math.random() * W,
      y: Math.random() * GROUND_Y,
      v: rand(10, 28),
      s: Math.random() < 0.2 ? 2 : 1
    });
  }

  function drawAsh(e) {
    if (e < 0.01) return;
    ctx.globalAlpha = e * 0.55;
    ctx.fillStyle = INK;
    for (const a of ash) ctx.fillRect(Math.round(a.x), Math.round(a.y), a.s, a.s);
    ctx.globalAlpha = 1;
  }

  const GL = 1200;
  const pebbles = [];
  for (let i = 0; i < 70; i++) {
    pebbles.push({
      x: Math.random() * GL,
      y: 3 + Math.floor(Math.random() * 16),
      w: 1 + Math.floor(Math.random() * 4),
      light: Math.random() < 0.4
    });
  }
  const rubble = [];
  for (let i = 0; i < 46; i++) {
    rubble.push({
      x: Math.random() * GL,
      w: 2 + Math.floor(Math.random() * 4),
      h: 1 + Math.floor(Math.random() * 3)
    });
  }

  function drawGround(e) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, GROUND_Y, W, 1);
    for (const p of pebbles) {
      const sx = (((p.x - groundOff) % GL) + GL) % GL;
      if (sx < W) {
        ctx.fillStyle = p.light ? MUTED : INK;
        ctx.fillRect(Math.round(sx), GROUND_Y + p.y, p.w, 1);
      }
    }
    if (e > 0.01) { // escombros sobre el suelo
      ctx.globalAlpha = e;
      ctx.fillStyle = MUTED;
      for (const r of rubble) {
        const sx = (((r.x - groundOff) % GL) + GL) % GL;
        if (sx < W) ctx.fillRect(Math.round(sx), GROUND_Y - r.h, r.w, r.h);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- Sonido ---------- */
  let audio = null;
  let muted = false;
  try { muted = localStorage.getItem('bitrunner-muted') === '1'; } catch (e) { /* sin almacenamiento */ }

  function getAudio() {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended' && audio.resume) audio.resume();
    return audio;
  }

  function beep(freq, dur, slideTo, vol) {
    if (muted) return;
    try {
      const a = getAudio();
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol || 0.04, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) { /* audio no disponible */ }
  }

  // Retumbar grave cuando la ciudad se derrumba
  function sfxRumble() {
    if (muted) return;
    try {
      const a = getAudio();
      const len = Math.floor(a.sampleRate * 1.0);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const gain = a.createGain();
      gain.gain.value = 0.5;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(a.destination);
      src.start();
    } catch (e) { /* audio no disponible */ }
    beep(70, 0.9, 35, 0.08);
  }

  // Ráfaga de ruido filtrado (para explosiones)
  function noiseBurst(dur, cutoff, vol) {
    if (muted) return;
    try {
      const a = getAudio();
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(a.destination);
      src.start();
    } catch (e) { /* audio no disponible */ }
  }

  // Avión pasando a baja altura
  function sfxJet() {
    if (muted) return;
    try {
      const a = getAudio();
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const gain = a.createGain();
      const lp = a.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(70, t0);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.7);
      osc.frequency.exponentialRampToValueAtTime(60, t0 + 1.6);
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + 1.6);
    } catch (e) { /* audio no disponible */ }
    noiseBurst(1.2, 500, 0.12);
  }
  const sfxHit = () => {
    noiseBurst(0.3, 1200, 0.15);
    beep(300, 0.2, 80, 0.04);
  };
  const sfxFarBoom = () => {
    noiseBurst(0.8, 450, 0.22);
    beep(65, 0.7, 30, 0.07);
  };
  const sfxBonus = () => {
    beep(988, 0.07, 0, 0.04);
    setTimeout(() => beep(1319, 0.1, 0, 0.04), 70);
  };
  const sfxLaser = () => beep(1500, 0.1, 280, 0.03);
  const sfxBoom = () => {
    noiseBurst(0.4, 1400, 0.35);
    beep(190, 0.3, 40, 0.06);
  };
  const sfxEmpty = () => beep(140, 0.07, 90, 0.035); // clic seco: sin energía
  const sfxJump = () => beep(380, 0.12, 720, 0.04);
  const sfxDie = () => beep(240, 0.4, 60, 0.06);
  const sfxMilestone = () => {
    beep(880, 0.08, 0, 0.04);
    setTimeout(() => beep(1175, 0.1, 0, 0.04), 90);
  };

  /* ---------- Lógica ---------- */
  function startGame() {
    obstacles = [];
    speed = START_SPEED;
    distance = START_SCORE / SCORE_RATE;
    score = START_SCORE;
    nextGap = 0;
    runTimer = 0;
    runFrame = 0;
    blinkUntil = 0;
    shakeUntil = 0;
    lasers = [];
    fx = [];
    bonus = 0;
    airOn = score >= AIR_SCORE;
    airT = airOn ? 1 : 0;
    airTimer = 0.5;
    skyFlash = 0;
    planes = [];
    bgFx = [];
    shootCd = 0;
    muzzleUntil = 0;
    energy = ENERGY_MAX;
    locked = false;
    flashUntil = 0;
    kills = 0;
    paused = false;
    syncUi();
    themeTarget = score >= RUIN_SCORE ? 1 : 0;
    themeT = themeTarget;
    player.py = 0;
    player.vy = 0;
    player.onGround = true;
    player.ducking = false;
    player.fastFall = false;
    state = 'running';
  }

  function gameOver() {
    state = 'over';
    lasers = [];
    overAt = performance.now();
    sfxDie();
    if (score > best) {
      best = score;
      try { localStorage.setItem('bitrunner-best', String(best)); } catch (e) { /* ignorar */ }
    }
  }

  function pressJump() {
    if (state === 'over') {
      if (performance.now() - overAt > RESTART_DELAY) startGame();
      else return;
    } else if (state === 'ready') {
      startGame();
    }
    if (player.onGround) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.ducking = false;
      sfxJump();
    }
  }

  function releaseJump() {
    if (!player.onGround && player.vy > MIN_JUMP_V) player.vy = MIN_JUMP_V;
  }

  function spawnObstacle() {
    let kind;
    // Más enemigos aéreos en cada fase; desde los 1000 también jets (2 disparos)
    const pAir = score >= AIR_SCORE ? 0.45 : score >= RUIN_SCORE ? 0.35 : 0.25;
    if (score >= 150 && Math.random() < pAir) {
      kind = score >= AIR_SCORE && Math.random() < 0.4 ? 'jet' : 'drone';
    } else {
      const pool = ['crate', 'crate', 'crateBig', 'tower', 'group2'];
      if (score >= 60) pool.push('group3');
      kind = pick(pool);
    }
    const o = makeObstacle(kind);
    o.x = W + 8;
    if (o.kind === 'drone' || o.kind === 'jet') {
      o.y = GROUND_Y - pick(DRONE_LIFTS) - o.h;
    } else {
      o.y = GROUND_Y - o.h;
    }
    obstacles.push(o);
    nextGap = Math.max(170, speed * rand(0.8, 1.3));
  }

  // Geometría del arma según la pose (de pie o agachado)
  function gunGeometry() {
    const duck = player.ducking;
    const spr = duck ? SPR.duckA : SPR.stand;
    const top = Math.round(GROUND_Y - spr.h - player.py);
    if (duck) {
      return { gx: PLAYER_X + 18, gy: top + 2, fx: PLAYER_X + 18, fy: top + 7 };
    }
    return { gx: PLAYER_X + 13, gy: top + 4, fx: PLAYER_X + 13, fy: top + 10 };
  }

  // Punta del cañón: de aquí sale el rayo
  function gunPos() {
    const g = gunGeometry();
    return { x: g.gx + 12, y: g.gy + 2 };
  }

  let emptyAt = 0;

  function fireLaser(now) {
    if (state !== 'running' || paused || shootCd > 0 || lasers.length >= MAX_LASERS) return;
    if (locked || energy < SHOT_COST) { // sobrecalentado: clic seco y parpadeo de la barra
      locked = true;
      flashUntil = now + 250;
      if (now - emptyAt > 260) {
        emptyAt = now;
        sfxEmpty();
      }
      return;
    }
    energy -= SHOT_COST;
    if (energy < SHOT_COST) locked = true;
    const g = gunPos();
    lasers.push({ x: g.x, y: g.y, len: 12 });
    shootCd = LASER_COOLDOWN;
    muzzleUntil = now + 110;
    sfxLaser();
  }

  // Explosión de primer plano: destello, onda expansiva y restos
  function fgBoom(x, y) {
    const parts = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(50, 190);
      parts.push({
        x: 0,
        y: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        s: Math.random() < 0.35 ? 2 : 1
      });
    }
    return { type: 'boom', x, y, t: 0, parts };
  }

  // Suma puntos por un enemigo derribado, con "+N" flotante y recarga de energía
  function award(points, x, y, now, refund) {
    kills++;
    bonus += points;
    energy = Math.min(ENERGY_MAX, energy + refund);
    if (locked && energy >= ENERGY_UNLOCK) locked = false;
    fx.push({ type: 'pop', x, y, t: 0, txt: '+' + points });
    setScore(score + points, now);
    sfxBonus();
  }

  function explodeDrone(o, now) { // drones y jets
    fx.push(fgBoom(o.x + o.w / 2, o.y + o.h / 2));
    shakeUntil = Math.max(shakeUntil, now + 140);
    sfxBoom();
    award(o.pts || DRONE_BONUS, o.x + o.w / 2, o.y - 4, now, o.kind === 'jet' ? 22 : 12);
  }

  // Avión en picada alcanzado por un rayo: estalla en el aire
  function shootPlane(p, now) {
    p.dead = true;
    skyFlash = 1;
    fx.push(fgBoom(p.x, p.y));
    shakeUntil = Math.max(shakeUntil, now + 140);
    sfxBoom();
    award(PLANE_BONUS, p.x, p.y - 12, now, 15);
  }

  function playerBox() {
    if (player.ducking) {
      const y = GROUND_Y - SPR.duckA.h - player.py;
      return { x: PLAYER_X + 2, y: y + 1, w: 16, h: 8 };
    }
    const y = GROUND_Y - SPR.stand.h - player.py;
    return { x: PLAYER_X + 3, y: y + 1, w: 10, h: 17 };
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Actualiza el puntaje y dispara los eventos (500 = ruinas, cada 100 = parpadeo)
  function setScore(next, now) {
    const prev = score;
    score = next;
    if (prev < RUIN_SCORE && score >= RUIN_SCORE) {
      themeTarget = 1;          // ¡la ciudad cae!
      blinkUntil = now + 700;
      shakeUntil = now + 900;
      sfxRumble();
    } else if (prev < AIR_SCORE && score >= AIR_SCORE) {
      airOn = true;             // ¡llegan los aviones!
      airTimer = 0.3;
      blinkUntil = now + 700;
      shakeUntil = now + 700;
      sfxJet();
    } else if (Math.floor(score / 100) > Math.floor(prev / 100)) {
      blinkUntil = now + 700;
      sfxMilestone();
    }
  }

  function update(dt, now) {
    let worldSpeed = 0;
    if (state === 'running') worldSpeed = speed;
    else if (state === 'ready') worldSpeed = 50;

    // Transición día <-> ruinas
    if (themeT < themeTarget) themeT = Math.min(themeTarget, themeT + dt / THEME_TIME);
    else if (themeT > themeTarget) themeT = Math.max(themeTarget, themeT - dt / THEME_TIME);

    // Fondo
    for (const L of LAYERS) L.off += worldSpeed * dt * L.par;
    groundOff += worldSpeed * dt;
    for (const d of dust) {
      d.x -= worldSpeed * dt * 0.35;
      if (d.x + d.w < 0) {
        d.x = W + Math.random() * 80;
        d.y = 14 + Math.random() * 62;
      }
    }
    for (const a of ash) {
      a.y += a.v * dt;
      a.x -= (worldSpeed * 0.22 + 14) * dt;
      if (a.y > GROUND_Y - 2 || a.x < -2) {
        a.y = -2;
        a.x = rand(0, W + 80);
      }
    }

    // Explosiones y chispas
    for (const f of fx) {
      f.t += dt;
      f.x -= worldSpeed * (f.type === 'spark' ? 1 : f.type === 'pop' ? 0.5 : 0.7) * dt;
      if (f.type === 'pop') f.y -= 26 * dt;
      if (f.parts) {
        for (const p of f.parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 420 * dt;
        }
      }
    }
    fx = fx.filter((f) => f.t < (f.type === 'boom' ? 0.55 : f.type === 'pop' ? 0.9 : 0.14));

    // Aviones destruidos del fondo (desde los 1000 puntos)
    updateAir(dt, now, worldSpeed);

    if (state !== 'running') return;

    // Velocidad y puntaje
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    distance += speed * dt;
    setScore(Math.floor(distance * SCORE_RATE) + bonus, now);

    // Jugador
    player.ducking = duckHeld && player.onGround;
    player.fastFall = duckHeld && !player.onGround;
    if (!player.onGround) {
      player.vy -= GRAVITY * (player.fastFall ? FAST_FALL : 1) * dt;
      player.py += player.vy * dt;
      if (player.py <= 0) {
        player.py = 0;
        player.vy = 0;
        player.onGround = true;
      }
    }
    runTimer += dt;
    if (runTimer > 0.09) {
      runTimer = 0;
      runFrame = 1 - runFrame;
    }

    // Obstáculos
    for (const o of obstacles) o.x -= (speed + (o.extra || 0)) * dt;
    obstacles = obstacles.filter((o) => o.x + o.w > -10);

    if (distance > 350) {
      const last = obstacles[obstacles.length - 1];
      if (!last || last.x + last.w + nextGap <= W) spawnObstacle();
    }

    // Energía del láser: se recupera sola; si se agotó, espera a tener un mínimo
    energy = Math.min(ENERGY_MAX, energy + ENERGY_REGEN * dt);
    if (locked && energy >= ENERGY_UNLOCK) locked = false;

    // Láseres: avanzan, derriban enemigos aéreos y se apagan contra el resto
    shootCd = Math.max(0, shootCd - dt);
    if (shootHeld) fireLaser(now);
    lasers = lasers.filter((l) => {
      const prevX = l.x;
      l.x += LASER_SPEED * dt;
      const box = { x: prevX, y: l.y - 3, w: l.x - prevX + l.len, h: 8 };
      let target = -1;
      for (let i = 0; i < obstacles.length; i++) {
        if (hit(box, obstacleBox(obstacles[i])) &&
            (target < 0 || obstacles[i].x < obstacles[target].x)) {
          target = i; // el más cercano
        }
      }
      if (target >= 0) {
        const o = obstacles[target];
        if (o.hp) {
          o.hp -= 1;
          if (o.hp <= 0) {
            explodeDrone(o, now);
            obstacles.splice(target, 1);
          } else { // el jet aguanta: destello y chispas
            o.hurt = now + 160;
            fx.push({ type: 'spark', x: o.x, y: l.y + 1, t: 0 });
            sfxHit();
          }
        } else {
          fx.push({ type: 'spark', x: o.x, y: l.y + 1, t: 0 });
        }
        return false;
      }
      // Sin obstáculo delante: ¿un avión en picada cruza el rayo?
      for (const p of planes) {
        if (p.state !== 'dive' || p.dead) continue;
        const ps = PLANE_SPR[p.small ? 1 : 0][Math.min(4, Math.round(p.pitch / 20))];
        if (hit(box, { x: p.x - ps.w / 2, y: p.y - ps.h / 2, w: ps.w, h: ps.h })) {
          shootPlane(p, now);
          return false;
        }
      }
      return l.x < W + 20;
    });

    // Colisiones
    const pb = playerBox();
    for (const o of obstacles) {
      if (hit(pb, obstacleBox(o))) {
        gameOver();
        break;
      }
    }
  }

  /* ---------- Dibujo ---------- */
  function drawPlayer() {
    if (state === 'over') {
      const y = GROUND_Y - SPR.stand.h - player.py;
      drawSprite(SPR.stand, PLAYER_X, y);
      ctx.fillStyle = INK;
      ctx.fillRect(PLAYER_X + 9, Math.round(y) + 4, 2, 2); // ojo cerrado
      return;
    }
    let sprite;
    if (player.ducking) {
      sprite = runFrame === 0 ? SPR.duckA : SPR.duckB;
    } else if (!player.onGround || state === 'ready') {
      sprite = SPR.stand;
    } else {
      sprite = runFrame === 0 ? SPR.runA : SPR.runB;
    }
    drawSprite(sprite, PLAYER_X, GROUND_Y - sprite.h - player.py);
  }

  function drawHud(now) {
    const fz = Math.round(8 * uiK);
    const line = Math.round(fz * (compact ? 1.5 : 1.75));
    const x = compact ? 10 : 14;
    const y = compact ? 8 : 12;
    const blinkOff = now < blinkUntil && Math.floor(now / 110) % 2 === 0;
    ctx.font = fz + 'px ' + FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (!blinkOff) {
      ctx.fillStyle = INK;
      ctx.fillText('PUNTOS ' + pad(score), x, y);
    }
    ctx.fillStyle = MUTED;
    let by;
    if (compact) { // teléfono vertical: el mejor puntaje va a la derecha
      ctx.textAlign = 'right';
      ctx.fillText('MEJOR ' + pad(best), W - 10, y);
      ctx.textAlign = 'left';
      by = y + line;
    } else {
      ctx.fillText('MEJOR  ' + pad(best), x, y + line);
      by = y + line * 2;
    }

    // Energía del láser: 10 casillas; parpadea si está sobrecalentado
    const lz = compact ? Math.round(fz * 0.7) : fz;
    ctx.font = lz + 'px ' + FONT;
    ctx.fillStyle = locked ? INK : MUTED;
    ctx.fillText('LASER', x, by);
    const k = compact ? 1.6 : uiK;
    const sw = Math.round(5 * k);
    const sg = Math.max(1, Math.round(k));
    const sh = Math.round(5 * k);
    const bx = x + lz * 5 + (compact ? 6 : 8);
    const bt = by + Math.max(0, Math.round((lz - sh) / 2));
    const filled = Math.ceil((energy / ENERGY_MAX) * 10 - 0.001);
    const flash = now < flashUntil && Math.floor(now / 60) % 2 === 0;
    const warn = locked && Math.floor(now / 150) % 2 === 0;
    for (let i = 0; i < 10; i++) {
      if (i < filled) ctx.fillStyle = locked && !warn ? MUTED : INK;
      else ctx.fillStyle = flash ? MUTED : MIST;
      ctx.fillRect(bx + i * (sw + sg), bt, sw, sh);
    }
  }

  function drawReady() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = compact ? 46 : 40;
    ctx.fillStyle = INK;
    ctx.font = fs(16);
    ctx.fillText('BIT RUNNER', W / 2, ty);
    ctx.fillStyle = MUTED;
    ctx.font = fs(8);
    ctx.fillText(isTouch ? 'TOCA PARA EMPEZAR' : 'ESPACIO O TOQUE PARA EMPEZAR',
      W / 2, ty + Math.round(16 * uiK) + 12);
  }

  function drawOver() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tz = Math.round((compact ? 12 : 14) * uiK);
    const ty = compact ? 48 : 28;
    ctx.fillStyle = INK;
    ctx.font = tz + 'px ' + FONT;
    ctx.fillText('FIN DEL JUEGO', W / 2, ty);

    // Resumen: enemigos derribados en la partida
    const sy = ty + tz + (compact ? 8 : 6);
    ctx.fillStyle = MUTED;
    ctx.font = fs(8);
    ctx.fillText('DERRIBADOS ' + String(kills).padStart(2, '0'), W / 2, sy);

    let ry;
    if (compact) {
      ry = sy + Math.round(8 * uiK) + 8;
    } else {
      // Botón de reintentar (esquinas de píxel)
      const bt = sy + Math.round(8 * uiK) + 4;
      const bx = W / 2 - 14;
      ctx.fillStyle = INK;
      ctx.fillRect(bx + 2, bt, 24, 24);
      ctx.fillRect(bx, bt + 2, 28, 20);
      ctx.fillStyle = PAPER;
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(W / 2 - 4 + i * 2, bt + 6 + i, 2, 12 - 2 * i);
      }
      ry = bt + 38;
    }

    ctx.fillStyle = MUTED;
    ctx.font = fs(8);
    ctx.fillText(isTouch ? 'TOCA PARA REINTENTAR' : 'ESPACIO PARA REINTENTAR', W / 2, ry);
  }

  function drawPause() {
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ty = compact ? 50 : 44;
    ctx.fillStyle = INK;
    ctx.font = fs(16);
    ctx.fillText('PAUSA', W / 2, ty);
    ctx.fillStyle = MUTED;
    ctx.font = fs(8);
    ctx.fillText(isTouch ? 'TOCA PARA SEGUIR' : 'P O ESPACIO PARA SEGUIR',
      W / 2, ty + Math.round(16 * uiK) + 12);
  }

  // Aviso corto en la franja de abajo (por ejemplo "SONIDO NO")
  function drawToast(now) {
    if (now >= toast.until) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = fs(8);
    ctx.fillStyle = INK;
    ctx.fillText(toast.text, W / 2, H - Math.round(8 * uiK) - 6);
  }

  function drawLasers() {
    ctx.fillStyle = INK;
    for (const l of lasers) {
      const x = Math.round(l.x);
      ctx.fillRect(x, l.y, l.len, 2);              // cuerpo del rayo
      ctx.fillRect(x + l.len - 3, l.y - 1, 3, 4);  // punta
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 6, l.y, 3, 2);              // estela
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x - 12, l.y, 3, 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawGun(now) {
    const g = gunGeometry();
    const dead = state === 'over';
    const firing = state === 'running' && now < muzzleUntil;
    const gx = g.gx - (firing ? 1 : 0); // retroceso al disparar
    const gy = g.gy;
    const ready = !dead && shootCd <= 0 && !locked;
    // Las 3 celdas del arma muestran la energía que queda
    const lit = dead || locked ? 0 : Math.min(3, Math.ceil(energy / (ENERGY_MAX / 3) - 0.001));

    // Antebrazo que sostiene el arma
    ctx.fillStyle = INK;
    ctx.fillRect(g.fx, g.fy, 2, 2);

    // Cuerpo del arma
    for (let y = 0; y < GUN.length; y++) {
      const row = GUN[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        if (ch === '#') ctx.fillStyle = INK;
        else if (ch === 'o') ctx.fillStyle = x - 3 < lit ? PAPER : MUTED;
        else ctx.fillStyle = ready ? PAPER : MUTED; // lente: brilla cuando está cargada
        ctx.fillRect(gx + x, gy + y, 1, 1);
      }
    }

    // Destello en la boca del cañón
    if (firing) {
      const tx = g.gx + 12;
      const ty = gy + 2;
      ctx.fillStyle = INK;
      ctx.fillRect(tx, ty - 1, 5, 4);
      ctx.fillRect(tx + 1, ty - 3, 2, 8);
      ctx.fillRect(tx + 5, ty, 3, 2);
    }
  }

  function drawFx() {
    for (const f of fx) {
      const cx = Math.round(f.x);
      const cy = Math.round(f.y);
      ctx.fillStyle = INK;
      if (f.type === 'pop') { // "+50" flotante que sube y se desvanece
        const k = f.t / 0.9;
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        ctx.font = fs(8);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.txt || '+50', Math.max(24, Math.min(W - 24, cx)), cy);
        ctx.globalAlpha = 1;
        continue;
      }
      if (f.type === 'spark') {
        const d = 2 + Math.floor(f.t * 30);
        if (f.t < 0.07) ctx.fillRect(cx - 1, cy - 1, 3, 3);
        ctx.fillRect(cx - d, cy, 1, 1);
        ctx.fillRect(cx + d, cy, 1, 1);
        ctx.fillRect(cx, cy - d, 1, 1);
        ctx.fillRect(cx, cy + d, 1, 1);
        continue;
      }

      // Explosión: destello, onda expansiva y restos
      const k = f.t / 0.55;
      ctx.globalAlpha = 1 - k * k;
      if (f.t < 0.07) ctx.fillRect(cx - 14, cy - 8, 28, 16);
      const R = Math.round(4 + 16 * (1 - Math.pow(1 - k, 2)));
      const th = Math.max(1, Math.round(7 * (1 - k)));
      const ri = R - th;
      for (let dy = -R; dy <= R; dy++) {
        const outer = Math.floor(Math.sqrt(R * R - dy * dy));
        if (Math.abs(dy) < ri) {
          const inner = Math.floor(Math.sqrt(ri * ri - dy * dy));
          ctx.fillRect(cx - outer, cy + dy, outer - inner, 1);
          ctx.fillRect(cx + inner, cy + dy, outer - inner, 1);
        } else {
          ctx.fillRect(cx - outer, cy + dy, outer * 2, 1);
        }
      }
      for (const p of f.parts) {
        ctx.fillRect(Math.round(cx + p.x), Math.round(cy + p.y), p.s, p.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  function draw(now) {
    const e = themeT * themeT * (3 - 2 * themeT); // suavizado
    applyTheme(e);

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    const shaking = now < shakeUntil;
    if (shaking) {
      ctx.save();
      ctx.translate(Math.floor(Math.random() * 3) - 1, Math.floor(Math.random() * 3) - 1);
    }

    drawMoon(e);
    drawAir();
    drawCity(e);
    drawDust();
    drawAsh(e);
    drawGround(e);
    for (const o of obstacles) drawObstacle(o, now);
    drawLasers();
    drawPlayer();
    drawGun(now);
    drawFx();
    drawHud(now);

    if (state === 'ready') drawReady();
    else if (state === 'over') drawOver();
    if (paused) drawPause();
    drawToast(now);

    if (shaking) ctx.restore();
  }

  /* ---------- Entradas ---------- */
  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  const DUCK_KEYS = ['ArrowDown', 'KeyS'];
  const SHOOT_KEYS = ['ArrowRight', 'KeyD'];

  // Sincroniza los botones de sonido y pausa con el estado del juego
  function syncUi() {
    if (soundBtn) {
      soundBtn.classList.toggle('is-off', muted);
      soundBtn.setAttribute('aria-pressed', String(muted));
    }
    if (pauseBtn) pauseBtn.classList.toggle('is-paused', paused);
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('bitrunner-muted', muted ? '1' : '0'); } catch (e) { /* ignorar */ }
    toast = { text: muted ? 'SONIDO NO' : 'SONIDO SI', until: performance.now() + 1400 };
    syncUi();
  }

  // Solo se puede pausar jugando; al volver se evita el salto de tiempo
  function setPaused(v) {
    if (v === paused || (v && state !== 'running')) return;
    paused = v;
    if (paused) {
      duckHeld = false;
      shootHeld = false;
    }
    last = null;
    syncUi();
  }

  window.addEventListener('keydown', (e) => {
    if (paused) { // en pausa: P, Esc, Espacio o Enter siguen; M cambia el sonido
      if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setPaused(false);
      } else if (e.code === 'KeyM') {
        toggleMute();
      }
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'running') {
        e.preventDefault();
        setPaused(true);
      }
    } else if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressJump();
    } else if (DUCK_KEYS.includes(e.code)) {
      e.preventDefault();
      duckHeld = true;
    } else if (SHOOT_KEYS.includes(e.code)) {
      e.preventDefault();
      shootHeld = true; // mantener presionado = ráfaga
      fireLaser(performance.now());
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      releaseJump();
    } else if (DUCK_KEYS.includes(e.code)) {
      duckHeld = false;
    } else if (SHOOT_KEYS.includes(e.code)) {
      shootHeld = false;
    }
  });

  // Tocar el juego: empezar, saltar, reintentar o seguir tras la pausa
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (paused) setPaused(false);
    else pressJump();
  });
  const jumpEnd = () => releaseJump();
  canvas.addEventListener('pointerup', jumpEnd);
  canvas.addEventListener('pointercancel', jumpEnd);

  // Botón que se activa con un toque o clic (sonido, pausa)
  function onTap(el, fn) {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
      el.blur(); // que el teclado siga controlando el juego
    });
  }

  // Botón que se mantiene presionado (disparar, saltar); soporta multitoque
  function holdButton(el, onDown, onUp) {
    if (!el) return;
    const up = () => {
      el.classList.remove('is-down');
      onUp();
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
  holdButton(padFire, () => {
    if (paused) return;
    shootHeld = true;
    fireLaser(performance.now());
  }, () => { shootHeld = false; });
  holdButton(padJump, () => {
    if (paused) setPaused(false);
    else pressJump();
  }, () => releaseJump());

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);

  // Al salir de la ventana o cambiar de pestaña/app, el juego se pausa solo
  window.addEventListener('blur', () => {
    duckHeld = false;
    shootHeld = false;
    if (state === 'running') setPaused(true);
  });

  /* ---------- Bucle principal ---------- */
  let last = null;
  function frame(t) {
    if (last === null) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!paused) update(dt, t);
    draw(t);
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    last = null;
    if (document.hidden && state === 'running') setPaused(true);
  });

  applyTheme(0, true);
  resize();
  syncUi();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('8px "Press Start 2P"').catch(() => {});
  }
  requestAnimationFrame(frame);
})();
