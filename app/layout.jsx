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

// v8.19.15: banner global de entorno. Si NEXT_PUBLIC_ENV_LABEL está seteada
// (típicamente en .env.local o previews), muestra una franja superior centrada
// para que no confundas el entorno de pruebas con producción. En prod la
// variable no existe → el banner no se renderiza.
function EnvBanner() {
  const label = process.env.NEXT_PUBLIC_ENV_LABEL;
  if (!label) return null;
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        background: 'repeating-linear-gradient(45deg,#facc15,#facc15 10px,#000 10px,#000 20px)',
        padding: '4px 0',
      }}
    >
      <div
        style={{
          background: '#facc15',
          color: '#000',
          fontWeight: 900,
          fontSize: 11,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          padding: '4px 14px',
          border: '2px solid #000',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        ⚠ {label} ⚠
      </div>
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
