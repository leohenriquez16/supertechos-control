// v8.57.0 — SEMÁFORO "LISTO PARA NÓMINA".
// Detecta ANTES de cerrar el corte lo que impide que el ERP calcule bien el pago.
// Nace del corte 17-30 sep 2026: 6 obras con reportes y CERO jornadas (el que cobra
// por día no cobraba), personas sin costo/día en su obra, y gente con producción a la
// que el cálculo le daba RD$0 (Cristian: reportó 376 m² en una obra por TAREA sin ser
// maestro de ninguna) — mientras en Odoo sí se le facturaban RD$60,100.
//
// Puro y sin dependencias: recibe lo que ya tiene cargado la vista de nómina.

export const SEVERIDADES = { bloqueante: 2, aviso: 1 };

const etiquetaObra = (p) => [p?.referenciaOdoo, p?.cliente || p?.nombre].filter(Boolean).join(' · ') || p?.id || '—';
const enRango = (fecha, corte) => fecha >= corte.fechaInicio && fecha <= corte.fechaFin;
const MODOS_CON_DIA = ['dia', 'dia_m2'];

/**
 * @param {object} p
 * @param {object} p.corte          { fechaInicio, fechaFin }
 * @param {object} p.data           { proyectos, reportes, personal }
 * @param {array}  p.jornadas       jornadas del periodo
 * @param {array}  p.detalle        filas calculadas (preview del corte)
 * @param {object} p.costosDia      { proyectoId: { personaId: {costoDia, precioM2, modoPago} } }
 * @returns {{alertas: array, bloqueantes: number, avisos: number, listo: boolean}}
 */
