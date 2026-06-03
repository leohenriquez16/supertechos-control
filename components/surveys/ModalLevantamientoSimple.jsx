'use client';

// v8.19.49: Levantamiento SIMPLE (un techo / un sitio) — flujo principal.
// Crea en un solo paso: proyecto + 1 sitio, y devuelve ambos para entrar
// directo a capturar. El flujo multi-sitio (Banreservas) queda como excepción.
//
// v8.20.3: el cliente se hala de la lista de clientes; la dirección crea/usa
// una LOCACIÓN del cliente (cliente_ubicaciones). Si la locación ya existe,
// se permite agregar ÁREAS (tipo proyecto: nombre, m², sistema) dentro de ella.

import React, { useEffect, useState } from 'react';
import { X, Loader2, MapPin, Check, Crosshair, Plus, Trash2, Building2, ChevronDown } from 'lucide-react';
import { listarTemplatesSurveys, crearProyectoSurvey, crearSiteSurvey, SERVICE_LINES, COMPANIES, FAMILIAS_SERVICIO, familiaDeServiceLine } from '../../lib/surveys';
import { listarUbicacionesCliente, crearUbicacionCliente, setAreasUbicacionCliente, crearCliente } from '../../lib/db';
import { obtenerUbicacion } from '../../lib/geo';
import { expandirYExtraer } from '../../lib/geoutils';
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

const nuevaAreaVacia = () => ({ id: 'ar_' + Date.now() + Math.random().toString(36).slice(2, 5), nombre: '', m2: '', sistemaId: '' });

// Familias de servicio compartidas (lib/surveys): Pisos / Pintura /
// Impermeabilizante-Aislante / Genérico-Otro. El específico se elige por área.
const FAMILIAS = FAMILIAS_SERVICIO;
const familiaDeLine = familiaDeServiceLine;

