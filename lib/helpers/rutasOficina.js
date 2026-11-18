// v8.75: lógica pura de la pantalla de Rutas para la oficina (Erisdania arma
// las rutas de los choferes). Sin React ni Supabase: testeable con node.
//  - buscador único de paradas (obras, locaciones de clientes, suplidores,
//    lugares logísticos y la Oficina) con resultados agrupados y recientes
//  - tipo de parada por defecto según el lugar
//  - reordenar (arrastrar), distancias en línea recta, resumen de la ruta
//  - color del pin e insignias (chofer / oficina / GPS) de cada parada
import { distanciaMetros } from '../geo.js';

// Oficina / almacén de Super Techos (Calle Arena 1, Mar Azul). Punto fijo: no vive en la base.
export const OFICINA = { lat: 18.4353713, lng: -69.9548778, nombre: 'Oficina Super Techos' };

export const GRUPOS_LUGAR = [
  { id: 'oficina', titulo: 'Oficina' },
  { id: 'obra', titulo: 'Obras' },
  { id: 'cliente', titulo: 'Locaciones de clientes' },
  { id: 'suplidor', titulo: 'Suplidores' },
  { id: 'lugar', titulo: 'Puertos y almacenes' },
];

export const TIPOS_PARADA = [
  { id: 'recogida', label: 'Recoger', icono: '↑' },
  { id: 'entrega', label: 'Entregar', icono: '↓' },
  { id: 'visita', label: 'Visita', icono: '•' },
];
export const etiquetaTipo = (t) => t === 'recogida' ? '↑ Recoger' : t === 'visita' ? '• Visita' : '↓ Entregar';

export const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const conCoords = (lat, lng) => lat != null && lng != null && lat !== '' && lng !== '' && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));

