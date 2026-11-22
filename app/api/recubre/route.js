// v8.100.0: liquidación con Recubre (pintura de Sites y otras). Acuerdo (Leo, 22-nov-2026):
// Super Techos compra los materiales, Recubre pone la MDO; beneficio bruto = venta − materiales − MDO,
// se reparte 50/50 (también la pérdida). Recubre nos factura MDO + su 50%. Corte mensual.
// GET  /api/recubre            → { filas }
// POST /api/recubre { ref, mdo_rd?, mdo_nota?, materiales_extra_rd?, materiales_extra_nota?, corte?, factura_recubre? }
import { verificarSesionInterna, tieneRolInterno } from '../../../lib/server/sesionInterna';
import { salidasAlmacenOdoo, ventasCotizacionesOdoo } from '../../../lib/odoo';

export const dynamic = 'force-dynamic';
const ROLES = ['owner', 'rentabilidad'];

export async function GET(request) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return ses.error;
  if (!tieneRolInterno(ses, ROLES)) return Response.json({ error: 'Sin permiso' }, { status: 403 });
  const db = ses.db;
  const [{ data: locs }, { data: liq }] = await Promise.all([
    db.from('programa_locaciones').select('id, nombre, cotizacion_pintura_ref, cotizacion_pintura_monto, pintura_aprobada, proyecto_pintura_id').not('cotizacion_pintura_ref', 'is', null),
    db.from('recubre_liquidacion').select('*'),
  ]);
  const porRef = {};
  (locs || []).filter(l => l.pintura_aprobada).forEach(l => {
    porRef[l.cotizacion_pintura_ref] = { ref: l.cotizacion_pintura_ref, nombre: l.nombre, locacion_id: l.id, proyecto_id: l.proyecto_pintura_id, montoPrograma: Number(l.cotizacion_pintura_monto) || 0 };
  });
  (liq || []).forEach(r => { porRef[r.ref] = { ...(porRef[r.ref] || { ref: r.ref, nombre: r.nombre, proyecto_id: r.proyecto_id }), liq: r }; });
  const refs = Object.keys(porRef);
  const pids = refs.map(r => porRef[r].proyecto_id).filter(Boolean);
  const { data: proys } = pids.length ? await db.from('proyectos').select('id, nombre, estado, fecha_entrega, referencia_odoo').in('id', pids) : { data: [] };
  const proyPorId = Object.fromEntries((proys || []).map(p => [p.id, p]));
  let ventas = {}, mats = {}, errorOdoo = null;
  try {
    const [v, s] = await Promise.all([ventasCotizacionesOdoo(refs), salidasAlmacenOdoo(refs, { agruparPorReferencia: true })]);
    ventas = v; mats = s?.porReferencia || {};
  } catch (e) { errorOdoo = e?.message || 'Error Odoo'; }
  const filas = refs.map(ref => {
    const b = porRef[ref]; const num = ref.replace(/\D+/g, '');
    const productos = mats[num]?.productos || [];
    return {
      ...b, proyecto: b.proyecto_id ? proyPorId[b.proyecto_id] || null : null,
      venta: ventas[ref] || null,
      materiales: productos.map(p => ({ producto: p.producto, cantidad: p.cantidad, unidad: p.unidad, costoRd: Number(p.costoRd) || 0 })),
      materialesOdooRd: productos.reduce((s, p) => s + (Number(p.costoRd) || 0), 0),
      liq: b.liq || null,
    };
  });
  return Response.json({ filas, errorOdoo });
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
export async function POST(request) {
  const ses = await verificarSesionInterna(request);
  if (ses.error) return ses.error;
  if (!tieneRolInterno(ses, ROLES)) return Response.json({ error: 'Sin permiso' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const ref = String(b.ref || '').trim();
  if (!/^(ST|PG)-C\d+$/i.test(ref)) return Response.json({ error: 'ref inválida' }, { status: 400 });
  const fila = { ref, updated_at: new Date().toISOString(), updated_by: ses.persona?.nombre || 'sistema' };
  ['nombre', 'proyecto_id', 'locacion_id'].forEach(k => { if (b[k] !== undefined) fila[k] = b[k] || null; });
  if (b.mdo_rd !== undefined) { fila.mdo_rd = num(b.mdo_rd); fila.mdo_reportado_at = fila.mdo_rd != null ? new Date().toISOString() : null; }
  if (b.m2_recubre !== undefined) fila.m2_recubre = num(b.m2_recubre);
  if (b.logistica_rd !== undefined) fila.logistica_rd = num(b.logistica_rd) || 0;
  if (b.mdo_nota !== undefined) fila.mdo_nota = String(b.mdo_nota || '').slice(0, 500) || null;
  if (b.materiales_extra_rd !== undefined) fila.materiales_extra_rd = num(b.materiales_extra_rd) || 0;
  if (b.materiales_extra_nota !== undefined) fila.materiales_extra_nota = String(b.materiales_extra_nota || '').slice(0, 500) || null;
  if (b.corte !== undefined) fila.corte = /^\d{4}-\d{2}$/.test(b.corte || '') ? b.corte : null;
  if (b.factura_recubre !== undefined) { fila.factura_recubre = String(b.factura_recubre || '').slice(0, 60) || null; fila.facturada_at = fila.factura_recubre ? new Date().toISOString() : null; }
  const { data, error } = await ses.db.from('recubre_liquidacion').upsert(fila).select().maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ liq: data });
}
