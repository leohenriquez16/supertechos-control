'use client';

// v8.95.0: «Mis oficinas de hoy» — tarjeta del técnico para las campañas de levantamiento (ej. pintura de las
// oficinas de Banreservas). Se carga sola con sus oficinas asignadas y NO pinta nada si no tiene ninguna.
// Secciones: Hoy (por franja), Para corregir (devueltas por Edwin, con su nota) y Atrasadas.
// Cada oficina: Waze, Llamar, el botón grande (Iniciar / Seguir / Corregir / Ver) y «No pude levantar».
// Al abrir, el padre monta el formulario a pantalla completa (onAbrirOficina(proyecto, site)).

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Navigation, Phone, Play, ClipboardList, X, AlertTriangle, Ban } from 'lucide-react';
import { listarMisOficinasCampana, obtenerProyectoSurvey, marcarNoPudoOficina, marcarEnSitioOficina } from '../../lib/surveys';
import {
  FRANJAS, MOTIVOS_NO_PUDO, labelNoPudo, ESTADO_OFICINA, estadoOficina, accionTecnico, puedeAbrirOficina,
  oficinasDeHoy, hoyRD, diaCorto,
} from '../../lib/helpers/coordinacion';
import { urlWaze } from '../../lib/helpers/navegacion';

// v8.95.0: estados en los que el técnico todavía no ha empezado (al abrir pasan a «En proceso»).
const SIN_EMPEZAR = ['programada', 'confirmada', 'no_pudo'];

