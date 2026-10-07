// v8.59.7 — ¿Esta persona ya existe? Se usa al invitar o crear personal para no duplicar fichas.
// Caso real (oct-2026): Gerbacio De León se reinvitó con el teléfono mal escrito (829-826… en vez
// de 829-926…) y nació una segunda ficha; las jornadas se marcaron en una y el pago en otra.
// Pura (sin red): sirve en cliente, servidor y pruebas.

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

export const normalizarNombre = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 1 && !PALABRAS_VACIAS.has(w));

const soloDigitos = (t) => String(t || '').replace(/\D/g, '').slice(-10);

/** Teléfonos de 10 dígitos que difieren en a lo sumo un dígito (error de tecleo). */
export function telefonosParecidos(a, b) {
  const x = soloDigitos(a), y = soloDigitos(b);
  if (x.length !== 10 || y.length !== 10) return false;
  let dif = 0;
  for (let i = 0; i < 10; i++) if (x[i] !== y[i]) dif++;
  return dif <= 1;
}

/**
 * Devuelve las fichas existentes que podrían ser la misma persona, con el motivo.
 * Coincide si: misma cédula · teléfono igual o con un dígito distinto · mismo primer nombre
 * y al menos un apellido en común.
 */
export function buscarPersonasParecidas(personal = [], { nombre, telefono, cedula, excluirId } = {}) {
  const tokens = normalizarNombre(nombre);
  const ced = String(cedula || '').replace(/\D/g, '');
  const out = [];
  personal.forEach(p => {
    if (!p || p.id === excluirId) return;
    if (/\(DUPLICADO\)/.test(p.nombre || '')) return;
    const motivos = [];
    const pced = String(p.cedulaNumero || p.cedula_numero || '').replace(/\D/g, '');
    if (ced.length >= 11 && pced && pced === ced) motivos.push('misma cédula');
    if (telefono && (telefonosParecidos(telefono, p.telefono) || telefonosParecidos(telefono, p.whatsapp))) {
      motivos.push(soloDigitos(telefono) === soloDigitos(p.telefono) ? 'mismo teléfono' : 'teléfono casi igual');
    }
    const pt = normalizarNombre(p.nombre);
    if (tokens.length >= 2 && pt.length >= 2 && tokens[0] === pt[0] && tokens.slice(1).some(t => pt.slice(1).includes(t))) {
      motivos.push('mismo nombre');
    }
    if (motivos.length) out.push({ persona: p, motivos });
  });
  return out.sort((a, b) => b.motivos.length - a.motivos.length).slice(0, 5);
}
