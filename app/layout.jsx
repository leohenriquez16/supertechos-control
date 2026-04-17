import './globals.css';

export const metadata = {
  title: 'Super Techos - Control de Obras',
  description: 'Sistema de control de obras de impermeabilización',
  manifest: '/manifest.json',
  themeColor: '#CC0000',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Super Techos',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
