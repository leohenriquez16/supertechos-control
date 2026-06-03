'use client';

// v8.19.49: Levantamiento SIMPLE (un techo / un sitio) — flujo principal.
// Crea en un solo paso: proyecto + 1 sitio, y devuelve ambos para entrar
// directo a capturar. El flujo multi-sitio (Banreservas) queda como excepción.
//
// v8.20.3: el cliente se hala de la lista de clientes; la dirección crea/usa
// una LOCACIÓN del cliente (cliente_ubicaciones). Si la locación ya existe,
// se permite agregar ÁREAS (tipo proyecto: nombre, m², sistema) dentro de ella.

import React, { useEffect, useState } from 'react';
import { X, Loader2, MapPin, Check, Crosshair, Plus, Trash2, Building2, ChevronDown, Search } from 'lucide-react';
import { listarTemplatesSurveys, crearProyectoSurvey, crearSiteSurvey, SERVICE_LINES, COMPANIES, FAMILIAS_SERVICIO, familiaDeServiceLine } from '../../lib/surveys';
import { listarUbicacionesCliente, crearUbicacionCliente, setAreasUbicacionCliente, crearCliente, crearContacto } from '../../lib/db';
import { obtenerUbicacion, geocodificarInverso } from '../../lib/geo';
import { expandirYExtraer } from '../../lib/geoutils';
import ServiceLineBadge from './ServiceLineBadge';
import MapaPickerModal from '../common/MapaPickerModal';
import { registrarCreacion } from '../../lib/chatter';

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

// v8.22.1: el correo automático "Levantamiento recibido" queda APAGADO hasta que el
// cliente defina el texto oficial de la plantilla (evita enviar placeholder en prod).
const EMAIL_LEVANTAMIENTO_RECIBIDO_ON = false;

// Familias de servicio compartidas (lib/surveys): Pisos / Pintura /
// Impermeabilizante-Aislante / Genérico-Otro. El específico se elige por área.
const FAMILIAS = FAMILIAS_SERVICIO;
const familiaDeLine = familiaDeServiceLine;

