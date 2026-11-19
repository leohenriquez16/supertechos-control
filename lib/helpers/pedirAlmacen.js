// lib/helpers/pedirAlmacen.js
// v8.76: "Pedir al almacén" desde la pestaña Materiales del proyecto (solo oficina).
// Lógica pura, sin React ni Supabase. Se prueba en tests/pedirAlmacen.test.mjs.
//
// Arma la lista de materiales de la obra con, por renglón:
//   Requiere  → del PRESUPUESTO APROBADO (líneas tipo 'material') o, si no hay, del SISTEMA
//               (m² ÷ rendimiento, lo que ya calcula calcMaterialesGrupo).
//   Ya salió  → productos de las salidas de almacén de Odoo (/api/odoo/salidas-almacen),
//               reconocidos con matcheaProductoOdoo (mismo criterio que Rentabilidad).
//   Ya pedido → renglones de pedidos ABIERTOS del proyecto; por materialId, o por nombre
//               parecido en los renglones viejos que no lo tienen. Los pedidos que Odoo ya
//               muestra como salidos (salidasDePedido) no cuentan: ya están en "Ya salió".
//   Pedir     → sugerido = requiere − ya salió − ya pedido (cantidadesSugeridas), editable.
import { matcheaProductoOdoo } from './presupuestoObra.js';
import {
  cantidadesSugeridas, yaSalioPorMaterial, salidasDePedido, codigoRequisicion,
  ESTADOS_PEDIDO_ABIERTO,
} from './requisiciones.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Clave de un renglón: el mismo material puede estar en dos sistemas de la obra.
export const claveRenglon = (sistemaId, materialId) => `${sistemaId || ''}|${materialId || ''}`;

const listaKws = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map(k => String(k).trim()).filter(Boolean);

// Keywords vivas del material en el sistema (el presupuesto guarda una foto vieja).
const kwsVivas = (sistemas, sistemaId, materialId) => {
  if (!sistemas || !materialId) return [];
  const enSis = (sistemas[sistemaId]?.materiales || []).find(m => m.id === materialId);
  if (enSis) return listaKws(enSis.keywords_odoo);
  for (const sis of Object.values(sistemas)) {
    const m = (sis?.materiales || []).find(x => x.id === materialId);
    if (m) return listaKws(m.keywords_odoo);
  }
  return [];
};

// ---------- base: lo que requiere la obra ----------
// presupuesto: el aprobado (mapPresupuestoObra). Suma por sistema+material.
export function baseDesdePresupuesto(presupuesto, sistemas = {}) {
  const out = [];
  const idx = {};
  (presupuesto?.partidas || []).forEach(pt => {
    const sistemaId = pt.sistemaId || pt.sistemaVinculadoId || null;
    const sistemaNombre = (sistemaId && sistemas?.[sistemaId]?.nombre) || pt.nombre || '';
    (pt.costos || []).forEach(l => {
      if (!l || l.tipo !== 'material') return;
      const cant = Number(l.cantidad);
      const req = Number.isFinite(cant) && cant > 0 ? cant : 0;
      const materialId = l.materialId || null;
      const clave = materialId ? claveRenglon(sistemaId, materialId) : `${sistemaId || ''}|l:${l.id || out.length}`;
      if (idx[clave] != null) { out[idx[clave]].requerido = r2(out[idx[clave]].requerido + req); return; }
      idx[clave] = out.length;
      out.push({
        clave, materialId, sistemaId, sistemaNombre,
        nombre: l.nombre || '', unidad: l.unidad || '',
        keywordsOdoo: [...new Set([...listaKws(l.keywordsOdoo), ...kwsVivas(sistemas, sistemaId, materialId)])],
        requerido: r2(req),
      });
    });
  });
  return out;
}

