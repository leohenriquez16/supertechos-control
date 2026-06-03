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
import { ArrowLeft, Building, MapPin, Calendar, Clock, FileText, AlertTriangle, Play, ClipboardList, Layers, ChevronDown, Loader2, Trash2, Check } from 'lucide-react';
import QuickActions from './QuickActions';
import DynamicSurveyForm from './DynamicSurveyForm';
import SatelitalAreas from './SatelitalAreas';
import { SITE_STATUS, listarVisitasDeSite, listarAreasDeVisita, obtenerTemplateSurvey, asignarPersonaSurvey, ESCALERA, setRequiereEscaleraSurvey, eliminarProyectoSurvey, solicitarEliminacionSurvey, cancelarSolicitudEliminacionSurvey, listarTemplatesSurveys, actualizarTipoProyectoSurvey, eliminarVisita, listarFotosVisita, getSignedUrlFotoSurvey, SERVICE_LINES, FAMILIAS_SERVICIO, familiaDeServiceLine } from '../../lib/surveys';
import { imprimirLevantamiento } from './imprimirLevantamiento';
import ChatterPanel from '../common/ChatterPanel';
import { registrarEvento as chatterEventoSurvey } from '../../lib/chatter';

export default function SurveySiteDetail({ site, proyecto, usuario, data, onVolver, onVerEdificaciones }) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [satelitalAbierta, setSatelitalAbierta] = useState(false); // v8.19.86

  // v8.19.91: eliminación con autorización del OWNER DEL APP (rol 'owner').
  const esAdmin = (usuario?.roles || []).includes('admin');
  const esOwner = (usuario?.roles || []).includes('owner');
  const ownerNombre = (data?.personal || []).find(p => (p.roles || []).includes('owner'))?.nombre || 'el dueño del app';
  const [solicitud, setSolicitud] = useState(proyecto?.eliminacion_solicitada_por ? { porId: proyecto.eliminacion_solicitada_por, porNombre: proyecto.eliminacion_solicitada_por_nombre } : null);
  const [procesandoDel, setProcesandoDel] = useState(false);
  const eliminarLev = async () => {
    if (!confirm('¿Eliminar este levantamiento? Se borran sus visitas, áreas y fotos. No se puede deshacer.')) return;
    setProcesandoDel(true);
    try { await eliminarProyectoSurvey(proyecto.id); onVolver?.(); }
    catch (e) { alert('Error: ' + (e.message || e)); setProcesandoDel(false); }
  };
  const solicitarDel = async () => {
    setProcesandoDel(true);
    try { await solicitarEliminacionSurvey(proyecto.id, usuario); setSolicitud({ porId: usuario.id, porNombre: usuario.nombre }); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setProcesandoDel(false);
  };
  const cancelarDel = async () => {
    setProcesandoDel(true);
    try { await cancelarSolicitudEliminacionSurvey(proyecto.id); setSolicitud(null); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    setProcesandoDel(false);
  };
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
  // v8.22.3: tipo de levantamiento (familia/template) editable dentro del levantamiento.
  const [tipoServiceLine, setTipoServiceLine] = useState(proyecto?.service_line || 'other');
  const [tipoTemplateId, setTipoTemplateId] = useState(proyecto?.template_id || '');
  const [tpls, setTpls] = useState([]);
  const [cambiandoTipo, setCambiandoTipo] = useState(false);
  useEffect(() => {
    let cancel = false;
    (async () => { try { const l = await listarTemplatesSurveys(); if (!cancel) setTpls(l); } catch {} })();
    return () => { cancel = true; };
  }, []);
  const familiaActual = familiaDeServiceLine(tipoServiceLine);
  // Templates específicos de la familia activa (ej. Impermeabilización / Aislamiento Térmico).
  const tplsFamiliaActual = familiaActual ? tpls.filter(t => familiaDeServiceLine(t.service_line) === familiaActual) : [];
  // Aplica un template específico (define el formulario de captura).
  const aplicarTemplate = async (tpl) => {
    if (!tpl || tpl.id === tipoTemplateId) return;
    setCambiandoTipo(true);
    const prevLabel = SERVICE_LINES[tipoServiceLine]?.label || 'Sin tipo';
    try {
      await actualizarTipoProyectoSurvey(proyecto.id, tpl.service_line, tpl.id);
      setTipoServiceLine(tpl.service_line); setTipoTemplateId(tpl.id);
      const nuevoLabel = SERVICE_LINES[tpl.service_line]?.label || tpl.service_line;
      try { await chatterEventoSurvey('levantamiento', proyecto.id, `Cambió el tipo: ${prevLabel} → ${nuevoLabel}`, usuario); } catch {}
    } catch (e) { alert('Error: ' + (e.message || e)); }
    setCambiandoTipo(false);
  };
  const cambiarTipoFamilia = async (familiaKey) => {
    const fam = FAMILIAS_SERVICIO.find(f => f.key === familiaKey);
    const tpl = tpls.find(t => fam?.lines.includes(t.service_line)) || tpls.find(t => t.service_line === 'other');
    if (!tpl) { alert('No hay plantilla para ese tipo.'); return; }
    await aplicarTemplate(tpl);
  };
  // Proyecto con el tipo actualizado para la captura (DynamicSurveyForm lee template_id).
  const proyectoConTipo = { ...proyecto, service_line: tipoServiceLine, template_id: tipoTemplateId };

  const status = SITE_STATUS[site.survey_status] || SITE_STATUS.pending;
  const hasGeo = site.latitude != null && site.longitude != null;
  const tieneInfoFaltante = site.survey_status === 'missing_info';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        {onVerEdificaciones && (
          <button onClick={onVerEdificaciones} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-card">
            <Building className="w-3.5 h-3.5" /> Edificaciones / ＋ agregar
          </button>
        )}
      </div>

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

      {/* CTA: iniciar levantamiento — primero */}
      <button
        onClick={() => setFormAbierto(true)}
        className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider py-4 rounded-card flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4" />
        Iniciar levantamiento
      </button>

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
      {/* v8.22.3: Tipo de levantamiento — editable (se puede crear sin tipo y definirlo aquí) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
        <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-red-500" /> Tipo de levantamiento
          {cambiandoTipo && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FAMILIAS_SERVICIO.map(f => {
            const activo = familiaActual === f.key;
            return (
              <button key={f.key} onClick={() => !activo && cambiarTipoFamilia(f.key)} disabled={cambiandoTipo}
                className={`px-2 py-2 rounded-card border text-xs font-bold text-center leading-tight ${activo ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'}`}>
                {f.label}{activo && <Check className="w-3 h-3 inline ml-1 -mt-0.5 text-red-400" />}
              </button>
            );
          })}
        </div>
        {/* Sub-selector: cuando la familia tiene varios formularios (ej. Impermeabilización vs Aislamiento) */}
        {tplsFamiliaActual.length > 1 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">Formulario de captura</div>
            <div className="flex flex-wrap gap-1.5">
              {tplsFamiliaActual.map(t => {
                const activo = tipoTemplateId === t.id;
                return (
                  <button key={t.id} onClick={() => !activo && aplicarTemplate(t)} disabled={cambiandoTipo}
                    className={`px-2.5 py-1.5 rounded-card border text-[11px] font-bold flex items-center gap-1 ${activo ? 'border-red-600 bg-red-900/30 text-white' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'}`}>
                    {SERVICE_LINES[t.service_line]?.label || t.service_line}{activo && <Check className="w-3 h-3 text-red-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="text-[10px] text-zinc-500 mt-1.5">
          {familiaActual === 'generico' || !familiaActual
            ? 'Sin tipo definido (genérico). Elige una familia; el tipo específico se elige por área al capturar.'
            : `Actual: ${SERVICE_LINES[tipoServiceLine]?.label || tipoServiceLine}. El formulario de captura corresponde a este tipo.`}
        </div>
      </div>

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

      {/* v8.24.6: "Puntos singulares" y "Estimación / cotización preliminar" removidos por ahora */}

      {/* v8.19.86: vista satelital con dibujo de áreas (opcional) */}
      <button onClick={() => setSatelitalAbierta(true)} className="w-full bg-zinc-900 border border-zinc-800 rounded-card p-3 flex items-center justify-between hover:border-red-600 text-left">
        <div className="flex items-center gap-2 text-sm font-bold"><MapPin className="w-4 h-4 text-red-500" /> Vista satelital — áreas <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 uppercase font-bold rounded">Opcional</span></div>
        <span className="text-[10px] text-zinc-500">Dibujar sobre el techo →</span>
      </button>
      {satelitalAbierta && <SatelitalAreas site={site} proyecto={proyecto} onCerrar={() => setSatelitalAbierta(false)} />}

      <LevantamientosRealizados site={site} proyecto={proyecto} />

      {/* Chatter tipo Odoo: quién creó, cambios de estado y notas */}
      <ChatterPanel entityType="levantamiento" entityId={proyecto?.id} usuario={usuario} />

      {/* v8.22.6: eliminación con autorización del owner — al final, debajo del chatter */}
      {(esOwner || esAdmin) && (
        <div className="bg-zinc-950 border border-red-900/50 rounded-card p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-red-400 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar levantamiento</div>
          {esOwner ? (
            <>
              {solicitud && <div className="text-[11px] text-amber-300">El admin <b>{solicitud.porNombre || '—'}</b> solicitó eliminar este levantamiento.</div>}
              <div className="flex gap-2">
                {solicitud && <button onClick={cancelarDel} disabled={procesandoDel} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Rechazar</button>}
                <button onClick={eliminarLev} disabled={procesandoDel} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase py-2 rounded-card flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> {solicitud ? 'Autorizar y eliminar' : 'Eliminar levantamiento'}</button>
              </div>
            </>
          ) : solicitud && solicitud.porId === usuario.id ? (
            <>
              <div className="text-[11px] text-amber-300">Solicitud enviada a <b>{ownerNombre}</b>. Esperando su autorización para eliminar.</div>
              <button onClick={cancelarDel} disabled={procesandoDel} className="px-3 bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase py-2 rounded-card">Cancelar solicitud</button>
            </>
          ) : solicitud ? (
            <div className="text-[11px] text-zinc-500">Ya hay una solicitud de eliminación pendiente de autorización de <b>{ownerNombre}</b>.</div>
          ) : (
            <>
              <div className="text-[11px] text-zinc-500">Solo <b>{ownerNombre}</b> (dueño del app) puede eliminar. Puedes solicitar su autorización.</div>
              <button onClick={solicitarDel} disabled={procesandoDel} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold uppercase py-2 rounded-card">Solicitar eliminación al dueño</button>
            </>
          )}
        </div>
      )}

      {formAbierto && (
        <DynamicSurveyForm
          site={site}
          proyecto={proyectoConTipo}
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

// v8.24.9: detalle de una sección/área (campos capturados, no vacíos).
function fmtCampoApp(field, v) {
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return null;
  switch (field.type) {
    case 'boolean': return v ? 'Sí' : 'No';
    case 'multi_select': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'rating_1_5': return `${v} / 5`;
    case 'counter': case 'number': return String(v);
    case 'measurement_table': { const f = Array.isArray(v) ? v : []; const t = f.reduce((s, x) => s + (Number(x.area_m2) || 0), 0); return `${f.length} medida(s) · ${t.toFixed(2)} m²`; }
    case 'ductos_table': { const f = Array.isArray(v) ? v : []; const t = f.reduce((s, x) => s + (Number(x.area_m2) || 0), 0); return `${f.length} ducto(s) · ${t.toFixed(2)} m²`; }
    case 'photos': case 'fotos_previas': return Array.isArray(v) ? `${v.length} foto(s)` : null;
    case 'map_point': return v?.lat != null ? 'punto marcado' : null;
    case 'map_polygon': return v?.areaM2 != null ? `${v.areaM2} m² (polígono)` : (Array.isArray(v?.vertices) && v.vertices.length ? `${v.vertices.length} pts` : null);
    case 'voice_note': case 'text': case 'textarea': return String(v);
    default: return typeof v === 'object' ? null : String(v);
  }
}

function TablaMedidas({ label, filas, ducto = false }) {
  const total = (filas || []).reduce((s, f) => s + (Number(f.area_m2) || 0), 0);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">{label}</div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-zinc-500 text-[9px] uppercase border-b border-zinc-800">
            <th className="text-left py-0.5">{ducto ? 'Ducto' : 'Tramo'}</th>
            <th className="text-right">Largo</th>
            <th className="text-right">Ancho</th>
            {ducto && <th className="text-right">Alto</th>}
            <th className="text-right">m²</th>
          </tr>
        </thead>
        <tbody>
          {(filas || []).map((r, i) => (
            <tr key={i} className="border-b border-zinc-800/40">
              <td className="text-zinc-300 py-0.5">{r.label || r.identificacion || `#${i + 1}`}</td>
              <td className="text-right">{r.length_m ?? r.largo ?? '—'}</td>
              <td className="text-right">{r.width_m ?? r.ancho ?? '—'}</td>
              {ducto && <td className="text-right">{r.alto ?? '—'}</td>}
              <td className="text-right font-bold text-red-300">{r.area_m2 != null ? Number(r.area_m2).toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-700">
            <td colSpan={ducto ? 4 : 3} className="text-right text-zinc-400 font-bold uppercase text-[9px] pt-1">Total</td>
            <td className="text-right font-black text-red-300 pt-1">{total.toFixed(2)} m²</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DetalleArea({ area, fields }) {
  const data = area.data || {};
  const [fotos, setFotos] = useState([]);
  const [cargandoFotos, setCargandoFotos] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      setCargandoFotos(true);
      try {
        const fs = await listarFotosVisita(area.visit_id);
        const mias = (fs || []).filter(f => f.area_id === area.id);
        const conUrl = await Promise.all(mias.map(async f => {
          let url = ''; try { url = await getSignedUrlFotoSurvey(f.storage_path, 3600); } catch {}
          return { url, caption: f.caption || '' };
        }));
        if (!cancel) setFotos(conUrl.filter(x => x.url));
      } catch { if (!cancel) setFotos([]); }
      if (!cancel) setCargandoFotos(false);
    })();
    return () => { cancel = true; };
  }, [area.id, area.visit_id]);

  const ocultar = ['photos', 'fotos_previas', 'map_point', 'map_polygon', 'measurement_table', 'ductos_table'];
  const escalares = (fields || [])
    .filter(f => !ocultar.includes(f.type))
    .map(f => ({ label: f.label, valor: fmtCampoApp(f, data[f.id]) }))
    .filter(x => x.valor != null);
  const tablasMedida = (fields || []).filter(f => f.type === 'measurement_table' && Array.isArray(data[f.id]) && data[f.id].length);
  const tablasDucto = (fields || []).filter(f => f.type === 'ductos_table' && Array.isArray(data[f.id]) && data[f.id].length);
  const vacio = !escalares.length && !tablasMedida.length && !tablasDucto.length && !fotos.length;

  return (
    <div className="border-t border-zinc-800 px-3 py-2.5 space-y-3">
      {escalares.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          {escalares.map((x, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-[11px] border-b border-zinc-800/50 py-0.5">
              <span className="text-zinc-500">{x.label}</span>
              <span className="text-zinc-200 font-semibold text-right">{x.valor}</span>
            </div>
          ))}
        </div>
      )}
      {tablasMedida.map(f => <TablaMedidas key={f.id} label={f.label} filas={data[f.id]} />)}
      {tablasDucto.map(f => <TablaMedidas key={f.id} label={f.label} filas={data[f.id]} ducto />)}
      {fotos.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">Fotos ({fotos.length})</div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {fotos.map((f, i) => (
              <a key={i} href={f.url} target="_blank" rel="noreferrer" title={f.caption}>
                <img src={f.url} alt="" className="w-full h-16 object-cover rounded border border-zinc-800 hover:border-red-600" />
              </a>
            ))}
          </div>
        </div>
      )}
      {vacio && (cargandoFotos ? <div className="text-[10px] text-zinc-600">Cargando…</div> : <div className="text-[10px] text-zinc-600">Sin datos adicionales capturados.</div>)}
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
  const [areaExp, setAreaExp] = useState(null); // v8.24.9: área (sección) expandida para ver su detalle
  const [template, setTemplate] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(null); // id de visita en proceso

  const tituloBloque = (bid) => (template?.schema?.sections || []).find(s => s.id === bid)?.title || bid;
  const camposBloque = (bid) => (template?.schema?.sections || []).find(s => s.id === bid)?.fields || [];

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

  const recargar = async () => {
    setLoading(true);
    try {
      const vs = await listarVisitasDeSite(site.id);
      const mapa = {};
      for (const v of vs) { mapa[v.id] = await listarAreasDeVisita(v.id); }
      setVisitas(vs);
      setAreasPorVisita(mapa);
      setExpandida(vs[0]?.id || null);
    } catch (e) { console.warn('LevantamientosRealizados:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [site.id]);

  const borrarVisita = async (v, areas) => {
    const vacia = (areas?.length || 0) === 0;
    if (!confirm(vacia ? '¿Eliminar esta visita vacía?' : 'Esta visita tiene áreas capturadas. ¿Eliminarla de todas formas? No se puede deshacer.')) return;
    try { await eliminarVisita(v.id); await recargar(); }
    catch (e) { alert('Error: ' + (e?.message || e)); }
  };

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
                  {areas.length} área{areas.length !== 1 ? 's' : ''} · {fmtM2(totalPared)} m²
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
                <button
                  onClick={() => borrarVisita(v, areas)}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-red-900/40 text-zinc-300 hover:text-red-300 text-[11px] font-bold uppercase py-1.5 rounded-card"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar esta visita
                </button>
                {grupos.map(({ piso, items, subPared, subTecho }) => (
                  <div key={piso}>
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                      <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-red-500" /> {tituloBloque(piso)} <span className="text-zinc-600">({items.length})</span></span>
                      <span className="text-zinc-500">{fmtM2(subPared)} m²{subTecho > 0 ? ` + ${fmtM2(subTecho)} techo` : ''}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map(a => {
                        const abiertaA = areaExp === a.id;
                        return (
                          <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-card">
                            <button onClick={() => setAreaExp(abiertaA ? null : a.id)} className="w-full px-2 py-1.5 text-xs flex items-start justify-between gap-2 text-left hover:bg-zinc-900/60">
                              <div className="min-w-0 flex items-center gap-1.5">
                                <ChevronDown className={`w-3 h-3 text-zinc-600 transition-transform ${abiertaA ? 'rotate-180' : ''}`} />
                                <span className="font-bold truncate">{a.name || `Sección ${a.area_number}`}</span>
                                {a.data?.section_surface_type && <span className="text-[9px] uppercase text-zinc-500 border border-zinc-700 rounded px-1">{a.data.section_surface_type}</span>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-bold">{a.gross_area_m2 != null ? `${fmtM2(a.gross_area_m2)} m²` : '—'}</div>
                                {Number(a.secondary_area_m2) > 0 && <div className="text-[9px] text-zinc-500">+{fmtM2(a.secondary_area_m2)} techo</div>}
                              </div>
                            </button>
                            {abiertaA && <DetalleArea area={a} fields={camposBloque(a.block_id)} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="border-t border-zinc-700 pt-2 flex items-center justify-between text-sm font-black">
                  <span className="uppercase tracking-wider text-zinc-400">Total</span>
                  <span>{fmtM2(totalPared)} m²{totalTecho > 0 ? ` · ${fmtM2(totalTecho)} m² techo` : ''}</span>
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
