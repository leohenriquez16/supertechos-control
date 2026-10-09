// v8.62.0 — Sincronización diaria de cada obra con su cotización en Odoo.
// La cotización cambia después de crear la obra (Yeara 28-sep: 970→2,190 m² y una partida
// nueva; donaciones; adicionales; volumetría corregida). Regla (decisión de Leo, 9-oct-2026):
//   · lo SEGURO se aplica solo y queda en el historial: valor, ITBIS, precio de un área,
//     m² que suben (o bajan sin quedar por debajo de lo ya reportado);
//   · lo que podría perder avance o no se puede emparejar con certeza se pone a REVISAR.
// Puro (sin red): lo usan el cron, la ficha de la obra y las pruebas.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/^ap\s*[-—–]\s*/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'y', 'con', 'en', 'para', 'sistema', 'a', 'base', 'ap']);
const tokens = (s) => norm(s).split(' ').filter(w => w.length > 2 && !PALABRAS_VACIAS.has(w));
const parecido = (a, b) => {
  const ta = new Set(tokens(a)), tb = tokens(b);
  if (!ta.size || !tb.length) return 0;
  return tb.filter(t => ta.has(t)).length / Math.max(ta.size, tb.length);
};
const NO_PARTIDA = /anticipo|down payment|avance de cliente|descuento/i;
const r2 = (x) => Math.round(Number(x) * 100) / 100;

/**
 * Convierte las líneas de una cotización de Odoo en partidas cobrables (con su sección).
 * @param lineas  [{ name, product_uom_qty, price_unit, price_subtotal, display_type, product_uom }]
 */
export function partidasDeCotizacion(lineas = []) {
  let seccion = '';
  const out = [];
  lineas.forEach(l => {
    if (l.display_type === 'line_section') { seccion = l.name || ''; return; }
    if (l.display_type) return;
    if (NO_PARTIDA.test(`${seccion} ${l.name}`)) return;
    const qty = Number(l.product_uom_qty) || 0, sub = Number(l.price_subtotal) || 0;
    if (!(qty > 0) || !(sub > 0)) return;
    out.push({ seccion, nombre: (l.name || '').split('\n')[0], texto: l.name || '', cantidad: qty, precio: Number(l.price_unit) || 0,
      subtotal: sub, unidad: Array.isArray(l.product_uom) ? l.product_uom[1] : (l.product_uom || '') });
  });
  return out;
}

/**
 * Compara una obra con su cotización y propone cambios.
 * @param proyecto  { areas:[{id,nombre,m2,sistemaId,precioVentaM2}], sistema, valorCotizacion, itbisFactor }
 * @param cot       { state, amount_total, amount_untaxed, moneda, tasa, lineas }
 * @param ctx       { sistemas: {id:{nombre}}, reportadoPorArea: {areaId: m² máximo reportado en una tarea} }
 * @returns { seguros:[{tipo, ...}], revisar:[{tipo, motivo, ...}], areas, valor, itbis }
 */
