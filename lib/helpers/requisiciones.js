// lib/helpers/requisiciones.js
// v8.76: pedidos de material (requisiciones) — lógica pura, sin React ni Supabase.
// Se prueba en tests/requisiciones.test.mjs.
//
// - codigoRequisicion: número humano REQ-0001 (migración 144).
// - claveCotizacion / origenMencionaCotizacion / origenMencionaCodigo / agruparSalidasPorPedido:
//   cómo se reconoce una salida de almacén de Odoo (stock.picking outgoing) por su
//   "Documento origen". En Odoo el origen se escribe a mano: "ST 5867", "ST-C5867",
//   "St 5867", "PG 1225", "ST 5747 (RECLAMACION)"… La empresa del picking NO sirve
//   para separar ST de PG (hay salidas "PG 1225" en el almacén de Super Techos):
//   manda el prefijo escrito en el origen.
// - salidasDePedido: amarre pedido ↔ salida (primero por código REQ, si no por cotización
//   desde la fecha del pedido, marcado como aproximado).
// - cantidadesSugeridas: requerido − ya salió − ya pedido, por material.
import { matcheaProductoOdoo } from './presupuestoObra.js';

// ---------- número humano ----------
export function codigoRequisicion(numero) {
  const n = Number(numero);
  if (numero === null || numero === undefined || numero === '' || !Number.isInteger(n) || n <= 0) return null;
  return 'REQ-' + String(n).padStart(4, '0');
}

// "REQ-0142" / "req 142" / "REQ0142" → 142. null si no es un código.
export function numeroDeCodigo(codigo) {
  const m = /^\s*REQ[\s\-_]*0*(\d+)\s*$/i.exec(String(codigo || ''));
  return m ? Number(m[1]) : null;
}

// ---------- cotización ----------
// "ST-C5867" → "ST5867"; "PG-C1269" → "PG1269"; "st 5867" → "ST5867".
// Sin prefijo ST/PG (solo el número) → "5867" (se busca el número sin importar prefijo).
export function claveCotizacion(ref) {
  const s = String(ref || '').toUpperCase();
  const m = /(ST|PG)?[\s\-_]*C?[\s\-_]*0*(\d{3,})/.exec(s);
  if (!m) return null;
  return (m[1] || '') + m[2];
}

const partesClave = (clave) => {
  const m = /^(ST|PG)?(\d+)$/.exec(String(clave || ''));
  return m ? { prefijo: m[1] || '', numero: m[2] } : null;
};

// ¿El origen de la salida menciona esta cotización? Exige el prefijo (si la clave lo trae)
// y que el número no sea parte de otro más largo ("ST 58670" no es ST5867).
export function origenMencionaCotizacion(origin, clave) {
  const p = partesClave(clave);
  if (!p) return false;
  const o = String(origin || '');
  if (p.prefijo) return new RegExp(`(^|[^A-Z0-9])${p.prefijo}[\\s\\-_]*C?[\\s\\-_]*0*${p.numero}(?!\\d)`, 'i').test(o);
  return new RegExp(`(^|\\D)0*${p.numero}(?!\\d)`).test(o);
}

// ¿El origen menciona este código REQ? (exacto por número: REQ-0142 ≠ REQ-1420)
export function origenMencionaCodigo(origin, codigo) {
  const n = numeroDeCodigo(codigo);
  if (n == null) return false;
  return new RegExp(`(^|[^A-Z0-9])REQ[\\s\\-_]*0*${n}(?!\\d)`, 'i').test(String(origin || ''));
}

// Todos los códigos REQ que aparecen en un origen (normalizados a REQ-0001).
export function codigosEnOrigen(origin) {
  const out = [];
  const re = /(^|[^A-Z0-9])REQ[\s\-_]*0*(\d+)(?!\d)/gi;
  let m;
  while ((m = re.exec(String(origin || '')))) { const c = codigoRequisicion(Number(m[2])); if (c && !out.includes(c)) out.push(c); }
  return out;
}

// Reparte las salidas (ya leídas de Odoo) en { porReferencia, porCodigo }.
// salidas: [{ name, origin, state, fecha, productos }]; refs: ['ST-C5867', ...]; codigos: ['REQ-0142', ...]
// Las claves de porReferencia son las de claveCotizacion ('ST5867'); las de porCodigo, el código normalizado.
// Una salida puede caer en varias claves (ej. "ST 5867 REQ-0142" va a las dos).
export function agruparSalidasPorPedido(salidas, refs = [], codigos = []) {
  const claves = [...new Set((refs || []).map(claveCotizacion).filter(Boolean))];
  const cods = [...new Set((codigos || []).map(c => codigoRequisicion(numeroDeCodigo(c))).filter(Boolean))];
  const porReferencia = Object.fromEntries(claves.map(k => [k, []]));
  const porCodigo = Object.fromEntries(cods.map(k => [k, []]));
  (salidas || []).forEach(s => {
    if (!s || s.state === 'cancel') return;
    claves.forEach(k => { if (origenMencionaCotizacion(s.origin, k)) porReferencia[k].push(s); });
    cods.forEach(k => { if (origenMencionaCodigo(s.origin, k)) porCodigo[k].push(s); });
  });
  return { porReferencia, porCodigo };
}

