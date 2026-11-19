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
//               parecido en los renglones viejos que no lo tienen. Un renglón deja de contar
//               SOLO por lo que ya salió en una salida HECHA de Odoo amarrada al pedido
//               (salidasDePedido) que trae ESE producto (matcheaProductoOdoo), y solo hasta la
//               cantidad que salió. En la duda se queda en "Ya pedido" y sale un aviso.
//   Pedir     → sugerido = requiere − ya salió − ya pedido (cantidadesSugeridas), editable.
import { matcheaProductoOdoo } from './presupuestoObra.js';
import {
  cantidadesSugeridas, yaSalioDetallado, salidasDePedido, codigoRequisicion,
  ESTADOS_PEDIDO_ABIERTO, unidadesCompatibles,
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

// Material vivo del sistema (para su unidad en plural).
const materialVivo = (sistemas, sistemaId, materialId) => {
  if (!sistemas || !materialId) return null;
  const enSis = (sistemas[sistemaId]?.materiales || []).find(m => m.id === materialId);
  if (enSis) return enSis;
  for (const sis of Object.values(sistemas)) {
    const m = (sis?.materiales || []).find(x => x.id === materialId);
    if (m) return m;
  }
  return null;
};

// Plural sencillo en español: rollo → rollos, galón → galones, lb → lb.
export function pluralUnidad(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/s$/i.test(s) || s.length <= 2 || /[^a-záéíóúñü]/i.test(s.slice(-1))) return s;
  if (/[aeiouáéíóú]$/i.test(s)) return s + 's';
  if (/ón$/i.test(s)) return s.slice(0, -2) + 'ones';
  return s + 'es';
}
// Singular sencillo: rollos → rollo, galones → galón (solo para mostrar "1 rollo").
export function singularUnidad(u) {
  const s = String(u || '').trim();
  if (/ones$/i.test(s)) return s.slice(0, -4) + 'ón';
  if (/[aeiou]s$/i.test(s)) return s.slice(0, -1);
  return s;
}
// "20 rollos" / "1 rollo" / "3" (sin unidad)
export function conUnidad(n, unidad, unidadPlural) {
  const num = Math.round((Number(n) || 0) * 100) / 100;
  const u = num === 1 ? (unidad || singularUnidad(unidadPlural)) : (unidadPlural || pluralUnidad(unidad));
  return `${num.toLocaleString('es-DO')}${u ? ' ' + u : ''}`;
}

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
      const vivo = materialVivo(sistemas, sistemaId, materialId);
      const u = l.unidad || vivo?.unidad || '';
      out.push({
        clave, materialId, sistemaId, sistemaNombre,
        nombre: l.nombre || '', unidad: singularUnidad(u),
        unidadPlural: vivo?.unidad_plural || (/s$/i.test(u) ? u : pluralUnidad(u)),
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
        nombre: mat.nombre || '', unidad: mat.unidad || '',
        unidadPlural: mat.unidad_plural || pluralUnidad(mat.unidad),
        keywordsOdoo: listaKws(mat.keywords_odoo),
        requerido: r2(mat.requerido),
      });
    });
  });
  return out;
}

// ---------- ya salió (Odoo) ----------
// base: renglones (baseDesde*); productos: [{ producto, cantidad, unidad? }] → { [clave]: cantidad }
// Si el mismo material está en dos sistemas de la obra, lo salido se reparte entre ellos en
// proporción a lo requerido (antes se lo llevaba todo el primero).
export function salioPorRenglon(base = [], productos = []) {
  return salioDetallePorRenglon(base, productos).cantidades;
}

