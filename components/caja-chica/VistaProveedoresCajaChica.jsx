'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Search, Edit2, Save, X, Trash2, Sparkles, ChevronRight } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import { formatRD, formatNum, formatFechaCorta, formatRNC } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';
import ToggleDensidad, { useDensidad } from '../common/ToggleDensidad';
import ModalFacturasProveedor from './ModalFacturasProveedor';

const CATEGORIAS = ['ferreteria', 'combustible', 'comida', 'peaje', 'transporte', 'herramientas', 'otros'];

// Vista admin de proveedores conocidos por la caja chica.
// Funciona como memoria viva: cada vez que se aprueba un gasto_factura con RNC,
// se hace upsert aquí. El admin puede editar nombre canónico, categoría, notas.
// v8.17.73: desktop muestra tabla; click en una fila abre las facturas del
// proveedor (ModalFacturasProveedor). Mobile mantiene cards.
export default function VistaProveedoresCajaChica({ usuario, data, onVolver }) {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('ultimaFactura');
  const [editando, setEditando] = useState(null); // {id, nombre, categoria, notas}
  const [verFacturas, setVerFacturas] = useState(null); // proveedor seleccionado
  const [densidad, setDensidad, dx] = useDensidad('caja-chica-proveedores');

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
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar proveedor "${p.nombre}"? El histórico de facturas no se borra, pero la memoria de la AI se pierde.`)) return;
    try {
      await db.eliminarProveedorCajaChica(p.id);
      cargar();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  const abrirEditar = (p) => setEditando({ id: p.id, nombre: p.nombre, categoria: p.categoria || '', notas: p.notas || '' });

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-2">
            PROVEEDORES <Sparkles className="w-3 h-3 text-yellow-400" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Memoria de la IA</h1>
          <div className="text-sm text-zinc-500 mt-1">
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''} · {totalFacturas} factura{totalFacturas !== 1 ? 's' : ''} histórico · {formatRD(totalMonto)}
          </div>
        </div>
        <ToggleDensidad valor={densidad} onChange={setDensidad} />
      </div>

      <div className="bg-zinc-950 border border-zinc-800 p-2 text-[10px] text-zinc-500 flex items-start gap-2">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400" />
        <div>Cada vez que apruebas un gasto con RNC, este proveedor se guarda aquí. La próxima vez que la AI vea el mismo RNC, autocompleta con el nombre y categoría que tú definas. Edita el nombre canónico para fusionar variantes (ej: "FERRETERIA AMERICANA SRL" vs "Ferreteria Americana"). Toca un proveedor para ver sus facturas.</div>
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
      {filtrados.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-sm">
          {proveedores.length === 0
            ? 'Aún no hay proveedores. Se irán agregando automáticamente al aprobar facturas con RNC.'
            : 'Sin coincidencias para esa búsqueda.'}
        </div>
      ) : (
        <>
          {/* DESKTOP: tabla */}
          <div className="hidden md:block bg-zinc-900 border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 border-b border-zinc-800">
                <tr className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  <th className="px-3 py-2 text-left">Proveedor</th>
                  <th className="px-3 py-2 text-left">RNC</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  <th className="px-3 py-2 text-right">Facturas</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Última</th>
                  <th className="px-3 py-2 text-right w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => editando?.id === p.id ? (
                  <tr key={p.id} className="border-b border-zinc-800/50 bg-zinc-950/50">
                    <td colSpan={7} className="px-3 py-3">
                      <FormEdicion editando={editando} setEditando={setEditando} onGuardar={guardarEdicion} onCancelar={() => setEditando(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={p.id}
                    onClick={() => setVerFacturas(p)}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <div className="font-bold text-sm truncate max-w-[280px]" title={p.nombre}>{p.nombre}</div>
                      {p.notas && <div className="text-[10px] text-zinc-500 italic truncate max-w-[280px]" title={p.notas}>📝 {p.notas}</div>}
                    </td>
                    <td className="px-3 py-2 text-zinc-400 font-mono text-[11px] whitespace-nowrap">{formatRNC(p.rnc)}</td>
                    <td className="px-3 py-2">
                      {p.categoria ? (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-zinc-950 border border-zinc-700 text-zinc-300">{p.categoria}</span>
                      ) : <span className="text-zinc-600 text-[10px]">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300 font-bold">{p.totalFacturas}</td>
                    <td className="px-3 py-2 text-right text-orange-400 font-bold whitespace-nowrap">{formatRD(p.totalMonto)}</td>
                    <td className="px-3 py-2 text-zinc-500 text-[11px] whitespace-nowrap">
                      {p.ultimaFacturaAt ? formatFechaCorta(p.ultimaFacturaAt.split('T')[0]) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirEditar(p); }}
                        className="text-zinc-500 hover:text-yellow-400 p-1 inline-flex"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminar(p); }}
                        className="text-zinc-500 hover:text-red-400 p-1 inline-flex"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-zinc-600 inline ml-1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE: cards (densidad-aware, click abre facturas) */}
          <div className={`md:hidden ${dx.listGap}`}>
            {filtrados.map(p => (
              <div key={p.id} className={`bg-zinc-900 border border-zinc-800 ${dx.cardPad}`}>
                {editando?.id === p.id ? (
                  <FormEdicion editando={editando} setEditando={setEditando} onGuardar={guardarEdicion} onCancelar={() => setEditando(null)} />
                ) : (
                  <div
                    className="cursor-pointer"
                    onClick={() => setVerFacturas(p)}
                  >
                    {dx.compacto ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold truncate">{p.nombre}</span>
                            {p.categoria && <span className="text-[9px] uppercase tracking-wider px-1 bg-zinc-950 border border-zinc-700 text-zinc-300">{p.categoria}</span>}
                          </div>
                          <div className="text-[9px] text-zinc-500 truncate">
                            <span className="font-mono">{formatRNC(p.rnc)}</span> · {p.totalFacturas} fact · {formatRD(p.totalMonto)}
                            {p.ultimaFacturaAt && <> · últ {formatFechaCorta(p.ultimaFacturaAt.split('T')[0])}</>}
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); abrirEditar(p); }} className="text-zinc-500 hover:text-yellow-400 p-1 shrink-0" title="Editar"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); eliminar(p); }} className="text-zinc-500 hover:text-red-400 p-1 shrink-0" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
                        <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{p.nombre}</div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">RNC {formatRNC(p.rnc)}</div>
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
                            onClick={(e) => { e.stopPropagation(); abrirEditar(p); }}
                            className="text-zinc-500 hover:text-yellow-400 p-1"
                            title="Editar"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); eliminar(p); }}
                            className="text-zinc-500 hover:text-red-400 p-1"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <ChevronRight className="w-3 h-3 text-zinc-600 mt-1" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal de facturas del proveedor */}
      {verFacturas && (
        <ModalFacturasProveedor
          proveedor={verFacturas}
          usuario={usuario}
          data={data}
          onCerrar={() => setVerFacturas(null)}
          onCambio={cargar}
        />
      )}
    </div>
  );
}

// Sub-formulario reutilizable para editar nombre/categoría/notas de un proveedor.
// Lo usamos tanto en la fila de tabla (desktop) como en la card (mobile).
function FormEdicion({ editando, setEditando, onGuardar, onCancelar }) {
  return (
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
        <button onClick={onCancelar} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2">Cancelar</button>
        <button onClick={onGuardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase py-2 flex items-center justify-center gap-1">
          <Save className="w-3 h-3" /> Guardar
        </button>
      </div>
    </div>
  );
}