export default function ModalLevantamientoSimple({ usuario, clientes = [], sistemas = {}, onCerrar, onCreado }) {
  const [templates, setTemplates] = useState([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [familiaKey, setFamiliaKey] = useState(null); // 'pisos' | 'pintura' | 'impermeable'
  const [company, setCompany] = useState('super_techos');

  // Cliente (de la lista)
  const [clienteId, setClienteId] = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteAbierto, setClienteAbierto] = useState(false);

  // Locación del cliente
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loadingUbic, setLoadingUbic] = useState(false);
  const [ubicMode, setUbicMode] = useState('nueva'); // 'existente' | 'nueva'
  const [ubicSelId, setUbicSelId] = useState('');
  const [locNombre, setLocNombre] = useState('');

  // Datos del sitio / locación
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [contactName, setContactName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [notes, setNotes] = useState('');

  // Áreas dentro de la locación (tipo proyecto)
  const [areas, setAreas] = useState([]);

  const [locationLink, setLocationLink] = useState('');
  const [extrayendo, setExtrayendo] = useState(false);
  const [origenUbicacion, setOrigenUbicacion] = useState(null); // 'link' | 'gps' | 'guardada'
  const [gpsCargando, setGpsCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const sistemasList = Object.entries(sistemas || {}).map(([id, s]) => ({ id, nombre: s?.nombre || id }));

  // Método principal: el cliente manda su ubicación por WhatsApp o Google Maps.
  const extraerDelLink = async (raw) => {
    const link = (raw ?? locationLink).trim();
    if (!link) return;
    setExtrayendo(true);
    setErrorMsg(null);
    try {
      const coords = await expandirYExtraer(link);
      if (!coords || coords.lat == null) {
        setErrorMsg('No pude leer coordenadas de ese link. Pega un link de Google Maps, una ubicación de WhatsApp, o las coordenadas (lat, lng).');
      } else {
        setLat(coords.lat);
        setLng(coords.lng);
        setOrigenUbicacion('link');
      }
    } catch (e) {
      setErrorMsg('No se pudo extraer la ubicación: ' + (e?.message || e));
    } finally { setExtrayendo(false); }
  };

  useEffect(() => {
    (async () => {
      try { setTemplates(await listarTemplatesSurveys()); }
      catch (e) { setErrorMsg(e?.message || String(e)); }
      finally { setLoadingTpl(false); }
    })();
  }, []);

  const templateActual = templates.find(t => t.id === templateId);
  const templatesFamilia = familiaKey ? templates.filter(t => familiaDeLine(t.service_line) === familiaKey) : [];
  const seleccionarFamilia = (key) => {
    setFamiliaKey(key);
    const tpls = templates.filter(t => familiaDeLine(t.service_line) === key);
    setTemplateId(tpls[0]?.id || ''); // por defecto el primero de la familia (si no conoce el específico)
  };
  const clienteNombreFinal = (clienteNombre || clienteQuery).trim();
  const puedeGuardar = !!templateId && clienteNombreFinal.length > 0 && !guardando;

  // ---- Cliente ----
  const q = clienteQuery.trim().toLowerCase();
  const clientesFiltrados = (q ? clientes.filter(c => (c.nombre || '').toLowerCase().includes(q)) : clientes).slice(0, 8);
  const hayExacto = clientes.some(c => (c.nombre || '').trim().toLowerCase() === q);

  const cargarUbicaciones = async (cid) => {
    setLoadingUbic(true);
    try {
      const ubs = await listarUbicacionesCliente(cid);
      setUbicaciones(ubs);
      if (ubs.length > 0) { setUbicMode('existente'); seleccionarUbicacion(ubs[0]); }
      else { setUbicMode('nueva'); setUbicSelId(''); }
    } catch (e) { setErrorMsg(e?.message || String(e)); }
    finally { setLoadingUbic(false); }
  };

  const seleccionarCliente = async (c) => {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    setClienteQuery(c.nombre);
    setClienteAbierto(false);
    await cargarUbicaciones(c.id);
  };

  const usarClienteNuevo = () => {
    setClienteId(null);
    setClienteNombre(clienteQuery.trim());
    setClienteAbierto(false);
    setUbicaciones([]);
    irNuevaLocacion();
  };

  const onChangeClienteQuery = (val) => {
    setClienteQuery(val);
    setClienteAbierto(true);
    // Si edita el texto luego de elegir, se considera "sin cliente fijado" hasta re-elegir.
    if (clienteId) { setClienteId(null); setClienteNombre(''); setUbicaciones([]); }
  };

  // ---- Locación ----
  const seleccionarUbicacion = (ub) => {
    setUbicSelId(ub.id);
    setLocNombre(ub.nombre || '');
    setAddress(ub.direccion || '');
    setCity(ub.ciudad || '');
    setLat(ub.latitud ?? null);
    setLng(ub.longitud ?? null);
    setOrigenUbicacion(ub.latitud != null ? 'guardada' : null);
    setContactName(ub.contactoNombre || '');
    setMobilePhone(ub.contactoTelefono || '');
    setAreas(Array.isArray(ub.areas) ? ub.areas.map(a => ({
      id: a.id || ('ar_' + Math.random().toString(36).slice(2, 6)),
      nombre: a.nombre || '', m2: a.m2 ?? '', sistemaId: a.sistemaId || '',
    })) : []);
  };

  const irNuevaLocacion = () => {
    setUbicMode('nueva');
    setUbicSelId('');
    setLocNombre('');
    setAddress(''); setCity('');
    setLat(null); setLng(null); setOrigenUbicacion(null);
    setContactName(''); setMobilePhone('');
    setAreas([]);
  };

  // ---- Áreas ----
  const addArea = () => setAreas(a => [...a, nuevaAreaVacia()]);
  const updArea = (id, campo, val) => setAreas(a => a.map(x => x.id === id ? { ...x, [campo]: val } : x));
  const delArea = (id) => setAreas(a => a.filter(x => x.id !== id));

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
        setOrigenUbicacion('gps');
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
      const cnombre = clienteNombreFinal;

      // Áreas limpias (tipo proyecto)
      const areasLimpias = areas
        .filter(a => (a.nombre || '').trim() || Number(a.m2) > 0)
        .map(a => ({ id: a.id, nombre: (a.nombre || '').trim(), m2: Number(a.m2) || 0, sistemaId: a.sistemaId || null }));

      // 1. Resolver cliente (de la lista o crear nuevo)
      let cid = clienteId;
      if (!cid) {
        cid = 'cli_' + Date.now() + Math.random().toString(36).slice(2, 7);
        await crearCliente({ id: cid, nombre: cnombre, tipo: 'empresa' });
      }

      // 2. Resolver locación
      let ubicId = null;
      let locNombreFinal = cnombre;
      if (ubicMode === 'existente' && ubicSelId) {
        ubicId = ubicSelId;
        const ub = ubicaciones.find(u => u.id === ubicSelId);
        locNombreFinal = ub?.nombre || cnombre;
        // Persistir áreas (el usuario pudo agregar áreas dentro de la locación existente)
        await setAreasUbicacionCliente(ubicId, areasLimpias);
      } else {
        const nom = (locNombre || '').trim() || cnombre;
        const ok = typeof window !== 'undefined'
          ? window.confirm(`¿Crear la locación «${nom}» para el cliente «${cnombre}»?`)
          : true;
        if (!ok) { setGuardando(false); return; }
        const nueva = await crearUbicacionCliente({
          clienteId: cid,
          nombre: nom,
          direccion: address.trim() || null,
          ciudad: city.trim() || null,
          latitud: lat,
          longitud: lng,
          contactoNombre: contactName.trim() || null,
          contactoTelefono: mobilePhone.trim() || null,
          areas: areasLimpias,
        });
        ubicId = nueva.id;
        locNombreFinal = nueva.nombre;
      }

      // 3. Proyecto (1 levantamiento)
      const proyecto = await crearProyectoSurvey({
        name: `${cnombre} — ${serviceLabel}`,
        clientName: cnombre,
        serviceLine,
        company,
        templateId,
        description: null,
        createdByAuthUserId: authUserId,
      });
      // 4. Sitio único (ligado a cliente + locación)
      const site = await crearSiteSurvey({
        projectId: proyecto.id,
        name: locNombreFinal,
        address: address.trim() || null,
        city: city.trim() || null,
        latitude: lat,
        longitude: lng,
        contactName: contactName.trim() || null,
        mobilePhone: mobilePhone.trim() || null,
        notes: notes.trim() || null,
        surveyStatus: 'pending',
        clienteId: cid,
        ubicacionId: ubicId,
      });
      onCreado?.({ proyecto, site });
    } catch (e) {
      setErrorMsg(e?.message || String(e));
      setGuardando(false);
    }
  };

  const inpCls = 'w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm';
  const labCls = 'text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5';

  const ubicacionActual = ubicaciones.find(u => u.id === ubicSelId);

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10 rounded-t-card">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo levantamiento</div>
            <div className="text-sm font-bold mt-0.5">Un techo / un sitio</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tipo de servicio — por familia (si no conoces el específico) */}
          <div>
            <div className={labCls}>Tipo de servicio *</div>
            {loadingTpl ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
            ) : (
              <>
                {/* Familia */}
                <div className="grid grid-cols-2 gap-1.5">
                  {FAMILIAS.map(f => {
                    const activo = familiaKey === f.key;
                    const disponibles = templates.some(t => familiaDeLine(t.service_line) === f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() => disponibles && seleccionarFamilia(f.key)}
                        disabled={!disponibles}
                        className={`px-2 py-2.5 rounded-card border text-xs font-bold text-center leading-tight ${activo ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'} disabled:opacity-40`}
                      >
                        {f.label}
                        {activo && <Check className="w-3 h-3 text-red-400 inline ml-1 -mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
                {/* El tipo específico (techo/piso) se elige POR ÁREA dentro del levantamiento. */}
                {familiaKey === 'generico' ? (
                  <div className="mt-1.5 text-[11px] text-zinc-500">Captura manual: tú describes cada superficie. Útil para algo no convencional o sin template.</div>
                ) : familiaKey && templatesFamilia.length >= 1 && (
                  <div className="mt-1.5 text-[11px] text-zinc-500">
                    El tipo específico ({familiaKey === 'pisos' ? 'tipo de piso' : familiaKey === 'impermeable' ? 'tipo de techo' : 'tipo'}) se elige por área al capturar.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Empresa */}
          <div>
            <div className={labCls}>Empresa</div>
            <div className="flex gap-1.5">
              {Object.entries(COMPANIES).map(([k, label]) => (
                <button key={k} onClick={() => setCompany(k)} className={`flex-1 px-2 py-1.5 rounded-card border text-[11px] font-bold ${company === k ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>{label}</button>
              ))}
            </div>
          </div>

          {/* Cliente — de la lista */}
          <div className="relative">
            <div className={labCls}>Cliente *</div>
            <div className="relative">
              <input
                value={clienteQuery}
                onChange={e => onChangeClienteQuery(e.target.value)}
                onFocus={() => setClienteAbierto(true)}
                placeholder="Busca un cliente de la lista…"
                className={inpCls + ' pr-8'}
              />
              <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {clienteId && (
              <div className="mt-1 text-[11px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Cliente: <b>{clienteNombre}</b></div>
            )}
            {clienteAbierto && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border-2 border-zinc-700 rounded-card max-h-56 overflow-y-auto shadow-xl">
                {clientesFiltrados.map(c => (
                  <button
                    key={c.id}
                    onClick={() => seleccionarCliente(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 border-b border-zinc-800/60"
                  >
                    <Building2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">{c.nombre}</span>
                    {c.rnc ? <span className="text-[10px] text-zinc-500 ml-auto shrink-0">{c.rnc}</span> : null}
                  </button>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-500">Sin clientes que coincidan.</div>
                )}
                {q.length > 0 && !hayExacto && (
                  <button onClick={usarClienteNuevo} className="w-full text-left px-3 py-2 text-sm hover:bg-red-900/20 text-red-300 flex items-center gap-2 border-t border-zinc-700">
                    <Plus className="w-3.5 h-3.5" /> Crear «{clienteQuery.trim()}» como cliente nuevo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Locación del cliente */}
          <div className="border border-zinc-800 rounded-card p-3 space-y-3 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div className={labCls + ' mb-0'}>Locación del cliente</div>
              {ubicaciones.length > 0 && (
                <div className="flex gap-1">
                  <button onClick={() => { setUbicMode('existente'); if (ubicaciones[0] && !ubicSelId) seleccionarUbicacion(ubicaciones[0]); }} className={`px-2 py-0.5 rounded-card text-[10px] font-bold uppercase border ${ubicMode === 'existente' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>Existente</button>
                  <button onClick={irNuevaLocacion} className={`px-2 py-0.5 rounded-card text-[10px] font-bold uppercase border ${ubicMode === 'nueva' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>＋ Nueva</button>
                </div>
              )}
            </div>

            {loadingUbic && <div className="flex items-center gap-2 text-zinc-500 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando locaciones…</div>}

            {!loadingUbic && !clienteNombreFinal && (
              <div className="text-xs text-zinc-500">Elige primero un cliente.</div>
            )}

            {/* Modo: locación existente */}
            {!loadingUbic && ubicMode === 'existente' && ubicaciones.length > 0 && (
              <div className="space-y-2">
                <select value={ubicSelId} onChange={e => { const ub = ubicaciones.find(u => u.id === e.target.value); if (ub) seleccionarUbicacion(ub); }} className={inpCls}>
                  {ubicaciones.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre}{u.ciudad ? ` · ${u.ciudad}` : ''}</option>
                  ))}
                </select>
                {ubicacionActual && (
                  <div className="text-[11px] text-zinc-400 flex items-start gap-1">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-zinc-500" />
                    <span>{ubicacionActual.direccion || 'Sin dirección registrada'}{ubicacionActual.latitud != null ? ` · ${Number(ubicacionActual.latitud).toFixed(4)}, ${Number(ubicacionActual.longitud).toFixed(4)}` : ''}</span>
                  </div>
                )}
              </div>
            )}

            {/* Modo: nueva locación */}
            {!loadingUbic && ubicMode === 'nueva' && clienteNombreFinal && (
              <div className="space-y-3">
                <div>
                  <div className={labCls}>Nombre de la locación</div>
                  <input value={locNombre} onChange={e => setLocNombre(e.target.value)} placeholder={`Ej: Sucursal Naco · ${clienteNombreFinal}`} className={inpCls} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <div className={labCls}>Dirección</div>
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección del sitio" className={inpCls} />
                  </div>
                  <div>
                    <div className={labCls}>Ciudad</div>
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad" className={inpCls} />
                  </div>
                </div>
                {/* Ubicación — link de Maps / WhatsApp */}
                <div>
                  <div className={labCls}>Ubicación (GPS)</div>
                  <div className="flex gap-1.5">
                    <input
                      value={locationLink}
                      onChange={e => setLocationLink(e.target.value)}
                      onBlur={() => locationLink.trim() && extraerDelLink()}
                      placeholder="Link de Google Maps / WhatsApp"
                      className="flex-1 min-w-0 bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
                    />
                    <button onClick={() => extraerDelLink()} disabled={extrayendo || !locationLink.trim()} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold uppercase px-3 rounded-card flex items-center gap-1">
                      {extrayendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Extraer'}
                    </button>
                  </div>
                  {lat != null && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 bg-green-900/20 border border-green-700/50 rounded-card px-2 py-1.5 text-[11px]">
                      <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)} <span className="text-green-600/70 uppercase text-[9px]">· {origenUbicacion === 'gps' ? 'GPS' : origenUbicacion === 'guardada' ? 'guardada' : 'link'}</span></span>
                      <button onClick={() => { setLat(null); setLng(null); setOrigenUbicacion(null); }} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  <button onClick={capturarGps} disabled={gpsCargando} className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                    {gpsCargando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                    o capturar mi GPS actual
                  </button>
                </div>
              </div>
            )}

            {/* Áreas dentro de la locación */}
            {clienteNombreFinal && (ubicMode === 'nueva' || ubicSelId) && (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div className={labCls + ' mb-0'}>Áreas de la locación</div>
                  <button onClick={addArea} className="text-[10px] font-bold uppercase text-red-400 hover:text-red-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
                </div>
                {areas.length === 0 && <div className="text-[11px] text-zinc-500">Sin áreas. Agrega una (nombre, m², sistema) si ya las conoces; también puedes capturarlas en el levantamiento.</div>}
                <div className="space-y-1.5">
                  {areas.map(a => (
                    <div key={a.id} className="flex gap-1.5 items-center">
                      <input value={a.nombre} onChange={e => updArea(a.id, 'nombre', e.target.value)} placeholder="Área (ej. Techo principal)" className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                      <input value={a.m2} onChange={e => updArea(a.id, 'm2', e.target.value)} type="number" inputMode="decimal" placeholder="m²" className="w-16 bg-zinc-900 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1.5 text-white text-xs" />
                      <select value={a.sistemaId} onChange={e => updArea(a.id, 'sistemaId', e.target.value)} className="w-28 bg-zinc-900 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-1.5 py-1.5 text-white text-xs">
                        <option value="">Sistema…</option>
                        {sistemasList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                      <button onClick={() => delArea(a.id)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Contacto en sitio */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={labCls}>Contacto en sitio</div>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre" className={inpCls} />
            </div>
            <div>
              <div className={labCls}>Teléfono</div>
              <input value={mobilePhone} onChange={e => setMobilePhone(e.target.value)} placeholder="809-…" className={inpCls} />
            </div>
          </div>

          {errorMsg && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-2 text-xs">{errorMsg}</div>}
        </div>

        <div className="flex gap-2 p-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950 rounded-b-card">
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
