// Parser de links de Google Maps — extrae lat/lng de varios formatos comunes

// Formatos soportados:
// 1. https://www.google.com/maps/@18.4861,-69.9312,15z
// 2. https://www.google.com/maps/place/.../@18.4861,-69.9312,17z/...
// 3. https://maps.google.com/?q=18.4861,-69.9312
// 4. https://goo.gl/maps/xxxx (acortado — requiere fetch, no lo soportamos aquí sin red)
// 5. https://maps.app.goo.gl/xxxx (acortado — tampoco)
// 6. Solo coordenadas "18.4861,-69.9312" en cualquier lado del link

export function extraerCoordenadasDeGoogleMapsLink(link) {
  if (!link) return null;
  try {
    // Intento 1: buscar patrón @lat,lng
    const matchAt = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchAt) return { lat: parseFloat(matchAt[1]), lng: parseFloat(matchAt[2]) };

    // Intento 2: buscar ?q=lat,lng o &q=lat,lng
    const matchQ = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchQ) return { lat: parseFloat(matchQ[1]), lng: parseFloat(matchQ[2]) };

    // Intento 3: buscar ?ll=lat,lng
    const matchLL = link.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchLL) return { lat: parseFloat(matchLL[1]), lng: parseFloat(matchLL[2]) };

    // Intento 4: !3d y !4d (formato place URL de Google Maps)
    const match3d = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (match3d) return { lat: parseFloat(match3d[1]), lng: parseFloat(match3d[2]) };

    // Intento 5: coordenadas sueltas
    const matchPlain = link.match(/(-?\d+\.\d{3,}),\s*(-?\d+\.\d{3,})/);
    if (matchPlain) return { lat: parseFloat(matchPlain[1]), lng: parseFloat(matchPlain[2]) };

    return null;
  } catch {
    return null;
  }
}
