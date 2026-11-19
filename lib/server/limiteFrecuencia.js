// Límite de frecuencia simple EN MEMORIA (por instancia del servidor; en Vercel
// cada instancia lleva su propia cuenta, así que es un freno, no una garantía).
// Sirve para que nadie —ni varias pestañas abiertas— dispare sin control rutas
// caras como /api/rutas/revisar-gps (cada corrida pega al GPSWOX por camión).
//
// crearLimitador({ ventanaMs }) → (clave, ahoraMs?) => { ok, esperaS }
//   Deja pasar una vez por clave cada ventanaMs. Con { soloConsultar: true }
//   responde sin anotar la corrida (para combinar dos límites sin gastar uno).
export function crearLimitador({ ventanaMs = 60000, maxClaves = 5000 } = {}) {
  const ultimo = new Map();
  return (clave, ahoraMs = Date.now(), { soloConsultar = false } = {}) => {
    const t = ultimo.get(clave);
    if (t != null && ahoraMs - t < ventanaMs) return { ok: false, esperaS: Math.ceil((ventanaMs - (ahoraMs - t)) / 1000) };
    if (soloConsultar) return { ok: true, esperaS: 0 };
    if (ultimo.size >= maxClaves) {
      for (const [k, v] of ultimo) if (ahoraMs - v >= ventanaMs) ultimo.delete(k);
      if (ultimo.size >= maxClaves) ultimo.delete(ultimo.keys().next().value);
    }
    ultimo.set(clave, ahoraMs);
    return { ok: true, esperaS: 0 };
  };
}
