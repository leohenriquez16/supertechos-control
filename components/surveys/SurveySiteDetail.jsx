'use client';

// v8.19.2: Vista de detalle de un site. Recibe site + proyecto + usuario.
// Muestra:
//  - Header: código, nombre, dirección, badge de estado
//  - Acciones rápidas (QuickActions)
//  - Info de contacto
//  - Horarios
//  - Notas
//  - Botón "Iniciar levantamiento" (placeholder — se conecta en PR 3B.4)

import React, { useState } from 'react';
import { ArrowLeft, Building, MapPin, Calendar, Clock, FileText, AlertTriangle, Play } from 'lucide-react';
import QuickActions from './QuickActions';
import DynamicSurveyForm from './DynamicSurveyForm';
import { SITE_STATUS } from '../../lib/surveys';

export default function SurveySiteDetail({ site, proyecto, usuario, onVolver }) {
  const [formAbierto, setFormAbierto] = useState(false);
  const status = SITE_STATUS[site.survey_status] || SITE_STATUS.pending;
  const hasGeo = site.latitude != null && site.longitude != null;
  const tieneInfoFaltante = site.survey_status === 'missing_info';

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a sitios
      </button>

      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
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
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Contacto</div>
        <Field label="Nombre" value={site.contact_name} />
        <Field label="Cargo" value={site.contact_role} />
        <Field label="Móvil" value={site.mobile_phone} />
        <Field label="Oficina" value={site.office_phone} />
      </div>

      {/* Horarios */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold flex items-center gap-1">
          <Clock className="w-3 h-3" /> Horarios
        </div>
        <Field label="Lun-Vie" value={site.weekday_hours} />
        <Field label="Sábado" value={site.saturday_hours} />
      </div>

      {/* Scheduled / asignación */}
      {(site.scheduled_at || site.assigned_to) && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
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
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Notas
          </div>
          <div className="text-sm whitespace-pre-wrap text-zinc-300">{site.notes}</div>
        </div>
      )}

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
