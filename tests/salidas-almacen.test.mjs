// tests de lib/helpers/salidasAlmacen.js (v8.80: salidas de almacén fase 2)
import { estadoTrasMarcarItem, puedeMarcarSalio, personasConductor, vuelveALista, tiemposPedidos, textoHoras } from '../lib/helpers/salidasAlmacen.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

const P = (estado, despachados, extra = {}) => ({ id: 'r', estado, items: despachados.map((d, i) => ({ id: 'i' + i, despachado: d })), ...extra });
// --- auto estados ---
t('pendiente, marca 1 de 2 → preparando', estadoTrasMarcarItem(P('pendiente', [false, false]), 'i0', true) === 'preparando');
t('preparando, marca el último → lista', estadoTrasMarcarItem(P('preparando', [true, false]), 'i1', true) === 'lista');
t('pendiente, 1 renglón → lista directo', estadoTrasMarcarItem(P('pendiente', [false]), 'i0', true) === 'lista');
t('lista, desmarca → preparando', estadoTrasMarcarItem(P('lista', [true, true]), 'i0', false) === 'preparando');
t('preparando, desmarca sin cambio', estadoTrasMarcarItem(P('preparando', [true, false]), 'i0', false) === null);
t('pendiente, desmarca nada', estadoTrasMarcarItem(P('pendiente', [false, false]), 'i0', false) === null);
t('en_ruta no se toca', estadoTrasMarcarItem(P('en_ruta', [true, false]), 'i1', true) === null);
t('ya salió no se toca', estadoTrasMarcarItem(P('lista', [true, true], { salidaAt: '2026-11-20' }), 'i0', false) === null);
t('cancelada no se toca', estadoTrasMarcarItem(P('cancelada', [false]), 'i0', true) === null);
t('sin renglones', estadoTrasMarcarItem(P('pendiente', []), 'x', true) === null);

// --- Salió ---
t('salió: lista envío', puedeMarcarSalio({ estado: 'lista', modoEntrega: 'envio' }));
t('salió: en ruta', puedeMarcarSalio({ estado: 'en_ruta' }));
t('salió: preparando no (primero listo)', !puedeMarcarSalio({ estado: 'preparando' }));
t('salió: retiro no', !puedeMarcarSalio({ estado: 'lista', modoEntrega: 'retiro' }));
t('salió: compra no', !puedeMarcarSalio({ estado: 'lista', tipo: 'compra' }));
t('salió: ya salió no', !puedeMarcarSalio({ estado: 'en_ruta', salidaAt: 'x' }));
t('salió: entregada no', !puedeMarcarSalio({ estado: 'entregada' }));

// --- conductores ---
const personal = [
  { id: 'a', nombre: 'Zoila', roles: ['maestro'] }, { id: 'b', nombre: 'Beto', roles: ['chofer'] },
  { id: 'c', nombre: 'Carlos', roles: ['supervisor'] }, { id: 'd', nombre: 'Dani', roles: ['ayudante'] },
  { id: 'e', nombre: 'Eva', roles: ['supervisor'], activo: false }, { id: 'f', nombre: 'Fito', roles: ['maestro'] },
  { id: 'g', nombre: '  ', roles: ['maestro'] },
];
const c = personasConductor(personal, [{ responsableId: 'f', activo: true }]);
t('todos los activos con nombre', c.length === 5 && !c.some(x => x.id === 'e' || x.id === 'g'));
t('choferes y responsables primero', c[0].grupo === 'Choferes' && c[1].grupo === 'Choferes' && c[0].nombre === 'Beto');
t('luego supervisores', c[2].id === 'c' && c[3].id === 'a' && c[4].id === 'd');

// --- devolver a lista ---
t('vuelve: en ruta sin salida', vuelveALista({ estado: 'en_ruta' }));
t('no vuelve: ya salió', !vuelveALista({ estado: 'en_ruta', salidaAt: 'x' }));
t('no vuelve: entregada', !vuelveALista({ estado: 'entregada' }));

// --- tiempos ---
const ps = [
  { tipo: 'obra', estado: 'entregada', createdAt: '2026-11-20T10:00:00Z', listaAt: '2026-11-20T14:00:00Z', salidaAt: '2026-11-21T10:00:00Z', entregadaAt: '2026-11-21T12:00:00Z', llevadoPorNombre: 'Carlos', salidaFotoUrl: 'u', recepcionConfirmadaAt: 'x' },
  { tipo: 'obra', estado: 'en_ruta', createdAt: '2026-11-20T10:00:00Z', listaAt: '2026-11-20T12:00:00Z', salidaAt: '2026-11-20T16:00:00Z', salidaOrigen: 'odoo' },
  { tipo: 'obra', estado: 'preparando', createdAt: '2026-11-21T10:00:00Z' },
  { tipo: 'compra', estado: 'lista', createdAt: '2026-11-21T10:00:00Z', listaAt: '2026-11-21T11:00:00Z' },
  { tipo: 'obra', estado: 'cancelada', createdAt: '2026-11-21T10:00:00Z', listaAt: '2026-11-21T11:00:00Z' },
  { tipo: 'obra', estado: 'entregada', createdAt: '2026-10-01T10:00:00Z', listaAt: '2026-10-01T11:00:00Z' },
];
const tm = tiemposPedidos(ps, { desde: '2026-11-19' });
t('cuenta sin compras ni canceladas ni viejos', tm.pedidos === 3 && tm.abiertos === 2);
t('mediana hasta listo (4h, 2h) = 3', tm.horasHastaListo === 3 && tm.nListo === 2);
t('mediana hasta salida (20h, 4h) = 12', tm.horasHastaSalida === 12);
t('hasta entrega 2h', tm.horasHastaEntrega === 2 && tm.nEntrega === 1);
t('contadores', tm.conQuienLleva === 1 && tm.conFoto === 1 && tm.salidasPorOdoo === 1 && tm.recepcionConfirmada === 1 && tm.entregados === 1);
t('vacío', tiemposPedidos([]).horasHastaListo === null);
t('texto horas', textoHoras(null) === '—' && textoHoras(0.5) === '30 min' && textoHoras(5) === '5 h' && textoHoras(72) === '3 días');

console.log(`salidasAlmacen: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
