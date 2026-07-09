// Metadata / vista previa (Open Graph) SOLO para /solicitud — así cuando el cliente
// recibe el link por WhatsApp/redes ve un mensaje que lo invita a pedir la visita,
// en vez del título interno del ERP. El page.jsx es client component (no puede exportar
// metadata), por eso va en este layout server-side.
const URL = 'https://supertechos-control.vercel.app/solicitud';
const OG_TITLE = '¿Tienes una filtración? Pásanos los datos aquí y te ayudamos';
const OG_DESC = 'Solicita tu levantamiento con Super Techos: cuéntanos qué pasa con el techo y coordinamos la visita. Impermeabilización, mantenimiento y diagnóstico — sin costo ni compromiso.';
const IMG = 'https://supertechos-control.vercel.app/logo-supertechos.png';

export const metadata = {
  title: '¿Tienes una filtración? · Super Techos',
  description: OG_DESC,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESC,
    url: URL,
    siteName: 'Super Techos',
    locale: 'es_DO',
    type: 'website',
    images: [{ url: IMG, width: 300, height: 237, alt: 'Super Techos — Impermeabilizantes y Aislantes' }],
  },
  twitter: {
    card: 'summary',
    title: OG_TITLE,
    description: OG_DESC,
    images: [IMG],
  },
};

export default function SolicitudLayout({ children }) {
  return children;
}
