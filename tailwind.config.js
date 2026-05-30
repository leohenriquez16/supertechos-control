/** @type {import('tailwindcss').Config} */
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
      // v8.19.36: primeros tokens del sistema de diseño. Aditivos — NO cambian
      // las clases zinc/red existentes; solo habilitan alias semánticos nuevos
      // (bg-surface-card, text-brand, etc.) para ir migrando de forma incremental.
      colors: {
        // Marca (rojo Super Techos)
        brand: {
          DEFAULT: '#dc2626', // red-600 — acción primaria
          hover:   '#b91c1c', // red-700
          soft:    '#7f1d1d', // red-900 — fondos sutiles
        },
        // Superficies (neutrales del tema oscuro, alineados a los zinc en uso)
        surface: {
          base:     '#09090b', // zinc-950 — fondo de página
          card:     '#18181b', // zinc-900 — tarjetas/tablas
          elevated: '#1f1f23', // hover/elevación
          border:   '#27272a', // zinc-800 — bordes sutiles
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
  plugins: [],
};
