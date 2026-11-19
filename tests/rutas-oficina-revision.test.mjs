// v8.75 (revisión oficina): orden de paradas nuevas, duplicar, por montar de una obra,
// cuándo revisar el GPS al abrir un día y firma del encuadre del mapa.
import { siguienteOrden, paradaDuplicable, paradasParaDuplicar, resumenDuplicar, porMontarDeObra, primeraPosicionMovible, debeRevisarGps, firmaEncuadreRuta } from '../lib/helpers/rutasOficina.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

// siguienteOrden
t('orden ruta vacía = 1', siguienteOrden([]) === 1 && siguienteOrden(null) === 1);
t('orden = max + 1, no length + 1', siguienteOrden([{ orden: 2 }, { orden: 3 }]) === 4);
t('orden ignora nulos', siguienteOrden([{ orden: null }, { orden: 5 }, {}]) === 6);
t('orden con parada de salida en 0', siguienteOrden([{ orden: 0 }]) === 1);

// duplicar
const ps = [
  { id: 'a', orden: 3, estado: 'pendiente' },
  { id: 'b', orden: 1, estado: 'pendiente', requisicionId: 'r1' },
  { id: 'c', orden: 2, estado: 'completada' },
  { id: 'd', orden: 4, estado: 'cancelada' },
  { id: 'e', orden: 5, estado: 'pendiente', diligencia_id: 'd1' },
  { id: 'f', orden: 0, estado: 'pendiente' },
];
t('duplica solo libres pendientes', JSON.stringify(paradasParaDuplicar(ps).map(p => p.id)) === '["f","a"]');
t('fila de la base con requisicion_id no se duplica', paradaDuplicable({ estado: 'pendiente', requisicion_id: 'x' }) === false);
t('resumen duplicar', JSON.stringify(resumenDuplicar(ps)) === JSON.stringify({ copia: 2, montadas: 2, hechas: 1 }));

// por montar de una obra
const listas = [{ id: 'r1', proyectoId: 'p1' }, { id: 'r2', proyectoId: 'p2' }, { id: 'r3', proyectoId: 'p1' }];
const dils = [{ id: 'd1', proyectoId: 'p1' }];
const pm = porMontarDeObra('p1', listas, dils);
t('por montar de la obra', pm.total === 3 && pm.requisiciones.length === 2 && pm.retiros.length === 1);
t('sin obra = nada', porMontarDeObra(null, listas, dils).total === 0);
t('obra sin nada', porMontarDeObra('p9', listas, dils).total === 0);

// primera posición movible
t('movible después de la última hecha', primeraPosicionMovible([{ estado: 'completada' }, { estado: 'pendiente' }, { estado: 'completada' }, { estado: 'pendiente' }]) === 3);
t('sin hechas = 0', primeraPosicionMovible([{ estado: 'pendiente' }]) === 0);

// revisar GPS al abrir un día
const hoy = '2026-11-18';
t('hoy siempre', debeRevisarGps({ fecha: hoy, hoy, viajes: [] }) === true);
t('futuro nunca', debeRevisarGps({ fecha: '2026-11-19', hoy, viajes: [{ fecha: '2026-11-19' }] }) === false);
t('pasado sin revisar', debeRevisarGps({ fecha: '2026-11-17', hoy, viajes: [{ fecha: '2026-11-17', estado: 'completado' }] }) === true);
t('pasado revisado durante el día = otra vez', debeRevisarGps({ fecha: '2026-11-17', hoy, viajes: [{ fecha: '2026-11-17', gpsRevisadoAt: '2026-11-17T15:00:00Z' }] }) === true);
t('pasado revisado después del día = no', debeRevisarGps({ fecha: '2026-11-17', hoy, viajes: [{ fecha: '2026-11-17', gpsRevisadoAt: '2026-11-18T09:00:00Z' }] }) === false);
t('pasado: cancelada no cuenta', debeRevisarGps({ fecha: '2026-11-17', hoy, viajes: [{ fecha: '2026-11-17', estado: 'cancelado' }] }) === false);
t('pasado: sin GPS no cuenta', debeRevisarGps({ fecha: '2026-11-17', hoy, viajes: [{ fecha: '2026-11-17' }], conGps: () => false }) === false);
t('pasado sin rutas = no', debeRevisarGps({ fecha: '2026-11-10', hoy, viajes: [] }) === false);

// firma del encuadre
const proyectos = [{ id: 'p1', ubicacionLat: 18.5, ubicacionLng: -69.9 }];
const v1 = { id: 'v1', paradas: [{ id: 'a', lat: 18.4, lng: -69.9, estado: 'pendiente' }, { id: 'b', proyectoId: 'p1', estado: 'pendiente' }] };
const f1 = firmaEncuadreRuta(v1, proyectos);
t('firma estable si no cambia nada', f1 === firmaEncuadreRuta({ ...v1, paradas: v1.paradas.map(p => ({ ...p, estado: p.id === 'a' ? 'completada' : p.estado })) }, proyectos));
t('firma cambia al agregar parada', f1 !== firmaEncuadreRuta({ ...v1, paradas: [...v1.paradas, { id: 'c', lat: 18, lng: -70, estado: 'pendiente' }] }, proyectos));
t('firma cambia con otra ruta', f1 !== firmaEncuadreRuta({ ...v1, id: 'v2' }, proyectos));
t('firma sin ruta', firmaEncuadreRuta(null, proyectos, '3') === 'sin-ruta|3');

console.log(`rutas-oficina-revision: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
