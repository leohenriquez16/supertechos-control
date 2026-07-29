// Mapeo de los tipos de NCF a los tipos de comprobante fiscal reales del Odoo
// de Super Techos (l10n_latam.document.type, verificados vía XML-RPC 2026-07).
export const TIPOS_NCF = [
  { v: 'B01', label: 'B01 · Crédito Fiscal', odoo: 'Crédito Fiscal' },
  { v: 'B02', label: 'B02 · Consumo', odoo: 'Consumo' },
  { v: 'B11', label: 'B11 · Comprobante de Compra', odoo: 'Comprobante de Compra' },
  { v: 'B13', label: 'B13 · Gasto Menor', odoo: 'Gasto Menor' },
  { v: 'B14', label: 'B14 · Régimen Especial', odoo: 'Régimen Especial' },
  { v: 'B15', label: 'B15 · Gubernamental', odoo: 'Factura Gubernamental' },
  { v: 'E31', label: 'E31 · Crédito Fiscal Electrónica', odoo: 'Crédito Fiscal Electrónica' },
  { v: 'E32', label: 'E32 · Consumo Electrónica', odoo: 'Consumo Electrónica' },
  { v: 'E43', label: 'E43 · Gasto Menor Electrónica', odoo: 'Gasto Menor Electrónica' },
];

// Diario de gasto por empresa (verificados en Odoo).
export const DIARIO_POR_EMPRESA = {
  super_techos: 'Facturas de Proveedores Gasto ST',
  prouco: 'Facturas Proveedores de Gastos PG',
};

export const NOMBRE_EMPRESA = { super_techos: 'Super Techos', prouco: 'Prouco' };

// Detecta el tipo (B01/E31/…) desde el prefijo del NCF.
export function detectarTipoNcf(ncf) {
  if (!ncf) return '';
  const n = String(ncf).toUpperCase().replace(/\s/g, '');
  const pref3 = n.slice(0, 3);
  if (TIPOS_NCF.some((t) => t.v === pref3)) return pref3;
  return '';
}
