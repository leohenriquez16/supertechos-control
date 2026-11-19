// v8.84.0: amarre pedido ↔ salida de almacén de Odoo (AL/OUT) SIN depender de que el almacén
// escriba el REQ en el Documento origen (decisión de Leo, 19-nov-2026). Lógica pura; se prueba
// en tests/amarre-salidas.test.mjs.
//
// Cada salida de Odoo va a UN solo pedido:
//   1. Código REQ en el origen  → a ese pedido (manda sobre todo).                    'codigo'
//   2. Ya elegida para el pedido (la oficina con "Es de este", la salida automática o el
//      despacho importado de Odoo): odoo_pickings_fijos / odoo_picking_id.             'fija'
//      Si dos pedidos la tienen elegida, el segundo la ve como conflicto (duda).
//   3. Backorder de una salida ya amarrada  → al mismo pedido.
//   4. Por cotización, SOLO HACIA ADELANTE: pedidos creados desde AMARRE_COT_DESDE y solo
//      salidas posteriores al pedido (nunca el histórico de Odoo). Solo pedidos ABIERTOS para
//      esa salida: un pedido que ya salió/se entregó solo recibe salidas de hasta 2 días
//      después (Odoo se valida tarde). Madres antes que backorders.
//      - el que más productos comparte con la salida, si gana claro               'cotizacion'
//      - si no está claro: DUDA en los pedidos posibles; la oficina elige
//        ("Es de este" = fija / "No" = descartada; nunca se vuelve a sugerir).
// Las salidas descartadas de un pedido no se le amarran por ninguna vía (salvo el picking
// propio de un despacho importado, que es su identidad).
// La salida AUTOMÁTICA (VistaAlmacen) solo corre cuando todas las salidas del pedido traen su
// REQ ('codigo'). Lo amarrado por cotización o elegido por la oficina se MUESTRA (y avisa si
// Odoo ya la validó), pero "Salió" lo marca una persona — ver salidaDePedidoVista.
// Backorders: uno ABIERTO es el saldo de su madre y va con ella; uno ya HECHO se reparte como
// salida nueva (la AL/OUT de la venta trae toda la cotización y se despacha por partes).
import { claveCotizacion, codigoRequisicion, codigosEnOrigen, diaRD, fechaDeSalida, origenMencionaCodigo, TOLERANCIA_AMARRE_MS } from './requisiciones.js';
import { matcheaProductoOdoo } from './presupuestoObra.js';

// Desde cuándo un pedido se amarra por cotización (el histórico se cerró a mano el 19-nov).
export const AMARRE_COT_DESDE = '2026-11-19';
// Parte de los productos de la salida que deben estar en el pedido para amarrarla sola.
export const MIN_COINCIDENCIA = 0.5;
// Ventaja mínima del mejor pedido sobre el segundo cuando hay varios.
export const MARGEN_GANADOR = 0.25;
// Un pedido que ya salió/se entregó sigue recibiendo salidas de Odoo validadas hasta 2 días después.
export const VENTANA_TRAS_SALIDA_MS = 2 * 24 * 3600 * 1000;

const tiempo = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : null; };
export const idSalida = (s) => (s?.id != null ? String(s.id) : s?.name ? 'n:' + s.name : null);
const descartadas = (p) => new Set((p?.odooPickingsDescartados || []).map(String));
const fijasDe = (p) => {
  const des = descartadas(p);
  const ids = (p?.odooPickingsFijos || []).map(String).filter(id => !des.has(id));
  // odoo_picking_id: el picking del despacho importado (su identidad: siempre) o el elegido
  if (p?.odooPickingId != null && (p.tipo === 'despacho' || !des.has(String(p.odooPickingId)))) ids.push(String(p.odooPickingId));
  return [...new Set(ids)];
};

// ¿El pedido participa del amarre por cotización?
export function pedidoAmarraPorCotizacion(p) {
  return !!p && p.tipo !== 'compra' && p.estado !== 'cancelada' && (diaRD(p.createdAt) || '') >= AMARRE_COT_DESDE;
}

// ¿La salida es posterior al pedido? (con margen de relojes)
const salidaNoAntes = (p, s) => {
  const tp = tiempo(p.createdAt);
  if (tp == null) return true;
  const ts = tiempo(fechaDeSalida(s));
  return ts == null || ts >= tp - TOLERANCIA_AMARRE_MS;
};
// ¿El pedido sigue abierto para esta salida? (si ya salió o se entregó, solo hasta 2 días después)
const abiertoPara = (p, s) => {
  if (p.estado === 'cancelada') return false;
  const cierre = tiempo(p.salidaAt || p.entregadaAt || p.retiradaAt);
  if (cierre == null) return true;
  const ts = tiempo(fechaDeSalida(s));
  return ts == null || ts <= cierre + VENTANA_TRAS_SALIDA_MS;
};

