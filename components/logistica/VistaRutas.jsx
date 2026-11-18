'use client';

// v8.29.0: Vista "Rutas" — planificación de viajes de camiones (adiós Excel).
// Un viaje (ruta) = un chofer (o envío pagado / sub-contratado) en una fecha, con
// paradas ordenadas: entregas de requisiciones LISTAS, retiros de sobrante y
// paradas libres (puertos, fiscales, suplidores, clientes, la oficina).
// El chofer ve su ruta en el teléfono y marca cada parada; sus horas de inicio/fin
// alimentan el cálculo de horas extras (abajo del mapa).
//
// v8.75: rediseño para quien arma las rutas (Erisdania), pensado como despacho:
//   izquierda = una tarjeta por ruta del día + "Por montar"
//   centro    = mapa grande (pines numerados, planificado vs recorrido real del GPS)
//   derecha   = la ruta abierta: buscador único de paradas, arrastrar para ordenar,
//               editar chofer/vehículo/fecha ahí mismo, duplicar para otro día.
// Las piezas viven en components/logistica/rutas/.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Truck, RefreshCw, MapPin, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import * as db from '../../lib/db';
import { formatFechaCorta } from '../../lib/helpers/formato';
import { toast } from '../../lib/toast';
// v8.68.0: cancelar viajes viejos + marcar parada hecha desde oficina (ticket Erisdania)
import { planCancelacionViaje, notaCancelacion, notaHechaDesdeOficina, filtrarViajes, viajesViejosSinCerrar, requisicionesMontadas, esViajeCancelado, VIAJE_CANCELADO, PARADA_CANCELADA } from '../../lib/helpers/rutas';
import { construirCandidatos, agregarReciente, OFICINA, totalRutaM, reducirPuntos, sumarDias } from '../../lib/helpers/rutasOficina';
import { distanciaMetros } from '../../lib/geo';
import { llamarApi } from './rutas/llamarApi';
import CarrilesDia from './rutas/CarrilesDia';
import BandejaPorMontar from './rutas/BandejaPorMontar';
import PlanSemana from './rutas/PlanSemana';
import MapaRuta from './rutas/MapaRuta';
import CabeceraRuta from './rutas/CabeceraRuta';
import BuscadorParada from './rutas/BuscadorParada';
import ListaParadas from './rutas/ListaParadas';
import FormParadaAvanzada from './rutas/FormParadaAvanzada';
import ModalLugares from './rutas/ModalLugares';

// v8.45.0: parseCoords vive en lib/helpers/geo (compartido); re-export por compatibilidad.
export { parseCoords } from '../../lib/helpers/geo';

const hoyRD = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const tieneRol = (p, r) => p?.roles?.includes(r);
const diaLargo = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
const CINCO_MIN = 5 * 60 * 1000;
const CLAVE_RECIENTES = 'rutas.recientes';

const leerRecientes = () => { try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); } catch { return []; } };
const guardarRecientes = (l) => { try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(l)); } catch { /* sin storage */ } };
const esOficina = (p) => p?.lat != null && p?.lng != null && (distanciaMetros(Number(p.lat), Number(p.lng), OFICINA.lat, OFICINA.lng) ?? 9e9) < 80;

