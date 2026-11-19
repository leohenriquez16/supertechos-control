// v8.75.2: encontrar un cliente que YA existe antes de crear uno nuevo.
// Causa de los duplicados (25 grupos fusionados el 18-nov-2026): se comparaba el nombre
// exacto ("ALAMSA SRL" ≠ "ALAMSA") contra una lista en memoria que no se refrescaba entre
// obras creadas seguidas. Orden: ID de Odoo → RNC → nombre normalizado.
// v8.85.0: (53 más fusionados el 19-nov-2026) — "Empresa, Persona" (así nombra Odoo a los
// contactos hijos) se parte: la empresa es el cliente y la persona un contacto. Se ignora lo que
// va entre paréntesis ("… SAS (CINTER)"). Si el que coincide está archivado por fusión
// ("Fusionado en <id>"), se devuelve el cliente principal.

const SUFIJO = /^(S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S?\.?|E\.?I\.?R\.?L\.?|C\.?\s?POR\s?A\.?)$/i;

// "TOWERS AND SITES SAS, Marlix Martínez" → { empresa: 'TOWERS AND SITES SAS', persona: 'Marlix Martínez' }
// "Inter Alia, SRL" → { empresa: 'Inter Alia, SRL', persona: null }
export function partirNombreClienteContacto(nombre) {
  const n = String(nombre || '').trim();
  const i = n.indexOf(',');
  if (i < 0) return { empresa: n, persona: null };
  const a = n.slice(0, i).trim(), b = n.slice(i + 1).trim();
  if (!b || SUFIJO.test(b)) return { empresa: n, persona: null };
  return { empresa: a, persona: b };
}

export const normNombreCliente = (n) => String(partirNombreClienteContacto(n).empresa || '')
  .replace(/\([^)]*\)/g, ' ')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\s+(SRL|SAS|SA|S R L|S A S|S A|EIRL|C POR A)$/, '').trim();

const soloDig = (x) => String(x || '').replace(/\D/g, '');
const fusionadoEn = (c) => (String(c?.nota || '').match(/Fusionado en (\S+)/) || [])[1] || null;

// clientes: [{ id, nombre, rnc, odooPartnerId|odoo_partner_id, archivado, nota }]
export function buscarClienteEnLista(clientes, { odooPartnerId = null, rnc = '', nombre = '' } = {}) {
  const todos = clientes || [];
  const porId = Object.fromEntries(todos.map(c => [c.id, c]));
  // sigue la cadena de fusiones hasta el cliente vigente
  const vigente = (c) => {
    let x = c, n = 0;
    while (x && x.archivado && fusionadoEn(x) && porId[fusionadoEn(x)] && n++ < 5) x = porId[fusionadoEn(x)];
    return x && !x.archivado ? x : null;
  };
  const buscar = (pred) => {
    const act = todos.find(x => !x.archivado && pred(x));
    if (act) return act;
    const arch = todos.filter(x => x.archivado && pred(x)).map(vigente).find(Boolean);
    return arch || null;
  };
  const pid = odooPartnerId != null ? String(odooPartnerId) : '';
  if (pid) {
    const c = buscar(x => String(x.odooPartnerId ?? x.odoo_partner_id ?? '') === pid);
    if (c) return c;
  }
  const r = soloDig(rnc);
  if (r.length >= 9) {
    const c = buscar(x => soloDig(x.rnc) === r);
    if (c) return c;
  }
  const k = normNombreCliente(nombre);
  if (k.length >= 3) {
    const c = buscar(x => normNombreCliente(x.nombre) === k);
    if (c) return c;
  }
  return null;
}