// Cuánto pasó entre que el pedido salió/se entregó y la salida de Odoo (ms).
const cerroHace = (p, s) => {
  const cierre = tiempo(p.salidaAt || p.entregadaAt || p.retiradaAt), ts = tiempo(fechaDeSalida(s));
  return cierre == null || ts == null ? Infinity : ts - cierre;
};

const itemsDe = (pedido) => (pedido?.items || []).map(i => (i?.descripcion || '').trim()).filter(Boolean);
const coincide = (item, producto) => matcheaProductoOdoo({ nombre: item, keywordsOdoo: [] }, producto);

// Parte (0..1) de los productos de la salida que aparecen en los renglones del pedido.
// null si no hay con qué comparar.
export function coincidenciaProductos(pedido, salida) {
  const prods = (salida?.productos || []).map(x => x?.producto).filter(Boolean);
  const items = itemsDe(pedido);
  if (!prods.length || !items.length) return null;
  const hits = prods.filter(pr => items.some(it => coincide(it, pr))).length;
  return Math.round((hits / prods.length) * 100) / 100;
}

// Parte (0..1) de los renglones del pedido que aparecen en alguna de las salidas.
export function coberturaPedido(pedido, salidas = []) {
  const items = itemsDe(pedido);
  const prods = (salidas || []).flatMap(s => (s?.productos || []).map(x => x?.producto)).filter(Boolean);
  if (!items.length || !prods.length) return 0;
  const hits = items.filter(it => prods.some(pr => coincide(it, pr))).length;
  return Math.round((hits / items.length) * 100) / 100;
}

