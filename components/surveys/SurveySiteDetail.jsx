'use client';

// v8.19.2: Vista de detalle de un site. Recibe site + proyecto + usuario.
// Muestra:
//  - Header: código, nombre, dirección, badge de estado
//  - Acciones rápidas (QuickActions)
//  - Info de contacto
//  - Horarios
//  - Notas
//  - Botón "Iniciar levantamiento" (placeholder — se conecta en PR 3B.4)

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building, MapPin, Calendar, Clock, FileText, AlertTriangle, Play, ClipboardList, Layers, ChevronDown, Loader2 } from 'lucide-react';
import QuickActions from './QuickActions';
import DynamicSurveyForm from './DynamicSurveyForm';
import PuntosSingulares from './PuntosSingulares';
import { SITE_STATUS, listarVisitasDeSite, listarAreasDeVisita, obtenerTemplateSurvey, asignarPersonaSurvey, ESCALERA, setRequiereEscaleraSurvey } from '../../lib/surveys';
import { imprimirLevantamiento } from './imprimirLevantamiento';

export default function SurveySiteDetail({ site, proyecto, usuario, data, onVolver }) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [puntosAbierto, setPuntosAbierto] = useState(false); // v8.19.82
  // v8.19.65: asignación de personal habilitado al levantamiento.
  const habilitados = (data?.personal || []).filter(p => p.levantamientoHabilitado && !p.archivado);
  const [asignadoId, setAsignadoId] = useState(proyecto?.asignado_a_id || '');
  const [guardandoAsig, setGuardandoAsig] = useState(false);
  const asignar = async (pid) => {
    setAsignadoId(pid);
    setGuardandoAsig(true);
    try {
      const persona = habilitados.find(p => p.id === pid);
      await asignarPersonaSurvey(proyecto.id, pid || null, persona?.nombre || null);
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardandoAsig(false);
  };
  // v8.19.72: requerimiento de escalera (clave para el maestro).
  const [escalera, setEscalera] = useState(proyecto?.requiere_escalera || '');
  const [guardandoEsc, setGuardandoEsc] = useState(false);
  const cambiarEscalera = async (v) => {
    setEscalera(v); setGuardandoEsc(true);
    try { await setRequiereEscaleraSurvey(proyecto.id, v || null); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setGuardandoEsc(false);
  };
  const status = SITE_STATUS[site.survey_status] || SITE_STATUS.pending;
  const hasGeo = site.latitude != null && site.longitude != null;
  const tieneInfoFaltante = site.survey_status === 'missing_info';

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a sitios
      </button>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Building className="w-6 h-6 text-zinc-500 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {site.external_code && (
                <span className="text-[11px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5">
                  {site.external_code}
                </span>
              )}
              <span
                className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5"
                style={{
                  backgroundColor: status.color + '22',
                  color: status.color,
                  border: `1px solid ${status.color}66`,
                }}
              >
                {status.label}
              </span>
              {site.site_subtype && (
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  · {site.site_subtype}
                </span>
              )}
            </div>
            <h2 className="text-xl font-black truncate">{site.name}</h2>
            {site.address && (
              <div className="text-sm text-zinc-400 mt-1 flex items-start gap-1">
                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  {site.address}
                  {site.city && `, ${site.city}`}
                  {site.province && `, ${site.province}`}
                </span>
              </div>
            )}
            {!hasGeo && (
              <div className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Sin coordenadas — Maps y Waze deshabilitados
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aviso de información faltante */}
      {tieneInfoFaltante && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold mb-0.5">Falta información para coordinar</div>
            <div className="text-[12px] opacity-80">
              Este sitio se marcó con datos pendientes (dirección, contacto, etc.). Actualízalo antes de programar la visita.
            </div>
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div>
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-2">
          Acciones rápidas
        </div>
        <QuickActions site={site} proyecto={proyecto} surveyorNombre={usuario?.nombre} />
      </div>

      {/* Contacto */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-2">
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Contacto</div>
        <Field label="Nombre" value={site.contact_name} />
        <Field label="Cargo" value={site.contact_role} />
        <Field label="Móvil" value={site.mobile_phone} />
        <Field label="Oficina" value={site.office_phone} />
      </div>

      {/* Horarios */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-2">
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold flex items-center gap-1">
          <Clock className="w-3 h-3" /> Horarios
        </div>
        <Field label="Lun-Vie" value={site.weekday_hours} />
        <Field label="Sábado" value={site.saturday_hours} />
      </div>

      {/* Scheduled / asignación */}
      {(site.scheduled_at || site.assigned_to) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Coordinación
          </div>
          {site.scheduled_at && (
            <Field
              label="Fecha programada"
              value={new Date(site.scheduled_at).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })}
            />
          )}
          {site.assigned_to && <Field label="Asignado a" value={site.assigned_to.slice(0, 8) + '…'} />}
        </div>
      )}

      {/* Notas */}
      {site.notes && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Notas
          </div>
          <div className="text-sm whitespace-pre-wrap text-zinc-300">{site.notes}</div>
        </div>
      )}

      {/* Levantamiento(s) ya capturado(s) — solo lectura */}
      {/* v8.19.65: Asignar levantador (personal habilitado) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5 flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5 text-red-500" /> Levantador asignado
          {guardandoAsig && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>
        {habilitados.length === 0 ? (
          <div className="text-[11px] text-zinc-500">No hay personal habilitado para levantamientos. Actívalo en el perfil de la persona (Personal → toggle "Levantamientos habilitado").</div>
        ) : (
          <select value={asignadoId} onChange={e => asignar(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
            <option value="">— Sin asignar —</option>
            {habilitados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}
      </div>

      {/* v8.19.72: ¿Requiere escalera? — para que el maestro sepa qué llevar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5 flex items-center gap-1">
          🪜 ¿Requiere escalera?
          {guardandoEsc && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(ESCALERA).map(([k, e]) => (
            <button key={k} onClick={() => cambiarEscalera(escalera === k ? '' : k)}
              className="px-3 py-1.5 text-xs font-bold rounded-card border"
              style={escalera === k ? { backgroundColor: e.color, borderColor: e.color, color: '#fff' } : { borderColor: '#3f3f46', color: '#a1a1aa' }}>
              {e.icon} {e.label}
            </button>
          ))}
        </div>
        {!escalera && <div className="text-[10px] text-zinc-600 mt-1">Sin especificar. Indícalo para que el maestro lleve el equipo correcto.</div>}
      </div>

      {/* v8.19.82: puntos singulares sobre la foto */}
      <button onClick={() => setPuntosAbierto(true)} className="w-full bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between hover:border-red-600 text-left">
        <div className="flex items-center gap-2 text-sm font-bold"><MapPin className="w-4 h-4 text-red-500" /> Puntos singulares</div>
        <span className="text-[10px] text-zinc-500">Marcar sobre la foto →</span>
      </button>
      {puntosAbierto && <PuntosSingulares site={site} onCerrar={() => setPuntosAbierto(false)} />}

      <LevantamientosRealizados site={site} proyecto={proyecto} />

      {/* CTA: iniciar levantamiento */}
      <div className="pt-2">
        <button
          onClick={() => setFormAbierto(true)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider py-4 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          Iniciar levantamiento
        </button>
      </div>

      {formAbierto && (
        <DynamicSurveyForm
          site={site}
          proyecto={proyecto}
          usuario={usuario}
          onCerrar={() => setFormAbierto(false)}
          onCompletado={() => {
            setFormAbierto(false);
            onVolver();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="grid grid-cols-[100px,1fr] gap-2 items-baseline text-sm">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-zinc-200">{value || <span className="text-zinc-600">—</span>}</div>
    </div>
  );
}

// v8.19.14: formato de m² es-DO con 2 decimales.
function fmtM2(n) {
  const x = Number(n) || 0;
  return x.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Agrupa áreas por piso (block_id) preservando el orden de aparición.
function agruparPorPiso(areas) {
  const orden = [];
  const mapa = new Map();
  for (const a of areas) {
    const piso = a.block_id || 'General';
    if (!mapa.has(piso)) { mapa.set(piso, []); orden.push(piso); }
    mapa.get(piso).push(a);
  }
  return orden.map(piso => {
    const items = mapa.get(piso);
    const subPared = items.reduce((s, a) => s + (Number(a.gross_area_m2) || 0), 0);
    const subTecho = items.reduce((s, a) => s + (Number(a.secondary_area_m2) || 0), 0);
    return { piso, items, subPared, subTecho };
  });
}

// v8.19.14: vista de solo lectura de los levantamientos ya capturados del site.
// Lista las visitas y, por cada una, las áreas agrupadas por piso con subtotales.
function LevantamientosRealizados({ site, proyecto }) {
  const [loading, setLoading] = useState(true);
  const [visitas, setVisitas] = useState([]);
  const [areasPorVisita, setAreasPorVisita] = useState({});
  const [expandida, setExpandida] = useState(null);
  const [template, setTemplate] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(null); // id de visita en proceso

  // v8.19.48: cargar el template del proyecto (para el PDF autocontenido).
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!proyecto?.template_id) return;
      try { const t = await obtenerTemplateSurvey(proyecto.template_id); if (!cancel) setTemplate(t); }
      catch (e) { console.warn('No se pudo cargar template para PDF:', e?.message); }
    })();
    return () => { cancel = true; };
  }, [proyecto?.template_id]);

  const exportarPdf = async (visit) => {
    setGenerandoPdf(visit.id);
    try {
      await imprimirLevantamiento({ proyecto, site, visit, areas: areasPorVisita[visit.id] || [], template });
    } catch (e) { alert('No se pudo generar el PDF: ' + (e?.message || e)); }
    setGenerandoPdf(null);
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const vs = await listarVisitasDeSite(site.id);
        if (cancel) return;
        const mapa = {};
        for (const v of vs) {
          const as = await listarAreasDeVisita(v.id);
          if (cancel) return;
          mapa[v.id] = as;
        }
        if (!cancel) {
          setVisitas(vs);
          setAreasPorVisita(mapa);
          setExpandida(vs[0]?.id || null); // expandir la visita más reciente
        }
      } catch (e) { console.warn('LevantamientosRealizados:', e?.message); }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [site.id]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 text-center">
        <Loader2 className="w-4 h-4 animate-spin text-red-500 mx-auto" />
      </div>
    );
  }
  if (visitas.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold flex items-center gap-1">
        <ClipboardList className="w-3 h-3" /> Levantamiento realizado
      </div>
      {visitas.map(v => {
        const areas = areasPorVisita[v.id] || [];
        const abierta = expandida === v.id;
        const grupos = agruparPorPiso(areas);
        const totalPared = areas.reduce((s, a) => s + (Number(a.gross_area_m2) || 0), 0);
        const totalTecho = areas.reduce((s, a) => s + (Number(a.secondary_area_m2) || 0), 0);
        const nVerif = areas.filter(a => a.data?.por_verificar).length;
        const fecha = v.checkin_at || v.created_at;
        return (
          <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-card">
            <button
              onClick={() => setExpandida(abierta ? null : v.id)}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-zinc-800/40"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm">
                  {areas.length} área{areas.length !== 1 ? 's' : ''} · {fmtM2(totalPared)} m² pared
                  {totalTecho > 0 ? ` · ${fmtM2(totalTecho)} m² techo` : ''}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {fecha ? new Date(fecha).toLocaleDateString('es-DO', { dateStyle: 'medium' }) : 'Sin fecha'}
                  {v.is_completed ? ' · cerrado' : ' · abierto'}
                  {nVerif > 0 ? ` · ${nVerif} por verificar` : ''}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`} />
            </button>
            {abierta && (
              <div className="border-t border-zinc-800 p-3 space-y-3">
                {/* v8.19.48: exportar PDF autocontenido del levantamiento */}
                <button
                  onClick={() => exportarPdf(v)}
                  disabled={!template || generandoPdf === v.id}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold uppercase py-2 rounded-card"
                  title={!template ? 'Cargando plantilla…' : 'Generar PDF autocontenido'}
                >
                  {generandoPdf === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  {generandoPdf === v.id ? 'Generando…' : 'Exportar PDF del levantamiento'}
                </button>
                {grupos.map(({ piso, items, subPared, subTecho }) => (
                  <div key={piso}>
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                      <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-red-500" /> {piso}</span>
                      <span className="text-zinc-500">{fmtM2(subPared)} m²{subTecho > 0 ? ` + ${fmtM2(subTecho)} techo` : ''}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map(a => (
                        <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-xs flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold truncate">
                              {a.name}
                              {a.data?.acabado ? <span className="text-zinc-500 font-normal"> · {a.data.acabado}</span> : ''}
                            </div>
                            {a.data?.expresion_perimetro && (
                              <div className="text-[10px] text-zinc-500 truncate">
                                {a.data.expresion_perimetro}
                                {a.data.altura_m ? ` × ${a.data.altura_m} m` : ''}
                                {a.data.reps > 1 ? ` ×${a.data.reps}` : ''}
                              </div>
                            )}
                            {a.notes && <div className="text-[10px] text-amber-400/80 truncate" title={a.notes}>{a.notes}</div>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold">{a.gross_area_m2 != null ? `${fmtM2(a.gross_area_m2)} m²` : '—'}</div>
                            {Number(a.secondary_area_m2) > 0 && <div className="text-[9px] text-zinc-500">+{fmtM2(a.secondary_area_m2)} techo</div>}
                            {a.data?.por_verificar && <div className="text-[8px] text-amber-400 font-bold uppercase">⚠ verificar</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="border-t border-zinc-700 pt-2 flex items-center justify-between text-sm font-black">
                  <span className="uppercase tracking-wider text-zinc-400">Total</span>
                  <span>{fmtM2(totalPared)} m² pared{totalTecho > 0 ? ` · ${fmtM2(totalTecho)} m² techo` : ''}</span>
                </div>
                {v.general_notes && (
                  <div className="text-[10px] text-zinc-500 border-t border-zinc-800 pt-2">{v.general_notes}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
