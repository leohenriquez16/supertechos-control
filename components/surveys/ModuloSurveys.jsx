'use client';

// v8.19.1: Módulo de Levantamientos en sitio. Componente shell que
// maneja su propia "subvista" (lista | proyecto | site) sin usar
// Next.js routing, consistente con el patrón del resto del ERP.
//
// PR 3B.1 entrega: lista de proyectos. PRs siguientes agregan detalle
// proyecto + sites + DynamicSurveyForm + photos.

import React, { useState, useEffect } from 'react';
import { Loader2, Plus, MapPin, Building, ChevronRight, ArrowLeft } from 'lucide-react';
import { listarProyectosSurveys, listarSitesProyectoSurvey, COMPANIES, PROJECT_STATUS, SITE_STATUS } from '../../lib/surveys';
import ServiceLineBadge from './ServiceLineBadge';
import SurveySiteDetail from './SurveySiteDetail';

export default function ModuloSurveys({ usuario }) {
  // Subvistas: 'lista' (default) | 'proyecto' | 'site'
  const [subvista, setSubvista] = useState('lista');
  const [proyectoActivo, setProyectoActivo] = useState(null);
  const [siteActivo, setSiteActivo] = useState(null);

  return (
    <div className="space-y-4">
      {subvista === 'lista' && (
        <SurveysList
          usuario={usuario}
          onAbrirProyecto={(p) => { setProyectoActivo(p); setSubvista('proyecto'); }}
        />
      )}
      {subvista === 'proyecto' && proyectoActivo && (
        <SurveyProjectDetail
          proyecto={proyectoActivo}
          onAbrirSite={(s) => { setSiteActivo(s); setSubvista('site'); }}
          onVolver={() => { setSubvista('lista'); setProyectoActivo(null); }}
        />
      )}
      {subvista === 'site' && siteActivo && proyectoActivo && (
        <SurveySiteDetail
          site={siteActivo}
          proyecto={proyectoActivo}
          usuario={usuario}
          onVolver={() => { setSubvista('proyecto'); setSiteActivo(null); }}
        />
      )}
    </div>
  );
}

// ============================================================
// LISTA DE PROYECTOS
// ============================================================
function SurveysList({ usuario, onAbrirProyecto }) {
  const [loading, setLoading] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listarProyectosSurveys();
        if (!cancelado) {
          setProyectos(data);
          setErrorMsg(null);
        }
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Levantamientos</h1>
          <div className="text-xs text-zinc-500 mt-1">
            Levantamientos en sitio para cotización (pintura, impermeabilización, aislamiento, pisos).
          </div>
        </div>
        {/* Botón "Nuevo proyecto" se habilita en PR 3B siguiente */}
      </div>

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
        <div className="bg-zinc-950 border border-zinc-800 p-8 text-center text-zinc-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="font-bold mb-1">Aún no hay proyectos de levantamiento</div>
          <div className="text-xs">Crea el primero desde "Nuevo proyecto" (próximamente)</div>
        </div>
      )}

      {!loading && !errorMsg && proyectos.length > 0 && (
        <div className="space-y-2">
          {proyectos.map(p => (
            <ProyectoCard key={p.id} proyecto={p} onClick={() => onAbrirProyecto(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProyectoCard({ proyecto, onClick }) {
  const estadoLabel = PROJECT_STATUS[proyecto.status] || proyecto.status;
  const company = COMPANIES[proyecto.company] || proyecto.company;
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-red-600 p-4 flex items-center justify-between gap-3 transition-colors"
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
        <div className="space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">
            Sitios ({sites.length})
          </div>
          {sites.map(s => (
            <SiteRow key={s.id} site={s} onClick={() => onAbrirSite(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-3">
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
      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-red-600 p-3 flex items-center gap-3 transition-colors"
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
