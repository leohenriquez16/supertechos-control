'use client';

// v8.19.49: Levantamiento SIMPLE (un techo / un sitio) — flujo principal.
// Crea en un solo paso: proyecto + 1 sitio, y devuelve ambos para entrar
// directo a capturar. El flujo multi-sitio (Banreservas) queda como excepción.

import React, { useEffect, useState } from 'react';
import { X, Loader2, MapPin, Check, Crosshair } from 'lucide-react';
import { listarTemplatesSurveys, crearProyectoSurvey, crearSiteSurvey, SERVICE_LINES, COMPANIES } from '../../lib/surveys';
import { obtenerUbicacion } from '../../lib/geo';
import ServiceLineBadge from './ServiceLineBadge';

// Helper local (convención del repo: helpers locales para evitar imports circulares).
async function obtenerAuthUserIdActual() {
  if (typeof window === 'undefined') return null;
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (keys.length === 0) return null;
    const parsed = JSON.parse(localStorage.getItem(keys[0]) || '{}');
    return parsed?.user?.id || parsed?.currentSession?.user?.id || null;
  } catch { return null; }
}

export default function ModalLevantamientoSimple({ usuario, onCerrar, onCreado }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [company, setCompany] = useState('super_techos');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [contactName, setContactName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [notes, setNotes] = useState('');
  const [gpsCargando, setGpsCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try { setTemplates(await listarTemplatesSurveys()); }
      catch (e) { setErrorMsg(e?.message || String(e)); }
      finally { setLoadingTpl(false); }
    })();
  }, []);

  const templateActual = templates.find(t => t.id === templateId);
  const puedeGuardar = !!templateId && clientName.trim().length > 0 && !guardando;

  const capturarGps = async () => {
    setGpsCargando(true);
    setErrorMsg(null);
    try {
      const u = await obtenerUbicacion();
      if (!u || u.lat == null) {
        setErrorMsg('No se pudo obtener la ubicación (permiso denegado o sin señal). Puedes continuar sin GPS.');
      } else {
        setLat(u.lat);
        setLng(u.lng);
      }
    } catch (e) {
      setErrorMsg('No se pudo capturar la ubicación: ' + (e?.message || e));
    } finally { setGpsCargando(false); }
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorMsg(null);
    try {
      const serviceLine = templateActual.service_line;
      const serviceLabel = SERVICE_LINES[serviceLine]?.label || serviceLine;
      const authUserId = await obtenerAuthUserIdActual();
      // 1. Proyecto (1 levantamiento)
      const proyecto = await crearProyectoSurvey({
        name: `${clientName.trim()} — ${serviceLabel}`,
        clientName: clientName.trim(),
        serviceLine,
        company,
        templateId,
        description: null,
        createdByAuthUserId: authUserId,
      });
      // 2. Sitio único
      const site = await crearSiteSurvey({
        projectId: proyecto.id,
        name: clientName.trim(),
        address: address.trim() || null,
        latitude: lat,
        longitude: lng,
        contactName: contactName.trim() || null,
        mobilePhone: mobilePhone.trim() || null,
        notes: notes.trim() || null,
        surveyStatus: 'pending',
      });
      onCreado?.({ proyecto, site });
    } catch (e) {
      setErrorMsg(e?.message || String(e));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo levantamiento</div>
            <div className="text-sm font-bold mt-0.5">Un techo / un sitio</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tipo de servicio */}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Tipo de servicio *</div>
            {loadingTpl ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {templates.map(t => {
                  const activo = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={`text-left px-2.5 py-2 rounded-card border text-xs ${activo ? 'border-red-600 bg-red-900/20' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <ServiceLineBadge serviceLine={t.service_line} />
                        {activo && <Check className="w-3 h-3 text-red-400" />}
                      </div>
                      <div className="font-bold mt-1 truncate">{t.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Empresa */}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Empresa</div>
            <div className="flex gap-1.5">
              {Object.entries(COMPANIES).map(([k, label]) => (
                <button key={k} onClick={() => setCompany(k)} className={`flex-1 px-2 py-1.5 rounded-card border text-[11px] font-bold ${company === k ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>{label}</button>
              ))}
            </div>
          </div>

          {/* Cliente */}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Cliente *</div>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ej: Plaza Central, Sr. Pérez…" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
          </div>

          {/* Dirección + GPS */}
          <div>
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Dirección y ubicación</div>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección del sitio" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm mb-1.5" />
            <button onClick={capturarGps} disabled={gpsCargando} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-card text-zinc-200 text-xs font-bold py-2">
              {gpsCargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              {lat != null ? `Ubicación capturada (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})` : 'Capturar ubicación GPS'}
            </button>
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Contacto</div>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5">Teléfono</div>
              <input value={mobilePhone} onChange={e => setMobilePhone(e.target.value)} placeholder="809-…" className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
            </div>
          </div>

          {errorMsg && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-2 text-xs">{errorMsg}</div>}
        </div>

        <div className="flex gap-2 p-4 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5 rounded-card">Cancelar</button>
          <button onClick={guardar} disabled={!puedeGuardar} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-black uppercase py-2.5 rounded-card flex items-center justify-center gap-2">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            {guardando ? 'Creando…' : 'Crear y empezar a capturar'}
          </button>
        </div>
      </div>
    </div>
  );
}
