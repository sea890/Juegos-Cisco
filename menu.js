(function () {
  'use strict';

  const lista = document.getElementById('lista');
  const error = document.getElementById('error');

  if (typeof JUEGOS === 'undefined' || !Array.isArray(JUEGOS)) {
    error.textContent = 'NO SE ENCONTRO LA LISTA DE JUEGOS. REVISA QUE "juegos.js" ESTE EN LA MISMA CARPETA QUE index.html.';
    error.hidden = false;
    return;
  }

  const SVG = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // Dibuja un icono de pixeles (filas de texto) como un solo trazo SVG
  function pixelIcon(rows, cls) {
    const h = rows.length;
    const w = Math.max.apply(null, rows.map((r) => r.length));
    let d = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') d += 'M' + x + ',' + y + 'h1v1h-1z';
      }
    });
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function arrow() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 6 12');
    svg.setAttribute('class', 'go');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M0,0h2v12h-2zM2,2h2v8h-2zM4,4h2v4h-2z');
    svg.appendChild(path);
    return svg;
  }

  const SOON_ICON = [
    '...######...',
    '..########..',
    '..##....##..',
    '........##..',
    '.......##...',
    '......##....',
    '.....##.....',
    '.....##.....',
    '............',
    '.....##.....',
    '.....##.....',
    '............'
  ];

  const cards = [];

  JUEGOS.forEach((j) => {
    const a = el('a', 'card');
    a.href = j.carpeta + 'index.html';
    a.setAttribute('aria-label', 'Juego ' + j.numero + ': ' + j.nombre);
    a.appendChild(pixelIcon(j.icono || SOON_ICON, 'icon'));

    const txt = el('span', 'txt');
    txt.appendChild(el('span', 'num', 'JUEGO ' + j.numero));
    txt.appendChild(el('span', 'name', j.nombre));
    if (j.descripcion) txt.appendChild(el('span', 'desc', j.descripcion));
    a.appendChild(txt);

    a.appendChild(arrow());
    lista.appendChild(a);
    cards.push({ link: a, numero: j.numero });
  });

  if (typeof MOSTRAR_PROXIMAMENTE === 'undefined' || MOSTRAR_PROXIMAMENTE) {
    const soon = el('div', 'card is-soon');
    soon.setAttribute('aria-label', 'Proximamente');
    soon.appendChild(pixelIcon(SOON_ICON, 'icon'));
    const txt = el('span', 'txt');
    const siguiente = JUEGOS.reduce((m, j) => Math.max(m, j.numero), 0) + 1;
    txt.appendChild(el('span', 'num', 'JUEGO ' + siguiente));
    txt.appendChild(el('span', 'name', 'PROXIMAMENTE'));
    soon.appendChild(txt);
    lista.appendChild(soon);
  }

  /* ---------- Teclado: flechas para elegir, Enter para jugar, numero para abrir ---------- */
  function focusAt(i) {
    if (!cards.length) return;
    const n = (i + cards.length) % cards.length;
    cards[n].link.focus();
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = cards.findIndex((c) => c.link === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(cur + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(cur < 0 ? 0 : cur - 1);
    } else if (/^[1-9]$/.test(e.key)) {
      const c = cards.find((x) => String(x.numero) === e.key);
      if (c) window.location.href = c.link.href;
    }
  });

  // En computador, el primer juego queda listo para jugar con Enter
  if (cards.length && window.matchMedia && matchMedia('(pointer: fine)').matches) {
    cards[0].link.focus({ preventScroll: true });
  }
})();
