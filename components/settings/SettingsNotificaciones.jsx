'use client';

// SettingsNotificaciones.jsx — Configuración de correos por módulo + etapa.
// (1) Etapas: por etapa, activar correo al CLIENTE y/o INTERNO (roles + lista),
//     eligiendo la plantilla. (2) Plantillas: crear/editar plantillas de correo.

import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Mail, Users, User, Loader2, Plus, Trash2, Save, Layers, FileText, Check } from 'lucide-react';
import {
  MODULOS_NOTIF, ROLES_INTERNOS, VARIABLES_PLANTILLA,
  listarPlantillas, guardarPlantilla, eliminarPlantilla,
  listarStageConfigs, guardarStageConfig,
} from '../../lib/notificaciones';

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-red-600' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
    </button>
  );
}

export default function SettingsNotificaciones({ usuario, onVolver }) {
  const [tab, setTab] = useState('etapas');
  const [plantillas, setPlantillas] = useState([]);
  const [configs, setConfigs] = useState({}); // key 'modulo:etapa' -> cfg
  const [loading, setLoading] = useState(true);
  const [moduloSel, setModuloSel] = useState('proyecto');

  const cargar = useCallback(async () => {
    setLoading(true);
    const [tpls, cfgs] = await Promise.all([listarPlantillas(), listarStageConfigs()]);
    setPlantillas(tpls);
    const map = {};
    cfgs.forEach(c => { map[c.id] = c; });
    setConfigs(map);
    setLoading(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const cfgDe = (modulo, etapa) => configs[`${modulo}:${etapa}`] || {
    id: `${modulo}:${etapa}`, modulo, etapa,
    clienteActivo: false, clienteTemplateId: null,
    internoActivo: false, internoTemplateId: null, internoRoles: [], internoEmails: [],
  };

  const actualizar = async (modulo, etapa, patch) => {
    const base = cfgDe(modulo, etapa);
    const next = { ...base, ...patch };
    setConfigs(prev => ({ ...prev, [next.id]: next })); // optimista
    try { await guardarStageConfig(next); } catch (e) { console.warn('guardarStageConfig:', e?.message); }
  };

  const moduloActual = MODULOS_NOTIF.find(m => m.key === moduloSel);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <div className="flex items-center gap-2">
        <Mail className="w-6 h-6 text-red-500" />
        <h1 className="text-2xl font-black">Notificaciones por correo</h1>
      </div>
      <p className="text-sm text-zinc-400 -mt-2">Define qué etapas de cada módulo envían correo al <b className="text-zinc-200">cliente</b> y cuáles envían correo <b className="text-zinc-200">interno</b>, y con qué plantilla.</p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {[['etapas', 'Etapas', Layers], ['plantillas', 'Plantillas', FileText]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-bold flex items-center gap-1.5 border-b-2 -mb-px ${tab === k ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-6"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : tab === 'etapas' ? (
        <div className="space-y-3">
          {/* Selector de módulo */}
          <div className="flex flex-wrap gap-1.5">
            {MODULOS_NOTIF.map(m => (
              <button key={m.key} onClick={() => setModuloSel(m.key)} className={`px-3 py-1.5 rounded-card text-xs font-bold border ${moduloSel === m.key ? 'border-red-600 bg-red-900/20 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'}`}>{m.label}</button>
            ))}
          </div>

          {/* Etapas del módulo */}
          <div className="space-y-2">
            {moduloActual.etapas.map(et => {
              const cfg = cfgDe(moduloSel, et.key);
              return (
                <div key={et.key} className="border border-zinc-800 rounded-card bg-zinc-900/40 p-3 space-y-2.5">
                  <div className="text-sm font-bold text-zinc-200">{et.label}</div>

                  {/* Cliente */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 w-28 shrink-0 pt-1">
                      <User className="w-3.5 h-3.5 text-green-400" /><span className="text-xs font-bold text-zinc-300">Cliente</span>
                    </div>
                    <Toggle on={cfg.clienteActivo} onClick={() => actualizar(moduloSel, et.key, { clienteActivo: !cfg.clienteActivo })} />
                    {cfg.clienteActivo && (
                      <select value={cfg.clienteTemplateId || ''} onChange={e => actualizar(moduloSel, et.key, { clienteTemplateId: e.target.value || null })} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white">
                        <option value="">— Plantilla… —</option>
                        {plantillas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Interno */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 w-28 shrink-0 pt-1">
                      <Users className="w-3.5 h-3.5 text-blue-400" /><span className="text-xs font-bold text-zinc-300">Interno</span>
                    </div>
                    <Toggle on={cfg.internoActivo} onClick={() => actualizar(moduloSel, et.key, { internoActivo: !cfg.internoActivo })} />
                    {cfg.internoActivo && (
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          {ROLES_INTERNOS.map(r => {
                            const on = cfg.internoRoles.includes(r.key);
                            return (
                              <button key={r.key} onClick={() => actualizar(moduloSel, et.key, { internoRoles: on ? cfg.internoRoles.filter(x => x !== r.key) : [...cfg.internoRoles, r.key] })} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${on ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-zinc-700 text-zinc-400'}`}>
                                {on && <Check className="w-2.5 h-2.5 inline mr-0.5" />}{r.label}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          defaultValue={cfg.internoEmails.join(', ')}
                          onBlur={e => actualizar(moduloSel, et.key, { internoEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          placeholder="Correos fijos separados por coma (ops@…, gerencia@…)"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white"
                        />
                        <select value={cfg.internoTemplateId || ''} onChange={e => actualizar(moduloSel, et.key, { internoTemplateId: e.target.value || null })} className="bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1 text-xs text-white">
                          <option value="">— Plantilla… —</option>
                          {plantillas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EditorPlantillas plantillas={plantillas} onCambio={cargar} />
      )}
    </div>
  );
}

function EditorPlantillas({ plantillas, onCambio }) {
  const [editando, setEditando] = useState(null); // objeto plantilla o null
  const [guardando, setGuardando] = useState(false);

  const nueva = () => setEditando({ id: null, nombre: '', asunto: '', html: '', descripcion: '' });

  const guardar = async () => {
    if (!editando.nombre.trim()) { alert('Ponle un nombre a la plantilla.'); return; }
    setGuardando(true);
    try { await guardarPlantilla(editando); setEditando(null); await onCambio(); }
    catch (e) { alert('Error: ' + (e.message || e)); }
    finally { setGuardando(false); }
  };

  const borrar = async (id) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try { await eliminarPlantilla(id); await onCambio(); } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  if (editando) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">{editando.id ? 'Editar plantilla' : 'Nueva plantilla'}</div>
          <button onClick={() => setEditando(null)} className="text-xs text-zinc-400 hover:text-white">Cancelar</button>
        </div>
        <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} placeholder="Nombre interno (ej. Proyecto aprobado · cliente)" className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-3 py-2 text-sm text-white" />
        <input value={editando.asunto} onChange={e => setEditando({ ...editando, asunto: e.target.value })} placeholder="Asunto del correo" className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-3 py-2 text-sm text-white" />
        <textarea value={editando.html} onChange={e => setEditando({ ...editando, html: e.target.value })} placeholder="Cuerpo del correo (HTML). Usa variables como {{cliente}}, {{etapa}}…" rows={12} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none rounded-card px-3 py-2 text-sm text-white font-mono" />
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-card p-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-bold mb-1">Variables disponibles (click para copiar)</div>
          <div className="flex flex-wrap gap-1">
            {VARIABLES_PLANTILLA.map(v => (
              <button key={v.k} title={v.d} onClick={() => { try { navigator.clipboard.writeText(`{{${v.k}}}`); } catch {} }} className="text-[10px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">{`{{${v.k}}}`}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={guardar} disabled={guardando} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase px-4 py-2 rounded-card flex items-center gap-1">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar plantilla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={nueva} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase px-3 py-1.5 rounded-card flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Nueva plantilla</button>
      </div>
      {plantillas.length === 0 ? (
        <div className="text-sm text-zinc-500 py-4">Sin plantillas. Crea la primera.</div>
      ) : (
        <div className="space-y-1.5">
          {plantillas.map(t => (
            <div key={t.id} className="border border-zinc-800 rounded-card bg-zinc-900/40 p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-200 truncate">{t.nombre}</div>
                <div className="text-[11px] text-zinc-500 truncate">{t.asunto || 'Sin asunto'}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditando(t)} className="text-xs text-zinc-400 hover:text-white px-2 py-1">Editar</button>
                <button onClick={() => borrar(t.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
