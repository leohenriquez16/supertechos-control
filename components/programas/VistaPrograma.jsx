'use client';

// v8.58.0 — PROGRAMA DE LOCACIONES (Fase 1, lo que ve operaciones).
// Una campaña con un mismo cliente y muchas locaciones: Towers and Sites, 60 antenas
// antes de fin de año. Amarra cada locación con su levantamiento y su obra (que viven
// en `proyectos`) y enseña dónde está trancada: luz verde del propietario, cotización
// sin aprobar, o aprobada sin programar.
//
// Tres vistas: tablero por etapa, mapa y planificador por zona (para mandar la brigada
// a varias antenas cercanas el mismo día en vez de cruzar la ciudad por una sola).

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Check, Clock, MapPin, Loader2, RefreshCw, Route, LayoutGrid, Search, Lock, Ruler, FileText, CalendarDays, Wrench, ClipboardCheck, CheckCircle2, ShieldCheck, PaintRoller } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD } from '../../lib/helpers/formato';
import { ETAPAS, ETAPA, FASES, COLOR_ETAPA, turnoDe, resumenPrograma, pendientesDelCliente, agruparPorZona, textoCoordinacion, ETAPAS_PINTURA, ETAPA_PINTURA, RECEPCION, sumaMontos, programacionObra, ETAPAS_TABLERO, FASES_TABLERO, ETAPA_TABLERO, turnoTablero } from '../../lib/helpers/programaSites';
import FichaLocacion from './FichaLocacion';
import ModalProgramar from './ModalProgramar';
import { LineaAcceso, PanelLlaves } from './AccesosPrograma';
import { CANDADO } from '../../lib/helpers/programaSites';
// v8.93.0: «Pedir acceso» reutiliza la carta de acceso de la obra (personal + vehículo)
const ModalCartaAcceso = dynamic(() => import('../proyecto/ModalCartaAcceso'), { ssr: false });
const fmtLarga = (f) => { try { return new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { return f; } };

// v8.91.0: monto de una columna (sin ITBIS, de Odoo) y cuántas no tienen monto, para que el total no engañe
const MontoColumna = ({ lista, campo }) => {
  if (!lista.length) return null;
  const { total, sinMonto } = sumaMontos(lista, campo);
  return (
    <div className="text-[10px] text-zinc-300 font-bold tabular-nums">
      {total > 0 ? formatRD(total) : 'RD$ —'}<span className="text-zinc-600 font-normal"> sin ITBIS{sinMonto ? ` · ${sinMonto} sin monto` : ''}</span>
    </div>
  );
};
const fmtCorta = (f) => { try { return new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }); } catch { return f; } };
/** Programación de la obra (techo o pintura) en una línea. */
const LineaProgramacion = ({ obra, personal = [] }) => {
  const pr = programacionObra(obra);
  if (!pr) return null;
  const sup = obra?.supervisorId ? (personal.find(p => p.id === obra.supervisorId)?.nombre || '') : '';
  if (pr.estado === 'sin_programar') return <div className="text-[10px] text-amber-400 font-bold">Sin programar{sup ? ` · ${sup}` : ''}</div>;
  return (
    <div className={`text-[10px] font-bold ${pr.estado === 'atrasada' ? 'text-red-400' : 'text-sky-400'}`}>
      {pr.estado === 'atrasada' ? `Debió arrancar el ${fmtCorta(pr.inicio)} (${pr.diasAtraso} d)` : `Programada ${fmtCorta(pr.inicio)}${pr.fin ? ` – ${fmtCorta(pr.fin)}` : ''}`}
      {sup ? <span className="text-zinc-400 font-normal"> · {sup}</span> : null}
    </div>
  );
};
/** Reservas (correcciones pendientes tras la visita de recepción) y reincidencias (filtración en un sitio entregado), con los términos de Sites. */
const ChipsCierre = ({ l }) => (
  <>
    {l.reservasAbiertas && <div className="text-[10px] font-bold text-orange-400" title={l.reservasNota || ''}>Con reservas{l.reservasNota ? `: ${l.reservasNota}` : ''}</div>}
    {(l.reincidencias || []).length > 0 && <div className="text-[10px] font-bold text-red-400">Reincidencia · {l.reincidencias.map(r => r.codigo || 'reclamación').join(', ')}</div>}
  </>
);

