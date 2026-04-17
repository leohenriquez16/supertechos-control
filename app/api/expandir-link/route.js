// Expande links acortados de Google Maps (goo.gl/maps, maps.app.goo.gl) siguiendo el redirect
export const runtime = 'edge';

export async function POST(request) {
  try {
    const { link } = await request.json();
    if (!link) return Response.json({ error: 'Falta el link' }, { status: 400 });

    // Hacer fetch sin seguir redirects automáticamente para capturar el Location header
    const resp = await fetch(link, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    // El location del redirect normalmente tiene el link completo
    let linkLargo = resp.headers.get('location');
    // A veces viene en otra iteración (redirect chain). Intentamos fetch completo con redirect:follow.
    if (!linkLargo) {
      const full = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
      linkLargo = full.url;
    }
    return Response.json({ linkLargo });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
