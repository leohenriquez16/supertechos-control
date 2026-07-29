'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Loader2, Save, Trash2, X, Edit2, Eye, EyeOff, Tag, Settings } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Paleta sugerida para categorías nuevas (mismas que las default)
const COLORES = [
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#eab308', label: 'Amarillo' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#a855f7', label: 'Morado' },
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#71717a', label: 'Gris' },
];

const FORM_VACIO = { nombre: '', color: '#3b82f6', icono: '', descripcion: '', orden: 50, aplicaA: '', odooProducto: '', odooCuenta: '', odooImpuesto: '' };

export default function VistaCategoriasCajaChica({ onVolver, onCambio, usuario }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // 'new' | id
  const [form, setForm] = useState(FORM_VACIO);

  // v8.17.29: config global de montos de dieta + hospedaje
  const [configDieta, setConfigDieta] = useState({ desayunoRd: 200, comidaRd: 350, cenaRd: 350, hotelRd: 900 });
  const [editandoDieta, setEditandoDieta] = useState(false);
  const [formDieta, setFormDieta] = useState(configDieta);
  const [guardandoDieta, setGuardandoDieta] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setCategorias(await db.listarCategoriasCajaChica());
      const cd = await db.obtenerConfigDieta();
      setConfigDieta(cd);
      setFormDieta(cd);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const guardarDieta = async () => {
    setGuardandoDieta(true);
    try {
      const cd = await db.actualizarConfigDieta({
        desayunoRd: parseFloat(formDieta.desayunoRd) || 0,
        comidaRd: parseFloat(formDieta.comidaRd) || 0,
        cenaRd: parseFloat(formDieta.cenaRd) || 0,
        hotelRd: parseFloat(formDieta.hotelRd) || 0,
        updatedPorId: usuario?.id || null,
      });
      setConfigDieta(cd);
      setFormDieta(cd);
      setEditandoDieta(false);
      toast.success('Montos de dieta actualizados');
      if (onCambio) onCambio();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
    setGuardandoDieta(false);
  };

  const empezarNueva = () => { setEditando('new'); setForm(FORM_VACIO); };
  const empezarEditar = (c) => {
    setEditando(c.id);
    setForm({ nombre: c.nombre, color: c.color, icono: c.icono || '', descripcion: c.descripcion || '', orden: c.orden, aplicaA: c.aplicaA || '', odooProducto: c.odooProducto || '', odooCuenta: c.odooCuenta || '', odooImpuesto: c.odooImpuesto || '' });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.warning('El nombre es obligatorio'); return; }
    try {
      if (editando === 'new') {
        await db.crearCategoriaCajaChica({
          nombre: form.nombre.trim(),
          color: form.color,
          icono: form.icono?.trim() || null,
          descripcion: form.descripcion?.trim() || null,
          orden: parseInt(form.orden) || 50,
          aplicaA: form.aplicaA || null, // v8.17.29
          odooProducto: form.odooProducto?.trim() || null, // v8.27.48
          odooCuenta: form.odooCuenta?.trim() || null,
          odooImpuesto: form.odooImpuesto?.trim() || null,
        });
      } else {
        await db.actualizarCategoriaCajaChica(editando, {
          nombre: form.nombre.trim(),
          color: form.color,
          icono: form.icono?.trim() || null,
          descripcion: form.descripcion?.trim() || null,
          orden: parseInt(form.orden) || 50,
          aplicaA: form.aplicaA || null, // v8.17.29
          odooProducto: form.odooProducto?.trim() || null, // v8.27.48
          odooCuenta: form.odooCuenta?.trim() || null,
          odooImpuesto: form.odooImpuesto?.trim() || null,
        });
      }
      setEditando(null);
      setForm(FORM_VACIO);
      cargar();
      if (onCambio) onCambio();
    } catch (e) {
      toast.error('Error: ' + (e.message || e));
    }
  };

  const toggleActiva = async (c) => {
    try {
      await db.actualizarCategoriaCajaChica(c.id, { activa: !c.activa });
      cargar();
      if (onCambio) onCambio();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  const eliminar = async (c) => {
    if (c.isDefault) { toast.warning('Las categorías por defecto solo se pueden desactivar, no eliminar.'); return; }
    if (!confirm(`¿Eliminar categoría "${c.nombre}"? Los gastos viejos con esta categoría seguirán existiendo pero perderán el etiquetado.`)) return;
    try {
      await db.eliminarCategoriaCajaChica(c.id);
      cargar();
      if (onCambio) onCambio();
    } catch (e) { toast.error('Error: ' + (e.message || e)); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest uppercase text-red-500 font-bold flex items-center gap-2">
            CATEGORÍAS <Tag className="w-3 h-3" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Caja Chica</h1>
          <div className="text-sm text-zinc-500 mt-1">
            {categorias.length} categoría{categorias.length !== 1 ? 's' : ''} · {categorias.filter(c => c.activa).length} activa{categorias.filter(c => c.activa).length !== 1 ? 's' : ''}
          </div>
        </div>
        {!editando && (
          <button onClick={empezarNueva} className="bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase px-4 py-2 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Nueva categoría
          </button>
        )}
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-[10px] text-zinc-500">
        💡 Las categorías se usan para clasificar gastos. La AI las usa al interpretar facturas — entre más descriptiva la "Descripción", mejor decide. Las categorías por defecto se pueden editar/desactivar pero no eliminar.
      </div>

      {/* v8.17.29: Config global de montos de dieta + hospedaje */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs tracking-widest uppercase text-orange-400 font-bold flex items-center gap-2">
              <Settings className="w-3 h-3" /> Montos de dieta + hospedaje
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Lo que la empresa paga por día a maestros/supervisores en proyectos del interior</div>
          </div>
          {!editandoDieta && (
            <button onClick={() => { setFormDieta(configDieta); setEditandoDieta(true); }} className="text-[10px] uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 font-bold flex items-center gap-1">
              <Edit2 className="w-3 h-3" /> Editar
            </button>
          )}
        </div>
        {!editandoDieta ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-center">
              <div className="text-[10px] uppercase text-zinc-500">Desayuno</div>
              <div className="font-black text-orange-300">RD$ {configDieta.desayunoRd.toLocaleString()}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-center">
              <div className="text-[10px] uppercase text-zinc-500">Comida</div>
              <div className="font-black text-orange-300">RD$ {configDieta.comidaRd.toLocaleString()}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-center">
              <div className="text-[10px] uppercase text-zinc-500">Cena</div>
              <div className="font-black text-orange-300">RD$ {configDieta.cenaRd.toLocaleString()}</div>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-center">
              <div className="text-[10px] uppercase text-zinc-500">Hotel</div>
              <div className="font-black text-purple-300">RD$ {configDieta.hotelRd.toLocaleString()}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { key: 'desayunoRd', label: 'Desayuno', color: 'orange' },
                { key: 'comidaRd', label: 'Comida', color: 'orange' },
                { key: 'cenaRd', label: 'Cena', color: 'orange' },
                { key: 'hotelRd', label: 'Hotel', color: 'purple' },
              ].map(({ key, label }) => (
                <div key={key} className="bg-zinc-950 border border-zinc-800 rounded-card p-2">
                  <div className="text-[10px] uppercase text-zinc-500">{label}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-zinc-500">RD$</span>
                    <input
                      type="number"
                      value={formDieta[key]}
                      onChange={e => setFormDieta({ ...formDieta, [key]: e.target.value })}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-card px-1.5 py-1 text-white text-xs text-right font-bold"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-zinc-800">
              <button onClick={() => { setEditandoDieta(false); setFormDieta(configDieta); }} className="px-3 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase py-2">Cancelar</button>
              <button onClick={guardarDieta} disabled={guardandoDieta} className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-800 text-white text-[10px] font-black uppercase py-2 flex items-center justify-center gap-1">
                {guardandoDieta ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3" /> Guardar montos</>}
              </button>
            </div>
            <div className="text-[10px] text-zinc-500">
              Estos montos se descuentan del presupuesto cuando el maestro marca "consumí desayuno/comida/cena/hotel" al cerrar jornada. También definen el techo de las facturas de comida/hospedaje que se cargan a estas partidas.
            </div>
          </div>
        )}
      </div>

      {editando && (
        <div className="bg-zinc-900 border-2 border-red-600 p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-xs tracking-widest uppercase font-bold text-red-500">{editando === 'new' ? 'Nueva categoría' : 'Editar categoría'}</div>
            <button onClick={() => { setEditando(null); setForm(FORM_VACIO); }} className="text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej: Materiales eléctricos" /></Campo>
            <Campo label="Icono (emoji opcional)"><Input value={form.icono} onChange={v => setForm({ ...form, icono: v })} placeholder="⚡" /></Campo>
          </div>
          <Campo label="Descripción (ayuda a la AI a decidir)">
            <textarea
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              placeholder="Ej: Cables, breakers, tomacorrientes, herramientas eléctricas"
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
            />
          </Campo>
          <div className="space-y-1">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Color</div>
            <div className="flex flex-wrap gap-1">
              {COLORES.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.hex })}
                  className={`w-8 h-8 border-2 ${form.color === c.hex ? 'border-white' : 'border-zinc-800'}`}
                  style={{ background: c.hex }}
                  title={c.label}
                />
              ))}
              <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-8 h-8 bg-transparent" title="Personalizado" />
            </div>
          </div>
          <Campo label="Orden (más bajo aparece primero)">
            <Input type="number" value={form.orden} onChange={v => setForm({ ...form, orden: v })} />
          </Campo>
          {/* v8.17.29: aplica_a — vincula la categoría al presupuesto de dieta u hospedaje */}
          <div className="space-y-1">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Cuenta a presupuesto de…</div>
            <select
              value={form.aplicaA || ''}
              onChange={e => setForm({ ...form, aplicaA: e.target.value })}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-2 text-white text-xs"
            >
              <option value="">— Ninguna (gasto normal reembolsable) —</option>
              <option value="dieta">🍽 Dieta (desayuno/comida/cena)</option>
              <option value="hospedaje">🛏 Hospedaje (hotel)</option>
            </select>
            <div className="text-[10px] text-zinc-500">
              Si seleccionas una partida, los gastos en esta categoría <b>no se reembolsan</b>: consumen el presupuesto fijo de dieta u hospedaje del maestro.
            </div>
          </div>
          {/* v8.27.48: mapeo a Odoo — el CSV de facturas usa estos valores exactos automático */}
          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Mapeo a Odoo (facturas)</div>
            <div className="text-[10px] text-zinc-500 -mt-1">Nombres <b>exactos</b> de Odoo para esta categoría. El CSV los usa solo. Déjalos vacíos y el CSV usa el concepto de la IA.</div>
            <Campo label="Producto en Odoo (nombre exacto)"><Input value={form.odooProducto} onChange={v => setForm({ ...form, odooProducto: v })} placeholder="Ej. Materiales Varios, Gasoil, Gas" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Cuenta contable (opcional)"><Input value={form.odooCuenta} onChange={v => setForm({ ...form, odooCuenta: v })} placeholder="Ej. 52000002 Combustible" /></Campo>
              <Campo label="Impuesto ITBIS (opcional)"><Input value={form.odooImpuesto} onChange={v => setForm({ ...form, odooImpuesto: v })} placeholder="Ej. 18% ITBIS Compras" /></Campo>
            </div>
            <div className="text-[10px] text-zinc-500">💡 Si pones el producto, Odoo suele traer su cuenta e ITBIS solo — cuenta/impuesto son solo si quieres forzarlos.</div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <button onClick={() => { setEditando(null); setForm(FORM_VACIO); }} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-2.5">Cancelar</button>
            <button onClick={guardar} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1">
              <Save className="w-3 h-3" /> Guardar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {categorias.map(c => (
          <div key={c.id} className={`bg-zinc-900 border ${c.activa ? 'border-zinc-800' : 'border-zinc-900 opacity-50'} p-3 flex items-center gap-3`}>
            <div className="w-10 h-10 shrink-0 flex items-center justify-center" style={{ background: c.color }}>
              <span className="text-base">{c.icono || '📦'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">{c.nombre}</span>
                {c.isDefault && <span className="text-[9px] uppercase tracking-wider px-1 bg-zinc-800 border border-zinc-700 text-zinc-400">Default</span>}
                {!c.activa && <span className="text-[9px] uppercase tracking-wider px-1 bg-red-900/40 text-red-300 border border-red-800 rounded-full">Inactiva</span>}
                {c.aplicaA === 'dieta' && <span className="text-[9px] uppercase tracking-wider px-1 bg-orange-900/40 text-orange-300 border border-orange-800" title="Consume presupuesto de dieta">🍽 Dieta</span>}
                {c.aplicaA === 'hospedaje' && <span className="text-[9px] uppercase tracking-wider px-1 bg-purple-900/40 text-purple-300 border border-purple-800" title="Consume presupuesto de hospedaje">🛏 Hospedaje</span>}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">{c.id}</div>
              {c.descripcion && <div className="text-[10px] text-zinc-400 mt-0.5">{c.descripcion}</div>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => toggleActiva(c)} className="text-zinc-500 hover:text-yellow-400 p-1" title={c.activa ? 'Desactivar' : 'Activar'}>
                {c.activa ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button onClick={() => empezarEditar(c)} className="text-zinc-500 hover:text-red-400 p-1" title="Editar"><Edit2 className="w-3 h-3" /></button>
              {!c.isDefault && (
                <button onClick={() => eliminar(c)} className="text-zinc-500 hover:text-red-400 p-1" title="Eliminar"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