export function compararConOdoo(proyecto, cot, ctx = {}) {
  const seguros = [], revisar = [];
  if (!cot) return { seguros, revisar: [{ tipo: 'sin_cotizacion', motivo: 'La referencia no existe en Odoo.' }] };
  if (cot.state === 'cancel') revisar.push({ tipo: 'cancelada', motivo: 'La cotización está cancelada en Odoo.' });
  const tasa = cot.moneda === 'USD' ? (Number(cot.tasa) || 0) : 1;
  if (cot.moneda === 'USD' && !(tasa > 0)) return { seguros, revisar: [...revisar, { tipo: 'sin_tasa', motivo: 'Cotización en US$ sin tasa de cambio.' }] };

  // Un cambio GRANDE de valor (más de 25%) puede ser una referencia amarrada a otra cotización
  // o un Odoo que todavía no se corrigió: se revisa, no se aplica solo.
  const valor = r2((Number(cot.amount_total) || 0) * tasa);
  const valorErp = Number(proyecto.valorCotizacion) || 0;
  if (valor > 0 && Math.abs(valor - valorErp) >= 1) {
    if (valorErp > 0 && (cot.moneda === 'USD' || Math.abs(valor - valorErp) / valorErp > 0.25)) {
      revisar.push({ tipo: 'valor_grande', de: valorErp, a: valor, motivo: `El valor en Odoo difiere ${Math.round(Math.abs(valor - valorErp) / valorErp * 100)}% del ERP.` });
    } else seguros.push({ tipo: 'valor', de: valorErp, a: valor });
  }
  const untaxed = Number(cot.amount_untaxed) || 0;
  const itbis = untaxed > 0 ? Math.round(((Number(cot.amount_total) || 0) / untaxed) * 10000) / 10000 : null;
  if (itbis && Math.abs(itbis - (Number(proyecto.itbisFactor) || 0)) >= 0.0001) seguros.push({ tipo: 'itbis', de: Number(proyecto.itbisFactor) || null, a: itbis });

  const partidas = partidasDeCotizacion(cot.lineas).map((p, i) => ({ ...p, i, precioRD: r2(p.precio * tasa) }));
  const usadas = new Set();
  const sisNombre = (a) => ctx.sistemas?.[a.sistemaId || proyecto.sistema]?.nombre || '';
  const hayVariasAreas = (proyecto.areas || []).length > 1;
  const areas = (proyecto.areas || []).map(a => ({ ...a }));

  areas.forEach(a => {
    // candidatas: misma sección (por nombre del área) o, si no hay secciones, todas
    const enSeccion = partidas.filter(p => !usadas.has(p.i) && p.seccion && (norm(p.seccion) === norm(a.nombre)
      || norm(p.seccion).includes(norm(a.nombre)) || norm(a.nombre).includes(norm(p.seccion))));
    const pool = enSeccion.length ? enSeccion : partidas.filter(p => !usadas.has(p.i) && (!p.seccion || !hayVariasAreas));
    const puntuadas = pool.map(p => ({ p, s: Math.max(parecido(sisNombre(a), p.texto), parecido(a.nombre, p.texto)) }))
      .sort((x, y) => y.s - x.s);
    let elegida = null;
    if (puntuadas.length === 1 && (enSeccion.length || !hayVariasAreas)) elegida = puntuadas[0].p;
    else if (puntuadas.length && puntuadas[0].s >= 0.34 && (puntuadas.length === 1 || puntuadas[0].s > puntuadas[1].s)) elegida = puntuadas[0].p;
    if (!elegida) return;
    usadas.add(elegida.i);
    // precio
    const precioErp = Number(a.precioVentaM2) || 0;
    if (elegida.precioRD > 0 && Math.abs(elegida.precioRD - precioErp) >= 0.01) {
      if (precioErp > 0 && Math.abs(elegida.precioRD - precioErp) / precioErp > 0.5) {
        revisar.push({ tipo: 'precio_grande', areaId: a.id, area: a.nombre, de: precioErp, a: elegida.precioRD, motivo: 'El precio cambió más de 50%.' });
      } else {
        seguros.push({ tipo: 'precio', areaId: a.id, area: a.nombre, de: precioErp || null, a: elegida.precioRD });
        a.precioVentaM2 = elegida.precioRD;
      }
    }
    // m²
    const m2Odoo = r2(elegida.cantidad), m2Erp = Number(a.m2) || 0;
    if (Math.abs(m2Odoo - m2Erp) >= 0.01) {
      const reportado = Number(ctx.reportadoPorArea?.[a.id]) || 0;
      // Antes de arrancar, los m² son los de la cotización. Ya arrancada la obra, lo medido en campo
      // manda: un cambio de m² se revisa, no se aplica solo.
      if (ctx.obraArrancada) {
        revisar.push({ tipo: 'm2_obra_arrancada', areaId: a.id, area: a.nombre, de: m2Erp, a: m2Odoo, motivo: 'La obra ya arrancó: confirmar si se ajustan los m².' });
      } else if (m2Odoo >= m2Erp || m2Odoo >= reportado) {
        seguros.push({ tipo: 'm2', areaId: a.id, area: a.nombre, de: m2Erp, a: m2Odoo });
        a.m2 = m2Odoo;
      } else {
        revisar.push({ tipo: 'm2_bajo_reportado', areaId: a.id, area: a.nombre, de: m2Erp, a: m2Odoo, reportado,
          motivo: `En Odoo bajó a ${m2Odoo} y ya hay ${reportado} reportados.` });
      }
    }
  });

  // Solo partidas medibles (m², ml) sin área: lo cobrado por unidad (transporte, movilización…)
  // ya está en el valor y no es un área de trabajo.
  const medible = (p) => !/^(units?|unidad(es)?|und|ud|pa|p\/a)$/i.test(String(p.unidad || '').trim());
  partidas.filter(p => !usadas.has(p.i) && medible(p)).forEach(p => {
    revisar.push({ tipo: 'partida_nueva', seccion: p.seccion, nombre: p.nombre, cantidad: p.cantidad, unidad: p.unidad,
      precio: p.precioRD, motivo: 'Partida de la cotización sin área en el ERP.' });
  });

  return { seguros, revisar, areas, valor, itbis };
}

/** Clave estable de un pendiente, para no volver a mostrar lo que alguien ya marcó como revisado. */
export const claveRevisar = (c) => [c.tipo, c.areaId || '', norm(c.seccion || ''), norm(c.nombre || ''), c.a ?? ''].join('|');

/** Texto corto de un cambio para el historial / correo. */
export function textoCambio(c) {
  const f = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  switch (c.tipo) {
    case 'valor': case 'valor_grande': return `Valor RD$${f(c.de)} → RD$${f(c.a)}`;
    case 'precio_grande': return `${c.area}: precio ${f(c.de)} → ${f(c.a)} (cambio grande)`;
    case 'itbis': return `ITBIS ${c.de ? f((c.de - 1) * 100) + '%' : '—'} → ${f((c.a - 1) * 100)}%`;
    case 'precio': return `${c.area}: precio ${f(c.de)} → ${f(c.a)}`;
    case 'm2': return `${c.area}: ${f(c.de)} → ${f(c.a)} m²`;
    case 'm2_obra_arrancada': return `${c.area}: Odoo ${f(c.a)} m² vs ERP ${f(c.de)} m² (obra arrancada)`;
    case 'm2_bajo_reportado': return `${c.area}: Odoo bajó a ${f(c.a)} m², reportado ${f(c.reportado)}`;
    case 'partida_nueva': return `Partida nueva: ${c.seccion ? c.seccion + ' · ' : ''}${c.nombre} (${f(c.cantidad)} ${c.unidad} a ${f(c.precio)})`;
    default: return c.motivo || c.tipo;
  }
}