// pedidos: requisiciones (requisicionRowToObj) — el UNIVERSO (todas, no solo las visibles).
// resp: /api/odoo/salidas-pedidos ({ porReferencia, porCodigo }).
// referenciaDe(pedido) → cotización con prefijo ST/PG de la obra (o null).
// → { [pedidoId]: { salidas: [{...salida, via}], via, dudas: [{ salida, coincidencia, candidatos, conflicto? }] } }
export function amarrarSalidas(pedidos = [], resp = null, referenciaDe = () => null) {
  const out = {};
  if (!resp) return out;
  const ps = (pedidos || []).filter(p => p && p.id && p.tipo !== 'compra');
  ps.forEach(p => { out[p.id] = { salidas: [], via: null, dudas: [] }; });
  const porId = new Map(ps.map(p => [p.id, p]));
  const dueno = new Map(); // idSalida → pedidoId
  const RANGO = { codigo: 3, fija: 2, cotizacion: 1 };
  const poner = (p, s, via, forzar = false) => {
    const k = idSalida(s);
    if (!p || !k || dueno.has(k) || (!forzar && descartadas(p).has(k))) return false;
    dueno.set(k, p.id);
    out[p.id].salidas.push({ ...s, via });
    if (!out[p.id].via || RANGO[via] > RANGO[out[p.id].via]) out[p.id].via = via;
    return true;
  };
  const vivas = (lista) => (lista || []).filter(s => s && s.state !== 'cancel');

  // Todas las salidas conocidas (por código y por cotización), sin repetir, por fecha.
  const todas = new Map();
  [...Object.values(resp.porCodigo || {}), ...Object.values(resp.porReferencia || {})]
    .forEach(l => vivas(l).forEach(s => { const k = idSalida(s); if (k && !todas.has(k)) todas.set(k, s); }));
  const porFecha = (a, b) => (tiempo(fechaDeSalida(a)) ?? 0) - (tiempo(fechaDeSalida(b)) ?? 0);
  const ordenadas = [...todas.values()].sort(porFecha);

  // 1. Código REQ exacto (si otro pedido ya la tiene elegida, queda como conflicto)
  const elegidaPor = new Map();
  ps.forEach(p => fijasDe(p).forEach(id => { if (!elegidaPor.has(id)) elegidaPor.set(id, p.id); }));
  ps.forEach(p => {
    const codigo = p.codigo || codigoRequisicion(p.numero);
    if (!codigo) return;
    ordenadas.filter(s => origenMencionaCodigo(s.origin, codigo) && salidaNoAntes(p, s)).forEach(s => {
      const otro = elegidaPor.get(idSalida(s));
      if (otro && otro !== p.id) { out[p.id].dudas.push({ salida: s, coincidencia: coincidenciaProductos(p, s), candidatos: 2, conflicto: true, de: otro }); return; }
      // con el REQ siempre se muestra (aunque se haya deshecho su salida: la vista no la vuelve automática)
      if (poner(p, s, 'codigo', true)) return;
      // una salida con VARIOS REQ en el origen va a cada uno de esos pedidos (como v8.80)
      const k = idSalida(s), d = dueno.get(k);
      if (d && d !== p.id && out[d].salidas.some(x => idSalida(x) === k && x.via === 'codigo')) {
        out[p.id].salidas.push({ ...s, via: 'codigo' });
        out[p.id].via = 'codigo';
      }
    });
  });
  // 2. Ya elegidas para el pedido
  ps.forEach(p => fijasDe(p).forEach(id => {
    const s = todas.get(id);
    if (!s) return;
    if (dueno.has(id) && dueno.get(id) !== p.id) {
      // dos pedidos la tienen elegida: el segundo lo ve como conflicto
      out[p.id].dudas.push({ salida: s, coincidencia: coincidenciaProductos(p, s), candidatos: 2, conflicto: true, de: dueno.get(id) });
      return;
    }
    // el picking propio de un despacho importado se le muestra aunque se haya deshecho su salida
    poner(p, s, 'fija', p.tipo === 'despacho' && String(p.odooPickingId) === id);
  }));
  // 3. Backorders: siguen a su salida madre (de la madre a la hija, en cadena)
  const backorders = () => {
    let cambio = true;
    while (cambio) {
      cambio = false;
      ordenadas.forEach(s => {
        if (dueno.has(idSalida(s)) || s.backorderDe == null || s.state === 'done') return;
        const madre = dueno.get(String(s.backorderDe));
        if (madre && poner(porId.get(madre), s, out[madre].salidas.find(x => String(x.id) === String(s.backorderDe))?.via || 'cotizacion')) cambio = true;
      });
    }
  };
  backorders();

  // 4. Por cotización, solo hacia adelante
  const porClave = {};
  ps.filter(pedidoAmarraPorCotizacion).forEach(p => {
    const k = claveCotizacion(referenciaDe(p));
    if (k) (porClave[k] ||= []).push(p);
  });
  Object.entries(porClave).forEach(([clave, grupo]) => {
    const lista = vivas(resp.porReferencia?.[clave])
      .filter(s => !dueno.has(idSalida(s)) && !codigosEnOrigen(s.origin).length) // con REQ: no es de cotización
      .sort(porFecha);
    // madres antes que sus backorders (en Odoo el backorder nace antes de que se valide la madre)
    const enLista = new Set(lista.map(idSalida));
    const ordenLista = [...lista.filter(s => s.backorderDe == null || !enLista.has(String(s.backorderDe))),
      ...lista.filter(s => s.backorderDe != null && enLista.has(String(s.backorderDe)))];
    ordenLista.forEach(s => {
      const k = idSalida(s);
      if (dueno.has(k)) return;
      const madre = s.backorderDe != null && s.state !== 'done' ? dueno.get(String(s.backorderDe)) : null;
      if (madre) { if (poner(porId.get(madre), s, 'cotizacion')) return; }
      const posiblesTodos = grupo.filter(p => salidaNoAntes(p, s) && !descartadas(p).has(k));
      const candidatos = posiblesTodos.filter(p => abiertoPara(p, s));
      // pedidos que ya salieron hace más de 2 días pero que comparten los productos: si alguno
      // coincide tanto como el mejor abierto, la salida puede ser suya (Odoo validado tarde) → duda
      // (solo los que aún no tienen ninguna salida de Odoo y cerraron hace menos de 7 días)
      const cerrados = posiblesTodos.filter(p => !abiertoPara(p, s) && !out[p.id].salidas.length && cerroHace(p, s) <= 7 * 24 * 3600 * 1000)
        .map(p => coincidenciaProductos(p, s) ?? 0);
      if (!candidatos.length) return;
      const puntaje = candidatos.map(p => ({ p, c: coincidenciaProductos(p, s), tiene: out[p.id].salidas.length > 0 }))
        .sort((a, b) => (b.c ?? -1) - (a.c ?? -1) || Number(a.tiene) - Number(b.tiene) || String(a.p.createdAt || '').localeCompare(String(b.p.createdAt || '')));
      const [mejor, segundo] = puntaje;
      const claro = mejor.c != null && mejor.c >= MIN_COINCIDENCIA
        && (!segundo || (segundo.c ?? 0) <= mejor.c - MARGEN_GANADOR)
        && !cerrados.some(c => c > 0 && c >= mejor.c);
      if (claro) { poner(mejor.p, s, 'cotizacion'); return; }
      // Duda: se muestra en los pedidos posibles para que la oficina elija
      const posibles = puntaje.filter(x => x.c == null || x.c > 0);
      (posibles.length ? posibles : puntaje).forEach(x => {
        out[x.p.id].dudas.push({ salida: s, coincidencia: x.c, candidatos: puntaje.length });
      });
    });
  });
  backorders();
  // Una duda que al final quedó con dueño ya no se ofrece (salvo los conflictos de elegidas)
  Object.values(out).forEach(o => { o.dudas = o.dudas.filter(d => d.conflicto || !dueno.has(idSalida(d.salida))); });
  return out;
}

// Salidas que el ERP ya tiene amarradas o en duda (para no ofrecerlas como "venta por entregar").
export function idsSalidasEnAmarre(amarre) {
  const ids = new Set();
  Object.values(amarre || {}).forEach(o => {
    (o.salidas || []).forEach(s => ids.add(idSalida(s)));
    (o.dudas || []).forEach(d => ids.add(idSalida(d.salida)));
  });
  return ids;
}
