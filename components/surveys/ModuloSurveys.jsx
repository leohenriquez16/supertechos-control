'use client';

// v8.19.1: Módulo de Levantamientos en sitio. Componente shell que
// maneja su propia "subvista" (lista | proyecto | site) sin usar
// Next.js routing, consistente con el patrón del resto del ERP.
//
// PR 3B.1 entrega: lista de proyectos. PRs siguientes agregan detalle
// proyecto + sites + DynamicSurveyForm + photos.

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, MapPin, Building, ChevronRight, ArrowLeft, List, Map as MapIcon } from 'lucide-react';
import { listarProyectosSurveys, listarSitesProyectoSurvey, listarTodosLosSitesSurvey, COMPANIES, PROJECT_STATUS, SITE_STATUS, SERVICE_LINES } from '../../lib/surveys';
import MapaLeaflet from '../common/MapaLeaflet';
import ServiceLineBadge from './ServiceLineBadge';
import SurveySiteDetail from './SurveySiteDetail';
import SurveySitesMap from './SurveySitesMap';
import ModalNuevoProyecto from './ModalNuevoProyecto';
import ModalLevantamientoSimple from './ModalLevantamientoSimple';

export default function ModuloSurveys({ usuario, data }) {
  // Subvistas: 'lista' (default) | 'proyecto' | 'site'
  const [subvista, setSubvista] = useState('lista');
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [siteActivo, setSiteActivo] = useState(null);
  // v8.19.64: si entramos directo a la ficha del sitio (levantamiento de 1 sitio),
  // "Volver" regresa a la lista, no a la pantalla de "sitios".
  const [siteDirecto, setSiteDirecto] = useState(false);

  // Abrir levantamiento: si tiene UN solo sitio, va directo a la ficha del cliente.
  const abrirProyecto = async (p) => {
    setProyectoActivo(p);
    try {
      const ss = await listarSitesProyectoSurvey(p.id);
      if (ss.length === 1) { setSiteActivo(ss[0]); setSiteDirecto(true); setSubvista('site'); return; }
    } catch (e) { console.warn('abrirProyecto:', e?.message); }
    setSiteDirecto(false);
    setSubvista('proyecto');
  };

  return (
    <div className="space-y-4">
      {subvista === 'lista' && (
        <SurveysList
          usuario={usuario}
          onAbrirProyecto={abrirProyecto}
          onAbrirSiteDirecto={(p, s) => { setProyectoActivo(p); setSiteActivo(s); setSiteDirecto(true); setSubvista('site'); }}
        />
      )}
      {subvista === 'proyecto' && proyectoActivo && (
        <SurveyProjectDetail
          proyecto={proyectoActivo}
          onAbrirSite={(s) => { setSiteActivo(s); setSiteDirecto(false); setSubvista('site'); }}
          onVolver={() => { setSubvista('lista'); setProyectoActivo(null); }}
        />
      )}
      {subvista === 'site' && siteActivo && proyectoActivo && (
        <SurveySiteDetail
          site={siteActivo}
          proyecto={proyectoActivo}
          usuario={usuario}
          data={data}
          onVolver={() => {
            if (siteDirecto) { setSubvista('lista'); setSiteActivo(null); setProyectoActivo(null); }
            else { setSubvista('proyecto'); setSiteActivo(null); }
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// LISTA DE PROYECTOS
// ============================================================
function SurveysList({ usuario, onAbrirProyecto, onAbrirSiteDirecto }) {
  const [loading, setLoading] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);     // multi-sitio (excepción)
  const [modalSimpleAbierto, setModalSimpleAbierto] = useState(false);   // levantamiento simple (principal)
  const [vista, setVista] = useState('lista');                           // lista | kanban | mapa
  const [sites, setSites] = useState([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const [data, ss] = await Promise.all([listarProyectosSurveys(), listarTodosLosSitesSurvey()]);
        if (!cancelado) {
          setProyectos(data);
          setSites(ss);
          setErrorMsg(null);
        }
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [reloadKey]);

  // Estado del levantamiento: usa la etapa real de Odoo si existe, si no el status del ERP.
  // Solo las etapas del pipeline de Levantamientos (equipo "Levantamientos" en Odoo).
  const ORDEN_ODOO = ['New', 'Contactado', 'Asignado', 'Agendado', 'Realizado', 'Cotizacion en Revision', 'Cotizacion Realizada', 'No se pudo coordinar', 'No podemos cotizar', 'Cliente no esta interesado'];
  const estadoDe = (p) => p.odoo_stage || PROJECT_STATUS[p.status] || p.status || 'Sin estado';
  const columnasKanban = React.useMemo(() => {
    // Pipeline completo de Odoo en orden + cualquier estado extra (ERP) al final.
    const extras = [...new Set(proyectos.map(estadoDe))].filter(e => !ORDEN_ODOO.includes(e));
    return [...ORDEN_ODOO, ...extras];
  }, [proyectos]);
  // Coords por proyecto (del primer site con GPS).
  const coordsProy = React.useMemo(() => {
    const m = {};
    for (const s of sites) { if (s.latitude != null && s.longitude != null && !m[s.project_id]) m[s.project_id] = { lat: Number(s.latitude), lng: Number(s.longitude) }; }
    return m;
  }, [sites]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight">Levantamientos</h1>
          <div className="text-xs text-zinc-500 mt-1">
            Levantamientos en sitio para cotización (pintura, impermeabilización, aislamiento, pisos).
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setModalSimpleAbierto(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1 rounded-card"
          >
            <Plus className="w-3 h-3" /> Nuevo levantamiento
          </button>
          <button
            onClick={() => setModalNuevoAbierto(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase tracking-wider px-3 py-2 text-[10px] rounded-card"
            title="Proyecto con varios sitios (ej. Banreservas)"
          >
            Multi-sitio
          </button>
        </div>
      </div>

      {/* Flujo principal: levantamiento simple (un techo) → entra directo a capturar */}
      {modalSimpleAbierto && (
        <ModalLevantamientoSimple
          usuario={usuario}
          onCerrar={() => setModalSimpleAbierto(false)}
          onCreado={({ proyecto, site }) => {
            setModalSimpleAbierto(false);
            setReloadKey(k => k + 1);
            onAbrirSiteDirecto?.(proyecto, site);
          }}
        />
      )}

      {/* Excepción: proyecto multi-sitio (Banreservas) */}
      {modalNuevoAbierto && (
        <ModalNuevoProyecto
          usuario={usuario}
          onCerrar={() => setModalNuevoAbierto(false)}
          onCreado={(proy) => {
            setModalNuevoAbierto(false);
            setReloadKey(k => k + 1);
            onAbrirProyecto(proy);
          }}
        />
      )}

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando proyectos...
        </div>
      )}

      {!loading && errorMsg && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 p-4 text-sm">
          Error cargando proyectos: {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && proyectos.length === 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="font-bold mb-1">Aún no hay proyectos de levantamiento</div>
          <div className="text-xs">Crea el primero desde "Nuevo levantamiento"</div>
        </div>
      )}

      {!loading && !errorMsg && proyectos.length > 0 && (
        <>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-card p-1 w-fit">
            {[['lista', 'Lista', List], ['kanban', 'Kanban', null], ['mapa', 'Mapa', MapIcon]].map(([k, l, Icon]) => (
              <button key={k} onClick={() => setVista(k)} className={`px-4 py-1.5 text-[11px] font-bold uppercase rounded-card flex items-center gap-1 ${vista === k ? 'bg-red-600 text-white' : 'text-zinc-400'}`}>
                {Icon && <Icon className="w-3 h-3" />}{l}
              </button>
            ))}
          </div>

          {vista === 'lista' ? (
            <div className="space-y-2">
              {proyectos.map(p => <ProyectoCard key={p.id} proyecto={p} onClick={() => onAbrirProyecto(p)} />)}
            </div>
          ) : vista === 'kanban' ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {columnasKanban.map(e => {
                const items = proyectos.filter(p => estadoDe(p) === e);
                return (
                  <div key={e} className="w-60 flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-card">
                    <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
                      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-300 truncate">{e}</span>
                      <span className="text-[9px] text-zinc-600">{items.length}</span>
                    </div>
                    <div className="p-2 space-y-2 min-h-[50px]">
                      {items.map(p => (
                        <button key={p.id} onClick={() => onAbrirProyecto(p)} style={{ borderLeftColor: SERVICE_LINES[p.service_line]?.color || '#666', borderLeftWidth: '4px' }} className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card p-2.5 hover:border-red-600">
                          <div className="flex items-center gap-1 mb-1"><ServiceLineBadge serviceLine={p.service_line} /></div>
                          <div className="font-bold text-xs truncate">{p.client_name}</div>
                          <div className="text-[10px] text-zinc-500 truncate">{p.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (() => {
              const conC = proyectos.map(p => ({ p, c: coordsProy[p.id] })).filter(x => x.c);
              if (conC.length === 0) return <div className="bg-zinc-950 border border-zinc-800 rounded-card p-8 text-center text-zinc-500 text-sm">Ningún levantamiento tiene ubicación con GPS aún. (Los importados de Odoo no traen coordenadas; los nuevos creados con link de Maps sí.)</div>;
              const markers = conC.map(({ p, c }) => ({ lat: c.lat, lng: c.lng, color: 'red', label: p.client_name, popup: `<b>${p.client_name}</b><br/>${p.name}`, onClick: () => onAbrirProyecto(p) }));
              return <MapaLeaflet center={[markers[0].lat, markers[0].lng]} zoom={11} height={460} markers={markers} scrollWheelZoom className="rounded-card overflow-hidden" />;
            })()
          )}
        </>
      )}
    </div>
  );
}

function ProyectoCard({ proyecto, onClick }) {
  const estadoLabel = proyecto.odoo_stage || PROJECT_STATUS[proyecto.status] || proyecto.status;
  const company = COMPANIES[proyecto.company] || proyecto.company;
  const color = SERVICE_LINES[proyecto.service_line]?.color || '#666';
  return (
    <button
      onClick={onClick}
      style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
      className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 p-4 flex items-center justify-between gap-3 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <ServiceLineBadge serviceLine={proyecto.service_line} />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{company}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">· {estadoLabel}</span>
        </div>
        <div className="font-bold text-sm truncate">{proyecto.name}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{proyecto.client_name}</div>
        {proyecto.description && (
          <div className="text-[11px] text-zinc-600 mt-1 truncate">{proyecto.description}</div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-600 flex-shrink-0" />
    </button>
  );
}

// ============================================================
// DETALLE DE PROYECTO (lista de sites)
// PR 3B.1: versión básica sin mapa todavía. Mapa viene en 3B.2.
// ============================================================
function SurveyProjectDetail({ proyecto, onAbrirSite, onVolver }) {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [vistaSites, setVistaSites] = useState('lista'); // 'lista' | 'mapa'

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listarSitesProyectoSurvey(proyecto.id);
        if (!cancelado) {
          setSites(data);
          setErrorMsg(null);
        }
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [proyecto.id]);

  const stats = {
    total: sites.length,
    pendientes: sites.filter(s => s.survey_status === 'pending').length,
    enRuta: sites.filter(s => s.survey_status === 'in_route' || s.survey_status === 'in_progress').length,
    completos: sites.filter(s => s.survey_status === 'completed' || s.survey_status === 'validated').length,
    faltaInfo: sites.filter(s => s.survey_status === 'missing_info').length,
  };

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a Levantamientos
      </button>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <ServiceLineBadge serviceLine={proyecto.service_line} />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {COMPANIES[proyecto.company] || proyecto.company}
          </span>
        </div>
        <h1 className="text-2xl font-black">{proyecto.name}</h1>
        <div className="text-sm text-zinc-500">{proyecto.client_name}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatBox label="Total" value={stats.total} color="#71717a" />
        <StatBox label="Pendientes" value={stats.pendientes} color="#71717a" />
        <StatBox label="En curso" value={stats.enRuta} color="#f59e0b" />
        <StatBox label="Completados" value={stats.completos} color="#22c55e" />
        <StatBox label="Falta info" value={stats.faltaInfo} color="#ef4444" />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando sitios...
        </div>
      )}

      {!loading && errorMsg && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 p-4 text-sm">
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
              Sitios ({sites.length})
            </div>
            <div className="flex border border-zinc-800">
              <button
                onClick={() => setVistaSites('lista')}
                className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 ${
                  vistaSites === 'lista' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                <List className="w-3 h-3" /> Lista
              </button>
              <button
                onClick={() => setVistaSites('mapa')}
                className={`px-3 py-1 text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 ${
                  vistaSites === 'mapa' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                <MapIcon className="w-3 h-3" /> Mapa
              </button>
            </div>
          </div>

          {vistaSites === 'lista' && (
            <div className="space-y-2">
              {sites.map(s => (
                <SiteRow key={s.id} site={s} onClick={() => onAbrirSite(s)} />
              ))}
            </div>
          )}

          {vistaSites === 'mapa' && (
            <SurveySitesMap sites={sites} onAbrirSite={onAbrirSite} />
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{label}</div>
      <div className="text-2xl font-black mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function SiteRow({ site, onClick }) {
  const status = SITE_STATUS[site.survey_status] || SITE_STATUS.pending;
  const hasGeo = site.latitude != null && site.longitude != null;
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-card hover:border-red-600 p-3 flex items-center gap-3 transition-colors"
    >
      <Building className="w-5 h-5 text-zinc-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {site.external_code && (
            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5">
              {site.external_code}
            </span>
          )}
          <span
            className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5"
            style={{
              backgroundColor: status.color + '22',
              color: status.color,
              border: `1px solid ${status.color}66`,
            }}
          >
            {status.label}
          </span>
        </div>
        <div className="font-bold text-sm truncate">{site.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {site.address ? site.address : 'Sin dirección'}
          {site.city && ` · ${site.city}`}
          {!hasGeo && ' · ⚠ sin georef'}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
    </button>
  );
}
