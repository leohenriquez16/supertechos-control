// app/api/cron/reporte-diario-obras/route.js
// v8.56.0: además del reporte de obras, el correo lleva el SEMÁFORO DE NÓMINA del corte
// abierto (lo mismo que ve Miguel antes de cerrar), para arreglar los huecos durante la
// quincena y no el día del pago.
// v8.30.3: Cron diario 10:30 AM RD — reporta a la gerencia cuáles obras EN
// EJECUCIÓN no tienen reporte de avance del día anterior (fecha tope: 10:30 am
// del día siguiente). Si ayer fue domingo, se evalúa el sábado.
//
// v8.55.2: la obra se exige por el estado que TENÍA el día evaluado, no por el
// que tiene a la hora del correo. Antes, una obra puesta en ejecución hoy salía
// como "no reportó ayer" — ayer no había arrancado — y la salida racional era
// esperar a que pasara el correo para marcarla: 63% de los cambios a ejecución
// de los últimos 6 meses ocurren a las 10:30 o después, 37 de ellos en la hora
// siguiente al envío. Ahora:
//   · entró en ejecución después del día evaluado → no se exige (va aparte)
//   · hubo jornada y no hay reporte → falta real (es lo que cuenta el asunto)
//   · sin jornada y sin reporte → pregunta: ¿se trabajó o está parada?
// El "desde cuándo está en ejecución" sale de historial_estados (existe desde
// abr-2026); si una obra no tiene historial, se cae a fecha_inicio.
//
// Destinatarios: env ALERTA_REPORTES_EMAILS (coma-separados) o por defecto
// Leonardo + Miguel; además incluye automáticamente el email de la ficha de
// Erisdania (o de quien se agregue a la lista) cuando esté lleno en Personal.
// Protegido por `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía solo).

