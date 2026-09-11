// OG/metadata para la página pública de calificación (se comparte por WhatsApp/correo).
const OG_TITLE = '¿Cómo lo hicimos? · Super Techos';
const OG_DESC = 'Cuéntanos cómo fue tu experiencia con Super Techos. Tu opinión nos ayuda a mejorar.';

export const metadata = {
  title: OG_TITLE,
  description: OG_DESC,
  robots: { index: false, follow: false },
  openGraph: { title: OG_TITLE, description: OG_DESC, siteName: 'Super Techos', locale: 'es_DO', type: 'website' },
  twitter: { card: 'summary', title: OG_TITLE, description: OG_DESC },
};

export default function CalificarLayout({ children }) {
  return children;
}
