// app/api/reportes/resolver-atraso/route.js
// v8.61.0 — Aprobar o rechazar un reporte de avance atrasado (más de 3 días).
//   POST { reporteId, aprobar, nota, quien }
// Aprobado: entra a nómina y a producción. Si el mes del reporte ya cerró (después del día 5 del
// mes siguiente), cuenta en la producción del mes de la aprobación: los meses cerrados no cambian.
// Cada aprobación avisa a Leo por correo (pedido de Leo, oct-2026), con copia a Miguel.

import { sbServicio } from '../../../../lib/server/portalAuth';

export const dynamic = 'force-dynamic';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());

/** Último día en que el mes de `fecha` todavía se puede reescribir: el 5 del mes siguiente. */
function cierreDelMes(fecha) {
  const [y, m] = fecha.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-05`;
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* noop */ }
  const { reporteId, aprobar, nota, quien } = body || {};
  if (!reporteId || !quien) return Response.json({ ok: false, error: 'Faltan datos.' }, { status: 400 });

  const db = sbServicio();
  const { data: r } = await db.from('reportes')
    .select('id, proyecto_id, area_id, tarea_id, fecha, m2, rollos, supervisor, atraso_estado, atraso_dias, atraso_motivo')
    .eq('id', reporteId).maybeSingle();
  if (!r) return Response.json({ ok: false, error: 'Reporte no encontrado.' }, { status: 404 });
  if (r.atraso_estado !== 'pendiente') return Response.json({ ok: false, error: 'Ese reporte ya fue resuelto.' }, { status: 409 });

  const hoy = hoyRD();
  const cambios = {
    atraso_estado: aprobar ? 'aprobado' : 'rechazado',
    atraso_resuelto_por: String(quien).slice(0, 80) + (nota ? ` · ${String(nota).slice(0, 200)}` : ''),
    atraso_resuelto_at: new Date().toISOString(),
  };
  let mesCerrado = false;
  if (aprobar) {
    mesCerrado = hoy > cierreDelMes(r.fecha);
    cambios.excluir_nomina = false;
    cambios.excluir_nomina_motivo = null;
    cambios.fecha_produccion = mesCerrado ? hoy : r.fecha;
  } else {
    cambios.excluir_nomina_motivo = 'Reporte atrasado rechazado';
  }
  const { error } = await db.from('reportes').update(cambios).eq('id', r.id).eq('atraso_estado', 'pendiente');
  if (error) return Response.json({ ok: false, error: 'No se pudo guardar.' }, { status: 500 });

  if (aprobar) {
    try {
      const KEY = process.env.RESEND_API_KEY, FROM = process.env.RESEND_FROM_EMAIL;
      if (KEY && FROM) {
        const { data: p } = await db.from('proyectos').select('referencia_odoo, cliente, nombre, areas').eq('id', r.proyecto_id).maybeSingle();
        const obra = [p?.referencia_odoo, p?.cliente || p?.nombre].filter(Boolean).join(' · ');
        const area = (p?.areas || []).find(a => a.id === r.area_id)?.nombre || '';
        const cant = r.m2 != null ? `${Number(r.m2).toLocaleString('es-DO')} m²` : (r.rollos != null ? `${r.rollos} rollos` : '');
        const fmt = (d) => d.split('-').reverse().join('/');
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: ['lhenriquez@supertechos.com.do'],
            cc: ['mmartinez@supertechos.com.do'],
            subject: `Reporte atrasado aprobado · ${obra} · ${r.atraso_dias} días`,
            html: `<div style="font-family:Arial,sans-serif;font-size:14px">
              <p><b>${quien}</b> aprobó un reporte de avance con <b>${r.atraso_dias} días de atraso</b>.</p>
              <table style="border-collapse:collapse;font-size:13px">
                <tr><td style="padding:3px 10px 3px 0;color:#666">Obra</td><td>${obra}</td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#666">Área</td><td>${area}</td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#666">Fecha del avance</td><td>${fmt(r.fecha)}</td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#666">Cantidad</td><td>${cant}</td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#666">Reportó</td><td>${r.supervisor || ''}</td></tr>
                <tr><td style="padding:3px 10px 3px 0;color:#666">Motivo del atraso</td><td>${r.atraso_motivo || '(sin motivo)'}</td></tr>
                ${nota ? `<tr><td style="padding:3px 10px 3px 0;color:#666">Nota de aprobación</td><td>${nota}</td></tr>` : ''}
              </table>
              <p style="color:#666">${mesCerrado ? `El mes del avance ya estaba cerrado: cuenta en la producción de ${fmt(hoy).slice(3)}.` : 'Cuenta en la producción del mes del avance.'} Entra a la nómina del corte abierto.</p>
            </div>`,
          }),
        });
      }
    } catch (e) { console.warn('aviso atraso:', e?.message); }
  }
  return Response.json({ ok: true, estado: cambios.atraso_estado, mesCerrado, fechaProduccion: cambios.fecha_produccion || null });
}