// Odoo devuelve fechas "YYYY-MM-DD HH:MM:SS" en UTC → ISO.
export function fechaOdooAIso(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return s.replace(' ', 'T') + (s.length === 16 ? ':00' : '') + 'Z';
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Día calendario en RD (UTC−4, sin horario de verano) de una fecha ISO.
export function diaRD(iso) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso);
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - 4 * 3600000).toISOString().slice(0, 10);
}

// ---------- amarre pedido ↔ salida ----------
// pedido: { codigo, createdAt, referencia? } (requisicionRowToObj); resp: respuesta de
// /api/odoo/salidas-pedidos. La cotización de la obra se pasa en opts.referencia (ST-C5867);
// si no, se usa pedido.referenciaCotizacion o pedido.referencia.
// 1) Exacto: salidas cuyo origen trae el código REQ del pedido.
// 2) Aproximado: salidas de la cotización de la obra creadas el día del pedido o después,
//    que no traigan el código REQ de OTRO pedido. Cada una va marcada porCotizacion: true.
// Nunca se usan salidas de antes del pedido.
// → { via: 'codigo' | 'cotizacion' | null, aproximado, salidas: [...] }
export function salidasDePedido(pedido, resp, opts = {}) {
  const vacio = { via: null, aproximado: false, salidas: [] };
  if (!pedido || !resp) return vacio;
  const diaPedido = diaRD(pedido.createdAt);
  const noAntes = (s) => !diaPedido || !diaRD(s.fecha) || diaRD(s.fecha) >= diaPedido;
  const vivas = (lista) => (lista || []).filter(s => s && s.state !== 'cancel' && noAntes(s));

  const codigo = pedido.codigo || codigoRequisicion(pedido.numero);
  if (codigo) {
    const porCod = vivas(resp.porCodigo?.[codigo]);
    if (porCod.length) return { via: 'codigo', aproximado: false, salidas: porCod.map(s => ({ ...s, porCotizacion: false })) };
  }
  const clave = claveCotizacion(opts.referencia || pedido.referenciaCotizacion || pedido.referencia);
  if (!clave) return vacio;
  const porRef = vivas(resp.porReferencia?.[clave])
    .filter(s => codigosEnOrigen(s.origin).every(c => c === codigo));
  if (!porRef.length) return vacio;
  return { via: 'cotizacion', aproximado: true, salidas: porRef.map(s => ({ ...s, porCotizacion: true })) };
}

// ---------- cantidades ----------
const valDe = (mapa, id) => {
  if (!mapa || id == null) return 0;
  const v = mapa instanceof Map ? mapa.get(id) : mapa[id];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

// materiales: [{ id, nombre, unidad }]; requerido / salio / pedido: { [materialId]: cantidad } (o Map).
// sugerido = max(0, requerido − yaSalio − yaPedido), redondeado hacia arriba a la unidad.
export function cantidadesSugeridas({ materiales = [], requerido = {}, salio = {}, pedido = {} } = {}) {
  return (materiales || []).filter(m => m && m.id != null).map(m => {
    const req = valDe(requerido, m.id), ya = valDe(salio, m.id), ped = valDe(pedido, m.id);
    const falta = req - ya - ped;
    const sugerido = falta > 1e-9 ? Math.ceil(falta - 1e-9) : 0;
    return { materialId: m.id, nombre: m.nombre || '', unidad: m.unidad || '', requerido: r2(req), yaSalio: r2(ya), yaPedido: r2(ped), sugerido };
  });
}

// Lo ya pedido por material en pedidos ABIERTOS (pendiente/preparando/lista/en_ruta).
// Los entregados no cuentan: lo entregado ya debe verse en "ya salió" (Odoo).
export const ESTADOS_PEDIDO_ABIERTO = ['pendiente', 'preparando', 'lista', 'en_ruta'];
export function yaPedidoPorMaterial(requisiciones = [], { excluirId = null } = {}) {
  const out = {};
  (requisiciones || []).forEach(r => {
    if (!r || r.id === excluirId || !ESTADOS_PEDIDO_ABIERTO.includes(r.estado)) return;
    (r.items || []).forEach(i => {
      if (!i.materialId) return;
      const c = Number(i.cantidad);
      if (Number.isFinite(c) && c > 0) out[i.materialId] = r2((out[i.materialId] || 0) + c);
    });
  });
  return out;
}

// Lo que ya salió por material desde los productos de Odoo ({ producto, cantidad } de
// /api/odoo/salidas-almacen). Mismo criterio que Rentabilidad: cada producto de Odoo se
// asigna al PRIMER material que lo reconoce (por nombre o keywords_odoo), para no contarlo dos veces.
export function yaSalioPorMaterial(materiales = [], productos = []) {
  const out = {};
  const usados = new Set();
  (materiales || []).forEach(m => {
    if (!m || m.id == null) return;
    const kws = Array.isArray(m.keywordsOdoo) ? m.keywordsOdoo
      : Array.isArray(m.keywords_odoo) ? m.keywords_odoo
        : String(m.keywordsOdoo || m.keywords_odoo || '').split(',');
    const linea = { nombre: m.nombre || '', keywordsOdoo: kws.map(k => String(k).trim()).filter(Boolean) };
    (productos || []).forEach((p, idx) => {
      if (usados.has(idx) || !p?.producto) return;
      if (matcheaProductoOdoo(linea, p.producto)) {
        usados.add(idx);
        out[m.id] = r2((out[m.id] || 0) + (Number(p.cantidad) || 0));
      }
    });
  });
  return out;
}
