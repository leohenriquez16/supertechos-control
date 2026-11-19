'use client';

// v8.80.0: "SALIÓ" — el material salió del almacén. Se registra QUIÉN lo lleva (cualquier
// persona: chofer, supervisor, maestro), con foto opcional de la carga. Sirve con ruta o sin
// ruta (el supervisor que se lo lleva en su vehículo). Lo marcan el almacén o la oficina.
import React, { useMemo, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagenABlob } from '../../lib/imports';
import { personasConductor } from '../../lib/helpers/salidasAlmacen';

export default function ModalSalio({ pedido, etiqueta, usuario, data, onCerrar, onListo }) {
  const personas = useMemo(() => personasConductor(data.personal || [], data.vehiculos || []), [data.personal, data.vehiculos]);
  const [quien, setQuien] = useState('');
  const [foto, setFoto] = useState(null); // { blob, url }
  const [guardando, setGuardando] = useState(false);
  const grupos = [...new Set(personas.map(p => p.grupo))];

  const elegirFoto = async (f) => {
    if (!f) return;
    try { const blob = await comprimirImagenABlob(f, 1600, 0.75); setFoto({ blob, url: URL.createObjectURL(blob) }); }
    catch (e) { alert('No se pudo usar la foto: ' + (e?.message || e)); }
  };
  const guardar = async () => {
    const p = personas.find(x => x.id === quien);
    if (!p) { alert('Elige quién lo lleva.'); return; }
    setGuardando(true);
    try {
      const ok = await db.registrarSalidaRequisicion(pedido.id, {
        llevadoPorId: p.id, llevadoPorNombre: p.nombre, porId: usuario?.id || null, porNombre: usuario?.nombre || null,
        origen: (usuario?.roles || []).includes('almacen') ? 'almacen' : 'oficina', estadosDesde: ['lista', 'en_ruta'],
      });
      if (!ok) alert('Este pedido ya tenía la salida registrada (o cambió de estado). Se recarga la lista.');
      // la foto se sube DESPUÉS de registrar (si no se registró, no queda una foto suelta)
      if (ok && foto?.blob) {
        try { await db.actualizarFotoSalida(pedido.id, await db.subirFotoSalida(foto.blob, pedido.id)); }
        catch (e) { alert('La salida quedó registrada, pero la foto no se pudo subir: ' + (e?.message || e)); }
      }
      await onListo?.();
      onCerrar();
    } catch (e) { alert('No se pudo registrar la salida: ' + (e?.message || e)); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => { if (!guardando && !quien && !foto) onCerrar(); }}>
      <div className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-card sm:rounded-card p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] tracking-widest uppercase text-emerald-400 font-bold">🚚 Salió del almacén</div>
            <div className="text-lg font-black leading-tight">{pedido.codigo || 'Pedido'}</div>
            <div className="text-xs text-zinc-400 truncate">{etiqueta}</div>
          </div>
          <button onClick={() => { if (!guardando) onCerrar(); }} className="text-zinc-500 hover:text-white shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <label className="block">
          <span className="text-[11px] font-bold text-zinc-400 uppercase">¿Quién lo lleva?</span>
          <select value={quien} onChange={e => setQuien(e.target.value)} autoFocus
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-card px-2.5 py-2.5 text-sm">
            <option value="">Elige la persona…</option>
            {grupos.map(g => (
              <optgroup key={g} label={g}>{personas.filter(p => p.grupo === g).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>
            ))}
          </select>
        </label>

        <div>
          <span className="text-[11px] font-bold text-zinc-400 uppercase">Foto de la carga (opcional)</span>
          {foto ? (
            <div className="mt-1 flex items-center gap-2">
              <img src={foto.url} alt="Carga" className="w-20 h-20 object-cover rounded-card border border-zinc-700" />
              <button onClick={() => setFoto(null)} className="text-[11px] font-bold text-zinc-400 hover:text-white">Quitar</button>
            </div>
          ) : (
            <label className="mt-1 flex items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-card py-3 text-sm text-zinc-400 cursor-pointer hover:border-zinc-500">
              <Camera className="w-4 h-4" /> Tomar o elegir foto
              <input type="file" accept="image/*" className="hidden" onChange={e => elegirFoto(e.target.files?.[0])} />
            </label>
          )}
        </div>

        <button onClick={guardar} disabled={!quien || guardando}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-black uppercase py-3 rounded-card flex items-center justify-center gap-2">
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Registrar salida
        </button>
        <div className="text-[10px] text-zinc-500">El pedido pasa a «En ruta». Si va en una ruta, el chofer lo marca entregado al llegar; si no, la oficina o el almacén lo marcan entregado.</div>
      </div>
    </div>
  );
}
