'use client';

// v8.19.8: Wizard "Nuevo levantamiento" — admin crea proyectos de surveys.
//
// 3 pasos:
//   1. Tipo de servicio (template) + empresa
//   2. Datos del proyecto (nombre, cliente, descripción)
//   3. Sites (manual uno a uno + paste-CSV simple)
//
// Al confirmar: INSERT en surveys.projects + bulk insert en surveys.sites.

import React, { useEffect, useState } from 'react';
import { X, Loader2, ArrowLeft, ArrowRight, Plus, Trash2, Building, FileText, MapPin, Check } from 'lucide-react';
import {
  listarTemplatesSurveys,
  crearProyectoSurvey,
  crearSitesEnLote,
  SERVICE_LINES,
  COMPANIES,
} from '../../lib/surveys';
import ServiceLineBadge from './ServiceLineBadge';

export default function ModalNuevoProyecto({ usuario, onCerrar, onCreado }) {
  const [paso, setPaso] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [loadingTpl, setLoadingTpl] = useState(true);

  // Paso 1
  const [templateId, setTemplateId] = useState('');
  const [company, setCompany] = useState('super_techos');

  // Paso 2
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');

  // Paso 3
  const [sites, setSites] = useState([]);
  const [pasteText, setPasteText] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Cargar templates al abrir
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoadingTpl(true);
      try {
        const data = await listarTemplatesSurveys();
        if (!cancelado) {
          setTemplates(data);
          if (data.length === 1) setTemplateId(data[0].id);
        }
      } catch (e) {
        if (!cancelado) setErrorMsg(e?.message || String(e));
      } finally {
        if (!cancelado) setLoadingTpl(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const templateActual = templates.find(t => t.id === templateId);

  const puedeAvanzar = () => {
    if (paso === 1) return !!templateId && !!company;
    if (paso === 2) return name.trim().length > 0 && clientName.trim().length > 0;
    if (paso === 3) return true; // sites es opcional, se pueden agregar después
    return true;
  };

  const agregarSiteVacio = () => {
    setSites(prev => [...prev, {
      _localId: Math.random().toString(36).slice(2),
      external_code: '',
      name: '',
      address: '',
      city: '',
      contact_name: '',
      mobile_phone: '',
    }]);
  };

  const actualizarSite = (idx, campo, val) => {
    setSites(prev => prev.map((s, i) => i === idx ? { ...s, [campo]: val } : s));
  };

  const eliminarSite = (idx) => {
    setSites(prev => prev.filter((_, i) => i !== idx));
  };

  // Pegado de CSV simple: header en primera línea o columnas fijas.
  // Acepta separadores: tab, coma, punto y coma.
  const importarPaste = () => {
    const lineas = pasteText.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length === 0) return;
    const sep = lineas[0].includes('\t') ? '\t' : (lineas[0].includes(';') ? ';' : ',');
    // Detecta header si la primera línea contiene palabras conocidas
    const headerSinNumeros = !/\d/.test(lineas[0]);
    let header = null;
    let dataLines = lineas;
    if (headerSinNumeros) {
      header = lineas[0].split(sep).map(c => c.trim().toLowerCase());
      dataLines = lineas.slice(1);
    }
    // Mapping de header a campos
    const mapField = (h) => {
      const x = h.replace(/[áéíóúñ]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n'}[c]));
      if (/^(codigo|cod|external_code)$/.test(x)) return 'external_code';
      if (/^(nombre|name|sucursal|sitio)$/.test(x)) return 'name';
      if (/^(direccion|address)$/.test(x)) return 'address';
      if (/^(ciudad|city)$/.test(x)) return 'city';
      if (/^(provincia|province)$/.test(x)) return 'province';
      if (/^(lat|latitud|latitude)$/.test(x)) return 'latitude';
      if (/^(lng|lon|longitud|longitude)$/.test(x)) return 'longitude';
      if (/^(contacto|contact_name)$/.test(x)) return 'contact_name';
      if (/^(movil|mobile|celular|whatsapp|mobile_phone)$/.test(x)) return 'mobile_phone';
      if (/^(oficina|office_phone)$/.test(x)) return 'office_phone';
      return x; // tal cual
    };
    const headerFields = header ? header.map(mapField) : ['external_code', 'name', 'address'];
    const nuevos = dataLines.map(line => {
      const cols = line.split(sep).map(c => c.trim());
      const obj = { _localId: Math.random().toString(36).slice(2) };
      headerFields.forEach((f, i) => {
        if (cols[i] != null) obj[f] = cols[i];
      });
      return obj;
    }).filter(o => o.name && o.name.trim());
    if (nuevos.length === 0) {
      setErrorMsg('No se reconoció ningún sitio. Verifica el formato (al menos una columna debe ser nombre).');
      return;
    }
    setSites(prev => [...prev, ...nuevos]);
    setPasteText('');
    setErrorMsg(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setErrorMsg(null);
    try {
      // 1. Crear proyecto
      const authUserId = await obtenerAuthUserIdActual();
      const proyecto = await crearProyectoSurvey({
        name: name.trim(),
        clientName: clientName.trim(),
        serviceLine: templateActual.service_line,
        company,
        templateId,
        description: description.trim() || null,
        createdByAuthUserId: authUserId,
      });

      // 2. Sites (si hay)
      if (sites.length > 0) {
        const validSites = sites.filter(s => s.name && s.name.trim());
        if (validSites.length > 0) {
          await crearSitesEnLote(proyecto.id, validSites);
        }
      }

      onCreado?.(proyecto);
    } catch (e) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 border-2 border-zinc-800 w-full max-w-2xl my-4">
        {/* Header */}
        <div className="border-b-2 border-red-600 px-4 py-3 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              Nuevo levantamiento · paso {paso} de 3
            </div>
            <div className="font-black text-sm">
              {paso === 1 && 'Tipo de servicio'}
              {paso === 2 && 'Datos del levantamiento'}
              {paso === 3 && 'Sitios a levantar'}
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {paso === 1 && (
            <Paso1
              templates={templates}
              loading={loadingTpl}
              templateId={templateId}
              setTemplateId={setTemplateId}
              company={company}
              setCompany={setCompany}
              templateActual={templateActual}
            />
          )}
          {paso === 2 && (
            <Paso2
              name={name}
              setName={setName}
              clientName={clientName}
              setClientName={setClientName}
              description={description}
              setDescription={setDescription}
            />
          )}
          {paso === 3 && (
            <Paso3
              sites={sites}
              onActualizar={actualizarSite}
              onEliminar={eliminarSite}
              onAgregar={agregarSiteVacio}
              pasteText={pasteText}
              setPasteText={setPasteText}
              onImportarPaste={importarPaste}
            />
          )}

          {errorMsg && (
            <div className="bg-red-900/20 border border-red-700 text-red-300 p-3 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-zinc-800 p-4 flex items-center justify-between gap-2 sticky bottom-0 bg-zinc-950">
          <button
            onClick={() => (paso === 1 ? onCerrar() : setPaso(p => p - 1))}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 text-xs font-bold uppercase flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {paso < 3 ? (
            <button
              onClick={() => setPaso(p => p + 1)}
              disabled={!puedeAvanzar()}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-3 py-2 text-xs font-bold uppercase flex items-center gap-1"
            >
              Siguiente <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={guardar}
              disabled={guardando}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white px-4 py-2 text-xs font-bold uppercase flex items-center gap-1"
            >
              {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Crear proyecto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PASO 1: Servicio + empresa
// ============================================================
function Paso1({ templates, loading, templateId, setTemplateId, company, setCompany, templateActual }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando servicios...
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-2">
          Servicio
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {templates.map(t => {
            const activo = templateId === t.id;
            const cfg = SERVICE_LINES[t.service_line] || SERVICE_LINES.other;
            return (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`text-left border-2 p-3 transition-colors ${
                  activo ? 'border-red-600 bg-red-900/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ServiceLineBadge serviceLine={t.service_line} />
                  <span className="text-[10px] text-zinc-500 uppercase">{COMPANIES[t.company]}</span>
                </div>
                <div className="font-bold text-sm">{t.name}</div>
                {t.description && (
                  <div className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{t.description}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {templateActual && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-2">
            Empresa que ejecuta
          </div>
          <div className="flex flex-wrap gap-2">
            {['super_techos', 'prouco', 'shared'].map(c => (
              <button
                key={c}
                onClick={() => setCompany(c)}
                className={`text-xs px-3 py-2 border-2 ${
                  company === c
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-red-600'
                }`}
              >
                {COMPANIES[c]}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Este template viene precargado de <strong>{COMPANIES[templateActual.company]}</strong>, pero puedes asignar el proyecto a cualquier empresa.
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PASO 2: Datos del proyecto
// ============================================================
function Paso2({ name, setName, clientName, setClientName, description, setDescription }) {
  return (
    <div className="space-y-3">
      <Field label="Nombre del levantamiento" required>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Techo Edificio Esperanza, Banreservas Pintura 2026…"
          autoFocus
          className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
        />
      </Field>
      <Field label="Cliente" required>
        <input
          type="text"
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="Ej: Banco de Reservas, Gildan, Centro Cuesta…"
          className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white"
        />
      </Field>
      <Field label="Descripción (opcional)">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Notas iniciales, alcance, contexto…"
          rows={3}
          className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-sm text-white resize-y"
        />
      </Field>
    </div>
  );
}

// ============================================================
// PASO 3: Sitios
// ============================================================
function Paso3({ sites, onActualizar, onEliminar, onAgregar, pasteText, setPasteText, onImportarPaste }) {
  const [mostrarPaste, setMostrarPaste] = useState(false);

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-zinc-500">
        Agrega los sitios físicos del proyecto (sucursales / naves / edificios). Puedes agregarlos uno por uno o pegar una lista con tabs/comas.
        <span className="text-zinc-400"> Los puedes editar después.</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={onAgregar}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Agregar sitio
        </button>
        <button
          onClick={() => setMostrarPaste(p => !p)}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
        >
          {mostrarPaste ? '× Cerrar pegado' : '📋 Pegar lista (CSV/Excel)'}
        </button>
      </div>

      {mostrarPaste && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
          <div className="text-[10px] text-zinc-500">
            Pega desde Excel/CSV. Primera fila opcional como header. Columnas reconocidas:
            <code className="block bg-zinc-950 p-1 mt-1 text-[10px] text-zinc-400">
              codigo, nombre, direccion, ciudad, lat, lng, contacto, movil
            </code>
          </div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="codigo	nombre	direccion	ciudad	lat	lng&#10;010	Sucursal Centro	Av. Mella 200	Santo Domingo	18.47	-69.91"
            rows={5}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200 font-mono resize-y"
          />
          <button
            onClick={onImportarPaste}
            disabled={!pasteText.trim()}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-700 text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
          >
            Importar
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sites.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-6 text-center text-xs text-zinc-500">
            Sin sitios todavía. Agrega al menos uno (o pasa al final y los agregas después).
          </div>
        )}
        {sites.map((s, idx) => (
          <div key={s._localId || idx} className="bg-zinc-900 border border-zinc-800 rounded-card p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5">
                #{idx + 1}
              </span>
              <input
                value={s.name || ''}
                onChange={e => onActualizar(idx, 'name', e.target.value)}
                placeholder="Nombre del sitio (requerido) — Ej: Sucursal Mella"
                className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-1 text-sm text-white"
              />
              <button onClick={() => onEliminar(idx)} className="text-zinc-500 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={s.external_code || ''}
                onChange={e => onActualizar(idx, 'external_code', e.target.value)}
                placeholder="Código (opcional)"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
              <input
                value={s.city || ''}
                onChange={e => onActualizar(idx, 'city', e.target.value)}
                placeholder="Ciudad"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
            </div>
            <input
              value={s.address || ''}
              onChange={e => onActualizar(idx, 'address', e.target.value)}
              placeholder="Dirección"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={s.latitude || ''}
                onChange={e => onActualizar(idx, 'latitude', e.target.value)}
                placeholder="Lat (opcional, ej. 18.4861)"
                inputMode="decimal"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
              <input
                value={s.longitude || ''}
                onChange={e => onActualizar(idx, 'longitude', e.target.value)}
                placeholder="Lng (opcional, ej. -69.9312)"
                inputMode="decimal"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={s.contact_name || ''}
                onChange={e => onActualizar(idx, 'contact_name', e.target.value)}
                placeholder="Contacto"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
              <input
                value={s.mobile_phone || ''}
                onChange={e => onActualizar(idx, 'mobile_phone', e.target.value)}
                placeholder="WhatsApp / móvil"
                className="bg-zinc-950 border border-zinc-800 rounded-card focus:border-red-600 outline-none px-2 py-1 text-xs text-zinc-200"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-zinc-500 text-center">
        {sites.length} sitio{sites.length === 1 ? '' : 's'} a crear
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{label}</span>
        {required && <span className="text-red-500 text-[11px]">*</span>}
      </div>
      {children}
    </div>
  );
}

// Mismo helper que DynamicSurveyForm — duplicado a propósito para
// mantener el módulo autocontenido (sin import cruzado de componentes).
async function obtenerAuthUserIdActual() {
  if (typeof window === 'undefined') return null;
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (keys.length === 0) return null;
    const raw = localStorage.getItem(keys[0]);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id || parsed?.currentSession?.user?.id || null;
  } catch {
    return null;
  }
}
