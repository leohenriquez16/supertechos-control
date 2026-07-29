'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Loader2, Edit2, Trash2, Copy, Check, FileText, Upload, X, AlertTriangle, Eye } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { comprimirImagenABlob } from '../../lib/imports';
import Campo from '../common/Campo';
import Input from '../common/Input';

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

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setVehiculos(await db.listarVehiculos({})); } finally { setCargando(false); }
    onRecargar?.();
  }, [onRecargar]);
  useEffect(() => { cargar(); }, []); // eslint-disable-line

  const verDoc = async (path) => {
    if (!path) return;
    try { const url = await db.obtenerUrlDocVehiculo(path, 3600); if (url) window.open(url, '_blank'); }
    catch { toast.error('No se pudo abrir el documento.'); }
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
        <button onClick={() => setModal('nuevo')} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2.5 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Nuevo vehículo
        </button>
      </div>

      {cargando ? (
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
                    <div className="text-[11px] text-zinc-500">{v.color || 'sin color'}{v.empresa ? ` · ${v.empresa === 'super_techos' ? 'Super Techos' : 'Prouco'}` : ''}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
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
                  {v.matriculaPath
                    ? <button onClick={() => verDoc(v.matriculaPath)} className="text-[11px] flex items-center gap-1 text-blue-400 hover:underline"><FileText className="w-3 h-3" /> Matrícula</button>
                    : <span className="text-[11px] text-zinc-600">sin matrícula</span>}
                  {v.seguroPath
                    ? <button onClick={() => verDoc(v.seguroPath)} className="text-[11px] flex items-center gap-1 text-blue-400 hover:underline"><FileText className="w-3 h-3" /> Seguro</button>
                    : <span className="text-[11px] text-zinc-600">sin seguro</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ModalVehiculo
          usuario={usuario}
          vehiculo={modal === 'nuevo' ? null : modal}
          onCerrar={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar(); }}
        />
      )}
    </div>
  );
}

function ModalVehiculo({ usuario, vehiculo, onCerrar, onGuardado }) {
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
  });

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