import { createClient } from '@supabase/supabase-js';
import { chequearNomina } from '../../../../lib/helpers/chequeoNomina';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const addDias = (fecha, n) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, motivo: 'no autorizado' }, { status: 401 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM_EMAIL;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return Response.json({ ok: false, motivo: 'faltan RESEND_API_KEY / RESEND_FROM_EMAIL' }, { status: 500 });
  }

  // Día evaluado: ayer; si ayer fue domingo → sábado.
  const hoy = hoyRD();
  let diaEval = addDias(hoy, -1);
  if (new Date(diaEval + 'T12:00:00').getDay() === 0) diaEval = addDias(diaEval, -1);

  // Obras en ejecución + reportes y jornadas del día evaluado + personal (nombres/emails)
  const [{ data: obras }, { data: reps }, { data: jors }, { data: personal }] = await Promise.all([
    supabase.from('proyectos').select('id, cliente, nombre, referencia_odoo, supervisor_id, maestro_id, fecha_inicio').eq('estado', 'en_ejecucion').eq('archivado', false),
    supabase.from('reportes').select('proyecto_id').eq('fecha', diaEval),
    supabase.from('jornadas').select('proyecto_id').eq('fecha', diaEval),
    supabase.from('personal').select('id, nombre, email'),
  ]);
  const nombreDe = (id) => (personal || []).find(p => p.id === id)?.nombre || '—';
  const conReporte = new Set((reps || []).map(r => r.proyecto_id));
  const conJornada = new Set((jors || []).map(j => j.proyecto_id));

  // v8.55.2: ¿desde cuándo está en ejecución cada obra? Último cambio a
  // 'en_ejecucion' en el historial; si no hay historial, fecha_inicio.
  const ids = (obras || []).map(o => o.id);
  let enEjecDesde = {};   // proyecto_id → ISO del cambio a ejecución
  if (ids.length) {
    const { data: hist } = await supabase.from('historial_estados')
      .select('proyecto_id, created_at')
      .in('proyecto_id', ids).eq('estado_nuevo', 'en_ejecucion')
      .order('created_at', { ascending: true });
    (hist || []).forEach(h => { enEjecDesde[h.proyecto_id] = h.created_at; });  // se queda el más reciente
  }
  // Fin del día evaluado en hora RD (UTC-4): todo cambio posterior arrancó después.
  const finDiaEval = new Date(`${diaEval}T23:59:59-04:00`);
  const fechaRD = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date(iso));
  const horaRD = (iso) => new Date(iso).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit' });
  const arrancoDespues = (o) => {
    const h = enEjecDesde[o.id];
    if (h) return new Date(h) > finDiaEval;
    if (o.fecha_inicio) return o.fecha_inicio > diaEval;
    return false;   // sin dato: se comporta como antes y se exige
  };

  // Tres grupos, en vez de una sola lista que mezclaba cosas distintas.
  const recienArrancadas = (obras || []).filter(arrancoDespues);
  const activasEseDia = (obras || []).filter(o => !arrancoDespues(o));
  const sinReporte = activasEseDia.filter(o => !conReporte.has(o.id));
  const trabajaronSinReporte = sinReporte.filter(o => conJornada.has(o.id));
  const sinJornadaNiReporte = sinReporte.filter(o => !conJornada.has(o.id));
  const faltantes = sinReporte;

  // Último reporte de cada obra faltante (ventana 21 días)
  let ultimoRep = {};
  if (faltantes.length) {
    const { data: ult } = await supabase.from('reportes')
      .select('proyecto_id, fecha')
      .in('proyecto_id', faltantes.map(o => o.id))
      .gte('fecha', addDias(diaEval, -21));
    (ult || []).forEach(r => { if (!ultimoRep[r.proyecto_id] || r.fecha > ultimoRep[r.proyecto_id]) ultimoRep[r.proyecto_id] = r.fecha; });
  }

  // Destinatarios: env o defaults + email de Erisdania si su ficha lo tiene
  const envList = String(process.env.ALERTA_REPORTES_EMAILS || '').split(/[,;\s]+/).filter(Boolean);
  const destinatarios = envList.length ? envList : ['lhenriquez@supertechos.com.do', 'mmartinez@supertechos.com.do', 'eperez@supertechos.com.do'];
  (personal || []).filter(p => /erisdania/i.test(p.nombre || '') && p.email && p.email.includes('@'))
    .forEach(p => { if (!destinatarios.includes(p.email)) destinatarios.push(p.email); });

  const etiqueta = (o) => [o.referencia_odoo, o.cliente || o.nombre].filter(Boolean).join(' · ');
  const TD = 'border:1px solid #ddd;padding:6px';
  const filaObra = (o) => `
    <tr>
      <td style="${TD}">${etiqueta(o)}</td>
      <td style="${TD}">${nombreDe(o.supervisor_id)}</td>
      <td style="${TD}">${nombreDe(o.maestro_id)}</td>
      <td style="${TD};text-align:center">${ultimoRep[o.id] || 'sin reportes (21d)'}</td>
    </tr>`;
  const tabla = (titulo, color, obrasLista, pie) => !obrasLista.length ? '' : `
    <h3 style="color:${color};margin:20px 0 6px">${titulo} (${obrasLista.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f3f3">
        <th style="${TD};text-align:left">Obra</th>
        <th style="${TD};text-align:left">Supervisor</th>
        <th style="${TD};text-align:left">Maestro</th>
        <th style="${TD}">Último reporte</th>
      </tr>${obrasLista.map(filaObra).join('')}
    </table>
    <p style="font-size:12px;color:#666;margin:6px 0 0">${pie}</p>`;

  // v8.55.2: las que arrancaron después del día evaluado no son falta; se listan
  // para que se vea el movimiento del día y para que marcarlas temprano no cueste.
  const seccionArrancadas = !recienArrancadas.length ? '' : `
    <h3 style="color:#2563eb;margin:20px 0 6px">🚀 Arrancaron después del ${fmt(diaEval)} (${recienArrancadas.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f3f3">
        <th style="${TD};text-align:left">Obra</th>
        <th style="${TD};text-align:left">Supervisor</th>
        <th style="${TD}">En ejecución desde</th>
      </tr>
      ${recienArrancadas.map(o => {
        const h = enEjecDesde[o.id];
        return `<tr>
          <td style="${TD}">${etiqueta(o)}</td>
          <td style="${TD}">${nombreDe(o.supervisor_id)}</td>
          <td style="${TD};text-align:center">${h ? `${fechaRD(h)} ${horaRD(h)}` : (o.fecha_inicio || '—')}</td>
        </tr>`;
      }).join('')}
    </table>
    <p style="font-size:12px;color:#666;margin:6px 0 0">No se les pide reporte del ${fmt(diaEval)}: ese día todavía no habían arrancado.</p>`;

  // v8.31.1: proyectos APROBADOS con información incompleta (regla: un proyecto
  // aprobado en Odoo queda completo en el ERP el mismo día — KPI de Miguel/Erisdania).
  const { data: aprob } = await supabase.from('proyectos')
    .select('id, cliente, nombre, referencia_odoo, ubicacion_lat, ubicacion_lng, contacto_principal_id, contacto_cliente_nombre, contacto_cliente_telefono, contacto_cliente_email, areas, sistema_id, valor_cotizacion, supervisor_id, maestro_id')
    .eq('estado', 'aprobado').eq('archivado', false);
  const sidsAll = [...new Set((aprob || []).flatMap(p => [p.sistema_id, ...((p.areas || []).map(a => a.sistemaId))]).filter(Boolean))];
  let sistemasMap = {};
  if (sidsAll.length) {
    const { data: ss } = await supabase.from('sistemas').select('id, data').in('id', sidsAll);
    (ss || []).forEach(s => { sistemasMap[s.id] = s; });
  }
  const faltasDe = (p) => {
    const f = [];
    if (!((p.cliente || p.nombre || '').trim())) f.push('cliente');
    const legacy = `${p.contacto_cliente_nombre || ''}${p.contacto_cliente_telefono || ''}${p.contacto_cliente_email || ''}`.trim();
    if (!p.contacto_principal_id && !legacy) f.push('contacto');
    if (p.ubicacion_lat == null || p.ubicacion_lng == null) f.push('ubicación');
    const areas = p.areas || [];
    if (areas.length === 0) f.push('áreas');
    else if (areas.some(a => !(Number(a.m2) > 0))) f.push('m² por área');
    const sids = [...new Set([p.sistema_id, ...areas.map(a => a.sistemaId)].filter(Boolean))];
    if (!sids.length) f.push('sistema');
    else if (sids.some(sid => !(sistemasMap[sid]?.data?.tareas?.length > 0))) f.push('tareas del sistema');
    if (!(Number(p.valor_cotizacion) > 0)) f.push('valor cotización');
    if (!p.supervisor_id) f.push('supervisor');
    if (!p.maestro_id) f.push('maestro');
    return f;
  };
  const incompletos = (aprob || []).map(p => ({ p, faltas: faltasDe(p) })).filter(x => x.faltas.length);
  const seccionProyectos = incompletos.length === 0 ? '' : `
    <h3 style="color:#D71920;margin-top:20px">🧩 Proyectos aprobados con información incompleta (${incompletos.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f3f3"><th style="border:1px solid #ddd;padding:6px;text-align:left">Proyecto</th><th style="border:1px solid #ddd;padding:6px;text-align:left">Le falta</th></tr>
      ${incompletos.map(({ p, faltas }) => `<tr><td style="border:1px solid #ddd;padding:6px">${[p.referencia_odoo, p.cliente || p.nombre].filter(Boolean).join(' · ')}</td><td style="border:1px solid #ddd;padding:6px">${faltas.join(', ')}</td></tr>`).join('')}
    </table>
    <p style="font-size:12px;color:#666">Regla: aprobado en Odoo = completo en el ERP el mismo día. Cuenta para el KPI "Proyectos creados completos".</p>`;

  // v8.56.0: SEMÁFORO DE NÓMINA — lo mismo que ve Miguel en el corte abierto, pero por
  // correo cada mañana, para que los huecos se arreglen durante la quincena y no el día
  // del pago. Sin montos (el cálculo del corte vive en la app): se omiten las revisiones
  // que dependen del monto por persona.
  let seccionNomina = '';
  try {
    const { data: corteAbierto } = await supabase.from('cortes_nomina')
      .select('id, fecha_inicio, fecha_fin').eq('estado', 'abierto')
      .order('fecha_fin', { ascending: false }).limit(1).maybeSingle();
    if (corteAbierto) {
      const corteCamel = { fechaInicio: corteAbierto.fecha_inicio, fechaFin: corteAbierto.fecha_fin };
      const [{ data: repsCorte }, { data: jorsCorte }, { data: obrasTodas }, { data: costos }] = await Promise.all([
        supabase.from('reportes').select('id, proyecto_id, area_id, tarea_id, fecha, m2, excluir_nomina')
          .gte('fecha', corteCamel.fechaInicio).lte('fecha', corteCamel.fechaFin),
        supabase.from('jornadas').select('proyecto_id, fecha, personas_presentes_ids')
          .gte('fecha', corteCamel.fechaInicio).lte('fecha', corteCamel.fechaFin),
        supabase.from('proyectos').select('id, cliente, nombre, referencia_odoo, maestro_id, areas, modo_pago_mano_obra, precio_m2_fijo_maestro, precios_tareas_m2, precios_mano_obra_tareas, maestros_tareas, paquetes_pago').eq('archivado', false),
        supabase.from('costos_dia_proyecto').select('proyecto_id, persona_id, costo_dia, precio_m2, modo_pago, monto_ajustado'),
      ]);
      const costosDia = {};
      (costos || []).forEach(c => { (costosDia[c.proyecto_id] = costosDia[c.proyecto_id] || {})[c.persona_id] = { costoDia: c.costo_dia, precioM2: c.precio_m2, modoPago: c.modo_pago, montoAjustado: c.monto_ajustado }; });
      const chequeo = chequearNomina({
        corte: corteCamel,
        conMontos: false,
        data: {
          personal: (personal || []).map(p => ({ id: p.id, nombre: p.nombre, banco: p.banco, bancoNumeroCuenta: p.banco_numero_cuenta })),
          proyectos: (obrasTodas || []).map(p => ({
            id: p.id, cliente: p.cliente, nombre: p.nombre, referenciaOdoo: p.referencia_odoo,
            maestroId: p.maestro_id, areas: p.areas || [], modoPagoManoObra: p.modo_pago_mano_obra,
            precioM2FijoMaestro: p.precio_m2_fijo_maestro, preciosTareasM2: p.precios_tareas_m2,
            preciosManoObraTareas: p.precios_mano_obra_tareas, maestrosTareas: p.maestros_tareas,
            paquetesPago: p.paquetes_pago,
          })),
          reportes: (repsCorte || []).map(r => ({ id: r.id, proyectoId: r.proyecto_id, areaId: r.area_id, tareaId: r.tarea_id, fecha: r.fecha, m2: r.m2, excluirNomina: r.excluir_nomina })),
        },
        jornadas: (jorsCorte || []).map(j => ({ proyectoId: j.proyecto_id, fecha: j.fecha, personasPresentesIds: j.personas_presentes_ids || [] })),
        costosDia,
      });
      const periodo = `${fmt(corteCamel.fechaInicio)} al ${fmt(corteCamel.fechaFin)}`;
      seccionNomina = chequeo.alertas.length === 0
        ? `<h3 style="color:#15803d;margin-top:20px">💸 Nómina lista — corte del ${periodo}</h3>
           <p style="font-size:13px;color:#666">Nada pendiente para calcular el pago.</p>`
        : `<h3 style="color:${chequeo.bloqueantes ? '#D71920' : '#b45309'};margin-top:20px">💸 Nómina del corte ${periodo}: ${chequeo.bloqueantes} por arreglar${chequeo.avisos ? ` · ${chequeo.avisos} aviso${chequeo.avisos === 1 ? '' : 's'}` : ''}</h3>
           <p style="font-size:13px">Si el corte se cierra así, alguien cobra de menos o de más:</p>
           <table style="border-collapse:collapse;width:100%;font-size:13px">
             <tr style="background:#f3f3f3"><th style="border:1px solid #ddd;padding:6px;text-align:left">Qué pasa</th><th style="border:1px solid #ddd;padding:6px;text-align:left">Qué hay que hacer</th></tr>
             ${chequeo.alertas.slice(0, 25).map(a => `<tr><td style="border:1px solid #ddd;padding:6px">${a.severidad === 'bloqueante' ? '🔴' : '🟡'} ${a.titulo}</td><td style="border:1px solid #ddd;padding:6px;color:#666">${a.accion}</td></tr>`).join('')}
           </table>
           ${chequeo.alertas.length > 25 ? `<p style="font-size:12px;color:#666">…y ${chequeo.alertas.length - 25} más en el ERP.</p>` : ''}`;
    }
  } catch (e) {
    seccionNomina = '';
  }

  const todoBien = faltantes.length === 0;
  const asunto = todoBien
    ? `✅ Reportes de obra al día — ${fmt(diaEval)}`
    : trabajaronSinReporte.length
      ? `⚠️ ${trabajaronSinReporte.length} obra${trabajaronSinReporte.length !== 1 ? 's' : ''} ${trabajaronSinReporte.length !== 1 ? 'trabajaron' : 'trabajó'} sin reportar — ${fmt(diaEval)}`
      : `❓ ${sinJornadaNiReporte.length} obra${sinJornadaNiReporte.length !== 1 ? 's' : ''} sin jornada ni reporte — ${fmt(diaEval)}`;

  const pie = `<p style="font-size:12px;color:#666;margin-top:14px">
      Se evalúa el estado que la obra tenía el ${fmt(diaEval)}: la que arrancó después no se cuenta. Fecha tope: 10:30 am del día siguiente.<br>
      — ERP Super Techos · ${activasEseDia.length - faltantes.length}/${activasEseDia.length} obras que ya estaban en ejecución sí reportaron</p>`;

  const html = todoBien
    ? `<div style="font-family:Arial,sans-serif;max-width:680px">
        <h2 style="color:#15803d">✅ Todas las obras en ejecución reportaron el ${fmt(diaEval)}</h2>
        <p style="font-size:13px;color:#666">${activasEseDia.length} obra${activasEseDia.length !== 1 ? 's' : ''} en ejecución ese día, todas con reporte.</p>
        ${seccionArrancadas}${seccionProyectos}${seccionNomina}${pie}
      </div>`
    : `<div style="font-family:Arial,sans-serif;max-width:680px">
        <h2 style="color:#D71920">Reporte de obra del ${fmt(diaEval)}</h2>
        ${tabla('🚨 Trabajaron y no reportaron', '#D71920', trabajaronSinReporte,
                'Hubo jornada registrada y no hay reporte de avance. Es la falta: llamar al supervisor.')}
        ${tabla('❓ Sin jornada ni reporte', '#b45309', sinJornadaNiReporte,
                '¿No se trabajó, o no se registró? Si la obra no puede avanzar, márquenla "parado" con su razón.')}
        ${seccionArrancadas}${seccionProyectos}${seccionNomina}${pie}
      </div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: destinatarios, subject: asunto, html }),
  });
  const data = await resp.json();

  return Response.json({
    ok: resp.ok, diaEvaluado: diaEval, obrasEnEjecucion: (obras || []).length,
    activasEseDia: activasEseDia.length, arrancaronDespues: recienArrancadas.length,
    trabajaronSinReporte: trabajaronSinReporte.length, sinJornadaNiReporte: sinJornadaNiReporte.length,
    sinReporte: faltantes.length, destinatarios, resendId: data?.id || null,
    ...(resp.ok ? {} : { motivo: data?.message || `Resend HTTP ${resp.status}` }),
  }, { status: resp.ok ? 200 : 502 });
}
