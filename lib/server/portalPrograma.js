// v8.59.0 — PORTAL DEL CLIENTE de un programa multi-sitio (Fase 2).
// Lógica del servidor de /api/programa/[codigo]: validar la clave, armar lo que el cliente
// ve y aplicar lo que el cliente hace (luz verde, supervisor, aprobar o rechazar cotización).
//
// El cliente NUNCA toca la base: la API lee con service_role y solo devuelve lo que este
// archivo decide mostrar. Nada de costos, márgenes, nómina ni notas internas.

import crypto from 'node:crypto';
import { etapaDeLocacion, resumenPrograma, pendientesDelCliente, ETAPAS, fechasPorEtapa, enEtapaDesde } from '../helpers/programaSites.js';

/** Hash de la clave del portal. Se guarda el hash, nunca la clave. */
export const hashClave = (clave) =>
  crypto.createHash('sha256').update(`portal-programa:${String(clave || '').trim()}`).digest('hex');

/** Compara en tiempo constante para no filtrar la clave por tiempos de respuesta. */
export function claveValida(clave, hashGuardado) {
  if (!clave || !hashGuardado) return false;
  const a = Buffer.from(hashClave(clave), 'hex');
  const b = Buffer.from(String(hashGuardado), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Clave legible para dictar por teléfono: 3 grupos sin letras confundibles. */
export function generarClave() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += abc[bytes[i] % abc.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/**
 * Lo que el cliente ve de cada locación. Solo campos de cara al cliente.
 * @param {object} row   fila de programa_locaciones (snake_case)
 * @param {object} obra  fila de proyectos (snake_case) o null
 * @param {array}  historialObra  filas de historial_estados de la obra (snake_case)
 */
export function locacionParaCliente(row, obra, historialObra = []) {
  const loc = {
    luzVerde: !!row.luz_verde, levantadoAt: row.levantado_at,
    cotizacionRef: row.cotizacion_ref, cotizacionAprobada: !!row.cotizacion_aprobada,
  };
  const etapa = etapaDeLocacion(loc, { obra: obra ? { estado: obra.estado } : null });
  const fechas = fechasPorEtapa({
    createdAt: row.created_at, luzVerdeAt: row.luz_verde_at, levantadoAt: row.levantado_at,
    cotizadoAt: row.cotizado_at, cotizacionAprobadaAt: row.cotizacion_aprobada_at,
  }, (historialObra || []).map(h => ({ estadoNuevo: h.estado_nuevo, fecha: h.created_at })));
  const enEtapa = enEtapaDesde(etapa, fechas);
  return {
    id: row.id,
    nombre: row.nombre,
    codigoUt: row.codigo_ut || '',
    direccion: row.direccion || '',
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    tipoTrabajo: row.tipo_trabajo || 'techo',
    etapa,
    luzVerde: !!row.luz_verde,
    luzVerdeAt: row.luz_verde_at,
    luzVerdePor: row.luz_verde_por || '',
    fechaVisita: row.fecha_visita || null,
    horaVisita: row.hora_visita || '',
    supervisorClienteNombre: row.supervisor_cliente_nombre || '',
    supervisorClienteTelefono: row.supervisor_cliente_telefono || '',
    supervisorClienteEmail: row.supervisor_cliente_email || '',
    cotizacionRef: row.cotizacion_ref || '',
    cotizacionMonto: row.cotizacion_monto != null ? Number(row.cotizacion_monto) : null,
    cotizacionAprobada: !!row.cotizacion_aprobada,
    cotizacionAprobadaAt: row.cotizacion_aprobada_at,
    levantadoAt: row.levantado_at,
    inicioObra: obra?.fecha_inicio || null,
    cotizadoAt: row.cotizado_at || null,
    fechasEtapas: fechas,
    etapaDesde: enEtapa.desde,
    diasEnEtapa: enEtapa.dias,
    actualizado: row.updated_at,
  };
}

/** Respuesta completa del portal: programa, resumen, pendientes del cliente y locaciones. */
export function armarPortal(programa, filas = [], obrasPorId = new Map(), historialPorObra = new Map()) {
  const locaciones = filas
    .map(r => locacionParaCliente(r, r.proyecto_id ? obrasPorId.get(r.proyecto_id) : null, r.proyecto_id ? (historialPorObra.get(r.proyecto_id) || []) : []))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const pend = pendientesDelCliente(locaciones);
  return {
    programa: {
      nombre: programa.nombre,
      cliente: programa.cliente_nombre || '',
      fechaMeta: programa.fecha_meta || null,
    },
    etapas: ETAPAS.map(e => ({ id: e.id, label: e.label, detalle: e.detalle, deQuien: e.deQuien })),
    resumen: resumenPrograma(locaciones, { fechaMeta: programa.fecha_meta }),
    pendientes: {
      sinLuzVerde: pend.sinLuzVerde.map(l => l.id),
      cotizacionesPorAprobar: pend.cotizacionesPorAprobar.map(l => l.id),
      sinSupervisor: pend.sinSupervisor.map(l => l.id),
    },
    locaciones,
  };
}

const limpio = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const emailValido = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Traduce una acción del cliente a los cambios en programa_locaciones.
 * @returns {{ ok:true, cambios:object, resumen:string } | { ok:false, error:string }}
 */
export function aplicarAccionCliente(accion, datos = {}, loc = {}, quien = '') {
  const autor = limpio(quien, 80) || 'Cliente (portal)';
  const ahora = new Date().toISOString();
  const marca = `[${ahora.slice(0, 10)} · ${autor}]`;

  // 'coordinar' (y el nombre viejo 'luz_verde'): el propietario autorizó y se fijó el día.
  if (accion === 'coordinar' || accion === 'luz_verde') {
    const fecha = limpio(datos.fecha, 10);
    const hora = limpio(datos.hora, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) return { ok: false, error: 'Pon el día coordinado para la visita.' };
    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { ok: false, error: 'La hora no es válida.' };
    if (loc.levantado_at) return { ok: false, error: 'Esta locación ya se levantó.' };
    const cambio = loc.luz_verde && loc.fecha_visita && loc.fecha_visita !== fecha;
    return {
      ok: true,
      cambios: {
        luz_verde: true, luz_verde_at: loc.luz_verde_at || ahora, luz_verde_por: `${autor} (portal)`,
        fecha_visita: fecha, hora_visita: hora || null,
        etapa_desde: loc.luz_verde ? loc.etapa_desde : ahora, updated_at: ahora,
      },
      resumen: `${cambio ? 'cambió la visita de levantamiento al' : 'coordinó la visita de levantamiento para el'} ${fecha}${hora ? ` a las ${hora}` : ''}`,
    };
  }

  if (accion === 'supervisor') {
    const nombre = limpio(datos.nombre, 80);
    const telefono = limpio(datos.telefono, 30);
    const email = limpio(datos.email, 120).toLowerCase();
    if (!nombre) return { ok: false, error: 'Escribe el nombre del supervisor.' };
    if (!telefono && !email) return { ok: false, error: 'Pon al menos un teléfono o un correo del supervisor.' };
    if (!emailValido(email)) return { ok: false, error: 'El correo del supervisor no es válido.' };
    return {
      ok: true,
      cambios: { supervisor_cliente_nombre: nombre, supervisor_cliente_telefono: telefono || null, supervisor_cliente_email: email || null, updated_at: ahora },
      resumen: `asignó supervisor: ${nombre}${telefono ? ` · ${telefono}` : ''}`,
    };
  }

  if (accion === 'aprobar_cotizacion') {
    if (!loc.cotizacion_ref) return { ok: false, error: 'Esta locación todavía no tiene cotización.' };
    if (loc.cotizacion_aprobada) return { ok: false, error: 'Esta cotización ya está aprobada.' };
    return {
      ok: true,
      cambios: { cotizacion_aprobada: true, cotizacion_aprobada_at: ahora, etapa_desde: ahora, updated_at: ahora,
        notas: `${loc.notas ? loc.notas + '\n' : ''}${marca} Aprobó la cotización ${loc.cotizacion_ref}.` },
      resumen: `aprobó la cotización ${loc.cotizacion_ref}`,
    };
  }

  if (accion === 'rechazar_cotizacion') {
    if (!loc.cotizacion_ref) return { ok: false, error: 'Esta locación todavía no tiene cotización.' };
    const motivo = limpio(datos.motivo, 600);
    if (!motivo) return { ok: false, error: 'Cuéntanos qué hay que cambiar en la cotización.' };
    return {
      ok: true,
      cambios: { updated_at: ahora,
        notas: `${loc.notas ? loc.notas + '\n' : ''}${marca} Pidió cambios a la cotización ${loc.cotizacion_ref}: ${motivo}` },
      resumen: `pidió cambios a la cotización ${loc.cotizacion_ref}: ${motivo}`,
    };
  }

  if (accion === 'comentario') {
    const texto = limpio(datos.texto, 1000);
    if (!texto) return { ok: false, error: 'Escribe el comentario.' };
    return {
      ok: true,
      cambios: { updated_at: ahora, notas: `${loc.notas ? loc.notas + '\n' : ''}${marca} ${texto}` },
      resumen: `comentó: ${texto}`,
    };
  }

  return { ok: false, error: 'Acción no reconocida.' };
}

// --- Ficha de un sitio (v8.59.1) -------------------------------------------------------
// Lo que el cliente ve al abrir una locación: sus datos, la línea de tiempo y, si ya se
// levantó, las áreas medidas y las fotos. NO salen notas internas del levantamiento
// (riesgos de ejecución, oportunidades de venta cruzada, notas del levantador).

const ETIQUETA_FOTO = {
  general: 'Vista general', overview: 'Vista general', detail: 'Detalle', detalle: 'Detalle',
  damage: 'Daño', dano: 'Daño', leak: 'Filtración', drain: 'Desagüe', penetration: 'Penetración',
};
export const etiquetaFoto = (tipo) => ETIQUETA_FOTO[String(tipo || '').toLowerCase()] || '';

/**
 * @param {object} visita   fila de surveys.visits (o null)
 * @param {array}  areas    filas de surveys.areas
 * @param {array}  fotos    [{ url, caption, photo_type, taken_at, is_critical }] con URL ya firmada
 */
export function levantamientoParaCliente(visita, areas = [], fotos = []) {
  if (!visita) return null;
  const areasCliente = areas
    .filter(a => a.to_be_treated !== false)
    .map(a => ({
      nombre: a.name || `Área ${a.area_number || ''}`.trim(),
      m2: Number(a.net_area_m2 || a.gross_area_m2 || 0),
    }))
    .filter(a => a.m2 > 0 || a.nombre);
  const totalM2 = areasCliente.reduce((s, a) => s + (a.m2 || 0), 0) || Number(visita.total_measured_m2 || 0);
  return {
    fecha: visita.checkin_at || visita.created_at || null,
    completado: !!visita.is_completed,
    sistemaRecomendado: visita.recommended_system || '',
    diasEstimados: visita.estimated_days || null,
    areas: areasCliente,
    totalM2: Math.round(totalM2 * 100) / 100,
    fotos: fotos.map(f => ({
      url: f.url,
      titulo: f.caption || etiquetaFoto(f.photo_type) || 'Foto',
      critica: !!f.is_critical,
      tomadaAt: f.taken_at || null,
    })),
  };
}

// --- Documentos (OC, cotización, informe…) ------------------------------------------
export const MIME_PERMITIDOS = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/msword': 'doc',
};
export const MAX_DOC_BYTES = 15 * 1024 * 1024;
const TIPOS_DOC_OK = ['oc', 'cotizacion', 'autorizacion', 'informe', 'garantia', 'otro'];

/** Valida un archivo que el cliente sube al portal. */
export function validarDocumento({ tipo, nombre, mime, tamano }) {
  if (!TIPOS_DOC_OK.includes(tipo)) return 'Elige qué tipo de documento es.';
  if (!nombre) return 'El archivo no tiene nombre.';
  if (!MIME_PERMITIDOS[mime]) return 'Solo se aceptan PDF, imágenes (JPG, PNG), Excel o Word.';
  if (!(tamano > 0)) return 'El archivo está vacío.';
  if (tamano > MAX_DOC_BYTES) return 'El archivo pasa de 15 MB.';
  return null;
}

// La ruta del archivo vive en el helper puro (lo usa también el ERP en el navegador).
export { rutaDocumento } from '../helpers/programaSites.js';
