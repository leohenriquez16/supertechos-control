// Lógica pura de la pantalla del CHOFER (InicioChofer / TarjetaRutaHoy).
// Sin dependencias del navegador ni de la base: testeable con node.

import { viajesViejosSinCerrar, PARADA_CANCELADA } from './rutas.js';

export const esHecha = (p) => p?.estado === 'completada';
export const esCancelada = (p) => p?.estado === PARADA_CANCELADA;
export const esEntregaObra = (p) => p?.tipo === 'entrega' && !!(p.requisicionId || p.proyectoId);

// ¿Puede el chofer marcar paradas de este viaje?
//  - Viaje de HOY: solo con la jornada iniciada (decisión de Leo: "Iniciar jornada" es obligatorio).
//  - Viaje VIEJO sin cerrar: sí, aunque nunca se haya iniciado (no se le pide iniciar
//    un viaje de otro día: eso pondría la hora de hoy y dañaría las horas extras).
//  - Viaje completado o cancelado: no.
export function puedeMarcarParadas(v, { viejo = false } = {}) {
  if (!v || v.estado === 'completado' || v.estado === 'cancelado') return false;
  return viejo ? true : v.estado === 'en_curso';
}

// Entrega a obra ya completada (por GPS u oficina, o vieja) que quedó sin foto:
// el chofer puede agregarla sin cambiar el estado ni quién la marcó.
export const faltaFotoEntrega = (p) => esEntregaObra(p) && esHecha(p) && !p.entregaFotoUrl;

// Campos a guardar cuando el chofer solo agrega la prueba de entrega a una parada
// ya completada: nunca estado, completadaPor ni coordenadas.
export function camposSoloFoto({ fotoUrl, firmaUrl, recibidoPor }) {
  const c = { entregaFotoUrl: fotoUrl };
  if (firmaUrl) c.entregaFirmaUrl = firmaUrl;
  if (recibidoPor) c.recibidoPorNombre = recibidoPor;
  return c;
}

// Rótulo del tipo de parada (mismo texto que la oficina para 'visita').
export function textoTipoParada(tipo) {
  if (tipo === 'recogida') return '↑ Recoger';
  if (tipo === 'entrega') return '↓ Entregar';
  if (tipo === 'visita') return '• Visita';
  return '• Parada';
}

// Escapa texto para meterlo en el HTML de un popup del mapa.
export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Resumen de la tarjeta "Tu ruta de hoy" a partir de la lista de viajes del chofer.
export function resumenRutaChofer(viajes, hoy) {
  const activos = (viajes || []).filter(v => v.estado !== 'cancelado');
  const deHoy = activos.filter(v => v.fecha === hoy);
  const viejos = viajesViejosSinCerrar(activos, hoy);
  const paradas = deHoy.flatMap(v => (v.paradas || []).filter(p => !esCancelada(p)));
  return {
    viajesHoy: deHoy.length,
    viejos: viejos.length,
    total: paradas.length,
    hechas: paradas.filter(esHecha).length,
    enCurso: deHoy.some(v => v.estado === 'en_curso'),
  };
}