// Todas las opciones del buscador. Cada candidato: { key, grupo, icono, label, sub,
// lugar, lat, lng, proyectoId, tipoDefecto }. Solo entran lugares con GPS.
export function construirCandidatos({ proyectos = [], ubicaciones = [], clientes = [], suplidores = [], lugares = [] } = {}) {
  const out = [{ key: 'oficina', grupo: 'oficina', icono: '🏢', label: OFICINA.nombre, sub: 'Calle Arena 1, Mar Azul', lugar: OFICINA.nombre, lat: OFICINA.lat, lng: OFICINA.lng, proyectoId: null, tipoDefecto: 'visita' }];
  proyectos.filter(p => !p.archivado && conCoords(p.ubicacionLat, p.ubicacionLng)).forEach(p => {
    const label = [p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || p.id;
    out.push({ key: `obra:${p.id}`, grupo: 'obra', icono: '🏗', label, sub: p.nombre && p.nombre !== p.cliente ? p.nombre : '', lugar: p.cliente || p.nombre || p.referenciaOdoo || '', lat: Number(p.ubicacionLat), lng: Number(p.ubicacionLng), proyectoId: p.id, tipoDefecto: 'entrega' });
  });
  const nomCliente = new Map(clientes.map(c => [c.id, c.nombre]));
  ubicaciones.filter(u => !u.archivado && conCoords(u.latitud, u.longitud)).forEach(u => {
    const cli = nomCliente.get(u.clienteId) || '';
    const label = [cli, u.nombre].filter(Boolean).join(' — ');
    out.push({ key: `cli:${u.id}`, grupo: 'cliente', icono: '📍', label, sub: [u.sector, u.ciudad].filter(Boolean).join(', '), lugar: label, lat: Number(u.latitud), lng: Number(u.longitud), proyectoId: null, tipoDefecto: 'entrega' });
  });
  suplidores.forEach(s => (s.locaciones || []).filter(l => conCoords(l.lat, l.lng)).forEach(l => {
    const nom = `${s.nombre}${l.nombre && l.nombre !== 'Principal' ? ` — ${l.nombre}` : ''}`;
    out.push({ key: `sup:${l.id || nom}`, grupo: 'suplidor', icono: '🏪', label: nom, sub: '', lugar: nom, lat: Number(l.lat), lng: Number(l.lng), proyectoId: null, tipoDefecto: 'recogida' });
  }));
  lugares.filter(l => conCoords(l.lat, l.lng)).forEach(l => {
    const icono = l.tipo === 'puerto' ? '⚓' : l.tipo === 'almacen_fiscal' ? '🏛' : l.tipo === 'almacen' ? '🏭' : '📍';
    const sub = l.tipo === 'puerto' ? 'Puerto' : l.tipo === 'almacen_fiscal' ? 'Almacén fiscal' : l.tipo === 'almacen' ? 'Almacén propio' : l.tipo === 'suplidor' ? 'Suplidor' : '';
    out.push({ key: `lug:${l.id}`, grupo: 'lugar', icono, label: l.nombre, sub, lugar: l.nombre, lat: Number(l.lat), lng: Number(l.lng), proyectoId: null, tipoDefecto: l.tipo === 'otro' ? 'visita' : 'recogida' });
  });
  return out;
}

// Busca en todos los candidatos: todas las palabras deben aparecer (sin acentos).
// Sin texto → los recientes (por key, en ese orden). Devuelve una lista plana ya
// ordenada por grupo, con como mucho `porGrupo` resultados de cada grupo.
export function buscarCandidatos(candidatos, texto, { recientes = [], porGrupo = 6, maxRecientes = 6 } = {}) {
  const q = normalizar(texto);
  if (!q) {
    const porKey = new Map((candidatos || []).map(c => [c.key, c]));
    return recientes.map(k => porKey.get(k)).filter(Boolean).slice(0, maxRecientes).map(c => ({ ...c, grupoMostrado: 'recientes' }));
  }
  const palabras = q.split(' ');
  const out = [];
  GRUPOS_LUGAR.forEach(g => {
    const del = (candidatos || []).filter(c => c.grupo === g.id).map(c => {
      const hay = normalizar(`${c.label} ${c.sub || ''}`);
      if (!palabras.every(w => hay.includes(w))) return null;
      const lab = normalizar(c.label);
      const rank = lab.startsWith(q) ? 0 : lab.split(/[\s·—-]+/).some(w => w.startsWith(palabras[0])) ? 1 : 2;
      return { c, rank };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.c.label.localeCompare(b.c.label));
    del.slice(0, porGrupo).forEach(({ c }) => out.push({ ...c, grupoMostrado: g.id }));
  });
  return out;
}

// Recientes: la key elegida pasa al frente, sin repetir, máximo n.
export const agregarReciente = (lista, key, n = 8) => [key, ...(lista || []).filter(k => k !== key)].slice(0, n);

// Mueve un elemento de la posición `desde` a la posición `hasta` (arrastrar y soltar).
export function moverEnLista(lista, desde, hasta) {
  const a = [...(lista || [])];
  if (desde < 0 || desde >= a.length || hasta < 0 || hasta >= a.length || desde === hasta) return a;
  const [x] = a.splice(desde, 1);
  a.splice(hasta, 0, x);
  return a;
}

// Coordenadas de una parada (las suyas o, si no tiene, las de su obra).
export function coordsParada(p, proyectos = []) {
  if (conCoords(p?.lat, p?.lng)) return { lat: Number(p.lat), lng: Number(p.lng) };
  const prj = p?.proyectoId ? proyectos.find(x => x.id === p.proyectoId) : null;
  return prj && conCoords(prj.ubicacionLat, prj.ubicacionLng) ? { lat: Number(prj.ubicacionLat), lng: Number(prj.ubicacionLng) } : null;
}

// Distancia en línea recta desde la parada anterior y acumulada (orientación, no
// es la distancia por carretera). Ignora paradas canceladas. → { [id]: { tramoM, acumM } }
export function distanciasRuta(paradas, proyectos = []) {
  const out = {};
  let prev = null, acum = 0;
  (paradas || []).forEach(p => {
    if (p.estado === 'cancelada') return;
    const c = coordsParada(p, proyectos);
    if (!c) { out[p.id] = { tramoM: null, acumM: prev ? acum : null }; return; }
    const tramo = prev ? distanciaMetros(prev.lat, prev.lng, c.lat, c.lng) : null;
    if (tramo != null) acum += tramo;
    out[p.id] = { tramoM: tramo, acumM: prev ? acum : 0 };
    prev = c;
  });
  return out;
}
export const totalRutaM = (paradas, proyectos = []) => {
  const d = distanciasRuta(paradas, proyectos);
  return Object.values(d).reduce((m, x) => Math.max(m, x.acumM || 0), 0);
};
export const formatKm = (m) => m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

// Quién la completó: el campo nuevo manda; las viejas se deducen de la nota.
export function completadaPorDe(p) {
  if (p?.estado !== 'completada') return null;
  if (p.completadaPor) return p.completadaPor;
  return /desde oficina/i.test(p.notas || '') ? 'oficina' : 'chofer';
}

// Estado visual de la parada (pin y fila).
//  pendiente → azul · hecha (chofer u oficina) → verde · hecha por GPS → verde con
//  borde · visitada por GPS pero sin marcar → morado · cancelada → gris
export function estadoVisualParada(p) {
  if (p?.estado === 'cancelada') return { clave: 'cancelada', color: 'gray', borde: null, texto: 'Cancelada' };
  if (p?.estado === 'completada') {
    const por = completadaPorDe(p);
    return por === 'gps' ? { clave: 'gps', color: 'green', borde: '#a855f7', texto: 'Hecha (GPS)' } : { clave: 'hecha', color: 'green', borde: null, texto: por === 'oficina' ? 'Hecha (oficina)' : 'Hecha' };
  }
  if (p?.llegadaGpsAt) return { clave: 'visitada', color: 'purple', borde: null, texto: 'El GPS la vio' };
  return { clave: 'pendiente', color: 'blue', borde: null, texto: 'Pendiente' };
}

const horaCorta = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }); } catch { return ''; }
};
const minutos = (s) => s == null ? null : Math.max(1, Math.round(s / 60));

