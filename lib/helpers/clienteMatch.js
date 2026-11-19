// v8.75.2: encontrar un cliente que YA existe antes de crear uno nuevo.
// Causa de los duplicados (25 grupos fusionados el 18-nov-2026): se comparaba el nombre
// exacto ("ALAMSA SRL" ≠ "ALAMSA") contra una lista en memoria que no se refrescaba entre
// obras creadas seguidas. Orden: ID de Odoo → RNC → nombre normalizado.
export const normNombreCliente = (n) => String(n || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\s+(SRL|SAS|SA|S R L|S A S|S A|EIRL|C POR A)$/, '').trim();

const soloDig = (x) => String(x || '').replace(/\D/g, '');

// clientes: [{ id, nombre, rnc, odooPartnerId|odoo_partner_id, archivado }]
export function buscarClienteEnLista(clientes, { odooPartnerId = null, rnc = '', nombre = '' } = {}) {
  const activos = (clientes || []).filter(c => !c.archivado);
  const pid = odooPartnerId != null ? String(odooPartnerId) : '';
  if (pid) {
    const c = activos.find(x => String(x.odooPartnerId ?? x.odoo_partner_id ?? '') === pid);
    if (c) return c;
  }
  const r = soloDig(rnc);
  if (r.length >= 9) {
    const c = activos.find(x => soloDig(x.rnc) === r);
    if (c) return c;
  }
  const k = normNombreCliente(nombre);
  if (k.length >= 3) {
    const c = activos.find(x => normNombreCliente(x.nombre) === k);
    if (c) return c;
  }
  return null;
}