// grupos: los de agruparAreasPorSistema con materialesCalculados (calcMaterialesGrupo).
export function baseDesdeSistema(grupos = []) {
  const out = [];
  (grupos || []).forEach(g => {
    (g.materialesCalculados || []).forEach(mat => {
      if (!mat || mat.id == null) return;
      out.push({
        clave: claveRenglon(g.sistemaId, mat.id), materialId: mat.id, sistemaId: g.sistemaId || null,
        sistemaNombre: g.sistema?.nombre || '',
        nombre: mat.nombre || '', unidad: mat.unidad_plural || mat.unidad || '',
        keywordsOdoo: listaKws(mat.keywords_odoo),
        requerido: r2(mat.requerido),
      });
    });
  });
  return out;
}

// ---------- ya salió (Odoo) ----------
// base: renglones (baseDesde*); productos: [{ producto, cantidad }] → { [clave]: cantidad }
export function salioPorRenglon(base = [], productos = []) {
  return yaSalioPorMaterial(
    (base || []).map(b => ({ id: b.clave, nombre: b.nombre, keywordsOdoo: b.keywordsOdoo || [] })),
    productos || [],
  );
}

// ---------- pedidos que Odoo ya muestra como salidos ----------
// requisiciones: las del proyecto; resp: /api/odoo/salidas-pedidos; referencia: cotización de la obra.
// → { [reqId]: { via: 'codigo'|'cotizacion', salidas: ['AL/OUT/01465', ...] } }
export function pedidosConSalida(requisiciones = [], resp = null, referencia = null) {
  const out = {};
  if (!resp) return out;
  (requisiciones || []).forEach(r => {
    if (!r || !ESTADOS_PEDIDO_ABIERTO.includes(r.estado)) return;
    const res = salidasDePedido(r, resp, { referencia });
    if (res.via) out[r.id] = { via: res.via, salidas: res.salidas.map(s => s.name).filter(Boolean) };
  });
  return out;
}

// Nombre corto de un pedido para los avisos.
export const etiquetaPedido = (r) => (r?.codigo || codigoRequisicion(r?.numero)
  || (r?.createdAt ? `el pedido del ${String(r.createdAt).slice(0, 10)}` : 'un pedido'));

// ---------- ya pedido ----------
// A qué renglón va un renglón de pedido: por materialId (mismo sistema si se puede);
// si no trae materialId (pedidos viejos), por nombre parecido (matcheaProductoOdoo).
export function renglonDeItem(base = [], item = {}) {
  if (!item) return null;
  if (item.materialId) {
    const mismos = (base || []).filter(b => b.materialId && b.materialId === item.materialId);
    if (!mismos.length) return null;
    return (mismos.find(b => item.sistemaId && b.sistemaId === item.sistemaId) || mismos[0]).clave;
  }
  const desc = String(item.descripcion || '').trim();
  if (!desc) return null;
  const hit = (base || []).find(b => b.nombre && matcheaProductoOdoo({ nombre: b.nombre, keywordsOdoo: b.keywordsOdoo || [] }, desc));
  return hit ? hit.clave : null;
}

// → { cantidades: { [clave]: n }, detalle: { [clave]: [{ reqId, etiqueta, cantidad, estado }] },
//     salidos: { [clave]: [{ reqId, etiqueta, cantidad, via, salidas }] } }
// conSalida: el resultado de pedidosConSalida (esos pedidos NO suman a "ya pedido").
export function pedidoPorRenglon(base = [], requisiciones = [], conSalida = {}) {
  const cantidades = {}, detalle = {}, salidos = {};
  (requisiciones || []).forEach(r => {
    if (!r || !ESTADOS_PEDIDO_ABIERTO.includes(r.estado)) return;
    const sal = conSalida?.[r.id] || null;
    (r.items || []).forEach(i => {
      const c = Number(i.cantidad);
      if (!Number.isFinite(c) || c <= 0) return;
      const clave = renglonDeItem(base, i);
      if (!clave) return;
      const fila = { reqId: r.id, etiqueta: etiquetaPedido(r), cantidad: r2(c), estado: r.estado };
      if (sal) { (salidos[clave] ||= []).push({ ...fila, via: sal.via, salidas: sal.salidas }); return; }
      cantidades[clave] = r2((cantidades[clave] || 0) + c);
      (detalle[clave] ||= []).push(fila);
    });
  });
  return { cantidades, detalle, salidos };
}

