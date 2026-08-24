'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Loader2, Edit2, Trash2, Copy, Check, FileText, Upload, X, AlertTriangle, Eye, MapPin, RefreshCw, ExternalLink, Camera, Satellite } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagenABlob } from '../../lib/imports';
import Campo from '../common/Campo';
import Input from '../common/Input';
import ModalInspecciones from './ModalInspecciones';
import VistaFlotaGps from './VistaFlotaGps';
import RutasVehiculo from './RutasVehiculo'; // v8.41.0

const COLORES = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul', 'Verde', 'Amarillo', 'Dorado', 'Marrón'];

// Botón de copiar al portapapeles con feedback.
function CopiarBtn({ texto }) {
  const [ok, setOk] = useState(false);
  if (!texto) return null;
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1200); } catch {} }}
      title="Copiar" className="text-zinc-500 hover:text-white p-1">
      {ok ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

const diasParaVencer = (fecha) => {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(fecha + 'T00:00:00') - hoy) / 86400000);
};

export default function VistaVehiculos({ usuario, data, onRecargar }) {
  const [vehiculos, setVehiculos] = useState(data?.vehiculos || []);
  const [cargando, setCargando] = useState(false);
  const [modal, setModal] = useState(null); // null | 'nuevo' | vehiculo
  const [logDe, setLogDe] = useState(null); // vehículo cuyo log se está viendo (v8.33.0)
  const [gpsDe, setGpsDe] = useState(null); // vehículo cuyo mapa GPS se está viendo (v8.27.85)
  const [rutasDe, setRutasDe] = useState(null); // v8.41.0: rutas futuras/pasadas del vehículo
  const [inspDe, setInspDe] = useState(null); // vehículo cuyas inspecciones se están viendo (v8.35.3)
  const [licencias, setLicencias] = useState({}); // v8.35.2: licencia por chofer (responsable) para verla en la ficha
  const [tab, setTab] = useState('fichas'); // v8.42.1: 'fichas' | 'flota' (dashboard GPS)

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const vs = await db.listarVehiculos({});
      setVehiculos(vs);
      try { setLicencias(await db.obtenerLicenciasDePersonas(vs.map((v) => v.responsableId))); } catch {}
    } finally { setCargando(false); }
    onRecargar?.();
  }, [onRecargar]);
  useEffect(() => { cargar(); }, []); // eslint-disable-line

  const verDoc = async (path) => {
    if (!path) return;
    try { const url = await db.obtenerUrlDocVehiculo(path, 3600); if (url) window.open(url, '_blank'); }
    catch { toast.error('No se pudo abrir el documento.'); }
  };
  const verLicencia = async (path) => {
    if (!path) return;
    try { const url = await db.obtenerUrlDocLicencia(path, 3600); if (url) window.open(url, '_blank'); }
    catch { toast.error('No se pudo abrir la licencia.'); }
  };
  const eliminar = async (v) => {
    if (!confirm(`¿Eliminar ${v.marca} ${v.modelo} (${v.placa || 'sin placa'})?`)) return;
    try { await db.eliminarVehiculo(v.id); toast.success('Eliminado.'); cargar(); }
    catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2"><Car className="w-6 h-6 text-red-500" /> Vehículos</h1>
          <div className="text-[11px] text-zinc-500">Flota de la empresa · datos, matrícula y seguro</div>
        </div>
        {tab === 'fichas' && (
          <button onClick={() => setModal('nuevo')} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2.5 flex items-center gap-1">
            <Plus className="w-4 h-4" /> Nuevo vehículo
          </button>
        )}
      </div>

      {/* v8.42.1: pestañas Fichas / Flota GPS */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('fichas')} className={`text-xs font-bold px-3.5 py-2 rounded-card flex items-center gap-1.5 ${tab === 'fichas' ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}><Car className="w-3.5 h-3.5" /> Fichas</button>
        <button onClick={() => setTab('flota')} className={`text-xs font-bold px-3.5 py-2 rounded-card flex items-center gap-1.5 ${tab === 'flota' ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}><Satellite className="w-3.5 h-3.5" /> Flota GPS</button>
      </div>

      {tab === 'flota' ? (
        <VistaFlotaGps usuario={usuario} data={data} />
      ) : cargando ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : vehiculos.length === 0 ? (
        <div className="py-16 text-center text-zinc-600">
          <Car className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <div className="text-sm">No hay vehículos. Toca <b>“Nuevo vehículo”</b> para agregar el primero.</div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {vehiculos.map((v) => {
            const dias = diasParaVencer(v.seguroVence);
            const seguroBadge = dias == null ? null
              : dias < 0 ? { t: `Seguro vencido hace ${-dias}d`, c: 'bg-red-900/50 text-red-300 border-red-700' }
              : dias <= 30 ? { t: `Seguro vence en ${dias}d`, c: 'bg-amber-900/40 text-amber-300 border-amber-700' }
              : { t: `Seguro al día`, c: 'bg-green-900/30 text-green-400 border-green-800' };
            return (
              <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-black">{v.marca} {v.modelo} {v.anio ? <span className="text-zinc-500 font-normal">· {v.anio}</span> : ''}</div>
                    <div className="text-[11px] text-zinc-500">{v.color || 'sin color'}{v.empresa ? ` · ${v.empresa === 'super_techos' ? 'Super Techos' : 'Prouco'}` : ''}{v.tipo ? ` · ${v.tipo}` : ''}</div>
                    <div className="text-[11px] mt-0.5">
                      <span className="text-zinc-500">Responsable: </span>
                      <b>{(data?.personal || []).find(p => p.id === v.responsableId)?.nombre || '— sin asignar —'}</b>
                      {v.odometroKm ? <span className="text-zinc-500"> · {v.odometroKm.toLocaleString()} km</span> : null}
                      {v.estadoOperativo && v.estadoOperativo !== 'activo' && <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-card ${v.estadoOperativo === 'en_taller' ? 'bg-amber-600/20 text-amber-400' : 'bg-red-600/20 text-red-400'}`}>{v.estadoOperativo === 'en_taller' ? '🔧 En taller' : '⛔ Fuera de servicio'}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setInspDe(v)} title="Inspecciones" className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded"><Camera className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setLogDe(v)} title="Historial / log" className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded text-[11px] font-bold">📋</button>
                    <button onClick={() => setRutasDe(v)} title="Rutas del vehículo (futuras y pasadas)" className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded text-[11px] font-bold">🚚</button>
                    <button onClick={() => setModal(v)} title="Editar" className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => eliminar(v)} title="Eliminar" className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                    <div className="text-[9px] uppercase text-zinc-500">Placa</div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-bold">{v.placa || '—'}</span><CopiarBtn texto={v.placa} />
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                    <div className="text-[9px] uppercase text-zinc-500">Chasis</div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs truncate">{v.chasis || '—'}</span><CopiarBtn texto={v.chasis} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {seguroBadge && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${seguroBadge.c}`}>{seguroBadge.t}{v.seguroVence ? ` (${v.seguroVence})` : ''}</span>}
                  {(() => { const d = diasParaVencer(v.matriculaVence); return d == null ? null : <span className={`text-[10px] px-2 py-0.5 rounded-full border ${d < 0 ? 'bg-red-900/50 text-red-300 border-red-700' : d <= 30 ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-green-900/30 text-green-400 border-green-800'}`}>{d < 0 ? `Placa vencida ${-d}d` : `Placa ${d}d`}</span>; })()}
                  {v.matriculaPath
                    ? <button onClick={() => verDoc(v.matriculaPath)} className="text-[11px] flex items-center gap-1 text-blue-400 hover:underline"><FileText className="w-3 h-3" /> Matrícula</button>
                    : <span className="text-[11px] text-zinc-600">sin matrícula</span>}
                  {v.seguroPath
                    ? <button onClick={() => verDoc(v.seguroPath)} className="text-[11px] flex items-center gap-1 text-blue-400 hover:underline"><FileText className="w-3 h-3" /> Seguro</button>
                    : <span className="text-[11px] text-zinc-600">sin seguro</span>}
                  {v.gpsUrl
                    ? <button onClick={() => setGpsDe(v)} className="text-[11px] flex items-center gap-1 text-emerald-400 hover:underline font-bold"><MapPin className="w-3 h-3" /> GPS en vivo</button>
                    : <span className="text-[11px] text-zinc-600">sin GPS</span>}
                  {/* v8.35.2: licencia del chofer (responsable) — sale de inmediato en la ficha */}
                  {v.responsableId && (() => {
                    const lic = licencias[v.responsableId];
                    const d = lic?.licenciaVence ? diasParaVencer(lic.licenciaVence) : null;
                    return (
                      <>
                        {lic?.licenciaPath
                          ? <button onClick={() => verLicencia(lic.licenciaPath)} className="text-[11px] flex items-center gap-1 text-purple-300 hover:underline"><FileText className="w-3 h-3" /> Licencia{lic.licenciaCategoria ? ` · ${lic.licenciaCategoria}` : ''}</button>
                          : <span className="text-[11px] text-amber-500">⚠ chofer sin licencia</span>}
                        {d != null && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${d < 0 ? 'bg-red-900/50 text-red-300 border-red-700' : d <= 30 ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-green-900/30 text-green-400 border-green-800'}`}>{d < 0 ? `Lic. vencida ${-d}d` : `Lic. ${d}d`}</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logDe && <ModalLogVehiculo usuario={usuario} vehiculo={logDe} personal={data?.personal || []} onCerrar={() => setLogDe(null)} />}
      {rutasDe && <RutasVehiculo vehiculo={rutasDe} onCerrar={() => setRutasDe(null)} />}
      {gpsDe && <ModalGpsVehiculo vehiculo={gpsDe} onCerrar={() => setGpsDe(null)} />}
      {inspDe && <ModalInspecciones vehiculo={inspDe} usuario={usuario} onCerrar={() => { setInspDe(null); cargar(); }} />}
      {modal && (
        <ModalVehiculo
          usuario={usuario}
          personal={data?.personal || []}
          vehiculo={modal === 'nuevo' ? null : modal}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

function ModalVehiculo({ usuario, vehiculo, personal, onCerrar, onGuardado }) {
  const editando = !!vehiculo;
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // 'matricula' | 'seguro' | null
  const [form, setForm] = useState({
    marca: vehiculo?.marca || '', modelo: vehiculo?.modelo || '',
    anio: vehiculo?.anio || '', color: vehiculo?.color || '',
    chasis: vehiculo?.chasis || '', placa: vehiculo?.placa || '',
    empresa: vehiculo?.empresa || '',
    seguroAseguradora: vehiculo?.seguroAseguradora || '', seguroVence: vehiculo?.seguroVence || '',
    notas: vehiculo?.notas || '',
    matriculaPath: vehiculo?.matriculaPath || null, seguroPath: vehiculo?.seguroPath || null,
    // v8.33.0
    responsableId: vehiculo?.responsableId || '', tipo: vehiculo?.tipo || '',
    combustible: vehiculo?.combustible || '', capacidadCargaKg: vehiculo?.capacidadCargaKg || '',
    odometroKm: vehiculo?.odometroKm || '', matriculaVence: vehiculo?.matriculaVence || '',
    revisionVence: vehiculo?.revisionVence || '', tagPeaje: vehiculo?.tagPeaje || '',
    estadoOperativo: vehiculo?.estadoOperativo || 'activo', proximoMantFecha: vehiculo?.proximoMantFecha || '',
    gpsUrl: vehiculo?.gpsUrl || '',
    gpsDeviceId: vehiculo?.gpsDeviceId || '',
    // v8.35.2: licencia del chofer (se carga/guarda en la persona responsable)
    licenciaPath: null, licenciaCategoria: '', licenciaVence: '',
  });

  // v8.35.2: carga la licencia del chofer (responsable) elegido, para verla/editarla aquí.
  const [cargandoLic, setCargandoLic] = useState(false);
  const [subiendoLic, setSubiendoLic] = useState(false);
  useEffect(() => {
    const rid = form.responsableId;
    if (!rid) { setForm((f) => ({ ...f, licenciaPath: null, licenciaCategoria: '', licenciaVence: '' })); return; }
    let cancel = false;
    (async () => {
      setCargandoLic(true);
      try {
        const m = await db.obtenerLicenciasDePersonas([rid]);
        const lic = m[rid];
        if (!cancel) setForm((f) => ({ ...f, licenciaPath: lic?.licenciaPath || null, licenciaCategoria: lic?.licenciaCategoria || '', licenciaVence: lic?.licenciaVence || '' }));
      } catch {}
      if (!cancel) setCargandoLic(false);
    })();
    return () => { cancel = true; };
  }, [form.responsableId]);

  const subirLicencia = async (file) => {
    if (!file) return;
    if (!form.responsableId) { toast.warning('Primero elige el chofer.'); return; }
    setSubiendoLic(true);
    try {
      let blob = file;
      if ((file.type || '').startsWith('image/')) blob = await comprimirImagenABlob(file, 1600, 0.7);
      const path = await db.subirDocLicencia({ file: blob, personaId: form.responsableId });
      setForm((f) => ({ ...f, licenciaPath: path }));
      toast.success('Licencia subida.');
    } catch (e) { toast.error('Error subiendo licencia: ' + (e.message || e)); }
    finally { setSubiendoLic(false); }
  };

  // Sube el doc de una vez (necesitamos un id; si es nuevo, lo creamos al primer archivo).
  const [vehiculoId, setVehiculoId] = useState(vehiculo?.id || null);
  const subirDoc = async (tipo, file) => {
    if (!file) return;
    setSubiendo(tipo);
    try {
      let blob = file;
      if ((file.type || '').startsWith('image/')) blob = await comprimirImagenABlob(file, 1600, 0.7);
      const id = vehiculoId || ('veh_' + Date.now() + Math.random().toString(36).slice(2, 6));
      if (!vehiculoId) setVehiculoId(id);
      const path = await db.subirDocVehiculo({ file: blob, vehiculoId: id, tipo });
      setForm((f) => ({ ...f, [tipo === 'matricula' ? 'matriculaPath' : 'seguroPath']: path }));
      toast.success(`${tipo === 'matricula' ? 'Matrícula' : 'Seguro'} subido.`);
    } catch (e) { toast.error('Error subiendo: ' + (e.message || e)); }
    finally { setSubiendo(null); }
  };

  const guardar = async () => {
    if (!form.marca.trim() && !form.placa.trim()) { toast.warning('Al menos marca o placa.'); return; }
    setGuardando(true);
    const payload = { ...form, id: vehiculoId || undefined };
    try {
      if (editando) await db.actualizarVehiculo(vehiculo.id, payload);
      else await db.crearVehiculo(payload);
      // v8.35.2: guardar la licencia en la persona del chofer (responsable)
      if (form.responsableId) {
        try { await db.guardarLicenciaPersona(form.responsableId, { licenciaPath: form.licenciaPath, licenciaCategoria: form.licenciaCategoria, licenciaVence: form.licenciaVence }); } catch (e) { console.warn('guardar licencia:', e?.message); }
      }
      toast.success('Vehículo guardado.');
      onGuardado();
    } catch (e) { toast.error('Error: ' + (e.message || e)); setGuardando(false); }
  };

  const DocBtn = ({ tipo, path, label }) => (
    <div className="bg-zinc-950 border-2 border-zinc-800 rounded-card p-3">
      <div className="text-[10px] uppercase text-zinc-400 font-bold mb-1">{label}</div>
      {path ? (
        <div className="flex items-center justify-between gap-2">
          <button onClick={async () => { const u = await db.obtenerUrlDocVehiculo(path); if (u) window.open(u, '_blank'); }} className="text-xs text-blue-400 flex items-center gap-1 hover:underline"><Eye className="w-3 h-3" /> Ver documento</button>
          <label className="text-[10px] text-zinc-500 hover:text-white cursor-pointer underline">reemplazar
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirDoc(tipo, e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <label className="flex items-center gap-2 border border-dashed border-zinc-700 hover:border-red-600 p-2 cursor-pointer text-xs text-zinc-400">
          {subiendo === tipo ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Upload className="w-4 h-4" />}
          {subiendo === tipo ? 'Subiendo…' : 'Subir foto o PDF'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirDoc(tipo, e.target.files?.[0])} />
        </label>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 rounded-card max-w-lg w-full p-5 space-y-3 my-8">
        <div className="flex justify-between items-start">
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold">{editando ? 'Editar vehículo' : 'Nuevo vehículo'}</div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Marca"><Input value={form.marca} onChange={(v) => setForm({ ...form, marca: v })} placeholder="Toyota, Honda…" /></Campo>
          <Campo label="Modelo"><Input value={form.modelo} onChange={(v) => setForm({ ...form, modelo: v })} placeholder="Hilux, CR-V…" /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Año"><Input type="number" value={form.anio} onChange={(v) => setForm({ ...form, anio: v })} placeholder="2022" /></Campo>
          <Campo label="Color">
            <input list="colores-veh" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Blanco…"
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm" />
            <datalist id="colores-veh">{COLORES.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
        </div>
        <Campo label="Placa"><Input value={form.placa} onChange={(v) => setForm({ ...form, placa: (v || '').toUpperCase() })} placeholder="A123456" /></Campo>
        <Campo label="Chasis"><Input value={form.chasis} onChange={(v) => setForm({ ...form, chasis: (v || '').toUpperCase() })} placeholder="Número de chasis / VIN" /></Campo>
        <Campo label="Empresa (opcional)">
          <select value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
            <option value="">— Ninguna —</option>
            <option value="super_techos">Super Techos</option>
            <option value="prouco">Prouco</option>
          </select>
        </Campo>
        <Campo label="Enlace GPS (Pressto)">
          <Input value={form.gpsUrl} onChange={(v) => setForm({ ...form, gpsUrl: v })} placeholder="https://…  (link de Compartir de Pressto para este vehículo)" />
          {/* v8.43.0: unidad GPS EN VIVO — amarra el vehículo a su rastreador */}
          <SelectorUnidadGPS value={form.gpsDeviceId} onChange={(v) => setForm({ ...form, gpsDeviceId: v })} />
          <div className="text-[10px] text-zinc-500 mt-1">En Pressto: <b>Compartir → Ninguna → selecciona SOLO este vehículo → Guardar</b>, y en la pestaña <b>Sharings</b> copia el enlace y pégalo aquí. Con eso el mapa en vivo se ve desde la ficha.</div>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Chofer / Responsable">
            <select value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              <option value="">— Sin asignar —</option>
              {(personal || []).filter(p => p.activo !== false).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              <option value="">—</option><option value="camion">Camión</option><option value="camioneta">Camioneta</option><option value="carro">Carro</option><option value="motor">Motor</option><option value="equipo">Equipo</option>
            </select>
          </Campo>
        </div>

        {/* v8.35.2: Licencia de conducir del chofer (se guarda en la persona) */}
        {form.responsableId && (
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-card p-3 space-y-2">
            <div className="text-[10px] uppercase text-zinc-400 font-bold flex items-center gap-1"><FileText className="w-3 h-3 text-purple-400" /> Licencia de conducir del chofer {cargandoLic && <Loader2 className="w-3 h-3 animate-spin text-purple-400" />}</div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Categoría"><Input value={form.licenciaCategoria} onChange={(v) => setForm({ ...form, licenciaCategoria: v })} placeholder="Categoría 3" /></Campo>
              <Campo label="Vence"><Input type="date" value={form.licenciaVence} onChange={(v) => setForm({ ...form, licenciaVence: v })} /></Campo>
            </div>
            {form.licenciaPath ? (
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={async () => { const u = await db.obtenerUrlDocLicencia(form.licenciaPath); if (u) window.open(u, '_blank'); }} className="text-xs text-blue-400 flex items-center gap-1 hover:underline"><Eye className="w-3 h-3" /> Ver licencia</button>
                <label className="text-[10px] text-zinc-500 hover:text-white cursor-pointer underline">reemplazar
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirLicencia(e.target.files?.[0])} />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-2 border border-dashed border-zinc-700 hover:border-purple-500 p-2 cursor-pointer text-xs text-zinc-400 rounded-card">
                {subiendoLic ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <Upload className="w-4 h-4" />}
                {subiendoLic ? 'Subiendo…' : 'Subir licencia (foto o PDF)'}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirLicencia(e.target.files?.[0])} />
              </label>
            )}
            <div className="text-[10px] text-zinc-500">Se guarda en la persona del chofer y aparece en la ficha del vehículo (con alerta de vencimiento).</div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Campo label="Combustible">
            <select value={form.combustible} onChange={(e) => setForm({ ...form, combustible: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              <option value="">—</option><option value="diesel">Diésel</option><option value="gasolina">Gasolina</option><option value="glp">GLP</option>
            </select>
          </Campo>
          <Campo label="Capacidad (kg)"><Input type="number" value={form.capacidadCargaKg} onChange={(v) => setForm({ ...form, capacidadCargaKg: v })} placeholder="3500" /></Campo>
          <Campo label="Odómetro (km)"><Input type="number" value={form.odometroKm} onChange={(v) => setForm({ ...form, odometroKm: v })} placeholder="85000" /></Campo>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo label="Vence placa/marbete"><Input type="date" value={form.matriculaVence} onChange={(v) => setForm({ ...form, matriculaVence: v })} /></Campo>
          <Campo label="Vence revisión"><Input type="date" value={form.revisionVence} onChange={(v) => setForm({ ...form, revisionVence: v })} /></Campo>
          <Campo label="Tag peaje"><Input value={form.tagPeaje} onChange={(v) => setForm({ ...form, tagPeaje: v })} placeholder="Paso Rápido #" /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Estado operativo">
            <select value={form.estadoOperativo} onChange={(e) => setForm({ ...form, estadoOperativo: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm">
              <option value="activo">Activo</option><option value="en_taller">En taller</option><option value="fuera_servicio">Fuera de servicio</option>
            </select>
          </Campo>
          <Campo label="Próx. mantenimiento (fecha)"><Input type="date" value={form.proximoMantFecha} onChange={(v) => setForm({ ...form, proximoMantFecha: v })} /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Aseguradora"><Input value={form.seguroAseguradora} onChange={(v) => setForm({ ...form, seguroAseguradora: v })} placeholder="Seguros…" /></Campo>
          <Campo label="Vence seguro"><Input type="date" value={form.seguroVence} onChange={(v) => setForm({ ...form, seguroVence: v })} /></Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DocBtn tipo="matricula" path={form.matriculaPath} label="📄 Matrícula" />
          <DocBtn tipo="seguro" path={form.seguroPath} label="🛡️ Seguro" />
        </div>

        <Campo label="Notas"><Input value={form.notas} onChange={(v) => setForm({ ...form, notas: v })} placeholder="Opcional" /></Campo>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} {editando ? 'Guardar cambios' : 'Guardar vehículo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// v8.33.0: Log del vehículo — historial de mantenimientos, fallas, choques y daños.
// Jonathan (flota) registra con costo/taller y resuelve lo reportado por los responsables.
function ModalLogVehiculo({ usuario, vehiculo, personal, onCerrar }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [form, setForm] = useState({ tipo: 'mantenimiento', descripcion: '', km: '', costoRd: '', taller: '', fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date()) });
  const TIPOS = { mantenimiento: '🛢️ Mantenimiento', falla_mecanica: '🔧 Falla mecánica', choque: '💥 Choque', dano: '🔨 Daño', gomas: '🛞 Gomas', inspeccion: '🔎 Inspección', otro: '📝 Otro' };
  const ESTADOS = { abierto: ['Abierto', 'bg-red-600/20 text-red-400'], en_taller: ['En taller', 'bg-amber-600/20 text-amber-400'], resuelto: ['Resuelto ✓', 'bg-green-600/20 text-green-400'] };

  const cargar = async () => {
    setLoading(true);
    try { setEventos(await db.listarEventosVehiculo({ vehiculoId: vehiculo.id })); } catch (e) { /* */ }
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [vehiculo.id]);

  const guardar = async () => {
    if (!(form.descripcion || '').trim()) { toast.warning('Describe el evento.'); return; }
    try {
      await db.crearEventoVehiculo({ vehiculoId: vehiculo.id, ...form, descripcion: form.descripcion.trim(), reportadoPorId: usuario.id, reportadoPorNombre: usuario.nombre, estado: (form.tipo === 'mantenimiento' || form.tipo === 'inspeccion') ? 'resuelto' : 'abierto' });
      setAgregando(false); setForm({ ...form, descripcion: '', km: '', costoRd: '', taller: '' });
      toast.success('Evento registrado.');
      await cargar();
    } catch (e) { toast.error('Error: ' + (e?.message || e)); }
  };
  const setEstado = async (ev, estado) => {
    const nota = estado === 'resuelto' ? (prompt('Nota de cierre (qué se hizo / costo):') || '') : null;
    try { await db.actualizarEventoVehiculo(ev.id, { estado, resueltoNota: nota }); await cargar(); }
    catch (e) { toast.error('Error: ' + (e?.message || e)); }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 overflow-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-zinc-700 rounded-card max-w-lg w-full p-5 space-y-3 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-red-500 font-bold">📋 Historial del vehículo</div>
            <div className="font-black">{vehiculo.marca} {vehiculo.modelo} · {vehiculo.placa || 'sin placa'}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {!agregando ? (
          <button onClick={() => setAgregando(true)} className="w-full bg-zinc-800 border border-zinc-700 hover:border-red-500 text-white text-xs font-black uppercase py-2.5 rounded-card">+ Registrar evento</button>
        ) : (
          <div className="bg-zinc-950 border border-zinc-700 rounded-card p-2.5 space-y-1.5">
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-sm">
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} placeholder="Descripción…" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-1.5">
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
              <input type="number" value={form.km} onChange={e => setForm({ ...form, km: e.target.value })} placeholder="Km" className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
              <input type="number" value={form.costoRd} onChange={e => setForm({ ...form, costoRd: e.target.value })} placeholder="Costo RD$" className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
              <input value={form.taller} onChange={e => setForm({ ...form, taller: e.target.value })} placeholder="Taller / proveedor" className="bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
            </div>
            <div className="flex gap-2">
              <button onClick={guardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase py-2 rounded-card">Guardar</button>
              <button onClick={() => setAgregando(false)} className="text-[11px] text-zinc-400 uppercase font-bold px-2">Cancelar</button>
            </div>
          </div>
        )}

        {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 text-red-500 animate-spin mx-auto" /></div> : (
          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
            {eventos.length === 0 && <div className="text-xs text-zinc-600 italic text-center py-3">Sin eventos registrados.</div>}
            {eventos.map(ev => {
              const [lbl, cls] = ESTADOS[ev.estado] || ESTADOS.abierto;
              return (
                <div key={ev.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold">{TIPOS[ev.tipo] || ev.tipo}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${cls}`}>{lbl}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{ev.descripcion}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">{ev.fecha}{ev.km ? ` · ${ev.km.toLocaleString()} km` : ''}{ev.costoRd ? ` · RD$ ${ev.costoRd.toLocaleString()}` : ''}{ev.taller ? ` · ${ev.taller}` : ''} · por {ev.reportadoPorNombre || '—'}{ev.resueltoNota ? ` · cierre: ${ev.resueltoNota}` : ''}</div>
                  {ev.estado !== 'resuelto' && (
                    <div className="flex gap-1.5 mt-1.5">
                      {ev.estado !== 'en_taller' && <button onClick={() => setEstado(ev, 'en_taller')} className="text-[10px] font-black uppercase px-2 py-1 rounded-card bg-amber-700/40 text-amber-300 hover:bg-amber-700/60">🔧 En taller</button>}
                      <button onClick={() => setEstado(ev, 'resuelto')} className="text-[10px] font-black uppercase px-2 py-1 rounded-card bg-green-700/40 text-green-300 hover:bg-green-700/60">✓ Resolver</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// v8.27.85: mapa GPS en vivo del vehículo (embebe el enlace "Compartir" de Pressto)
// con botón de refrescar y hora de última actualización.
function ModalGpsVehiculo({ vehiculo, onCerrar }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [actualizado, setActualizado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const url = vehiculo?.gpsUrl || '';
  const nombre = `${vehiculo.marca || ''} ${vehiculo.modelo || ''}`.trim() || vehiculo.placa || 'Vehículo';
  const horaTxt = actualizado
    ? actualizado.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const refrescar = () => { setCargando(true); setReloadKey((k) => k + 1); };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div className="min-w-0">
            <div className="text-sm font-black text-white flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-400" /> GPS en vivo · {nombre}</div>
            <div className="text-[11px] text-zinc-500">Actualizado: <span className="text-zinc-300 font-bold">{horaTxt}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refrescar} className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 py-1.5 rounded-card"><RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Refrescar</button>
            <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline text-xs font-bold"><ExternalLink className="w-3.5 h-3.5" /> Abrir en Pressto</a>
            <button onClick={onCerrar} className="text-zinc-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="relative flex-1 bg-zinc-950">
          {cargando && <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm gap-2 z-10 pointer-events-none"><Loader2 className="w-5 h-5 animate-spin" /> Cargando mapa…</div>}
          <iframe
            key={reloadKey}
            src={url}
            title={`GPS ${nombre}`}
            className="w-full h-full border-0"
            onLoad={() => { setCargando(false); setActualizado(new Date()); }}
          />
        </div>
        <div className="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-500">
          Si el mapa sale en blanco, Pressto no permite incrustarlo aquí — usa <b>“Abrir en Pressto”</b>. El mapa se actualiza solo mientras esté abierto; <b>Refrescar</b> lo recarga y actualiza la hora.
        </div>
      </div>
    </div>
  );
}


// v8.43.0: selector de UNIDAD GPS (Pressto) — trae la lista en vivo del API y
// amarra el vehículo a su rastreador para verlo moverse en los mapas del ERP.
function SelectorUnidadGPS({ value, onChange }) {
  const [unidades, setUnidades] = useState(null);
  useEffect(() => {
    fetch('/api/gps/posiciones').then(r => r.json()).then(d => setUnidades(d.dispositivos || [])).catch(() => setUnidades([]));
  }, []);
  return (
    <div className="mt-2">
      <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">🛰 Unidad GPS (posición en vivo)</div>
      {unidades === null ? (
        <div className="text-[11px] text-zinc-600">Cargando unidades del GPS…</div>
      ) : unidades.length === 0 ? (
        <div className="text-[11px] text-zinc-600">No se pudieron leer las unidades (revisa GPS_API_KEY).</div>
      ) : (
        <select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-emerald-600 outline-none px-3 py-3 text-white">
          <option value="">Sin unidad GPS</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.online === 'offline' ? 'sin señal' : `${u.velocidad} km/h`}</option>)}
        </select>
      )}
    </div>
  );
}