// → { cantidades, detalle: { [clave]: [{ producto, cantidad, unidad }] }, otraUnidad: { [clave]: [...] } }
export function salioDetallePorRenglon(base = [], productos = []) {
  const grupos = new Map(); // un grupo por material (materialId o, sin id, por clave)
  (base || []).forEach(b => {
    const k = b.materialId ? `m:${b.materialId}` : `c:${b.clave}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(b);
  });
  const lista = [...grupos.entries()].map(([k, bs]) => ({
    id: k, nombre: bs[0].nombre, unidad: bs[0].unidadPlural || bs[0].unidad || '',
    keywordsOdoo: [...new Set(bs.flatMap(b => b.keywordsOdoo || []))],
  }));
  const res = yaSalioDetallado(lista, productos || []);
  const cantidades = {}, detalle = {}, otraUnidad = {};
  grupos.forEach((bs, k) => {
    const total = Number(res.cantidades[k]) || 0;
    const sumReq = bs.reduce((s, b) => s + (Number(b.requerido) || 0), 0);
    bs.forEach((b, i) => {
      if (res.detalle[k]) detalle[b.clave] = res.detalle[k];
      if (res.otraUnidad[k]) otraUnidad[b.clave] = res.otraUnidad[k];
      if (!total) return;
      const parte = bs.length === 1 ? total
        : sumReq > 0 ? total * (Number(b.requerido) || 0) / sumReq
          : (i === 0 ? total : 0);
      if (parte) cantidades[b.clave] = r2(parte);
    });
  });
  return { cantidades, detalle, otraUnidad };
}

// Texto para el title de "Ya salió": qué productos de Odoo se contaron.
export function detalleSalioTexto(detalle = [], otraUnidad = []) {
  const l = (d) => `• ${d.producto} ×${d.cantidad}${d.unidad ? ' ' + d.unidad : ''}`;
  const partes = [];
  if (detalle?.length) partes.push('Salidas hechas en Odoo que se contaron:', ...detalle.map(l));
  else partes.push('Ninguna salida hecha en Odoo trae este material.');
  if (otraUnidad?.length) partes.push('', 'No se sumaron (vienen en otra unidad):', ...otraUnidad.map(l));
  return partes.join('\n');
}

// Aviso cuando Odoo trae el material en otra unidad (galones contra cubetas…).
export function avisoOtraUnidad(otraUnidad = [], unidadPlural = '') {
  if (!otraUnidad?.length) return '';
  const us = [...new Set(otraUnidad.map(d => d.unidad).filter(Boolean))].join(', ');
  return `En Odoo salió en ${us || 'otra unidad'}${unidadPlural ? ` y aquí se cuenta en ${unidadPlural}` : ''}: no se resta de "Ya salió". Revisa la cantidad.`;
}

// ---------- pedidos abiertos que Odoo ya muestra como salidos ----------
// requisiciones: las del proyecto; resp: /api/odoo/salidas-pedidos; referencia: cotización de la obra.
// base: los renglones del panel (para reconocer el producto de cada renglón del pedido).
// Solo cuentan las salidas HECHAS (done) y solo por los productos que coinciden con el renglón
// del pedido, hasta la cantidad mínima entre lo pedido y lo que salió. Una misma salida no se
// reparte dos veces: se consume en orden, del pedido más viejo al más nuevo.
// → { [reqId]: { via, hechas: [names], abiertas: [names], cubierto: { [indiceItem]: { cantidad, salidas } } } }
export function pedidosConSalida(requisiciones = [], resp = null, referencia = null, base = []) {
  const out = {};
  if (!resp) return out;
  const restante = new Map(); // `${salida}|${i}` → cantidad que aún no cubrió a ningún pedido
  const abiertos = (requisiciones || []).filter(r => r && ESTADOS_PEDIDO_ABIERTO.includes(r.estado))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  abiertos.forEach(r => {
    const res = salidasDePedido(r, resp, { referencia });
    if (!res.via) return;
    const hechas = res.salidas.filter(s => s.state === 'done');
    const abiertas = res.salidas.filter(s => s.state !== 'done');
    const cubierto = {};
    (r.items || []).forEach((it, idx) => {
      const pedidoCant = Number(it?.cantidad);
      if (!Number.isFinite(pedidoCant) || pedidoCant <= 0) return;
      const clave = renglonDeItem(base, it);
      const b = clave ? (base || []).find(x => x.clave === clave) : null;
      const linea = b ? { nombre: b.nombre, keywordsOdoo: b.keywordsOdoo || [] }
        : { nombre: String(it.descripcion || ''), keywordsOdoo: [] };
      if (!linea.nombre) return;
      const unidad = b ? (b.unidadPlural || b.unidad) : it.unidad;
      let falta = pedidoCant, cant = 0;
      const usadas = [];
      hechas.forEach(s => {
        (s.productos || []).forEach((p, i) => {
          if (falta <= 1e-9 || !p?.producto) return;
          if (!matcheaProductoOdoo(linea, p.producto)) return;
          if (unidad && p.unidad && !unidadesCompatibles(unidad, p.unidad)) return;
          const k = `${s.id || s.name}|${i}`;
          const disp = restante.has(k) ? restante.get(k) : (Number(p.cantidad) || 0);
          if (disp <= 1e-9) return;
          const toma = Math.min(disp, falta);
          restante.set(k, disp - toma);
          falta -= toma; cant += toma;
          if (s.name && !usadas.includes(s.name)) usadas.push(s.name);
        });
      });
      if (cant > 0) cubierto[idx] = { cantidad: r2(cant), salidas: usadas };
    });
    out[r.id] = {
      via: res.via,
      hechas: hechas.map(s => s.name).filter(Boolean),
      abiertas: abiertas.map(s => s.name).filter(Boolean),
      cubierto,
    };
  });
  return out;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// "2026-11-03T…" → "3-nov" (día en hora de RD)
export function fechaCortaRD(iso) {
  if (!iso) return '';
  const t = /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Date(iso + 'T12:00:00Z').getTime() : new Date(iso).getTime() - 4 * 3600000;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getUTCDate()}-${MESES[d.getUTCMonth()]}`;
}

// Nombre corto de un pedido para los avisos.
export const etiquetaPedido = (r) => (r?.codigo || codigoRequisicion(r?.numero)
  || (r?.createdAt && fechaCortaRD(r.createdAt) ? `el pedido del ${fechaCortaRD(r.createdAt)}` : 'un pedido'));

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

// → { cantidades: { [clave]: n }, detalle: { [clave]: [{ reqId, etiqueta, cantidad, estado, odoo? }] },
//     salidos: { [clave]: [{ reqId, etiqueta, cantidad, via, salidas }] } }
// conSalida: el resultado de pedidosConSalida. De cada renglón solo se descuenta lo cubierto
// por una salida hecha con ese producto; el resto sigue en "ya pedido". Si Odoo tiene salidas
// amarradas al pedido que no lo cubren (sin validar, o sin ese producto), el renglón lleva
// odoo: { via, abiertas, hechas } para avisar.
export function pedidoPorRenglon(base = [], requisiciones = [], conSalida = {}) {
  const cantidades = {}, detalle = {}, salidos = {};
  (requisiciones || []).forEach(r => {
    if (!r || !ESTADOS_PEDIDO_ABIERTO.includes(r.estado)) return;
    const sal = conSalida?.[r.id] || null;
    (r.items || []).forEach((i, idx) => {
      const c = Number(i.cantidad);
      if (!Number.isFinite(c) || c <= 0) return;
      const clave = renglonDeItem(base, i);
      if (!clave) return;
      const etiqueta = etiquetaPedido(r);
      const cub = sal?.cubierto?.[idx] || null;
      const cubierto = cub ? Math.min(c, Number(cub.cantidad) || 0) : 0;
      if (cubierto > 0) {
        (salidos[clave] ||= []).push({ reqId: r.id, etiqueta, cantidad: r2(cubierto), estado: r.estado, via: sal.via, salidas: cub.salidas || [] });
      }
      const resto = r2(c - cubierto);
      if (resto <= 0) return;
      const fila = { reqId: r.id, etiqueta, cantidad: resto, estado: r.estado };
      if (sal && (sal.abiertas?.length || sal.hechas?.length)) fila.odoo = { via: sal.via, abiertas: sal.abiertas || [], hechas: sal.hechas || [], parcial: cubierto > 0 };
      cantidades[clave] = r2((cantidades[clave] || 0) + resto);
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

const listaY = (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// Aviso de pedidos abiertos de ese material: "Ya hay 20 rollos pedidos sin entregar en REQ-0142."
export function avisoYaPedido(detalle = [], unidad = '', unidadPlural = '') {
  if (!detalle || !detalle.length) return '';
  const total = r2(detalle.reduce((s, d) => s + (Number(d.cantidad) || 0), 0));
  const donde = [...new Set(detalle.map(d => d.etiqueta))];
  const uno = total === 1;
  return `Ya hay ${conUnidad(total, unidad, unidadPlural)} ${uno ? 'pedido' : 'pedidos'} sin entregar en ${listaY(donde)}.`;
}

// Aviso de la duda: Odoo tiene salidas amarradas a esos pedidos que todavía no los cubren.
export function avisoDudaOdoo(detalle = []) {
  const conDuda = (detalle || []).filter(d => d.odoo);
  if (!conDuda.length) return '';
  const donde = [...new Set(conDuda.map(d => d.etiqueta))];
  const abiertas = [...new Set(conDuda.flatMap(d => d.odoo.abiertas || []))];
  const sinValidar = abiertas.length && !conDuda.some(d => d.odoo.hechas?.length);
  const verbo = donde.length === 1 ? 'sigue' : 'siguen';
  if (sinValidar) {
    return `En Odoo ya hay ${abiertas.length === 1 ? 'una salida' : 'salidas'} para ${listaY(donde)} (${abiertas.join(', ')}) sin validar: ${verbo} contando en "Ya pedido" hasta que salga.`;
  }
  return `En Odoo hay salidas de esta obra después de ${listaY(donde)}, pero no traen este material (o no completo): ${verbo} contando en "Ya pedido". Revísalo.`;
}

// Aviso de pedidos abiertos aquí que Odoo ya muestra como salidos (por este material).
export function avisoYaSalio(salidos = [], unidad = '', unidadPlural = '') {
  if (!salidos || !salidos.length) return '';
  const donde = [...new Set(salidos.map(d => d.etiqueta))];
  const total = r2(salidos.reduce((s, d) => s + (Number(d.cantidad) || 0), 0));
  const aprox = salidos.some(d => d.via === 'cotizacion');
  const uno = donde.length === 1;
  return `${listaY(donde)} ${uno ? 'sigue abierto' : 'siguen abiertos'} aquí, pero en Odoo ya ${total === 1 ? 'salió' : 'salieron'} ${conUnidad(total, unidad, unidadPlural)}${aprox ? ' en una salida de esta obra (puede ser de otro pedido)' : ''}: no se ${total === 1 ? 'suma' : 'suman'} en "Ya pedido".`;
}

// Renglones → items de la requisición (crearRequisicion).
// libres: [{ descripcion, cantidad, unidad }] (brochas, motas, herramientas).
export function itemsParaRequisicion(renglones = [], libres = []) {
  const items = [];
  (renglones || []).forEach(r => {
    const c = Number(r.pedir);
    if (!r.marcado || !Number.isFinite(c) || c <= 0) return;
    items.push({
      descripcion: r.nombre, cantidad: r2(c), unidad: (r2(c) === 1 ? r.unidad : (r.unidadPlural || r.unidad)) || '',
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
