// Metadata del portal del cliente (se comparte por correo y WhatsApp).
const OG_TITLE = 'Portal del programa · Super Techos';
const OG_DESC = 'Avance de cada locación, desde el levantamiento hasta la entrega.';

export const metadata = {
  title: OG_TITLE,
  description: OG_DESC,
  robots: { index: false, follow: false },
  openGraph: { title: OG_TITLE, description: OG_DESC, siteName: 'Super Techos', locale: 'es_DO', type: 'website' },
};

export default function PortalProgramaLayout({ children }) {
  return children;
}