export function chequearNomina({ corte, data, jornadas = [], detalle = [], costosDia = {} }) {
  const proyectos = data?.proyectos || [];
  const personal = data?.personal || [];
  const reportes = (data?.reportes || []).filter(r => enRango(r.fecha, corte) && !r.excluirNomina);
  const porId = new Map(proyectos.map(p => [p.id, p]));
  const persona = (id) => personal.find(x => x.id === id);
  const alertas = [];
  const add = (a) => alertas.push(a);

  // Obras tocadas en el periodo (por reporte o por jornada)
  const obrasReporte = new Set(reportes.map(r => r.proyectoId));
  const obrasJornada = new Set(jornadas.map(j => j.proyectoId));
  const obras = [...new Set([...obrasReporte, ...obrasJornada])].map(id => porId.get(id)).filter(Boolean);

  // 1. Reportes sin ninguna jornada en la obra → quien cobra por día no cobra.
  obras.forEach(p => {
    if (obrasReporte.has(p.id) && !obrasJornada.has(p.id)) {
      const n = reportes.filter(r => r.proyectoId === p.id).length;
      add({
        tipo: 'obra_sin_jornadas', severidad: 'bloqueante', obraId: p.id, obra: etiquetaObra(p),
        titulo: `${etiquetaObra(p)}: ${n} reporte${n === 1 ? '' : 's'} y ninguna jornada`,
        detalle: 'Nadie abrió jornada en esta obra durante el corte. Quien cobre por día no va a cobrar.',
        accion: 'Abrir las jornadas de los días trabajados.',
      });
    }
  });

  // 2. Jornadas sin ningún reporte → se paga el día sin avance que lo respalde.
  obras.forEach(p => {
    if (obrasJornada.has(p.id) && !obrasReporte.has(p.id)) {
      const dias = new Set(jornadas.filter(j => j.proyectoId === p.id).map(j => j.fecha)).size;
      add({
        tipo: 'obra_sin_reportes', severidad: 'aviso', obraId: p.id, obra: etiquetaObra(p),
        titulo: `${etiquetaObra(p)}: ${dias} día${dias === 1 ? '' : 's'} trabajados sin un solo reporte`,
        detalle: 'Se pagarían días sin avance registrado.',
        accion: 'Pedir el reporte de avance al maestro.',
      });
    }
  });

  // 3. Obra sin la configuración de pago que su modo exige.
  obras.forEach(p => {
    const modo = p.modoPagoManoObra;
    const vacio = (o) => !o || Object.keys(o).length === 0;
    let falta = null;
    if (!modo) falta = 'no tiene definido cómo se paga la mano de obra';
    else if (modo === 'm2_fijo' && !(Number(p.precioM2FijoMaestro) > 0)) falta = 'no tiene precio por m² del maestro';
    else if (modo === 'm2' && vacio(p.preciosTareasM2)) falta = 'no tiene precios por tarea (m²)';
    else if (modo === 'tarea' && vacio(p.preciosManoObraTareas)) falta = 'no tiene precios de mano de obra por tarea';
    if (falta) {
      add({
        tipo: 'obra_sin_precios', severidad: 'bloqueante', obraId: p.id, obra: etiquetaObra(p),
        titulo: `${etiquetaObra(p)}: ${falta}`,
        detalle: 'Sin eso el ERP calcula RD$0 para esa obra.',
        accion: 'Configurar el pago de mano de obra en la ficha de la obra.',
      });
    }
  });

  // 4. Persona con jornada en obra que paga por día y sin costo/día configurado.
  const vistos = new Set();
  jornadas.forEach(j => {
    const p = porId.get(j.proyectoId);
    if (!p) return;
    (j.personasPresentesIds || []).forEach(pid => {
      const ov = costosDia?.[p.id]?.[pid] || {};
      const modo = ov.modoPago || p.modoPagoManoObra;
      if (!MODOS_CON_DIA.includes(modo)) return;
      if (Number(ov.costoDia) > 0) return;
      const k = `${p.id}__${pid}`;
      if (vistos.has(k)) return;
      vistos.add(k);
      add({
        tipo: 'persona_sin_costo_dia', severidad: 'bloqueante', obraId: p.id, obra: etiquetaObra(p), personaId: pid,
        titulo: `${persona(pid)?.nombre || pid} no tiene costo por día en ${etiquetaObra(p)}`,
        detalle: 'Trabajó en esa obra y la obra paga por día, así que cobraría RD$0.',
        accion: 'Poner su costo por día en la obra.',
      });
    });
  });

  // 5. Reporte cuyo m² no tiene a quién pagársele (ni tarea, ni área, ni obra con maestro).
  reportes.forEach(r => {
    const p = porId.get(r.proyectoId);
    if (!p) return;
    const area = (p.areas || []).find(a => a.id === r.areaId);
    const dePaquete = (p.paquetesPago || []).some(pk => pk.maestroId && (pk.tareaIds || []).includes(r.tareaId));
    const maestro = dePaquete || (p.maestrosTareas || {})[r.tareaId] || area?.maestroAreaId || p.maestroId;
    if (!maestro) {
      add({
        tipo: 'reporte_sin_maestro', severidad: 'bloqueante', obraId: p.id, obra: etiquetaObra(p), reporteId: r.id,
        titulo: `${etiquetaObra(p)}: avance del ${r.fecha} sin maestro asignado`,
        detalle: `${r.m2 || 0} m² que no se le pagan a nadie.`,
        accion: 'Asignar el maestro de la tarea, del área o de la obra.',
      });
    }
  });

  // 6. Trabajó (días o m²) y el cálculo le da RD$0 — el caso Cristian.
  const conMovimiento = new Map(); // personaId -> {dias, m2}
  jornadas.forEach(j => (j.personasPresentesIds || []).forEach(pid => {
    const v = conMovimiento.get(pid) || { dias: new Set(), m2: 0 };
    v.dias.add(j.fecha); conMovimiento.set(pid, v);
  }));
  reportes.forEach(r => {
    const p = porId.get(r.proyectoId);
    const area = (p?.areas || []).find(a => a.id === r.areaId);
    const pid = (p?.maestrosTareas || {})[r.tareaId] || area?.maestroAreaId || p?.maestroId;
    if (!pid) return;
    const v = conMovimiento.get(pid) || { dias: new Set(), m2: 0 };
    v.m2 += Number(r.m2) || 0; conMovimiento.set(pid, v);
  });
  const pagoPorPersona = {};
  detalle.forEach(d => { pagoPorPersona[d.personaId] = (pagoPorPersona[d.personaId] || 0) + (Number(d.montoTotal) || 0); });
  conMovimiento.forEach((v, pid) => {
    if ((pagoPorPersona[pid] || 0) > 0) return;
    const partes = [];
    if (v.dias.size) partes.push(`${v.dias.size} día${v.dias.size === 1 ? '' : 's'}`);
    if (v.m2 > 0) partes.push(`${Math.round(v.m2)} m²`);
    if (!partes.length) return;
    add({
      tipo: 'persona_en_cero', severidad: 'bloqueante', personaId: pid,
      titulo: `${persona(pid)?.nombre || pid} trabajó (${partes.join(' · ')}) y el corte le da RD$0`,
      detalle: 'Falta precio, costo por día o asignación de maestro en su obra.',
      accion: 'Revisar la configuración de pago de su obra.',
    });
  });

  // 7. Sin datos bancarios → se queda fuera del archivo de pago del banco.
  Object.keys(pagoPorPersona).forEach(pid => {
    if (!(pagoPorPersona[pid] > 0)) return;
    const p = persona(pid);
    if (!p) return;
    if (p.banco && p.bancoNumeroCuenta) return;
    add({
      tipo: 'sin_datos_banco', severidad: 'aviso', personaId: pid,
      titulo: `${p.nombre}: sin datos bancarios`,
      detalle: 'No va a entrar en el archivo de pago del banco.',
      accion: 'Completar banco, tipo de cuenta, número y titular en su ficha.',
    });
  });

  alertas.sort((a, b) => (SEVERIDADES[b.severidad] - SEVERIDADES[a.severidad]) || a.titulo.localeCompare(b.titulo));
  const bloqueantes = alertas.filter(a => a.severidad === 'bloqueante').length;
  return { alertas, bloqueantes, avisos: alertas.length - bloqueantes, listo: alertas.length === 0 };
}
