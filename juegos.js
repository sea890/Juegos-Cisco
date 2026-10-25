/* ==========================================================================
   LISTA DE JUEGOS DE LA GALERIA

   Para agregar un juego nuevo:
     1) Crea una carpeta nueva dentro de "juegos/", por ejemplo "juegos/juego-2/",
        con su propio index.html, style.css y game.js.
     2) Copia uno de los bloques de abajo, pegalo al final de la lista y cambia
        los datos. El menu se actualiza solo.

   Campos:
     numero       : el numero que aparece en el menu (y la tecla para abrirlo)
     nombre       : nombre del juego
     descripcion  : frase corta
     carpeta      : donde esta el juego (termina en "/")
     icono        : dibujo en pixeles, 12 filas de 12 caracteres ("#" = pixel, "." = vacio)
   ========================================================================== */

const JUEGOS = [
  {
    numero: 1,
    nombre: 'BIT RUNNER',
    descripcion: 'CORRE, SALTA Y DISPARA',
    carpeta: 'juegos/juego-1/',
    icono: [
      '....####....',
      '...######...',
      '...#.##.#...',
      '...######...',
      '....####....',
      '..########..',
      '..#.####.###',
      '..#.####.###',
      '....####....',
      '....#..#....',
      '....#..#....',
      '...##..##...'
    ]
  }

  /* Ejemplo para el siguiente juego (quita los comentarios y cambia los datos):
  ,{
    numero: 2,
    nombre: 'NOMBRE DEL JUEGO',
    descripcion: 'FRASE CORTA',
    carpeta: 'juegos/juego-2/',
    icono: [ ...12 filas de 12 caracteres... ]
  }
  */
];

/* Muestra al final una tarjeta "PROXIMAMENTE" (pon false para ocultarla) */
const MOSTRAR_PROXIMAMENTE = true;