export default function TarjetaMisOficinasHoy({ usuario, onAbrirOficina }) {
  const [sites, setSites] = useState(null); // null = cargando
  const [abriendo, setAbriendo] = useState(null);
  const [hoja, setHoja] = useState(null); // oficina a la que se le marca «No pude levantar»

  const cargar = useCallback(async () => {
    if (!usuario?.id) return;
    try { setSites(await listarMisOficinasCampana(usuario.id)); }
    catch { setSites([]); } // sin oficinas (o sin señal) no se muestra nada
  }, [usuario?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = hoyRD();
  const grupos = useMemo(() => oficinasDeHoy(sites || [], usuario?.id, hoy), [sites, usuario?.id, hoy]);
  const total = grupos.hoy.length + grupos.corregir.length + grupos.atrasadas.length;
  if (!sites || total === 0) return null;

  const abrir = async (site) => {
    if (!puedeAbrirOficina(site, usuario)) { alert('Esta oficina no está asignada a ti.'); return; }
    // Edwin ve «En proceso» desde que el técnico la abre; si falla (poca señal) no bloquea nada.
    if (SIN_EMPEZAR.includes(estadoOficina(site))) Promise.resolve().then(() => marcarEnSitioOficina(site.id)).catch(() => {});
    setAbriendo(site.id);
    try {
      const proyecto = await obtenerProyectoSurvey(site.project_id);
      if (!proyecto) throw new Error('no se encontró el levantamiento de esta oficina');
      onAbrirOficina?.(proyecto, site);
    } catch (e) {
      alert('No se pudo abrir la oficina: ' + (e?.message || 'error') + '. Revisa la señal y vuelve a intentar.');
    }
    setAbriendo(null);
  };

  const hoyPorFranja = ['manana', 'tarde', null].map(f => ({
    franja: f,
    lista: grupos.hoy.filter(s => (f ? s.visita_franja === f : !FRANJAS[s.visita_franja])),
  })).filter(g => g.lista.length > 0);

  return (
    <div className="bg-zinc-900 border border-red-800/60 rounded-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-red-400" />
        <span className="text-[11px] tracking-widest uppercase text-red-400 font-bold">Mis oficinas de hoy</span>
        <span className="text-[10px] text-zinc-500">({grupos.hoy.length})</span>
      </div>

      {grupos.corregir.length > 0 && (
        <Seccion titulo={`Para corregir (${grupos.corregir.length})`} color="text-pink-400">
          {grupos.corregir.map(s => <Oficina key={s.id} site={s} abriendo={abriendo} onAbrir={abrir} onNoPude={setHoja} />)}
        </Seccion>
      )}

      {grupos.hoy.length === 0 ? (
        <div className="text-xs text-zinc-500 mb-2">No tienes oficinas programadas para hoy.</div>
      ) : hoyPorFranja.map(g => (
        <Seccion key={g.franja || 'sin'} titulo={`Hoy · ${g.franja ? FRANJAS[g.franja] : 'Sin franja'} (${g.lista.length})`} color="text-zinc-300">
          {g.lista.map(s => <Oficina key={s.id} site={s} abriendo={abriendo} onAbrir={abrir} onNoPude={setHoja} />)}
        </Seccion>
      ))}

      {grupos.atrasadas.length > 0 && (
        <Seccion titulo={`Atrasadas (${grupos.atrasadas.length})`} color="text-amber-400">
          {grupos.atrasadas.map(s => <Oficina key={s.id} site={s} abriendo={abriendo} onAbrir={abrir} onNoPude={setHoja} atrasada />)}
        </Seccion>
      )}

      {hoja && <HojaNoPude site={hoja} onCerrar={() => setHoja(null)} onGuardado={() => { setHoja(null); cargar(); }} />}
    </div>
  );
}

function Seccion({ titulo, color, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className={`text-[11px] tracking-widest uppercase font-bold mb-1.5 ${color}`}>{titulo}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Oficina({ site, abriendo, onAbrir, onNoPude, atrasada = false }) {
  const est = estadoOficina(site);
  const meta = ESTADO_OFICINA[est] || ESTADO_OFICINA.sin_asignar;
  const accion = accionTecnico(site);
  const waze = urlWaze(site.latitude, site.longitude);
  const tel = String(site.mobile_phone || site.office_phone || '').replace(/[^\d+]/g, '');
  const cargando = abriendo === site.id;
  const colorBoton = accion.tono === 'alerta' ? 'bg-pink-600 hover:bg-pink-500' : accion.tono === 'neutro' ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-600 hover:bg-red-500';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-card p-3" style={{ borderLeftColor: meta.color, borderLeftWidth: 4 }}>
      <div className="min-w-0">
        <div className="font-bold text-base leading-tight">
          {site.external_code && <span className="font-mono text-zinc-400 mr-1.5">{site.external_code}</span>}
          {site.name || 'Oficina'}
        </div>
        {site.address && <div className="text-[11px] text-zinc-500 mt-0.5">📍 {site.address}</div>}
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card" style={{ backgroundColor: meta.color + '22', color: meta.color }}>{meta.label}</span>
          {FRANJAS[site.visita_franja] && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-zinc-800 text-zinc-300">🕐 {FRANJAS[site.visita_franja]}</span>}
          {atrasada && site.visita_fecha && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-card bg-amber-600/20 text-amber-400">📅 Era el {diaCorto(site.visita_fecha)}</span>}
        </div>
      </div>

      {est === 'devuelta' && site.devuelto_nota && (
        <div className="mt-2 text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded-card p-2">
          <span className="font-bold text-red-400">Corregir{site.devuelto_por ? ` (${site.devuelto_por})` : ''}: </span>{site.devuelto_nota}
        </div>
      )}
      {est === 'falta_info' && (
        <div className="mt-2 text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Falta jardín o techo: vuelve a completarlo.</div>
      )}
      {est === 'no_pudo' && (
        <div className="mt-2 text-xs text-orange-300">No se pudo: {labelNoPudo(site.no_pudo_motivo)}{site.no_pudo_nota ? ` — ${site.no_pudo_nota}` : ''}</div>
      )}

      <div className="flex items-stretch gap-2 mt-3">
        {waze && (
          <a href={waze} target="_blank" rel="noopener noreferrer" className="px-3 py-3 rounded-card bg-zinc-800 border border-zinc-700 hover:border-cyan-500 text-cyan-300 text-xs font-black uppercase flex items-center gap-1.5">
            <Navigation className="w-4 h-4" /> Waze
          </a>
        )}
        {tel && (
          <a href={`tel:${tel}`} className="px-3 py-3 rounded-card bg-zinc-800 border border-zinc-700 hover:border-green-500 text-green-300 text-xs font-black uppercase flex items-center gap-1.5">
            <Phone className="w-4 h-4" /> Llamar
          </a>
        )}
        <button onClick={() => onAbrir(site)} disabled={!!abriendo} className={`flex-1 px-4 py-3 rounded-card ${colorBoton} disabled:opacity-60 text-white text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2`}>
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {accion.label}
        </button>
      </div>
      {(SIN_EMPEZAR.includes(est) || est === 'en_sitio') && (
        <button onClick={() => onNoPude(site)} className="w-full mt-2 py-2.5 rounded-card bg-zinc-900 border border-zinc-700 hover:border-orange-500 text-orange-300 text-xs font-bold uppercase flex items-center justify-center gap-1.5">
          <Ban className="w-3.5 h-3.5" /> No pude levantar
        </button>
      )}
    </div>
  );
}

// v8.95.0: hoja «No pude levantar»: un motivo obligatorio; la nota es obligatoria si el motivo es «Otro».
function HojaNoPude({ site, onCerrar, onGuardado }) {
  const [motivo, setMotivo] = useState(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const faltaNota = motivo === 'otro' && !nota.trim();

  const guardar = async () => {
    if (!motivo || faltaNota) return;
    setGuardando(true);
    try { await marcarNoPudoOficina(site.id, { motivo, nota: nota.trim() || null }); onGuardado(); }
    catch (e) { alert('No se pudo guardar: ' + (e?.message || 'error') + '. Revisa la señal.'); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-end sm:items-center justify-center" onClick={() => !guardando && onCerrar()}>
      <div className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-card sm:rounded-card p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest uppercase text-orange-400 font-bold">No pude levantar</div>
            <div className="font-bold truncate">{site.external_code ? `${site.external_code} · ` : ''}{site.name || 'Oficina'}</div>
          </div>
          <button onClick={onCerrar} disabled={guardando} className="p-2 text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-[11px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">¿Qué pasó?</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          {MOTIVOS_NO_PUDO.map(m => (
            <button key={m.value} onClick={() => setMotivo(m.value)}
              className={`text-left px-3 py-3 rounded-card border text-sm font-bold ${motivo === m.value ? 'bg-orange-600/20 border-orange-500 text-orange-200' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] tracking-widest uppercase text-zinc-500 font-bold mb-1.5">Nota {motivo === 'otro' ? '(obligatoria)' : '(opcional)'}</div>
        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Ej. el gerente pidió volver el jueves"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-card p-2 text-sm text-white focus:border-orange-500 outline-none" />
        {faltaNota && <div className="text-[11px] text-orange-300 mt-1">Escribe qué pasó.</div>}
        <button onClick={guardar} disabled={!motivo || faltaNota || guardando}
          className="w-full mt-3 py-3 rounded-card bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-black uppercase flex items-center justify-center gap-2">
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
        </button>
        <div className="text-[10px] text-zinc-500 mt-2">La oficina queda pendiente para que Edwin la vuelva a programar.</div>
      </div>
    </div>
  );
}