// v8.59.0: un icono por etapa, para distinguirlas sin leer el texto.
const ICONO = { lock: Lock, 'map-pin': MapPin, ruler: Ruler, file: FileText, calendar: CalendarDays, tool: Wrench, clipboard: ClipboardCheck, check: CheckCircle2 };

const MapaPrograma = dynamic(() => import('./MapaPrograma'), { ssr: false, loading: () => <div className="h-[420px] grid place-items-center text-zinc-500 text-xs">Cargando mapa…</div> });
// v8.71.0: la carta de garantía de la locación, desde el tablero.
const ModalEntregaGarantia = dynamic(() => import('../proyecto/modales/ModalEntregaGarantia'), { ssr: false });

const Chip = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{children}
  </span>
);

export default function VistaPrograma({ programa, locaciones = [], usuario, data = {}, onVolver, onRecargar, onRecargarDatos, onAbrirProyecto }) {
  const [tab, setTab] = useState('tablero');
  const [buscar, setBuscar] = useState('');
  const [guardando, setGuardando] = useState(null);
  const [ficha, setFicha] = useState(null); // v8.59.2: ficha de la sucursal
  const [refrescando, setRefrescando] = useState(false); // v8.69.0
  const [garantiaDe, setGarantiaDe] = useState(null); // v8.71.0: carta de garantía de la locación
  // v8.91.0: programar en bloque — selección por tipo ('techo' en el tablero, 'pintura' en Recubre)
  const [sel, setSel] = useState({ tipo: 'techo', ids: [] });
  const [programando, setProgramando] = useState(false);
  // v8.93.0: usuarios de llave (Teleporte / iLoq) y «Pedir acceso»
  const [llaves, setLlaves] = useState([]);
  const cargarLlaves = async () => { try { setLlaves(await db.listarLlavesPrograma(programa.id)); } catch (e) { console.warn('llaves:', e?.message); } };
  useEffect(() => { if (programa?.id) cargarLlaves(); /* eslint-disable-next-line */ }, [programa?.id]);
  const [accesoDe, setAccesoDe] = useState(null);
  const marcarAcceso = async (l, campo) => {
    const txt = campo === 'accesoAsignadoAt' ? `¿Sites ya asignó la llave / creó el acceso de ${l.nombre}?` : `¿Ya se le pidió a Sites el acceso de ${l.nombre}?`;
    if (!confirm(txt)) return;
    try { await db.actualizarLocacionPrograma(l.id, { [campo]: new Date().toISOString(), etapaDesde: l.etapaDesde || undefined }); await onRecargar?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
  };
  const toggleSel = (tipo, id) => setSel(s => {
    const base = s.tipo === tipo ? s.ids : [];
    return { tipo, ids: base.includes(id) ? base.filter(x => x !== id) : [...base, id] };
  });
  // solo cuentan las que siguen siendo programables (tras refrescar pudieron arrancar)
  const programable = (l) => sel.tipo === 'pintura'
    ? ['espera_techo', 'lista'].includes(l.etapaPintura) && l.proyectoPinturaId && ['aprobado', 'planificado'].includes(l.obraPintura?.estado)
    : l.etapa === 'por_programar' && l.proyectoId && ['aprobado', 'planificado'].includes(l.obra?.estado);
  const seleccionadas = sel.ids.map(id => locaciones.find(l => l.id === id)).filter(l => l && programable(l));
  const cambiarTab = (t) => { setTab(t); setSel({ tipo: t === 'pintura' ? 'pintura' : 'techo', ids: [] }); };

  // v8.92.0: lo que salió del programa no cuenta en el tablero, los totales ni el portal
  const activas = useMemo(() => locaciones.filter(l => !l.fueraPrograma), [locaciones]);
  const fuera = useMemo(() => locaciones.filter(l => l.fueraPrograma), [locaciones]);
  const [verFuera, setVerFuera] = useState(false);
  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return activas;
    return activas.filter(l => `${l.nombre} ${l.codigoUt || ''} ${l.direccion || ''} ${l.cotizacionRef || ''} ${l.cotizacionPinturaRef || ''}`.toLowerCase().includes(q));
  }, [activas, buscar]);

  const resumen = useMemo(() => resumenPrograma(activas, { fechaMeta: programa?.fechaMeta }), [activas, programa]);
  const pendCliente = useMemo(() => pendientesDelCliente(activas), [activas]);
  const zonas = useMemo(() => agruparPorZona(filtradas.filter(l => ['sin_obra', 'por_programar', 'programado'].includes(l.etapaTablero)), 8), [filtradas]);
  const devolverAlPrograma = async (l) => {
    if (!confirm(`¿Devolver ${l.nombre} al programa?`)) return;
    try { await db.actualizarLocacionPrograma(l.id, { fueraPrograma: false, fueraMotivo: null, fueraAt: null, etapaDesde: l.etapaDesde || undefined }); await onRecargar?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const marcarLuzVerde = async (loc, valor) => {
    // v8.59.0: confirmar en los dos sentidos — un clic suelto movía la locación de etapa.
    const msg = valor
      ? `¿El propietario de ${loc.nombre} ya autorizó el acceso?\n\nPasa a "Por levantar".`
      : `¿Quitar la luz verde de ${loc.nombre}?\n\nVuelve a "Sin luz verde".`;
    if (!confirm(msg)) return;
    setGuardando(loc.id);
    try {
      await db.actualizarLocacionPrograma(loc.id, {
        luzVerde: valor, luzVerdeAt: valor ? new Date().toISOString() : null,
        luzVerdePor: valor ? `${usuario?.nombre || 'ERP'} (ERP)` : null,
      });
      await onRecargar?.();
    }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(null);
  };

  // Crea el levantamiento ya amarrado a la locación (nace en el módulo de Levantamientos).
  const agendarLevantamiento = async (loc) => {
    if (!loc.luzVerde && !confirm(`${loc.nombre} todavía no tiene luz verde del propietario.\n\n¿Crear el levantamiento igual?`)) return;
    setGuardando(loc.id);
    try {
      const codigo = await db.agendarLevantamientoLocacion(loc, programa, usuario);
      await onRecargar?.();
      alert(`Levantamiento ${codigo || ''} creado para ${loc.nombre}.\nAsígnalo y ponle fecha en Levantamientos.`);
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardando(null);
  };

  // v8.92.0: columnas de la cotización al cobro (etapaTablero)
  const porEtapa = useMemo(() => {
    const g = Object.fromEntries(ETAPAS_TABLERO.map(e => [e.id, []]));
    filtradas.forEach(l => { (g[l.etapaTablero] = g[l.etapaTablero] || []).push(l); });
    return g;
  }, [filtradas]);

  // v8.90.0: pintura interior (Recubre), con su propio tablero
  const porEtapaPintura = useMemo(() => {
    const g = Object.fromEntries(ETAPAS_PINTURA.map(e => [e.id, []]));
    filtradas.forEach(l => { if (l.etapaPintura) (g[l.etapaPintura] = g[l.etapaPintura] || []).push(l); });
    return g;
  }, [filtradas]);
  const conPintura = useMemo(() => activas.filter(l => l.etapaPintura).length, [activas]);
  // v8.91.0: valor del programa (sin ITBIS, de Odoo)
  const valor = useMemo(() => ({
    techo: sumaMontos(activas, 'montoSinItbis'),
    pintura: sumaMontos(activas.filter(l => l.etapaPintura), 'pinturaMontoSinItbis'),
  }), [activas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onVolver} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black uppercase tracking-tight truncate">{programa?.nombre || 'Programa'}</h1>
          <div className="text-[11px] text-zinc-500">
            {resumen.total} locaciones · {resumen.entregadas} entregadas · {resumen.pctAvance}% del programa
            {programa?.fechaMeta && <> · meta {new Date(programa.fechaMeta + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })}</>}
          </div>
        </div>
        {/* v8.69.0: releer todo — vuelve a amarrar cada locación con su levantamiento y
            su obra, y recoge las visitas y cotizaciones que pasaron desde la última vez. */}
        <button
          onClick={async () => { if (refrescando) return; setRefrescando(true); try { await onRecargar?.(); } finally { setRefrescando(false); } }}
          disabled={refrescando}
          title="Releer levantamientos y obras"
          className="shrink-0 w-9 h-9 grid place-items-center rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Lo que marca el ritmo */}
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black">{resumen.faltan}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Faltan por entregar</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black text-amber-400">{resumen.pendientesCliente}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Esperan al cliente</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black text-sky-400">{resumen.pendientesNuestros}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Nos toca a nosotros</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-2xl font-black">{resumen.ritmo ? resumen.ritmo.porSemanaNecesarias : '—'}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            {resumen.ritmo ? `por semana para llegar (${resumen.ritmo.diasRestantes} días)` : 'sin fecha meta'}
          </div>
        </div>
      </div>

      {/* v8.91.0: valor del programa, techo y pintura, sin ITBIS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex flex-wrap gap-x-6 gap-y-1 items-baseline text-[11px]">
        <span className="text-zinc-400 font-bold uppercase tracking-widest">Valor del programa · sin ITBIS</span>
        <span>Techos <b className="text-white text-sm tabular-nums">{formatRD(valor.techo.total)}</b>{valor.techo.sinMonto ? <span className="text-zinc-500"> ({valor.techo.sinMonto} sin monto)</span> : null}</span>
        <span>Pintura · Recubre <b className="text-white text-sm tabular-nums">{formatRD(valor.pintura.total)}</b>{valor.pintura.sinMonto ? <span className="text-zinc-500"> ({valor.pintura.sinMonto} sin monto)</span> : null}</span>
        <span>Total <b className="text-white text-sm tabular-nums">{formatRD(valor.techo.total + valor.pintura.total)}</b>{valor.techo.sinMonto + valor.pintura.sinMonto ? <span className="text-zinc-500"> ({valor.techo.sinMonto + valor.pintura.sinMonto} sin monto)</span> : null}</span>
      </div>

      {programa?.id && <PanelLlaves programaId={programa.id} llaves={llaves} personal={data.personal || []} onCambio={cargarLlaves} />}

      {/* v8.59.0: enlace del portal del cliente */}
      {programa?.codigoPublico && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-zinc-400 font-bold uppercase tracking-widest">Portal del cliente</span>
          <code className="text-zinc-200 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 select-all break-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/programa/{programa.codigoPublico}
          </code>
          <button onClick={async () => {
            const url = `${window.location.origin}/programa/${programa.codigoPublico}`;
            try { await navigator.clipboard.writeText(url); alert('Enlace copiado. La clave se la das aparte.'); } catch { prompt('Copia el enlace:', url); }
          }} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold uppercase rounded-card">Copiar enlace</button>
          <a href={`/programa/${programa.codigoPublico}`} target="_blank" rel="noreferrer" className="underline text-zinc-400 hover:text-white">Ver como el cliente</a>
          <span className="text-zinc-600">La clave no se muestra aquí por seguridad.</span>
        </div>
      )}

      {/* Lo que el cliente tiene trancado */}
      {(pendCliente.sinLuzVerde.length > 0 || pendCliente.cotizacionesPorAprobar.length > 0) && (
        <div className="bg-amber-950/20 border border-amber-800 rounded-card p-3 text-[11px] text-amber-200">
          <b>Trancado del lado de Sites:</b>{' '}
          {[pendCliente.sinLuzVerde.length > 0 && `${pendCliente.sinLuzVerde.length} sin luz verde del propietario`,
            pendCliente.cotizacionesPorAprobar.length > 0 && `${pendCliente.cotizacionesPorAprobar.length} cotización(es) por aprobar`].filter(Boolean).join(' · ')}
          {pendCliente.sinSupervisor.length > 0 && <> · {pendCliente.sinSupervisor.length} sin supervisor asignado</>}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {[['tablero', 'Tablero', LayoutGrid], ['pintura', `Pintura · Recubre (${conPintura})`, PaintRoller], ['mapa', 'Mapa', MapPin], ['zonas', 'Por zona', Route]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => cambiarTab(id)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase rounded-card flex items-center gap-1.5 ${tab === id ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar locación, código o cotización…"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-600 outline-none rounded-card pl-7 pr-3 py-1.5 text-xs text-white placeholder-zinc-600" />
        </div>
        {seleccionadas.length > 0 && (tab === 'pintura') === (sel.tipo === 'pintura') && (
          <div className="flex items-center gap-2">
            <button onClick={() => setProgramando(true)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase rounded-card bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Programar {seleccionadas.length}{sel.tipo === 'pintura' ? ' (pintura)' : ''}
            </button>
            <button onClick={() => setSel({ tipo: sel.tipo, ids: [] })} className="text-[10px] underline text-zinc-500 hover:text-white">quitar selección</button>
          </div>
        )}
      </div>

      {tab === 'tablero' && (
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {FASES_TABLERO.map((fase, nf) => (
            <div key={fase.id} className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1">{nf + 1} · {fase.label}</div>
              {ETAPAS_TABLERO.filter(e => e.fase === fase.id).map(e => {
                const lista = porEtapa[e.id] || [];
                if (e.soloSiHay && !lista.length) return null;
                const Icono = ICONO[e.icono] || Clock;
                const color = e.color;
                return (
                  <div key={e.id} className="bg-zinc-900 rounded-card p-2.5 space-y-2" style={{ border: `1px solid ${color}55`, borderTop: `3px solid ${color}` }}>
                    <div className="flex items-start gap-2">
                      <Icono className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-black leading-tight" style={{ color }}>{e.label}</div>
                        <div className="text-[10px] text-zinc-500 leading-snug">{e.detalle}</div>
                      </div>
                      <span className="text-sm font-black text-zinc-200">{lista.length}</span>
                    </div>
                    <div className={`text-[9px] font-bold uppercase tracking-wide ${e.deQuien === 'cliente' ? 'text-amber-400' : e.deQuien === 'nosotros' ? 'text-sky-400' : 'text-zinc-500'}`}>{turnoTablero(e.id)}</div>
                    <MontoColumna lista={lista} campo="montoSinItbis" />
                    {e.id === 'terminado' && lista.length > 0 && (
                      <div className="text-[10px] flex gap-3 flex-wrap">
                        <span style={{ color: RECEPCION.listo.color }}>{lista.filter(l => l.recepcion === 'listo').length} listas techo y pintura</span>
                        <span style={{ color: RECEPCION.solo_techo.color }}>{lista.filter(l => l.recepcion === 'solo_techo').length} solo techo</span>
                      </div>
                    )}
                    <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                      {(e.id === 'terminado' ? [...lista].sort((a, b) => (a.recepcion === 'listo' ? 0 : 1) - (b.recepcion === 'listo' ? 0 : 1)) : lista).map(l => (
                        <div key={l.id} className="bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-card p-2">
                          {['por_programar', 'programado'].includes(e.id) && l.proyectoId && ['aprobado', 'planificado'].includes(l.obra?.estado) && (
                            <label className="float-right ml-1 cursor-pointer" title="Elegir para programar">
                              <input type="checkbox" className="accent-red-600" checked={sel.tipo === 'techo' && sel.ids.includes(l.id)} onChange={() => toggleSel('techo', l.id)} />
                            </label>
                          )}
                          <button onClick={() => setFicha(l)} className="text-left w-full">
                            <div className="text-[11px] font-bold text-zinc-100 truncate hover:underline">{l.nombre}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{l.codigoUt}{l.sector ? ` · ${l.sector}` : ''}</div>
                            {l.etapaDesde && <div className="text-[10px] text-zinc-400">desde {new Date(l.etapaDesde).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}{l.diasEnEtapa != null ? ` · ${l.diasEnEtapa} d` : ''}</div>}
                            {['por_programar', 'programado', 'en_ejecucion'].includes(e.id) && !l.personalAprobadoAt && <div className="text-[10px] text-red-400 font-bold">Falta aprobación del personal</div>}
                            {['por_programar', 'programado'].includes(e.id) && <LineaProgramacion obra={l.obra} personal={data.personal} />}
                            {e.id === 'sin_obra' && <div className="text-[10px] text-red-400 font-bold">Sin obra en el ERP</div>}
                            {e.id === 'en_ejecucion' && l.obra?.estado === 'parado' && <div className="text-[10px] text-red-400 font-bold">Obra parada</div>}
                            <LineaAcceso l={l} obra={l.obra} llaves={llaves} personal={data.personal || []} />
                            {e.id === 'terminado' && l.recepcion && <div className="text-[10px] font-bold" style={{ color: RECEPCION[l.recepcion].color }}>{RECEPCION[l.recepcion].label}</div>}
                            <ChipsCierre l={l} />
                            {l.etapaPintura && (
                              <div className="text-[10px] font-bold flex items-center gap-1" style={{ color: ETAPA_PINTURA[l.etapaPintura]?.color }}>
                                <PaintRoller className="w-3 h-3" /> Pintura: {ETAPA_PINTURA[l.etapaPintura]?.label}
                              </div>
                            )}
                          </button>
                          {l.cotizacionRef && (
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              {l.cotizacionRef}{l.montoSinItbis ? ` · ${formatRD(l.montoSinItbis)}` : ''}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {/* v8.71.0: la carta de garantía se saca desde la columna donde
                                falta entregar, que es donde toca la acción. */}
                            {e.id === 'terminado' && l.proyectoId && (
                              <button onClick={() => setGarantiaDe(l)}
                                className="text-[10px] font-bold uppercase px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded-card flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> Carta de garantía
                              </button>
                            )}
                            {l.acceso && l.acceso !== 'asignado' && l.proyectoId && (
                              <button onClick={() => setAccesoDe(l)}
                                className="text-[10px] font-bold uppercase px-2 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-card">
                                {l.acceso === 'pedido' ? 'Reenviar acceso' : 'Pedir acceso'}
                              </button>
                            )}
                            {l.acceso === 'falta' && <button onClick={() => marcarAcceso(l, 'accesoPedidoAt')} className="text-[10px] underline text-zinc-500 hover:text-white">ya se pidió</button>}
                            {l.acceso === 'pedido' && <button onClick={() => marcarAcceso(l, 'accesoAsignadoAt')} className="text-[10px] underline text-green-400 hover:text-white">llave asignada</button>}
                            {['recibido', 'facturado', 'cobrado'].includes(e.id) && l.proyectoId && (
                              <button onClick={() => setGarantiaDe(l)} className="text-[10px] underline text-zinc-400 hover:text-white">carta de garantía</button>
                            )}
                            {l.proyectoId && onAbrirProyecto && (
                              <button onClick={() => onAbrirProyecto(l.proyectoId)} className="text-[10px] underline text-zinc-400 hover:text-white">ver obra</button>
                            )}
                            {l.supervisorClienteNombre && <span className="text-[10px] text-zinc-600 truncate">👤 {l.supervisorClienteNombre}</span>}
                          </div>
                        </div>
                      ))}
                      {lista.length === 0 && <div className="text-[10px] text-zinc-700 py-1 text-center">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* v8.92.0: lo que salió del programa, aparte y recuperable */}
      {tab === 'tablero' && fuera.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-[11px]">
          <button onClick={() => setVerFuera(v => !v)} className="font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
            Fuera del programa ({fuera.length}) {verFuera ? '▴' : '▾'}
          </button>
          {verFuera && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {fuera.map(l => (
                <div key={l.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                  <button onClick={() => setFicha(l)} className="text-left w-full">
                    <div className="font-bold text-zinc-300 truncate hover:underline">{l.nombre}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{l.codigoUt}{l.fueraMotivo ? ` · ${l.fueraMotivo}` : ''}</div>
                  </button>
                  <button onClick={() => devolverAlPrograma(l)} className="text-[10px] underline text-zinc-500 hover:text-white mt-1">volver al programa</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'pintura' && (
        <div className="space-y-2">
          <div className="text-[11px] text-zinc-500">
            Pintura interior de cada sitio (resane y pintura, la hace Recubre). Va después del techo: «Lista para Recubre» son las que ya tienen el techo terminado.
            {locaciones.length - conPintura > 0 && <> {locaciones.length - conPintura} locaciones no tienen pintura cotizada.</>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {ETAPAS_PINTURA.map(e => {
              const lista = porEtapaPintura[e.id] || [];
              return (
                <div key={e.id} className="bg-zinc-900 rounded-card p-2.5 space-y-2" style={{ border: `1px solid ${e.color}55`, borderTop: `3px solid ${e.color}` }}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-black leading-tight" style={{ color: e.color }}>{e.label}</div>
                      <div className="text-[10px] text-zinc-500 leading-snug">{e.detalle}</div>
                    </div>
                    <span className="text-sm font-black text-zinc-200">{lista.length}</span>
                  </div>
                  <MontoColumna lista={lista} campo="pinturaMontoSinItbis" />
                  <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                    {lista.map(l => (
                      <div key={l.id} className="bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-card p-2">
                        {['espera_techo', 'lista'].includes(e.id) && l.proyectoPinturaId && ['aprobado', 'planificado'].includes(l.obraPintura?.estado) && (
                          <label className="float-right ml-1 cursor-pointer" title="Elegir para programar la pintura">
                            <input type="checkbox" className="accent-red-600" checked={sel.tipo === 'pintura' && sel.ids.includes(l.id)} onChange={() => toggleSel('pintura', l.id)} />
                          </label>
                        )}
                        <button onClick={() => setFicha(l)} className="text-left w-full">
                          <div className="text-[11px] font-bold text-zinc-100 truncate hover:underline">{l.nombre}</div>
                          <div className="text-[10px] text-zinc-500 truncate">{l.codigoUt}</div>
                          {l.pinturaDesde && <div className="text-[10px] text-zinc-400">desde {new Date(l.pinturaDesde).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}</div>}
                          <div className="text-[10px] mt-0.5" style={{ color: COLOR_ETAPA[l.etapa] }}>Techo: {ETAPA[l.etapa]?.label}</div>
                          {['espera_techo', 'lista'].includes(e.id) && (l.proyectoPinturaId ? <LineaProgramacion obra={l.obraPintura} personal={data.personal} /> : <div className="text-[10px] text-amber-400">Sin obra de pintura en el ERP</div>)}
                          <ChipsCierre l={l} />
                        </button>
                        {l.cotizacionPinturaRef && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">{l.cotizacionPinturaRef}{l.pinturaMontoSinItbis ? ` · ${formatRD(l.pinturaMontoSinItbis)}` : ''}</div>
                        )}
                        {l.proyectoPinturaId && onAbrirProyecto && (
                          <button onClick={() => onAbrirProyecto(l.proyectoPinturaId)} className="text-[10px] underline text-zinc-400 hover:text-white mt-1">ver obra de pintura</button>
                        )}
                      </div>
                    ))}
                    {lista.length === 0 && <div className="text-[10px] text-zinc-700 py-1 text-center">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'mapa' && (
        <div className="space-y-2">
          <MapaPrograma locaciones={filtradas} onSeleccionar={(l) => setFicha(l)} />
          <div className="flex gap-3 flex-wrap">
            {ETAPAS_TABLERO.filter(e => (porEtapa[e.id] || []).length).map(e => <Chip key={e.id} color={e.color}>{e.label} ({(porEtapa[e.id] || []).length})</Chip>)}
          </div>
        </div>
      )}

      {/* v8.71.0: carta de garantía de la locación — resuelve la obra por su id. */}

      {garantiaDe?.proyectoId && (() => {

        const obra = (data.proyectos || []).find(p => p.id === garantiaDe.proyectoId);

        if (!obra) return null;

        const sis = (data.sistemas || []).find(x => x.id === obra.sistema);

        return <ModalEntregaGarantia proyecto={obra} sistema={sis} data={data} usuario={usuario}

          onCambio={onRecargar} onCerrar={() => setGarantiaDe(null)} />;

      })()}


      {/* v8.93.0: Pedir acceso = carta de acceso de la obra con el texto para Sites */}
      {accesoDe?.proyectoId && (() => {
        const obra = (data.proyectos || []).find(p => p.id === accesoDe.proyectoId);
        if (!obra) { setTimeout(() => { alert('La obra no está cargada en el ERP; recarga la página.'); setAccesoDe(null); }, 0); return null; }
        const l = accesoDe;
        const c = l.candadoTipo ? CANDADO[l.candadoTipo]?.label : null;
        const inicio = l.obra?.inicioProgramado;
        const msg = [
          'Buenos días,',
          '',
          `Solicitamos el acceso a la localidad ${l.nombre}${l.codigoUt ? ` (${l.codigoUt})` : ''}${inicio ? ` a partir del ${fmtLarga(inicio)}` : ''} para el personal de la carta adjunta.`,
          c ? `Candado del sitio: ${c}.` : null,
          'Favor confirmarnos la asignación de la llave o la creación del acceso.',
        ].filter(x => x !== null).join('\n');
        return <ModalCartaAcceso proyecto={obra} data={data} usuario={usuario} onCerrar={() => setAccesoDe(null)}
          asuntoInicial={`Solicitud de acceso — ${l.nombre}${l.codigoUt ? ` — ${l.codigoUt}` : ''}`}
          mensajeInicial={msg}
          onEnviado={async () => { try { await db.actualizarLocacionPrograma(l.id, { accesoPedidoAt: new Date().toISOString(), etapaDesde: l.etapaDesde || undefined }); await onRecargar?.(); } catch (e) { console.warn(e); } }} />;
      })()}

      {programando && (
        <ModalProgramar seleccion={seleccionadas} tipo={sel.tipo} personal={data.personal || []} usuario={usuario}
          onCerrar={() => setProgramando(false)}
          onListo={async (n) => { setProgramando(false); setSel({ tipo: sel.tipo, ids: [] }); await Promise.all([onRecargar?.(), onRecargarDatos?.()]); alert(`${n} obra(s) programada(s).`); }} />
      )}

      {ficha && (
        <FichaLocacion
          locacion={locaciones.find(x => x.id === ficha.id) || ficha}
          usuario={usuario}
          onCerrar={() => setFicha(null)}
          onCambio={onRecargar}
          onAbrirProyecto={onAbrirProyecto}
        />
      )}

      {tab === 'zonas' && (
        <div className="space-y-3">
          <div className="text-[11px] text-zinc-500">
            Locaciones aprobadas por arrancar, agrupadas por cercanía (8 km). La idea es mandar la brigada a todas las de un grupo el mismo viaje.
          </div>
          {zonas.map((z, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-black uppercase tracking-wide">{z.zona}</div>
                <div className="text-[11px] text-zinc-500">{z.locaciones.length} locación(es)</div>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {z.locaciones.map(l => (
                  <div key={l.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                    <div className="text-[11px] font-bold truncate">{l.nombre}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{l.direccion}</div>
                    <div className="mt-1"><Chip color={ETAPA_TABLERO[l.etapaTablero]?.color}>{ETAPA_TABLERO[l.etapaTablero]?.label}</Chip></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {zonas.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-500">
              <Clock className="w-5 h-5 mx-auto mb-2 text-zinc-700" />
              Nada por arrancar: todo está en ejecución, cotizado o cerrado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
