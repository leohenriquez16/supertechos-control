import './globals.css';

export const metadata = {
  title: 'Super Techos - Control de Obras',
  description: 'Sistema de gestión de proyectos de impermeabilización',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