export default function ModalLevantamientoSimple({ usuario, clientes = [], contactos = [], sistemas = {}, onCerrar, onCreado }) {
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
  const [sector, setSector] = useState('');
  const [provincia, setProvincia] = useState('');
  const [pais, setPais] = useState('');
  const [sugiriendo, setSugiriendo] = useState(false);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [contactName, setContactName] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [contactoMode, setContactoMode] = useState('manual'); // 'cliente' | 'manual'
  const [contactoSelId, setContactoSelId] = useState('');
  const [buscarUbic, setBuscarUbic] = useState('');      // v8.25.11: buscador de locaciones
  const [buscarContacto, setBuscarContacto] = useState(''); // v8.25.11: buscador de contactos
  const [ubicAbierto, setUbicAbierto] = useState(false);     // v8.25.15: combobox locaciones
  const [contactoAbierto, setContactoAbierto] = useState(false); // v8.25.15: combobox contactos
  // v8.25.15: datos del cliente nuevo (manual): teléfono + cédula/RNC.
  const [nuevoClienteTel, setNuevoClienteTel] = useState('');
  const [nuevoClienteCedula, setNuevoClienteCedula] = useState('');
  const [tipoClienteNuevo, setTipoClienteNuevo] = useState('empresa'); // v8.25.17: 'empresa' | 'persona'
  // v8.25.12: crear un contacto nuevo y guardarlo en el cliente.
  const [contactosExtra, setContactosExtra] = useState([]); // creados en esta sesión
  const [nuevoCt, setNuevoCt] = useState({ nombre: '', cargo: '', telefono: '', email: '' });
  const [guardandoCt, setGuardandoCt] = useState(false);
  const [notes, setNotes] = useState('');

  // Áreas dentro de la locación (tipo proyecto)
  const [areas, setAreas] = useState([]);

  const [locationLink, setLocationLink] = useState('');
  const [extrayendo, setExtrayendo] = useState(false);
  const [origenUbicacion, setOrigenUbicacion] = useState(null); // 'link' | 'gps' | 'guardada'
  const [gpsCargando, setGpsCargando] = useState(false);
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const sistemasList = Object.entries(sistemas || {}).map(([id, s]) => ({ id, nombre: s?.nombre || id }));

  // v8.20.9: al fijar coordenadas, sugiere sector/ciudad/provincia/país (solo rellena
  // los campos vacíos — no pisa lo que el usuario ya escribió).
  const sugerirDesdeCoords = async (la, ln) => {
    setSugiriendo(true);
    try {
      const g = await geocodificarInverso(la, ln);
      if (g) {
        setAddress(d => d || g.direccion || g.calle || '');
        setSector(s => s || g.sector || '');
        setCity(c => c || g.ciudad || '');
        setProvincia(p => p || g.provincia || '');
        setPais(p => p || g.pais || '');
        // Si el lugar tiene nombre (POI) y aún no hay nombre de locación, sugerirlo.
        if (g.nombre) setLocNombre(n => n || g.nombre);
      }
    } catch { /* ignore */ }
    finally { setSugiriendo(false); }
  };

  const aplicarCoords = (la, ln, origen) => {
    setLat(la); setLng(ln); setOrigenUbicacion(origen);
    if (ubicMode === 'nueva') sugerirDesdeCoords(la, ln);
  };

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
        aplicarCoords(coords.lat, coords.lng, 'link');
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

  // Contactos del cliente seleccionado (para "contacto en sitio"), incluyendo los recién creados.
  const contactosCliente = clienteId ? [...contactos, ...contactosExtra].filter(c => c.clienteId === clienteId) : [];
  // v8.25.12: crear y guardar un contacto nuevo en el cliente, y dejarlo elegido.
  const guardarNuevoContacto = async () => {
    if (!clienteId) { setErrorMsg('Primero elige un cliente existente para guardarle el contacto.'); return; }
    if (!nuevoCt.nombre.trim()) { setErrorMsg('El contacto necesita un nombre.'); return; }
    setGuardandoCt(true); setErrorMsg('');
    try {
      const id = 'ct_' + Date.now() + Math.floor(Math.random() * 1000);
      const tel = nuevoCt.telefono.trim() || null;
      await crearContacto({ id, clienteId, nombre: nuevoCt.nombre.trim(), cargo: nuevoCt.cargo.trim() || null, telefono: tel, whatsapp: tel, email: nuevoCt.email.trim() || null });
      const nuevo = { id, clienteId, nombre: nuevoCt.nombre.trim(), cargo: nuevoCt.cargo.trim() || '', telefono: tel || '', whatsapp: tel || '', email: nuevoCt.email.trim() || '', esPrincipal: false };
      setContactosExtra(prev => [...prev, nuevo]);
      setNuevoCt({ nombre: '', cargo: '', telefono: '', email: '' });
      setContactoMode('cliente');
      setContactoSelId(id);
      setContactName(nuevo.nombre);
      setMobilePhone(nuevo.telefono);
    } catch (e) {
      setErrorMsg('No se pudo crear el contacto: ' + (e?.message || e));
    }
    setGuardandoCt(false);
  };
  // v8.25.11: filtros de búsqueda (cuando hay muchas locaciones/contactos).
  const _norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ubicacionesFiltradas = (() => {
    const q = _norm(buscarUbic.trim());
    if (!q) return ubicaciones;
    return ubicaciones.filter(u => u.id === ubicSelId || _norm(`${u.nombre} ${u.ciudad || ''} ${u.direccion || ''}`).includes(q));
  })();
  const contactosFiltrados = (() => {
    const q = _norm(buscarContacto.trim());
    if (!q) return contactosCliente;
    return contactosCliente.filter(c => c.id === contactoSelId || _norm(`${c.nombre} ${c.cargo || ''} ${c.telefono || ''} ${c.email || ''}`).includes(q));
  })();
  // Al cambiar de cliente: si tiene contactos, modo "del cliente"; si no, manual.
  useEffect(() => {
    const cts = clienteId ? contactos.filter(c => c.clienteId === clienteId) : [];
    setContactoMode(cts.length > 0 ? 'cliente' : 'manual');
    setContactoSelId('');
    setContactName(''); setMobilePhone(''); // v8.25.14: sin contacto hasta que se elija
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const elegirContacto = (id) => {
    setContactoSelId(id);
    const ct = contactosCliente.find(c => c.id === id);
    if (ct) { setContactName(ct.nombre || ''); setMobilePhone(ct.telefono || ct.whatsapp || ''); setBuscarContacto(ct.nombre || ''); }
  };

  const templateActual = templates.find(t => t.id === templateId);
  const templatesFamilia = familiaKey ? templates.filter(t => familiaDeLine(t.service_line) === familiaKey) : [];
  const seleccionarFamilia = (key) => {
    setFamiliaKey(key);
    const fam = FAMILIAS.find(f => f.key === key);
    const tpls = templates.filter(t => familiaDeLine(t.service_line) === key);
    // v8.25.16: por defecto el template del PRIMER service_line de la familia
    // (ej. Impermeabilizante/Aislante → Impermeabilización, no Aislante).
    const preferido = (fam?.lines || []).map(line => tpls.find(t => t.service_line === line)).find(Boolean);
    setTemplateId((preferido || tpls[0])?.id || '');
  };
  const clienteNombreFinal = (clienteNombre || clienteQuery).trim();
  // v8.22.3: el tipo es OPCIONAL. Sin familia se crea genérico (template generic-v1)
  // y se puede definir el tipo después dentro del levantamiento.
  const templateGenerico = templates.find(t => t.id === 'generic-v1') || templates.find(t => t.service_line === 'other');
  const puedeGuardar = clienteNombreFinal.length > 0 && !guardando;

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
    setBuscarUbic(ub.nombre || ''); // v8.25.15: refleja la selección en el combobox
    setLocNombre(ub.nombre || '');
    setAddress(ub.direccion || '');
    setCity(ub.ciudad || '');
    setSector(ub.sector || '');
    setProvincia(ub.provincia || '');
    setPais(ub.pais || '');
    setLat(ub.latitud ?? null);
    setLng(ub.longitud ?? null);
    setOrigenUbicacion(ub.latitud != null ? 'guardada' : null);
    // v8.25.14: NO pisar el contacto en sitio con el guardado de la locación; el
    // contacto de la obra lo gobierna el selector "Contacto en sitio" (el que se elija).
    setAreas(Array.isArray(ub.areas) ? ub.areas.map(a => ({
      id: a.id || ('ar_' + Math.random().toString(36).slice(2, 6)),
      nombre: a.nombre || '', m2: a.m2 ?? '', sistemaId: a.sistemaId || '',
    })) : []);
  };

  const irNuevaLocacion = () => {
    setUbicMode('nueva');
    setUbicSelId('');
    setLocNombre('');
    setAddress(''); setCity(''); setSector(''); setProvincia(''); setPais('');
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
        aplicarCoords(u.lat, u.lng, 'gps');
      }
    } catch (e) {
      setErrorMsg('No se pudo capturar la ubicación: ' + (e?.message || e));
    } finally { setGpsCargando(false); }
  };

  const guardar = async (iniciar = true) => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorMsg(null);
    try {
      // Si no se eligió tipo, usa el template genérico (definible después).
      const tpl = templateActual || templateGenerico;
      if (!tpl) { setErrorMsg('No hay plantillas disponibles.'); setGuardando(false); return; }
      const templateIdFinal = tpl.id;
      const serviceLine = tpl.service_line;
      const serviceLabel = templateActual ? (SERVICE_LINES[serviceLine]?.label || serviceLine) : 'Sin tipo';
      const authUserId = await obtenerAuthUserIdActual();
      const cnombre = clienteNombreFinal;
      // v8.25.14: el contacto de la obra es el ELEGIDO en el selector (no el predeterminado).
      const ctElegido = contactoMode === 'cliente' ? contactosCliente.find(c => c.id === contactoSelId) : null;
      let finalContactName = (ctElegido?.nombre || contactName).trim() || null;
      let finalContactPhone = (ctElegido ? (ctElegido.telefono || ctElegido.whatsapp || '') : mobilePhone).trim() || null;
      // v8.25.17: para una PERSONA nueva, el contacto es ella misma si no se indicó "quien recibe".
      if (!clienteId && tipoClienteNuevo === 'persona') {
        if (!finalContactName) finalContactName = cnombre;
        if (!finalContactPhone) finalContactPhone = nuevoClienteTel.trim() || null;
      }

      // Áreas limpias (tipo proyecto)
      const areasLimpias = areas
        .filter(a => (a.nombre || '').trim() || Number(a.m2) > 0)
        .map(a => ({ id: a.id, nombre: (a.nombre || '').trim(), m2: Number(a.m2) || 0, sistemaId: a.sistemaId || null }));

      // 1. Resolver cliente (de la lista o crear nuevo)
      let cid = clienteId;
      if (!cid) {
        cid = 'cli_' + Date.now() + Math.random().toString(36).slice(2, 7);
        await crearCliente({ id: cid, nombre: cnombre, tipo: tipoClienteNuevo, telefonoPrincipal: nuevoClienteTel.trim() || null, rnc: nuevoClienteCedula.trim() || null });
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
          sector: sector.trim() || null,
          ciudad: city.trim() || null,
          provincia: provincia.trim() || null,
          pais: pais.trim() || null,
          latitud: lat,
          longitud: lng,
          contactoNombre: finalContactName,
          contactoTelefono: finalContactPhone,
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
        templateId: templateIdFinal,
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
        contactName: finalContactName,
        mobilePhone: finalContactPhone,
        notes: notes.trim() || null,
        surveyStatus: 'pending',
        clienteId: cid,
        ubicacionId: ubicId,
      });

      // Chatter: registrar la creación del levantamiento (entidad = proyecto survey).
      try {
        await registrarCreacion('levantamiento', proyecto.id, usuario,
          `Creó el levantamiento — ${serviceLabel}${locNombreFinal ? ' · ' + locNombreFinal : ''}`);
      } catch { /* el chatter no debe romper el flujo */ }

      // Correo "levantamiento recibido" al cliente. Fire-and-forget; en LOCAL no envía.
      try {
        const cliente = clientes.find(c => c.id === cid);
        const contactoSel = contactosCliente.find(c => c.id === contactoSelId);
        const correos = [contactoSel?.email, cliente?.emailPrincipal].filter(Boolean);
        // v8.22.1: APAGADO hasta tener la plantilla oficial. En prod Resend está activo,
        // así que un placeholder llegaría a clientes reales. Activar cuando el texto esté listo.
        if (EMAIL_LEVANTAMIENTO_RECIBIDO_ON && correos.length > 0) {
          fetch('/api/email/levantamiento-recibido', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              destinatarios: correos,
              clienteNombre: cnombre,
              contactoNombre: finalContactName || '',
              servicio: serviceLabel,
              locacion: locNombreFinal,
              fecha: new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }),
              empresa: COMPANIES[company] || 'Super Techos',
            }),
          }).catch(() => {});
        }
      } catch { /* no bloquear creación */ }

      onCreado?.({ proyecto, site, iniciar });
    } catch (e) {
      setErrorMsg(e?.message || String(e));
      setGuardando(false);
    }
  };

  // v8.25.13: inputs más grandes (cómodos con dedo y mouse).
  const inpCls = 'w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3.5 py-2.5 text-white text-sm sm:text-base';
  const labCls = 'text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1.5';

  const ubicacionActual = ubicaciones.find(u => u.id === ubicSelId);

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 border-2 border-red-600 rounded-card w-full max-w-3xl my-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10 rounded-t-card">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">Nuevo levantamiento</div>
            <div className="text-sm font-bold mt-0.5">Un techo / un sitio</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tipo de servicio — por familia (opcional; se puede definir después) */}
          <div>
            <div className="flex items-center justify-between">
              <div className={labCls}>Tipo de servicio (opcional)</div>
              {familiaKey && <button onClick={() => { setFamiliaKey(null); setTemplateId(''); }} className="text-[10px] text-zinc-500 hover:text-zinc-300 mb-1.5">Sin tipo</button>}
            </div>
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
                ) : familiaKey && templatesFamilia.length >= 1 ? (
                  <div className="mt-1.5 text-[11px] text-zinc-500">
                    El tipo específico ({familiaKey === 'pisos' ? 'tipo de piso' : familiaKey === 'impermeable' ? 'tipo de techo' : 'tipo'}) se elige por área al capturar.
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-zinc-500">Puedes crear <b className="text-zinc-300">sin tipo</b> y definirlo después dentro del levantamiento.</div>
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

          {/* v8.25.17: datos del cliente nuevo (manual) — empresa o persona */}
          {!clienteId && clienteNombreFinal && (
            <div className="border border-red-800/40 bg-red-900/10 rounded-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-red-300 font-bold">Nuevo cliente «{clienteNombreFinal}»</div>
                <div className="flex gap-1">
                  {[['empresa', 'Empresa'], ['persona', 'Persona']].map(([k, l]) => (
                    <button key={k} onClick={() => setTipoClienteNuevo(k)} className={`px-2.5 py-0.5 rounded-card text-[10px] font-bold uppercase border ${tipoClienteNuevo === k ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={nuevoClienteTel} onChange={e => setNuevoClienteTel(e.target.value)} placeholder="Teléfono" inputMode="tel" className={inpCls} />
                <input value={nuevoClienteCedula} onChange={e => setNuevoClienteCedula(e.target.value)} placeholder={tipoClienteNuevo === 'persona' ? 'Cédula' : 'RNC'} inputMode="numeric" className={inpCls} />
              </div>
              {tipoClienteNuevo === 'persona' && (
                <div className="text-[10px] text-zinc-400">El contacto de la obra es <b>{clienteNombreFinal}</b> por defecto. Si recibe otra persona, ponla en <b>"Contacto en sitio → Otro"</b>.</div>
              )}
            </div>
          )}

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

            {/* Modo: locación existente — combobox (escribe y filtra la lista en vivo) */}
            {!loadingUbic && ubicMode === 'existente' && ubicaciones.length > 0 && (
              <div className="space-y-2">
                <div className="relative">
                  <div className="relative">
                    <input
                      value={buscarUbic}
                      onChange={e => { setBuscarUbic(e.target.value); setUbicAbierto(true); }}
                      onFocus={() => setUbicAbierto(true)}
                      onBlur={() => setTimeout(() => setUbicAbierto(false), 150)}
                      placeholder={`Busca entre ${ubicaciones.length} locaciones…`}
                      className={inpCls + ' pr-8'}
                    />
                    <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {ubicSelId && !ubicAbierto && (
                    <div className="mt-1 text-[11px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Locación: <b>{ubicacionActual?.nombre}</b></div>
                  )}
                  {ubicAbierto && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border-2 border-zinc-700 rounded-card max-h-56 overflow-y-auto shadow-xl">
                      {ubicacionesFiltradas.map(u => (
                        <button key={u.id} onMouseDown={e => e.preventDefault()} onClick={() => { seleccionarUbicacion(u); setBuscarUbic(u.nombre || ''); setUbicAbierto(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 border-b border-zinc-800/60 ${u.id === ubicSelId ? 'bg-red-900/15' : ''}`}>
                          <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="truncate">{u.nombre}</span>
                          {u.ciudad ? <span className="text-[10px] text-zinc-500 ml-auto shrink-0">{u.ciudad}</span> : null}
                        </button>
                      ))}
                      {ubicacionesFiltradas.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">Sin locaciones que coincidan.</div>}
                    </div>
                  )}
                </div>
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
                <div>
                  <div className={labCls}>Dirección</div>
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección del sitio" className={inpCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={labCls + ' mb-0'}>Sector</span>
                      {sugiriendo && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
                    </div>
                    <input value={sector} onChange={e => setSector(e.target.value)} placeholder="Sector / barrio" className={inpCls} />
                  </div>
                  <div>
                    <div className={labCls}>Ciudad</div>
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad" className={inpCls} />
                  </div>
                  <div>
                    <div className={labCls}>Provincia</div>
                    <input value={provincia} onChange={e => setProvincia(e.target.value)} placeholder="Provincia" className={inpCls} />
                  </div>
                  <div>
                    <div className={labCls}>País</div>
                    <input value={pais} onChange={e => setPais(e.target.value)} placeholder="País" className={inpCls} />
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 -mt-1">Al fijar la ubicación se sugieren dirección, sector, ciudad, provincia y país (y el nombre del lugar si lo tiene); puedes editarlos.</div>
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
                      <span className="flex items-center gap-1 text-green-300"><MapPin className="w-3 h-3" /> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)} <span className="text-green-600/70 uppercase text-[9px]">· {origenUbicacion === 'gps' ? 'GPS' : origenUbicacion === 'guardada' ? 'guardada' : origenUbicacion === 'mapa' ? 'mapa' : 'link'}</span></span>
                      <button onClick={() => { setLat(null); setLng(null); setOrigenUbicacion(null); }} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                  {/* v8.25.15: buscar el lugar en Google Maps (mejor búsqueda de POIs) y pegar el link */}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([locNombre, address, city].filter(s => s && s.trim()).join(' ').trim() || clienteNombreFinal)}`}
                    target="_blank" rel="noreferrer"
                    className="mt-1.5 w-full bg-zinc-900 border border-zinc-700 hover:border-blue-500 text-zinc-200 text-[11px] font-bold rounded-card px-3 py-2 flex items-center justify-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-blue-400" /> Buscar el lugar en Google Maps
                  </a>
                  <div className="text-[10px] text-zinc-500 mt-1">Encuentra el sitio en Google, toca <b>Compartir → Copiar vínculo</b> y pégalo arriba.</div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button onClick={() => setMapaAbierto(true)} className="text-[10px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Elegir en el mapa
                    </button>
                    <button onClick={capturarGps} disabled={gpsCargando} className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                      {gpsCargando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                      o capturar mi GPS actual
                    </button>
                  </div>
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

          {/* Contacto en sitio — del cliente o manual (quien recibe) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <div className={labCls + ' mb-0'}>Contacto en sitio (quien recibe)</div>
              {(clienteId || contactosCliente.length > 0) && (
                <div className="flex gap-1">
                  {contactosCliente.length > 0 && <button onClick={() => setContactoMode('cliente')} className={`px-2 py-0.5 rounded-card text-[10px] font-bold uppercase border ${contactoMode === 'cliente' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>Del cliente</button>}
                  {clienteId && <button onClick={() => setContactoMode('nuevo')} className={`px-2 py-0.5 rounded-card text-[10px] font-bold uppercase border ${contactoMode === 'nuevo' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>＋ Nuevo</button>}
                  <button onClick={() => { setContactoMode('manual'); setContactoSelId(''); setContactName(''); setMobilePhone(''); }} className={`px-2 py-0.5 rounded-card text-[10px] font-bold uppercase border ${contactoMode === 'manual' ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>Otro</button>
                </div>
              )}
            </div>
            {contactoMode === 'nuevo' && clienteId ? (
              <div className="space-y-2 bg-zinc-900/50 border border-zinc-800 rounded-card p-2.5">
                <div className="text-[11px] text-zinc-400">Crear un contacto nuevo y guardarlo en <b>{clienteNombreFinal}</b>.</div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={nuevoCt.nombre} onChange={e => setNuevoCt({ ...nuevoCt, nombre: e.target.value })} placeholder="Nombre *" className={inpCls} />
                  <input value={nuevoCt.cargo} onChange={e => setNuevoCt({ ...nuevoCt, cargo: e.target.value })} placeholder="Cargo (opcional)" className={inpCls} />
                  <input value={nuevoCt.telefono} onChange={e => setNuevoCt({ ...nuevoCt, telefono: e.target.value })} placeholder="Teléfono / WhatsApp" inputMode="tel" className={inpCls} />
                  <input value={nuevoCt.email} onChange={e => setNuevoCt({ ...nuevoCt, email: e.target.value })} placeholder="Email (opcional)" className={inpCls} />
                </div>
                <button onClick={guardarNuevoContacto} disabled={guardandoCt || !nuevoCt.nombre.trim()} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-bold uppercase py-2 rounded-card flex items-center justify-center gap-1.5">
                  {guardandoCt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Guardar contacto en el cliente
                </button>
              </div>
            ) : contactoMode === 'cliente' && contactosCliente.length > 0 ? (
              <div className="relative">
                <div className="relative">
                  <input
                    value={buscarContacto}
                    onChange={e => { setBuscarContacto(e.target.value); setContactoAbierto(true); }}
                    onFocus={() => setContactoAbierto(true)}
                    onBlur={() => setTimeout(() => setContactoAbierto(false), 150)}
                    placeholder={`Busca entre ${contactosCliente.length} contactos…`}
                    className={inpCls + ' pr-8'}
                  />
                  <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {contactoSelId && !contactoAbierto && (
                  <div className="mt-1 text-[11px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Contacto: <b>{contactosCliente.find(c => c.id === contactoSelId)?.nombre}</b></div>
                )}
                {contactoAbierto && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border-2 border-zinc-700 rounded-card max-h-56 overflow-y-auto shadow-xl">
                    {contactosFiltrados.map(c => (
                      <button key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => { elegirContacto(c.id); setBuscarContacto(c.nombre || ''); setContactoAbierto(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex flex-col border-b border-zinc-800/60 ${c.id === contactoSelId ? 'bg-red-900/15' : ''}`}>
                        <span className="truncate font-medium">{c.nombre}{c.esPrincipal ? ' ★' : ''}</span>
                        <span className="text-[10px] text-zinc-500 truncate">{[c.cargo, c.telefono].filter(Boolean).join(' · ') || '—'}</span>
                      </button>
                    ))}
                    {contactosFiltrados.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">Sin contactos que coincidan.</div>}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre de quien recibe" className={inpCls} />
                <input value={mobilePhone} onChange={e => setMobilePhone(e.target.value)} placeholder="809-…" inputMode="tel" className={inpCls} />
              </div>
            )}
          </div>

          {errorMsg && <div className="bg-red-900/20 border border-red-700 rounded-card text-red-300 p-2 text-xs">{errorMsg}</div>}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 p-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950 rounded-b-card">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-sm font-bold uppercase py-3 rounded-card sm:w-auto">Cancelar</button>
          {/* v8.25.13: crear sin iniciar la captura (para asignar/capturar después) */}
          <button onClick={() => guardar(false)} disabled={!puedeGuardar} className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-600 text-white text-sm font-bold uppercase py-3 rounded-card flex items-center justify-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Solo crear
          </button>
          <button onClick={() => guardar(true)} disabled={!puedeGuardar} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-black uppercase py-3 rounded-card flex items-center justify-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {guardando ? 'Creando…' : 'Crear y capturar'}
          </button>
        </div>
      </div>

      {mapaAbierto && (
        <MapaPickerModal
          initialLat={lat}
          initialLng={lng}
          onCerrar={() => setMapaAbierto(false)}
          onSelect={(la, ln) => { aplicarCoords(la, ln, 'mapa'); setMapaAbierto(false); }}
        />
      )}
    </div>
  );
}
