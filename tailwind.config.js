/** @type {import('tailwindcss').Config} */
// v8.74.13: tema claro. Los colores de Tailwind salen de variables CSS (rgb en canales).
// En :root valen lo mismo que Tailwind por defecto → el tema oscuro queda idéntico.
// Con <html class="tema-claro"> la paleta se invierte (los zinc oscuros pasan a claros y
// los acentos claros a su tono oscuro), sin tocar las ~8,000 clases de la app.
// Excepciones (vuelven a los colores originales): el "papel" de PDFs/cartas (.bg-white
// o .tema-original), el texto blanco sobre botones de color y el fondo de los modales.
const plugin = require('tailwindcss/plugin');
const twColors = require('tailwindcss/colors');

const NEUTROS = ['zinc', 'gray', 'neutral', 'slate', 'stone'];
const ACENTOS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

// Tema claro: qué tono original toma cada tono. 'W' = blanco.
const MAPA_NEUTRO = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '600', 500: '500', 600: '400', 700: '300', 800: '200', 900: 'W', 950: '100' };
const MAPA_ACENTO = { 50: '950', 100: '900', 200: '800', 300: '800', 400: '700', 500: '500', 600: '600', 700: '700', 800: '200', 900: '100', 950: '50' };

const canales = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const v = (nombre) => `rgb(var(--c-${nombre}) / <alpha-value>)`;
const familia = (f) => Object.fromEntries(SHADES.map(s => [s, v(`${f}-${s}`)]));

const varsOriginales = () => {
  const o = { '--c-white': '255 255 255', '--c-black': '0 0 0', '--c-elevated': canales('#1f1f23') };
  [...NEUTROS, ...ACENTOS].forEach(f => SHADES.forEach(s => { o[`--c-${f}-${s}`] = canales(twColors[f][s]); }));
  return o;
};
const varsClaras = () => {
  const o = { '--c-white': canales(twColors.zinc[900]), '--c-black': '255 255 255', '--c-elevated': canales('#fafafa') };
  NEUTROS.forEach(f => SHADES.forEach(s => { const d = MAPA_NEUTRO[s]; o[`--c-${f}-${s}`] = d === 'W' ? '255 255 255' : canales(twColors[f][d]); }));
  ACENTOS.forEach(f => SHADES.forEach(s => { o[`--c-${f}-${s}`] = canales(twColors[f][MAPA_ACENTO[s]]); }));
  return o;
};
// Tarjetas con degradado de color fuerte (from-red-600 to-red-800…): se ven como en oscuro.
const DEGRADADOS = ACENTOS.flatMap(f => ['500', '600', '700'].map(s => `.from-${f}-${s}`)).join(',');
const varsAcentosOriginales = () => {
  const o = { '--c-white': '255 255 255' };
  ACENTOS.forEach(f => SHADES.forEach(s => { o[`--c-${f}-${s}`] = canales(twColors[f][s]); }));
  return o;
};
// Fondos de color sólidos: el texto blanco encima sigue siendo blanco.
const FONDOS_SOLIDOS = [...ACENTOS.flatMap(f => ['500', '600', '700'].map(s => `.bg-${f}-${s}`)), '.bg-brand', '.bg-brand-hover'].join(',');

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    // v8.17.35: incluir components/ y lib/ para que Tailwind escanee y genere
    // las clases usadas SOLO en esos archivos (antes muchas clases responsivas
    // como md:flex no se generaban porque solo se usaban en components/).
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        white: v('white'),
        black: v('black'),
        ...Object.fromEntries([...NEUTROS, ...ACENTOS].map(f => [f, familia(f)])),
        // v8.19.36: primeros tokens del sistema de diseño (alias semánticos).
        // Marca (rojo Super Techos)
        brand: {
          DEFAULT: v('red-600'), // acción primaria
          hover:   v('red-700'),
          soft:    v('red-900'), // fondos sutiles
        },
        // Superficies (siguen al tema)
        surface: {
          base:     v('zinc-950'), // fondo de página
          card:     v('zinc-900'), // tarjetas/tablas
          elevated: v('elevated'), // hover/elevación
          border:   v('zinc-800'), // bordes sutiles
        },
        // Estados de proyecto (semánticos)
        state: {
          approved: '#06b6d4', // cyan-500
          planned:  '#3b82f6', // blue-500
          running:  '#ef4444', // red-500
          paused:   '#eab308', // yellow-500
          pending:  '#f97316', // orange-500
          complete: '#22c55e', // green-500
        },
      },
      borderRadius: {
        // Esquinas suaves para modernizar (hoy casi todo es esquina recta).
        card: '0.625rem', // 10px — tarjetas, tablas, modales
      },
      boxShadow: {
        card: '0 4px 12px -2px rgba(0,0,0,0.6)',
        pop:  '0 12px 32px -8px rgba(0,0,0,0.8)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(-2px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.18s ease-out',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const originales = varsOriginales();
      addBase({
        ':root': originales,
        'html.tema-claro': varsClaras(),
        // papel de PDFs, cartas y firmas: colores reales
        'html.tema-claro .bg-white, html.tema-claro .tema-original': originales,
        // texto blanco sobre botones/insignias de color
        [`html.tema-claro :is(${FONDOS_SOLIDOS})`]: { '--c-white': '255 255 255' },
        [`html.tema-claro :is(${DEGRADADOS})`]: varsAcentosOriginales(),
        // fondo oscuro detrás de los modales (bg-black/80, /70…)
        'html.tema-claro [class*="bg-black/"]': { '--c-black': '0 0 0' },
        'html.tema-claro [class*="bg-black/"] > *': { '--c-black': '255 255 255' },
      });
    }),
  ],
};
