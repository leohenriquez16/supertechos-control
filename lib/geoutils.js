// Parser de links de Google Maps — extrae lat/lng de varios formatos

export function extraerCoordenadasDeGoogleMapsLink(link) {
  if (!link) return null;
  try {
    const matchAt = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchAt) return { lat: parseFloat(matchAt[1]), lng: parseFloat(matchAt[2]) };
    const matchQ = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchQ) return { lat: parseFloat(matchQ[1]), lng: parseFloat(matchQ[2]) };
    const matchLL = link.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchLL) return { lat: parseFloat(matchLL[1]), lng: parseFloat(matchLL[2]) };
    const match3d = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match3d) return { lat: parseFloat(match3d[1]), lng: parseFloat(match3d[2]) };
    const matchPlain = link.match(/(-?\d+\.\d{3,}),\s*(-?\d+\.\d{3,})/);
    if (matchPlain) return { lat: parseFloat(matchPlain[1]), lng: parseFloat(matchPlain[2]) };
    return null;
  } catch {
    return null;
  }
}

export function esLinkCortoMaps(link) {
  if (!link) return false;
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(link);
}

export async function expandirYExtraer(link) {
  if (!esLinkCortoMaps(link)) return extraerCoordenadasDeGoogleMapsLink(link);
  try {
    const resp = await fetch('/api/expandir-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });
    const data = await resp.json();
    if (data.linkLargo) return extraerCoordenadasDeGoogleMapsLink(data.linkLargo);
    return null;
  } catch {
    return null;
  }
}
