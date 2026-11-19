'use client';

// v8.40.0 / v8.41.0: gestor de LUGARES FRECUENTES (puertos, almacenes) y
// SUPLIDORES con sus locaciones. v8.75: movido tal cual desde VistaRutas.

import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import * as db from '../../../lib/db';
import { parseCoords } from '../../../lib/helpers/geo';
import { expandirYExtraer } from '../../../lib/geoutils'; // v8.49.14: expandir links cortos de Maps

const TIPOS_LUGAR = { suplidor: '🏪 Suplidores', puerto: '⚓ Puertos', almacen_fiscal: '🏛 Almacenes fiscales', almacen: '🏭 Almacenes propios', otro: '📍 Otros' };

export default function ModalLugares({ lugares, suplidores = [], onCerrar, onCambio }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('puerto');
  const [ubic, setUbic] = useState('');
  const [guardando, setGuardando] = useState(false);
  const coords = parseCoords(ubic);
  // Suplidores
  const [supNombre, setSupNombre] = useState('');
  const [supRnc, setSupRnc] = useState('');
  const [supUbic, setSupUbic] = useState('');
  const [supGuardando, setSupGuardando] = useState(false);
  const [locDe, setLocDe] = useState(null);      // suplidor al que se agrega locación
  const [locNombre, setLocNombre] = useState('');
  const [locUbic, setLocUbic] = useState('');
  const [vinculando, setVinculando] = useState(null);

  const crearSup = async () => {
    if (!supNombre.trim()) { alert('Escribe el nombre del suplidor.'); return; }
    let c = parseCoords(supUbic);
    if (supUbic.trim() && !c) c = await expandirYExtraer(supUbic.trim()); // v8.49.14: link corto de Maps
    if (supUbic.trim() && !c) { alert('No entendí la ubicación — pega el link de Google Maps o "lat, lng".'); return; }
    setSupGuardando(true);
    try {
      const id = await db.crearSuplidor({ nombre: supNombre.trim(), rnc: supRnc.replace(/\D/g, '') || null });
      await db.crearLocacionSuplidor({ suplidorId: id, nombre: 'Principal', lat: c?.lat ?? null, lng: c?.lng ?? null });
      setSupNombre(''); setSupRnc(''); setSupUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setSupGuardando(false);
  };
  const agregarLoc = async (sup) => {
    if (!locNombre.trim()) { alert('Nombre de la locación (ej. "Suc. 27 de Febrero").'); return; }
    let c = parseCoords(locUbic);
    if (locUbic.trim() && !c) c = await expandirYExtraer(locUbic.trim()); // v8.49.14: link corto de Maps
    if (locUbic.trim() && !c) { alert('Ubicación no entendida — link de Maps o "lat, lng".'); return; }
    try {
      await db.crearLocacionSuplidor({ suplidorId: sup.id, nombre: locNombre.trim(), lat: c?.lat ?? null, lng: c?.lng ?? null });
      setLocDe(null); setLocNombre(''); setLocUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  // Vincular con Odoo: busca por RNC (si hay) o nombre, y alinea el nombre al de Odoo.
  const vincularOdoo = async (sup) => {
    setVinculando(sup.id);
    try {
      const res = await fetch(`/api/odoo/buscar-suplidores?q=${encodeURIComponent(sup.rnc || sup.nombre)}`);
      const d = await res.json();
      const m = (d.resultados || [])[0];
      if (!m) { alert(`No encontré "${sup.rnc || sup.nombre}" en Odoo. Créalo allá primero (con su RNC) o revisa el nombre.`); }
      else if (confirm(`Odoo: "${m.name}"${m.vat ? ` · RNC ${m.vat}` : ''}\n¿Vincular este suplidor? (el nombre del ERP se alinea al de Odoo)`)) {
        await db.actualizarSuplidor(sup.id, { nombre: m.name, rnc: (m.vat || '').replace(/\D/g, '') || sup.rnc, odooPartnerId: m.id });
        await onCambio();
      }
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setVinculando(null);
  };
  const crear = async () => {
    if (!nombre.trim()) { alert('Escribe el nombre del lugar.'); return; }
    let c = coords;
    if (ubic.trim() && !c) c = await expandirYExtraer(ubic.trim()); // v8.49.14: link corto de Maps
    if (ubic.trim() && !c) { alert('No entendí la ubicación. Pega el link de Google Maps o escribe "lat, lng".'); return; }
    setGuardando(true);
    try {
      await db.crearLugarLogistico({ tipo, nombre: nombre.trim(), lat: c?.lat ?? null, lng: c?.lng ?? null });
      setNombre(''); setUbic('');
      await onCambio();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };
  const eliminar = async (l) => {
    if (!confirm(`¿Quitar "${l.nombre}" de los lugares frecuentes?`)) return;
    try { await db.eliminarLugarLogistico(l.id); await onCambio(); } catch (e) { alert('Error: ' + (e?.message || e)); }
  };
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-zinc-900 border-2 border-cyan-700 rounded-card max-w-md w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest uppercase text-cyan-400 font-bold">📍 Lugares frecuentes</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Suplidores, puertos y almacenes con su ubicación — la parada se autollena y la ruta se carga de una vez.</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {/* ===== v8.41.0: SUPLIDORES (espejo de Odoo, con locaciones) ===== */}
        <div className="border border-orange-800/50 rounded-card p-2.5 space-y-2">
          <div className="text-[10px] tracking-widest uppercase text-orange-400 font-bold">🏪 Suplidores</div>
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <input value={supNombre} onChange={e => setSupNombre(e.target.value)} placeholder="Nombre del suplidor" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-0" />
              <input value={supRnc} onChange={e => setSupRnc(e.target.value)} placeholder="RNC (opcional)" className="w-28 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
            </div>
            <input value={supUbic} onChange={e => setSupUbic(e.target.value)} placeholder="Ubicación principal: link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
            <button onClick={crearSup} disabled={supGuardando || !supNombre.trim()} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-black text-[10px] font-black uppercase py-2 rounded-card">{supGuardando ? '…' : '+ Crear suplidor'}</button>
          </div>
          <div className="space-y-1">
            {suplidores.map(s => (
              <div key={s.id} className="bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{s.nombre} {s.odooPartnerId && <span className="text-[9px] font-black text-green-400 align-middle" title={`Vinculado a Odoo (#${s.odooPartnerId})`}>✓ Odoo</span>}</div>
                    <div className="text-[10px] text-zinc-600">{s.rnc ? `RNC ${s.rnc} · ` : ''}{s.locaciones.length} locación{s.locaciones.length !== 1 ? 'es' : ''}</div>
                  </div>
                  {!s.odooPartnerId && <button onClick={() => vincularOdoo(s)} disabled={vinculando === s.id} className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-card border border-zinc-700 text-zinc-400 hover:border-green-600 hover:text-green-400">{vinculando === s.id ? '…' : '🔗 Odoo'}</button>}
                  <button onClick={() => { setLocDe(locDe === s.id ? null : s.id); setLocNombre(''); setLocUbic(''); }} className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-card border border-zinc-700 text-zinc-400 hover:border-orange-500">+ Locación</button>
                </div>
                <div className="mt-1 space-y-0.5">
                  {s.locaciones.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[10px] text-zinc-500 pl-1">
                      <span className="min-w-0 flex-1 truncate">📍 {l.nombre}{l.lat != null ? ` · ${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : ' · sin coordenadas'}</span>
                      {s.locaciones.length > 1 && <button onClick={async () => { if (confirm(`¿Quitar la locación "${l.nombre}"?`)) { await db.eliminarLocacionSuplidor(l.id); await onCambio(); } }} className="text-zinc-700 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
                    </div>
                  ))}
                </div>
                {locDe === s.id && (
                  <div className="mt-1.5 space-y-1">
                    <input value={locNombre} onChange={e => setLocNombre(e.target.value)} placeholder='Nombre (ej. "Suc. 27 de Febrero")' className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
                    <input value={locUbic} onChange={e => setLocUbic(e.target.value)} placeholder="Link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1.5 text-xs" />
                    <button onClick={() => agregarLoc(s)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase py-1.5 rounded-card">Guardar locación</button>
                  </div>
                )}
              </div>
            ))}
            {suplidores.length === 0 && <div className="text-[10px] text-zinc-600 italic">Sin suplidores todavía — créalos aquí y vincúlalos a Odoo.</div>}
          </div>
        </div>

        {/* ===== Puertos y almacenes ===== */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5 space-y-1.5">
          <div className="flex gap-1.5">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-card px-1.5 py-2 text-xs">
              <option value="puerto">⚓ Puerto</option>
              <option value="almacen_fiscal">🏛 Almacén fiscal</option>
              <option value="almacen">🏭 Almacén propio</option>
              <option value="otro">📍 Otro</option>
            </select>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej. Ferretería Ochoa)" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-0" />
          </div>
          <input value={ubic} onChange={e => setUbic(e.target.value)} placeholder="Pega el link de Google Maps o lat, lng" className="w-full bg-zinc-900 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
          {ubic.trim() && (coords
            ? <div className="text-[10px] text-green-400">📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} ✓</div>
            : <div className="text-[10px] text-amber-400">Aún no leo coordenadas — el link debe traer @lat,lng (ábrelo en el navegador y copia la URL completa).</div>)}
          <button onClick={crear} disabled={guardando || !nombre.trim()} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-[10px] font-black uppercase py-2 rounded-card">
            {guardando ? '…' : '+ Guardar lugar'}
          </button>
        </div>
        <div className="space-y-1">
          {lugares.length === 0 && <div className="text-[11px] text-zinc-600 italic">Sin lugares todavía.</div>}
          {Object.entries(TIPOS_LUGAR).map(([t, label]) => {
            const del = lugares.filter(l => l.tipo === t);
            if (!del.length) return null;
            return (
              <div key={t}>
                <div className="text-[10px] tracking-widest uppercase text-zinc-600 font-bold mt-2 mb-1">{label}</div>
                {del.map(l => (
                  <div key={l.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-card px-2.5 py-1.5 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{l.nombre}</div>
                      <div className="text-[10px] text-zinc-600">{l.lat != null ? `📍 ${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : 'sin ubicación'}</div>
                    </div>
                    <button onClick={() => eliminar(l)} className="text-zinc-600 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