export default function VistaRutas({ usuario, data, onVolver }) {
  const [fecha, setFecha] = useState(hoyRD());
  const [viajes, setViajes] = useState([]);
  const [listas, setListas] = useState([]);        // requisiciones listas sin viaje
  const [diligencias, setDiligencias] = useState([]);
  const [enAlmacen, setEnAlmacen] = useState([]);  // requisiciones pendiente/preparando (aviso)
  const [lugares, setLugares] = useState([]);
  const [suplidores, setSuplidores] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]); // locaciones de clientes (con GPS)
  const [gpsUnidades, setGpsUnidades] = useState([]); // camiones EN VIVO
  const [loading, setLoading] = useState(true);
  const [viajeSel, setViajeSel] = useState(null);
  // v8.68.0: 'dia' (rutas de la fecha) | 'viejos' (días anteriores sin cerrar) | 'cancelados'
  const [filtro, setFiltro] = useState('dia');
  const [historial, setHistorial] = useState([]);
  const [vista, setVista] = useState('dia');       // 'dia' | 'semana'
  const [viajesSemana, setViajesSemana] = useState([]);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ tipoEnvio: 'camion', vehiculoId: '', vehiculo: '', choferId: '' });
  const [avanzada, setAvanzada] = useState(null);  // { texto } — form "Más opciones"
  const [puntoMapa, setPuntoMapa] = useState(null);
  const [gestionLugares, setGestionLugares] = useState(false);
  const [recientes, setRecientes] = useState([]);
  const [aviso, setAviso] = useState(null);        // { texto, accion: { label, fn } }
  const [gpsAviso, setGpsAviso] = useState(null);
  const [recorrido, setRecorrido] = useState({ clave: null, puntos: [] });
  const [tick, setTick] = useState(0);             // cada 5 min (solo hoy)
  const [esDesktop, setEsDesktop] = useState(true);
  const pedido = useRef(0);

  useEffect(() => { setRecientes(leerRecientes()); }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const f = () => setEsDesktop(mq.matches);
    f(); mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, []);
  // Locaciones de clientes para el buscador (una sola vez; no cambian en el día).
  useEffect(() => { db.listarUbicacionesCliente().then(setUbicaciones).catch(() => setUbicaciones([])); }, []);

  // v8.50.0: cuenta como chofer quien tenga el rol o sea RESPONSABLE de un vehículo activo.
  const choferes = useMemo(() => {
    const respIds = new Set((data.vehiculos || []).filter(v => v.activo !== false && v.responsableId).map(v => v.responsableId));
    return (data.personal || []).filter(p => tieneRol(p, 'chofer') || respIds.has(p.id));
  }, [data.personal, data.vehiculos]);

  const viajesActivos = useMemo(() => filtrarViajes(viajes, 'activos'), [viajes]);
  const viajesLista = useMemo(() => filtro === 'viejos' ? viajesViejosSinCerrar(historial, hoyRD())
    : filtro === 'cancelados' ? filtrarViajes(historial, 'cancelados') : viajesActivos, [filtro, historial, viajesActivos]);
  const vSel = viajesLista.find(v => v.id === viajeSel) || null;

  const recargar = async ({ silencioso = false } = {}) => {
    const mio = ++pedido.current;
    if (!silencioso) setLoading(true);
    try {
      const [vs, reqs, dils, lugs, viniendo] = await Promise.all([
        db.listarViajes({ fecha }),
        db.listarRequisiciones({ estados: ['lista'] }),
        db.listarDiligencias({ estados: ['sin_planificar'] }).catch(() => []),
        db.listarLugaresLogisticos().catch(() => []),
        db.listarRequisiciones({ estados: ['pendiente', 'preparando'] }).catch(() => []),
      ]);
      db.listarSuplidores().then(setSuplidores).catch(() => {});
      // v8.43.0: posiciones en vivo de la flota (no bloquea la vista si falla)
      fetch('/api/gps/posiciones').then(r => r.json()).then(d => setGpsUnidades(d.dispositivos || [])).catch(() => {});
      // v8.68.0: las paradas/viajes cancelados no cuentan (su requisición volvió a 'lista')
      const asignadas = requisicionesMontadas(vs);
      const otras = await db.listarViajes({ desde: hoyRD().slice(0, 8) + '01' }).catch(() => []);
      requisicionesMontadas(otras).forEach(id => asignadas.add(id));
      let hist = null;
      if (filtro !== 'dia') {
        const d = new Date(hoyRD() + 'T12:00:00'); d.setDate(d.getDate() - 120);
        hist = await db.listarViajes({ desde: d.toISOString().slice(0, 10) }).catch(() => []);
      }
      if (mio !== pedido.current) return; // llegó tarde: ya se pidió otra fecha
      setViajes(vs);
      if (hist) setHistorial(hist);
      // v8.48.0: los alistos en modo RETIRO no van a camión (se firman en el almacén)
      setListas(reqs.filter(r => !asignadas.has(r.id) && r.modoEntrega !== 'retiro'));
      setDiligencias(dils); setLugares(lugs); setEnAlmacen(viniendo);
    } catch (e) { console.warn('Rutas:', e?.message); if (!silencioso) toast.error('No se pudieron cargar las rutas: ' + (e?.message || e)); }
    if (mio === pedido.current) setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [fecha, filtro]);

  // Abrir la primera ruta si la abierta ya no está en la lista.
  useEffect(() => {
    if (loading) return;
    if (viajeSel && viajesLista.some(v => v.id === viajeSel)) return;
    setViajeSel(viajesLista[0]?.id || null);
    // eslint-disable-next-line
  }, [viajes, historial, filtro, loading]);
  useEffect(() => { setPuntoMapa(null); setAvanzada(null); }, [viajeSel]);

  // ===== GPS: revisar visitas al abrir hoy/días pasados y cada 5 min si es hoy =====
  useEffect(() => {
    if (fecha !== hoyRD() || vista !== 'dia') return;
    const id = setInterval(() => setTick(t => t + 1), CINCO_MIN);
    return () => clearInterval(id);
  }, [fecha, vista]);
  useEffect(() => {
    if (filtro !== 'dia' || fecha > hoyRD()) { setGpsAviso(null); return; }
    let vivo = true;
    llamarApi('POST', '/api/rutas/revisar-gps', { fecha })
      .then(() => { if (vivo) { setGpsAviso(null); recargar({ silencioso: true }); } })
      .catch(() => { if (vivo) setGpsAviso('No pude revisar el GPS ahora; lo intento de nuevo en unos minutos.'); });
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [fecha, filtro, tick]);

  // Recorrido REAL del camión de la ruta abierta (historial del GPS del día).
  const vehSel = vSel?.vehiculoId ? (data.vehiculos || []).find(x => x.id === vSel.vehiculoId) : null;
  const claveRecorrido = vSel && vehSel?.gpsDeviceId && vSel.fecha <= hoyRD() ? `${vSel.vehiculoId}|${vSel.fecha}` : null;
  useEffect(() => {
    if (!claveRecorrido) return;
    let vivo = true;
    const [vehiculoId, f] = claveRecorrido.split('|');
    llamarApi('GET', `/api/gps/historial?vehiculoId=${encodeURIComponent(vehiculoId)}&fecha=${f}`)
      .then(d => { if (vivo) setRecorrido({ clave: claveRecorrido, puntos: reducirPuntos(d?.puntos || []) }); })
      .catch(() => { if (vivo) setRecorrido(r => r.clave === claveRecorrido ? r : { clave: claveRecorrido, puntos: [] }); });
    return () => { vivo = false; };
  }, [claveRecorrido, tick]);
  const puntosRecorrido = recorrido.clave === claveRecorrido ? recorrido.puntos : [];

  // ===== Semana =====
  const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const diasSemana = useMemo(() => { const ini = lunesDe(fecha); return Array.from({ length: 7 }, (_, i) => sumarDias(ini, i)); }, [fecha]);
  useEffect(() => {
    if (vista !== 'semana') return;
    db.listarViajes({ desde: diasSemana[0], hasta: diasSemana[6] }).then(setViajesSemana).catch(() => setViajesSemana([]));
  }, [vista, diasSemana, viajes]);

  const nombreObra = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p ? ([p.referenciaOdoo, p.cliente || p.nombre].filter(Boolean).join(' · ') || pid) : pid; }; // v8.49.2
  const tieneGps = (pid) => { const p = (data.proyectos || []).find(x => x.id === pid); return p?.ubicacionLat != null && p?.ubicacionLng != null; };

  const candidatos = useMemo(() => construirCandidatos({ proyectos: data.proyectos || [], ubicaciones, clientes: data.clientes || [], suplidores, lugares }),
    [data.proyectos, data.clientes, ubicaciones, suplidores, lugares]);

  const fallo = (e, que = 'No se pudo guardar') => { toast.error(`${que}: ${e?.message || e}`); };

  // ===== Crear ruta =====
  const crearViaje = async () => {
    if (nuevo.tipoEnvio === 'camion' && !nuevo.choferId) { toast.warning('Elige el vehículo (el chofer entra solo) o el chofer.'); return; }
    const chofer = choferes.find(c => c.id === nuevo.choferId) || (data.personal || []).find(p => p.id === nuevo.choferId);
    try {
      const id = await db.crearViaje({
        fecha, choferId: nuevo.tipoEnvio === 'camion' ? nuevo.choferId : null,
        // v8.41.1: tercer tipo — viaje SUB-CONTRATADO (camión alquilado con su chofer externo)
        choferNombre: nuevo.tipoEnvio === 'camion' ? (chofer?.nombre || '') : nuevo.tipoEnvio === 'subcontratado' ? 'Sub-contratado' : 'Envío pagado',
        vehiculo: nuevo.vehiculo, vehiculoId: nuevo.tipoEnvio === 'camion' ? (nuevo.vehiculoId || null) : null,
        tipoEnvio: nuevo.tipoEnvio, creadoPorId: usuario.id,
      });
      setCreando(false); setNuevo({ tipoEnvio: 'camion', vehiculoId: '', vehiculo: '', choferId: '' });
      setViajeSel(id);
      await recargar({ silencioso: true });
    } catch (e) { fallo(e, 'No se pudo crear la ruta'); }
  };
  const borrarViaje = async (v) => {
    if (v.paradas.some(p => p.requisicionId)) { toast.warning('Quita primero las requisiciones montadas.'); return; }
    if (!confirm('¿Borrar esta ruta vacía?')) return;
    try { await db.eliminarViaje(v.id); await recargar({ silencioso: true }); } catch (e) { fallo(e, 'No se pudo borrar'); }
  };

  // ===== Agregar paradas =====
  const agregarRapida = async ({ cand, tipo, nota }) => {
    if (!vSel) return false;
    try {
      await db.agregarParada({ viajeId: vSel.id, orden: vSel.paradas.length + 1, tipo, lugar: cand.lugar, proyectoId: cand.proyectoId || null, lat: cand.lat, lng: cand.lng, descripcion: nota || '' });
      if (cand.key) { const l = agregarReciente(recientes, cand.key); setRecientes(l); guardarRecientes(l); }
      await recargar({ silencioso: true });
      return true;
    } catch (e) { fallo(e, 'No se pudo agregar la parada'); return false; }
  };
  const activasSel = vSel ? vSel.paradas.filter(p => p.estado !== PARADA_CANCELADA) : [];
  const yaSaleDeOficina = activasSel.length > 0 && esOficina(activasSel[0]);
  const yaRegresa = activasSel.length > 0 && esOficina(activasSel[activasSel.length - 1]);
  const paradaOficina = async (alInicio) => {
    if (!vSel) return;
    try {
      const id = await db.agregarParada({ viajeId: vSel.id, orden: alInicio ? 0 : vSel.paradas.length + 1, tipo: 'visita', lugar: OFICINA.nombre, lat: OFICINA.lat, lng: OFICINA.lng,
        descripcion: alInicio ? 'Salida de la oficina' : 'Regreso a la oficina' });
      if (alInicio) await db.reordenarParadas(vSel.id, [id, ...vSel.paradas.map(p => p.id)]);
      await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };

  const montarRequisicion = async (req) => {
    const viaje = vSel; if (!viaje) return;
    const prj = (data.proyectos || []).find(x => x.id === req.proyectoId);
    if (prj?.ubicacionLat == null || prj?.ubicacionLng == null) { toast.warning(`La obra "${nombreObra(req.proyectoId)}" no tiene ubicación GPS. Asígnala en el proyecto (Info → Ubicación).`); return; }
    try {
      await db.agregarParada({ viajeId: viaje.id, orden: viaje.paradas.length + 1, tipo: 'entrega', proyectoId: req.proyectoId, requisicionId: req.id,
        lat: prj.ubicacionLat, lng: prj.ubicacionLng, descripcion: `Entregar materiales en ${nombreObra(req.proyectoId)}` });
      // el envío pagado/sub-contratado entrega directo; el camión la lleva cuando el chofer arranca
      if (viaje.tipoEnvio === 'pagado' || viaje.tipoEnvio === 'subcontratado' || viaje.estado === 'en_curso') await db.actualizarRequisicion(req.id, { estado: 'en_ruta' });
      await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };
  // v8.40.0: RETIRO DE SOBRANTE → parada de recogida en la obra.
  const montarDiligencia = async (d) => {
    const viaje = vSel; if (!viaje) return;
    const proy = (data.proyectos || []).find(x => x.id === d.proyectoId);
    if (proy?.ubicacionLat == null || proy?.ubicacionLng == null) { toast.warning(`La obra "${nombreObra(d.proyectoId)}" no tiene ubicación GPS. Asígnala en el proyecto (Info → Ubicación).`); return; }
    try {
      await db.agregarParada({ viajeId: viaje.id, orden: viaje.paradas.length + 1, tipo: 'recogida', proyectoId: d.proyectoId, diligenciaId: d.id,
        lat: proy.ubicacionLat, lng: proy.ubicacionLng, descripcion: `Retirar sobrante en ${nombreObra(d.proyectoId)}: ${(d.descripcion || '').split('\n')[0]}` });
      await db.actualizarDiligencia(d.id, { estado: 'asignada', viajeId: viaje.id });
      await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };

  // ===== Editar paradas =====
  const reordenar = async (ids) => {
    if (!vSel) return;
    try { await db.reordenarParadas(vSel.id, ids); } catch (e) { fallo(e, 'No se pudo guardar el orden'); }
    await recargar({ silencioso: true });
  };
  const quitarParada = async (parada) => {
    if (!confirm('¿Quitar esta parada de la ruta?')) return;
    try {
      await db.eliminarParada(parada.id);
      if (parada.requisicionId) await db.actualizarRequisicion(parada.requisicionId, { estado: 'lista' });
      // v8.40.0: el retiro vuelve a "sin planificar" — no se pierde el recordatorio
      if (parada.diligenciaId) await db.actualizarDiligencia(parada.diligenciaId, { estado: 'sin_planificar' });
      await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };
  // v8.68.0: HECHA DESDE LA OFICINA — queda en la nota quién la marcó. La requisición
  // pasa a entregada (como cuando la marca el chofer); la diligencia se cierra en actualizarParada.
  const marcarHechaOficina = async (p) => {
    try {
      await db.actualizarParada(p.id, { estado: 'completada', completadaPor: 'oficina', notas: notaHechaDesdeOficina(p.notas, { nombre: usuario?.nombre, fechaISO: new Date().toISOString() }) });
      if (p.requisicionId && p.tipo !== 'recogida') { try { await db.actualizarRequisicion(p.requisicionId, { estado: 'entregada' }); } catch (e) { /* no bloquear */ } }
      await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };

  // ===== Editar la ruta =====
  const editarViaje = async (campos) => {
    if (!vSel) return;
    try {
      await db.actualizarViaje(vSel.id, campos);
      if (campos.fecha && campos.fecha !== fecha) {
        toast.success(`Ruta movida al ${diaLargo(campos.fecha)}`);
        setFecha(campos.fecha); // la seguimos: queda abierta en su nuevo día
      } else await recargar({ silencioso: true });
    } catch (e) { fallo(e); }
  };
  const cambiarVehiculo = async (vehId) => {
    if (!vehId) { await editarViaje({ vehiculoId: null }); return; }
    const veh = (data.vehiculos || []).find(x => x.id === vehId);
    if (!veh) return;
    const campos = { vehiculoId: veh.id, vehiculo: `${veh.marca || ''} ${veh.modelo || ''}${veh.placa ? ` · ${veh.placa}` : ''}`.trim() };
    const resp = (data.personal || []).find(p => p.id === veh.responsableId);
    if (resp && resp.id !== vSel?.choferId) { campos.choferId = resp.id; campos.choferNombre = resp.nombre; toast.info(`Chofer: ${resp.nombre} (responsable del vehículo)`); }
    await editarViaje(campos);
  };
  const duplicar = async (fechaDestino) => {
    if (!vSel) return false;
    try {
      const nuevoV = await db.duplicarViaje(vSel.id, { fecha: fechaDestino });
      setAviso({ texto: `Ruta copiada al ${diaLargo(fechaDestino)} con ${nuevoV.paradas.length} parada${nuevoV.paradas.length !== 1 ? 's' : ''}.`, accion: { label: 'Ir a ese día', fn: () => { setFiltro('dia'); setFecha(fechaDestino); setViajeSel(nuevoV.id); setAviso(null); } } });
      if (fechaDestino === fecha) await recargar({ silencioso: true });
      return true;
    } catch (e) { fallo(e, 'No se pudo duplicar'); return false; }
  };
  // v8.68.0: CANCELAR — no borra nada; pendientes → canceladas; requisiciones/diligencias vuelven.
  const cancelarViaje = async (motivo) => {
    const v = vSel; if (!v || !motivo) return false;
    try {
      const plan = planCancelacionViaje(v);
      for (const id of plan.paradasACancelar) await db.actualizarParada(id, { estado: PARADA_CANCELADA });
      for (const id of plan.requisicionesADevolver) await db.actualizarRequisicion(id, { estado: 'lista' });
      for (const id of plan.diligenciasADevolver) await db.actualizarDiligencia(id, { estado: 'sin_planificar' });
      await db.actualizarViaje(v.id, { estado: VIAJE_CANCELADO, notas: notaCancelacion(v.notas, { motivo, nombre: usuario?.nombre, fechaISO: new Date().toISOString() }) });
      await recargar({ silencioso: true });
      return true;
    } catch (e) { fallo(e); return false; }
  };

  // Jornada del día por chofer (horas extras sobre 8h)
  const horasChofer = useMemo(() => viajesActivos.filter(v => v.choferId && v.horaInicio).map(v => {
    const fin = v.horaFin ? new Date(v.horaFin) : null;
    const horasTot = fin ? (fin - new Date(v.horaInicio)) / 3600000 : null;
    return { v, horasTot, extras: horasTot != null ? Math.max(0, horasTot - 8) : null };
  }), [viajesActivos]);

  const puedeAgregar = !!vSel && vSel.estado !== 'completado' && !esViajeCancelado(vSel);
  const hoy = hoyRD();
  const totalM = vSel ? totalRutaM(vSel.paradas, data.proyectos || []) : 0;
  const gpsRevisado = !!vSel?.gpsRevisadoAt;

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-3">
      {/* ===== Encabezado: día + vistas ===== */}
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Truck className="w-6 h-6 text-cyan-400" /> Rutas</h1>
            <div className="text-[11px] text-zinc-500">Arma la ruta de cada chofer: almacén, obras, clientes, suplidores y puertos</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFecha(sumarDias(fecha, vista === 'semana' ? -7 : -1))} className="p-2 rounded-card border border-zinc-700 text-zinc-400 hover:text-white" title="Anterior"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setFecha(hoy)} disabled={fecha === hoy} className="text-xs font-bold px-3 py-2 rounded-card border border-zinc-700 text-zinc-300 hover:text-white disabled:opacity-40">Hoy</button>
          <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-sm" />
          <button onClick={() => setFecha(sumarDias(fecha, vista === 'semana' ? 7 : 1))} className="p-2 rounded-card border border-zinc-700 text-zinc-400 hover:text-white" title="Siguiente"><ChevronRight className="w-4 h-4" /></button>
          <span className="hidden md:inline text-sm font-bold text-zinc-300 capitalize ml-1">{diaLargo(fecha)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-card border border-zinc-700 overflow-hidden">
            {[['dia', 'Día'], ['semana', 'Semana']].map(([k, l]) => (
              <button key={k} onClick={() => setVista(k)} className={`text-xs font-bold px-3 py-2 ${vista === k ? 'bg-cyan-700 text-white' : 'text-zinc-400 hover:text-white'}`}>{l}</button>
            ))}
          </div>
          <button onClick={() => setGestionLugares(true)} className="text-xs font-bold px-3 py-2 rounded-card border border-zinc-700 text-zinc-400 hover:text-white flex items-center gap-1" title="Suplidores, puertos y almacenes con su ubicación"><MapPin className="w-3.5 h-3.5" /> Lugares</button>
          <button onClick={() => recargar()} className="p-2 text-zinc-500 hover:text-white" title="Actualizar"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {aviso && (
        <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-card px-3 py-2 flex items-center gap-3 text-sm">
          <span className="flex-1">{aviso.texto}</span>
          {aviso.accion && <button onClick={aviso.accion.fn} className="text-xs font-black text-cyan-300 hover:text-white">{aviso.accion.label} →</button>}
          <button onClick={() => setAviso(null)} className="text-zinc-500 hover:text-white text-xs">Cerrar</button>
        </div>
      )}
      {gpsAviso && vista === 'dia' && <div className="text-[11px] text-amber-400/90">🛰 {gpsAviso}</div>}

      {vista === 'semana' ? (
        <PlanSemana diasSemana={diasSemana} viajesSemana={viajesSemana} fecha={fecha} hoy={hoy} vehiculos={data.vehiculos} personal={data.personal}
          onAbrir={(x) => { setFiltro('dia'); setFecha(x.fecha); setViajeSel(x.id); setVista('dia'); }}
          onIrDia={(d) => { setFecha(d); setVista('dia'); }}
          onPlanificar={(d, vh, chofer) => {
            setFiltro('dia'); setFecha(d); setVista('dia'); setCreando(true);
            setNuevo({ tipoEnvio: 'camion', vehiculoId: vh.id, vehiculo: `${vh.marca || ''} ${vh.modelo || ''}${vh.placa ? ` · ${vh.placa}` : ''}`.trim(), choferId: chofer ? chofer.id : '', cambiarChofer: !chofer });
          }} />
      ) : loading ? (
        <div className="text-center py-16"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin mx-auto" /></div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_380px] xl:grid-cols-[280px_minmax(0,1fr)_440px] items-start">
          {/* ===== Izquierda: rutas del día + por montar ===== */}
          <aside className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            <div className="flex rounded-card border border-zinc-700 overflow-hidden">
              {[['dia', 'Del día'], ['viejos', 'Viejas sin cerrar'], ['cancelados', 'Canceladas']].map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} className={`flex-1 text-[11px] font-bold px-1.5 py-1.5 ${filtro === k ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}>{l}</button>
              ))}
            </div>
            <CarrilesDia viajes={viajesLista} viajeSel={viajeSel} onElegir={setViajeSel} mostrarFecha={filtro !== 'dia'} filtro={filtro}
              creando={creando} setCreando={setCreando} nuevo={nuevo} setNuevo={setNuevo} vehiculos={data.vehiculos} personal={data.personal || []} choferes={choferes}
              viajesDelDia={viajesActivos} onCrear={crearViaje} onBorrarVacio={borrarViaje} fecha={fecha} />
            {filtro === 'dia' && (
              <BandejaPorMontar listas={listas} diligencias={diligencias} enAlmacen={enAlmacen} nombreObra={nombreObra} tieneGps={tieneGps}
                destino={puedeAgregar ? (vSel.choferNombre || vSel.vehiculo || 'esta ruta') : null}
                onMontarRequisicion={montarRequisicion} onMontarDiligencia={montarDiligencia} />
            )}
          </aside>

          {/* ===== Centro: mapa + jornada ===== */}
          <section className="order-3 lg:order-none space-y-3 min-w-0">
            <MapaRuta viaje={vSel} proyectos={data.proyectos || []} nombreObra={nombreObra} listas={filtro === 'dia' ? listas : []} diligencias={filtro === 'dia' ? diligencias : []}
              gpsUnidades={(vSel?.fecha || fecha) === hoy ? gpsUnidades : []} vehiculos={data.vehiculos} recorrido={puntosRecorrido} puntoMapa={puntoMapa}
              onMapClick={puedeAgregar ? (lat, lng) => { setAvanzada(null); setPuntoMapa({ lat, lng }); } : null}
              height={esDesktop ? 'calc(100vh - 230px)' : 320} />
            {horasChofer.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                <div className="text-[11px] tracking-wider uppercase text-zinc-400 font-bold mb-1.5">⏱ Jornada de choferes · {formatFechaCorta(fecha)} (extras sobre 8 h)</div>
                {horasChofer.map(({ v, horasTot, extras }) => (
                  <div key={v.id} className="grid grid-cols-4 gap-2 items-center text-xs border-t border-zinc-800 py-1.5">
                    <span className="font-bold truncate">{v.choferNombre}</span>
                    <span className="text-zinc-400">{hora(v.horaInicio)} → {hora(v.horaFin)}</span>
                    <span className="text-zinc-300 tabular-nums">{horasTot != null ? horasTot.toFixed(1) + ' h' : 'en la calle'}</span>
                    <span className={`font-bold ${extras > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{extras != null ? (extras > 0 ? `+${extras.toFixed(1)} h extra` : 'sin extras') : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ===== Derecha: la ruta abierta ===== */}
          <aside className="order-2 lg:order-none lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            {!vSel ? (
              <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-card p-6 text-center">
                <div className="text-sm font-bold text-zinc-300">{filtro === 'dia' ? (viajesLista.length ? 'Elige una ruta a la izquierda' : 'No hay rutas para este día') : 'Elige una ruta de la lista'}</div>
                {filtro === 'dia' && !viajesLista.length && (
                  <button onClick={() => setCreando(true)} className="mt-3 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-black px-4 py-2.5 rounded-card">Crear la primera ruta</button>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-3">
                <CabeceraRuta key={vSel.id} viaje={vSel} choferes={choferes} vehiculos={data.vehiculos} totalM={totalM}
                  onEditar={editarViaje} onCambiarVehiculo={cambiarVehiculo} onDuplicar={duplicar} onCancelar={cancelarViaje} />

                {puedeAgregar && (
                  <div className="space-y-2">
                    {avanzada ? (
                      <FormParadaAvanzada viaje={vSel} candidatos={candidatos} textoInicial={avanzada.texto} onCerrar={() => setAvanzada(null)} onGuardado={() => recargar({ silencioso: true })} />
                    ) : (
                      <BuscadorParada key={vSel.id} candidatos={candidatos} recientes={recientes} puntoMapa={puntoMapa} onLimpiarPuntoMapa={() => setPuntoMapa(null)}
                        onAgregar={agregarRapida} onMasOpciones={(texto) => setAvanzada({ texto })} />
                    )}
                    {!avanzada && (
                      <div className="flex gap-1.5 flex-wrap">
                        {!yaSaleDeOficina && <button onClick={() => paradaOficina(true)} className="text-xs font-bold border border-zinc-700 hover:border-cyan-600 text-zinc-300 px-2.5 py-1.5 rounded-card">🏢 Salir de oficina</button>}
                        {!yaRegresa && activasSel.length > 0 && <button onClick={() => paradaOficina(false)} className="text-xs font-bold border border-zinc-700 hover:border-cyan-600 text-zinc-300 px-2.5 py-1.5 rounded-card">🏢 Regresar a oficina</button>}
                        <button onClick={() => setAvanzada({ texto: '' })} className="text-xs font-bold border border-zinc-700 hover:border-cyan-600 text-zinc-400 px-2.5 py-1.5 rounded-card flex items-center gap-1 ml-auto" title="Recoger y entregar, lugar escrito a mano, documento para retirar">
                          <SlidersHorizontal className="w-3.5 h-3.5" /> Más opciones
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <ListaParadas viaje={vSel} proyectos={data.proyectos || []} nombreObra={nombreObra}
                  editable={puedeAgregar} puedeMarcar={!esViajeCancelado(vSel)} gpsRevisado={gpsRevisado}
                  onReordenar={reordenar} onMarcarHecha={marcarHechaOficina} onQuitar={quitarParada} />
                {puedeAgregar && vSel.paradas.length > 1 && <div className="text-[11px] text-zinc-500">Arrastra las paradas para cambiar el orden. Las distancias son en línea recta, solo para orientarte.</div>}
              </div>
            )}
          </aside>
        </div>
      )}

      {gestionLugares && <ModalLugares lugares={lugares} suplidores={suplidores} onCerrar={() => setGestionLugares(false)} onCambio={() => recargar({ silencioso: true })} />}
    </div>
  );
}
