// v8.74.3: qué sistemas trae una cotización de Odoo y cuántos m² de cada uno.
// Mismo criterio que ModalImportarOdoo: keywords_cotizacion del sistema o su nombre dentro
// del nombre del producto. Por área se toma la cantidad mayor de cada sistema (un mismo techo
// puede llevar varias líneas del mismo sistema: imprimante, capa base, capa final).

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const AREAS_EXCLUIDAS = ['anticipo', 'indirecto', 'descuento'];
// Sistemas que no llevan garantía propia: se ofrecen al final.
const AUXILIAR = /lavado|limpieza|bote|mantenimiento|movilizacion|transporte/;

// Gana el sistema con más palabras en común con el producto; a igualdad, el que tiene la keyword
// y luego el de nombre más corto (más exacto). Así "AP - Ever Silic HS - Sobre Lona Asfaltica" va a
// "Ever Silic HS (Silicona Sobre Lona Asfáltica)" y no a "Lona Asfáltica", y
// "AP - Mantenimiento Lona Asfaltica" va al de mantenimiento.
const VACIAS = new Set(['ap', 'de', 'del', 'la', 'el', 'en', 'con', 'sobre', 'sistema', 'y', 'para', 'a']);
const tokens = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !VACIAS.has(t)));

export function sistemaDeProducto(nombreProducto, sistemas = []) {
  const n = norm(nombreProducto);
  if (!n) return null;
  const tp = tokens(n);
  let mejor = null, clave = null;
  for (const s of sistemas) {
    const ts = tokens(s.nombre || s.data?.nombre);
    let comunes = 0; ts.forEach(t => { if (tp.has(t)) comunes++; });
    const kw = (s.keywords_cotizacion || s.data?.keywords_cotizacion || []).map(norm).filter(Boolean).some(k => n.includes(k)) ? 1 : 0;
    if (comunes < 2 && !kw) continue;
    const c = [comunes, kw, -ts.size];
    if (!clave || c[0] > clave[0] || (c[0] === clave[0] && (c[1] > clave[1] || (c[1] === clave[1] && c[2] > clave[2])))) { mejor = s; clave = c; }
  }
  return mejor;
}

/** [{ sistemaId, nombre, m2, auxiliar }] ordenado: primero los que llevan garantía, de más a menos m². */
export function sistemasDeCotizacion(cot, sistemas = []) {
  const m = new Map();
  for (const a of cot?.areas || []) {
    if (AREAS_EXCLUIDAS.some(x => norm(a.nombre).includes(x))) continue;
    const porSis = new Map();
    for (const p of a.productos || []) {
      const s = sistemaDeProducto(p.producto || p.nombre, sistemas) || sistemaDeProducto(p.nombre, sistemas);
      if (!s) continue;
      porSis.set(s.id, Math.max(porSis.get(s.id) || 0, Number(p.cantidad) || 0));
    }
    for (const [id, m2] of porSis) {
      const s = sistemas.find(x => x.id === id);
      const g = m.get(id) || { sistemaId: id, nombre: s?.nombre || s?.data?.nombre || id, m2: 0 };
      g.m2 += m2; m.set(id, g);
    }
  }
  return [...m.values()]
    .map(g => ({ ...g, m2: Math.round(g.m2 * 100) / 100, auxiliar: AUXILIAR.test(norm(g.nombre)) }))
    .sort((a, b) => (a.auxiliar - b.auxiliar) || b.m2 - a.m2);
}