// ---------- renglones del panel ----------
export function armarRenglones({ base = [], salio = {}, pedido = {} } = {}) {
  const sug = cantidadesSugeridas({
    materiales: (base || []).map(b => ({ id: b.clave, nombre: b.nombre, unidad: b.unidad })),
    requerido: Object.fromEntries((base || []).map(b => [b.clave, b.requerido])),
    salio, pedido,
  });
  const porClave = Object.fromEntries(sug.map(s => [s.materialId, s]));
  return (base || []).map(b => {
    const s = porClave[b.clave] || {};
    return {
      ...b, yaSalio: s.yaSalio || 0, yaPedido: s.yaPedido || 0, sugerido: s.sugerido || 0,
      pedir: s.sugerido || 0, marcado: (s.sugerido || 0) > 0,
    };
  });
}

// Aviso de pedidos abiertos de ese material: "Ya hay 20 rollos pedidos sin entregar en REQ-0142."
export function avisoYaPedido(detalle = [], unidad = '') {
  if (!detalle || !detalle.length) return '';
  const total = r2(detalle.reduce((s, d) => s + (Number(d.cantidad) || 0), 0));
  const donde = [...new Set(detalle.map(d => d.etiqueta))];
  const lista = donde.length === 1 ? donde[0] : `${donde.slice(0, -1).join(', ')} y ${donde[donde.length - 1]}`;
  return `Ya hay ${total}${unidad ? ' ' + unidad : ''} pedidos sin entregar en ${lista}.`;
}

// Aviso de pedidos abiertos en el ERP que Odoo ya muestra como salidos.
export function avisoYaSalio(salidos = []) {
  if (!salidos || !salidos.length) return '';
  const donde = [...new Set(salidos.map(d => d.etiqueta))];
  const aprox = salidos.some(d => d.via === 'cotizacion');
  return `${donde.join(', ')} sigue abierto en el ERP, pero Odoo ya tiene salida${aprox ? ' (por cotización, aproximado)' : ''}: no se cuenta como pendiente.`;
}

// Renglones → items de la requisición (crearRequisicion).
// libres: [{ descripcion, cantidad, unidad }] (brochas, motas, herramientas).
export function itemsParaRequisicion(renglones = [], libres = []) {
  const items = [];
  (renglones || []).forEach(r => {
    const c = Number(r.pedir);
    if (!r.marcado || !Number.isFinite(c) || c <= 0) return;
    items.push({
      descripcion: r.nombre, cantidad: r2(c), unidad: r.unidad || '',
      materialId: r.materialId || null, sistemaId: r.sistemaId || null,
    });
  });
  (libres || []).forEach(l => {
    const d = String(l?.descripcion || '').trim();
    if (!d) return;
    const c = Number(l.cantidad);
    items.push({
      descripcion: d, cantidad: l.cantidad === '' || l.cantidad == null || !Number.isFinite(c) ? null : r2(c),
      unidad: l.unidad || '', materialId: null, sistemaId: null,
    });
  });
  return items;
}

// Día más viejo (YYYY-MM-DD) entre los pedidos abiertos: el "desde" de /api/odoo/salidas-pedidos.
export function desdePedidosAbiertos(requisiciones = []) {
  const dias = (requisiciones || [])
    .filter(r => r && ESTADOS_PEDIDO_ABIERTO.includes(r.estado) && r.createdAt)
    .map(r => String(r.createdAt).slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!dias[0]) return null;
  // Un día antes: createdAt viene en UTC y el amarre fino (salidasDePedido) va por día de RD.
  const d = new Date(dias[0] + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
