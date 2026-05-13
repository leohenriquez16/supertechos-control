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
  theme: { extend: {} },
  plugins: [],
};
