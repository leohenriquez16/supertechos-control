// v8.59.0 — PORTAL DEL CLIENTE de un programa multi-sitio (Fase 2).
// Lógica del servidor de /api/programa/[codigo]: validar la clave, armar lo que el cliente
// ve y aplicar lo que el cliente hace (luz verde, supervisor, aprobar o rechazar cotización).
//
// El cliente NUNCA toca la base: la API lee con service_role y solo devuelve lo que este
// archivo decide mostrar. Nada de costos, márgenes, nómina ni notas internas.

import crypto from 'node:crypto';
import { etapaDeLocacion, resumenPrograma, pendientesDelCliente, ETAPAS } from '../helpers/programaSites.js';

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
 */
export function locacionParaCliente(row, obra) {
  const loc = {
    luzVerde: !!row.luz_verde, levantadoAt: row.levantado_at,
    cotizacionRef: row.cotizacion_ref, cotizacionAprobada: !!row.cotizacion_aprobada,
  };
  const etapa = etapaDeLocacion(loc, { obra: obra ? { estado: obra.estado } : null });
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
    supervisorClienteNombre: row.supervisor_cliente_nombre || '',
    supervisorClienteTelefono: row.supervisor_cliente_telefono || '',
    supervisorClienteEmail: row.supervisor_cliente_email || '',
    cotizacionRef: row.cotizacion_ref || '',
    cotizacionMonto: row.cotizacion_monto != null ? Number(row.cotizacion_monto) : null,
    cotizacionAprobada: !!row.cotizacion_aprobada,
    cotizacionAprobadaAt: row.cotizacion_aprobada_at,
    levantadoAt: row.levantado_at,
    inicioObra: obra?.fecha_inicio || null,
    actualizado: row.updated_at,
  };
}

/** Respuesta completa del portal: programa, resumen, pendientes del cliente y locaciones. */
export function armarPortal(programa, filas = [], obrasPorId = new Map()) {
  const locaciones = filas
    .map(r => locacionParaCliente(r, r.proyecto_id ? obrasPorId.get(r.proyecto_id) : null))
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

  if (accion === 'luz_verde') {
    if (loc.luz_verde) return { ok: false, error: 'Esta locación ya tiene luz verde.' };
    return {
      ok: true,
      cambios: { luz_verde: true, luz_verde_at: ahora, luz_verde_por: `${autor} (portal)`, etapa_desde: ahora, updated_at: ahora },
      resumen: `dio luz verde del propietario`,
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
