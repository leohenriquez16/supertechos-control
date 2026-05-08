'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Search, Edit2, Save, X, Trash2, Sparkles } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatNum, formatFechaCorta } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';

const CATEGORIAS = ['ferreteria', 'combustible', 'comida', 'peaje', 'transporte', 'herramientas', 'otros'];

// Vista admin de proveedores conocidos por la caja chica.
// Funciona como memoria viva: cada vez que se aprueba un gasto_factura con RNC,
// se hace upsert aquí. El admin puede editar nombre canónico, categoría, notas.
export default function VistaProveedoresCajaChica({ usuario, data, onVolver }) {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('ultimaFactura');
  const [editando, setEditando] = useState(null); // {id, nombre, categoria, notas}

  const cargar = async () => {
    setLoading(true);
    try { setProveedores(await db.listarProveedoresCajaChica({ orden })); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [orden]);

  const filtrados = useMemo(() => {
    if (!busqueda) return proveedores;
    const q = busqueda.toLowerCase();
    return proveedores.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.rnc || '').includes(q) ||
      (p.categoria || '').toLowerCase().includes(q)
    );
  }, [proveedores, busqueda]);

  const totalFacturas = proveedores.reduce((s, p) => s + p.totalFacturas, 0);
  const totalMonto = proveedores.reduce((s, p) => s + p.totalMonto, 0);

  const guardarEdicion = async () => {
    if (!editando) return;
    try {
      await db.actualizarProveedorCajaChica(editando.id, {
        nombre: editando.nombre,
        categoria: editando.categoria || null,
        notas: editando.notas || null,
      });
      setEditando(null);
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar proveedor "${p.nombre}"? El histórico de facturas no se borra, pero la memoria de la AI se pierde.`)) return;
    try {
      await db.eliminarProveedorCajaChica(p.id);
      cargar();
    } catch (e) { alert('Error: ' + (e.message || e)); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div>
        <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-2">
          PROVEEDORES <Sparkles className="w-3 h-3 text-yellow-400" />
        </div>
        <h1 className="text-3xl font-black tracking-tight">Memoria de la IA</h1>
        <div className="text-sm text-zinc-500 mt-1">
          {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''} · {totalFacturas} factura{totalFacturas !== 1 ? 's' : ''} histórico · {formatRD(totalMonto)}
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] text-zinc-500 flex items-start gap-2">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
        <div>Cada vez que apruebas un gasto con RNC, este proveedor se guarda aquí. La próxima vez que la AI vea el mismo RNC, autocompleta con el nombre y categoría que tú definas. Edita el nombre canónico para fusionar variantes (ej: "FERRETERIA AMERICANA SRL" vs "Ferreteria Americana").</div>
      </div>

      {/* Búsqueda + orden */}
      <div className="bg-zinc-900 border border-zinc-800 p-2 flex flex-wrap gap-2 items-center">
        <Search className="w-3 h-3 text-zinc-500 ml-1" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, RNC o categoría..."
          className="flex-1 min-w-[200px] bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white"
        />
        <select value={orden} onChange={e => setOrden(e.target.value)} className="bg-zinc-950 border border-zinc-800 px-2 py-1 text-xs text-white">
          <option value="ultimaFactura">Última factura</option>
          <option value="totalMonto">Mayor monto</option>
          <option value="nombre">A-Z</option>
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-sm">
            {proveedores.length === 0
              ? 'Aún no hay proveedores. Se irán agregando automáticamente al aprobar facturas con RNC.'
              : 'Sin coincidencias para esa búsqueda.'}
          </div>
        ) : (
          filtrados.map(p => (
            <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-3">
              {editando?.id === p.id ? (
                <div className="space-y-2">
                  <Campo label="Nombre canónico"><Input value={editando.nombre} onChange={v => setEditando({ ...editando, nombre: v })} /></Campo>
                  <Campo label="Categoría">
                    <select
                      value={editando.categoria || ''}
                      onChange={e => setEditando({ ...editando, categoria: e.target.value })}
                      className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-sm"
                    >
                      <option value="">— sin categoría —</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Notas internas (opcional)">
                    <textarea
                      value={editando.notas || ''}
                      onChange={e => setEditando({ ...editando, notas: e.target.value })}
                      rows={2}
                      placeholder="Ej: Suele cobrar el doble los sábados"
                      className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
                    />
                  </Campo>
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(null)} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2">Cancelar</button>
                    <button onClick={guardarEdicion} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase py-2 flex items-center justify-center gap-1">
                      <Save className="w-3 h-3" /> Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{p.nombre}</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">RNC {p.rnc}</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {p.categoria && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-zinc-950 border border-zinc-700 text-zinc-300">{p.categoria}</span>
                      )}
                      <span className="text-[10px] text-zinc-500">
                        {p.totalFacturas} factura{p.totalFacturas !== 1 ? 's' : ''} · {formatRD(p.totalMonto)}
                      </span>
                    </div>
                    {p.notas && (
                      <div className="text-[10px] text-zinc-400 mt-1 italic">📝 {p.notas}</div>
                    )}
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {p.primeraFacturaAt && `desde ${formatFechaCorta(p.primeraFacturaAt.split('T')[0])} · `}
                      {p.ultimaFacturaAt && `última ${formatFechaCorta(p.ultimaFacturaAt.split('T')[0])}`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => setEditando({ id: p.id, nombre: p.nombre, categoria: p.categoria || '', notas: p.notas || '' })}
                      className="text-zinc-500 hover:text-red-400 p-1"
                      title="Editar"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => eliminar(p)}
                      className="text-zinc-500 hover:text-red-400 p-1"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
