// tests/rutas-chofer.test.mjs — lógica pura de la pantalla del chofer.
// Ejecutar desde la raíz:  node tests/rutas-chofer.test.mjs
import { puedeMarcarParadas, faltaFotoEntrega, camposSoloFoto, textoTipoParada, escHtml, resumenRutaChofer, esEntregaObra } from '../lib/helpers/rutasChofer.js';

let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

// --- puedeMarcarParadas ---
t('hoy planificado: no (Iniciar jornada obligatorio)', puedeMarcarParadas({ estado: 'planificado' }) === false);
t('hoy en curso: sí', puedeMarcarParadas({ estado: 'en_curso' }) === true);
t('hoy completado: no', puedeMarcarParadas({ estado: 'completado' }) === false);
t('viejo planificado: sí, sin iniciar', puedeMarcarParadas({ estado: 'planificado' }, { viejo: true }) === true);
t('viejo en curso: sí', puedeMarcarParadas({ estado: 'en_curso' }, { viejo: true }) === true);
t('viejo completado: no', puedeMarcarParadas({ estado: 'completado' }, { viejo: true }) === false);
t('cancelado: no', puedeMarcarParadas({ estado: 'cancelado' }, { viejo: true }) === false);
t('null: no', puedeMarcarParadas(null) === false);

// --- faltaFotoEntrega ---
const entrega = { tipo: 'entrega', proyectoId: 'p1', estado: 'completada', completadaPor: 'gps' };
t('entrega a obra marcada por GPS sin foto: falta', faltaFotoEntrega(entrega) === true);
t('con foto: no falta', faltaFotoEntrega({ ...entrega, entregaFotoUrl: 'https://x/f.jpg' }) === false);
t('pendiente: no (usa Finalizado)', faltaFotoEntrega({ ...entrega, estado: 'pendiente' }) === false);
t('recogida: no', faltaFotoEntrega({ ...entrega, tipo: 'recogida' }) === false);
t('entrega libre sin obra: no', faltaFotoEntrega({ tipo: 'entrega', estado: 'completada' }) === false);
t('entrega con requisición: es de obra', esEntregaObra({ tipo: 'entrega', requisicionId: 'r1' }) === true);

// --- camposSoloFoto: nunca toca estado ni quién la marcó ---
const c1 = camposSoloFoto({ fotoUrl: 'f', firmaUrl: null, recibidoPor: '' });
t('solo foto: solo entregaFotoUrl', JSON.stringify(c1) === JSON.stringify({ entregaFotoUrl: 'f' }));
const c2 = camposSoloFoto({ fotoUrl: 'f', firmaUrl: 'g', recibidoPor: 'Juan' });
t('foto + firma + nombre', c2.entregaFirmaUrl === 'g' && c2.recibidoPorNombre === 'Juan');
t('sin estado ni completadaPor ni coords', !('estado' in c2) && !('completadaPor' in c2) && !('completadaLat' in c2) && !('completadaAt' in c2));

// --- tipo y escape ---
t('visita = • Visita (igual que oficina)', textoTipoParada('visita') === '• Visita');
t('recogida', textoTipoParada('recogida') === '↑ Recoger');
t('entrega', textoTipoParada('entrega') === '↓ Entregar');
t('otro', textoTipoParada(undefined) === '• Parada');
t('escape html', escHtml('<img src=x onerror="a">&\'') === '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
t('escape null', escHtml(null) === '');

// --- resumenRutaChofer ---
const hoy = '2026-11-18';
const viajes = [
  { id: 'a', fecha: hoy, estado: 'en_curso', paradas: [{ estado: 'completada' }, { estado: 'pendiente' }, { estado: 'cancelada' }] },
  { id: 'b', fecha: hoy, estado: 'cancelado', paradas: [{ estado: 'pendiente' }] },
  { id: 'c', fecha: '2026-11-15', estado: 'planificado', paradas: [{ estado: 'pendiente' }] },
  { id: 'd', fecha: '2026-11-14', estado: 'completado', paradas: [] },
];
const r = resumenRutaChofer(viajes, hoy);
t('resumen: 1 viaje hoy (sin el cancelado)', r.viajesHoy === 1);
t('resumen: 1 viejo sin cerrar', r.viejos === 1);
t('resumen: 2 paradas (sin canceladas), 1 hecha', r.total === 2 && r.hechas === 1);
t('resumen: en curso', r.enCurso === true);
// tras finalizar la parada pendiente, el resumen se recalcula
const r2 = resumenRutaChofer([{ ...viajes[0], paradas: [{ estado: 'completada' }, { estado: 'completada' }] }], hoy);
t('resumen recalculado: 2 hechas', r2.hechas === 2 && r2.total === 2);
t('resumen vacío', resumenRutaChofer(null, hoy).viajesHoy === 0);

console.log(`${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