// Insignias de la parada: [{ texto, tono: 'verde'|'morado'|'gris' }].
// gpsRevisado: el viaje ya se cruzó con el GPS (si no, no decimos "no ha pasado").
export function insigniasParada(p, { gpsRevisado = false } = {}) {
  const out = [];
  if (!p || p.estado === 'cancelada') return out;
  if (p.estado === 'completada') {
    const por = completadaPorDe(p);
    const h = horaCorta(p.completadaAt);
    out.push({ texto: `✓ ${por === 'oficina' ? 'Oficina' : por === 'gps' ? 'GPS' : 'Chofer'}${h ? ` ${h}` : ''}`, tono: por === 'gps' ? 'morado' : 'verde' });
  }
  if (p.llegadaGpsAt) {
    const m = minutos(p.permanenciaGpsS);
    out.push({ texto: `🛰 GPS llegó ${horaCorta(p.llegadaGpsAt)}${m ? ` · ${m} min` : ''}`, tono: 'morado' });
  } else if (gpsRevisado && p.estado !== 'completada') {
    out.push({ texto: '🛰 no ha pasado', tono: 'gris' });
  }
  return out;
}

// Resumen de la ruta: "N paradas · X hechas · Y vistas por GPS".
export function resumenRuta(viaje) {
  const ps = (viaje?.paradas || []).filter(p => p.estado !== 'cancelada');
  const hechas = ps.filter(p => p.estado === 'completada').length;
  const gps = ps.filter(p => p.llegadaGpsAt).length;
  return { total: ps.length, hechas, gps, pendientes: ps.length - hechas, completa: ps.length > 0 && hechas === ps.length };
}

// Reduce un recorrido largo a como mucho `max` puntos (para el mapa).
export function reducirPuntos(puntos, max = 600) {
  const a = (puntos || []).filter(p => p && conCoords(p.lat, p.lng));
  if (a.length <= max) return a;
  const paso = (a.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => a[Math.round(i * paso)]);
}

// Fecha + n días ('YYYY-MM-DD').
export function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
