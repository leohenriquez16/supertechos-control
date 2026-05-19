'use client';

// v8.17.56: Modal admin para crear un gasto/ajuste manualmente.
// Útil cuando llega una factura a oficina, o cuando el personal no tiene acceso
// al app y el admin quiere registrarla. No usa AI — todos los campos a mano.
// El gasto queda como pendiente_revision; el admin lo aprueba después por flujo normal.

import React, { useState, useMemo } from 'react';
import { X, Loader2, Save, Plus, Camera, AlertCircle, FileText, User as UserIcon, Calendar, DollarSign } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatRNC, limpiarRNC } from '../../lib/helpers/formato';
import { EMPRESAS_RECEPTORAS } from '../../lib/constants';
import ProyectoSelector from '../common/ProyectoSelector';

export default function ModalCrearGastoAdmin({ usuario, data, onCerrar, onCreado, movimientos = [] }) {
  const personalConCaja = (data.personal || []).filter(p => p.cajaChicaHabilitada && p.activo !== false);
  const proyectosActivos = (data.proyectos || []).filter(p => !p.archivado);
  const categoriasActivas = (data.categoriasCajaChica || []).filter(c => c.activa);

  // Orden de proyectos por último uso (mismo criterio del modal de detalle)
  const proyectosOrdenados = useMemo(() => {
    const ultimoUso = {};
    (movimientos || []).forEach(m => {
      if (m.tipo !== 'gasto_factura' || !m.proyectoId) return;
      if (!ultimoUso[m.proyectoId] || m.fecha > ultimoUso[m.proyectoId]) {
        ultimoUso[m.proyectoId] = m.fecha;
      }
    });
    return proyectosActivos.slice().sort((a, b) => {
      const ua = ultimoUso[a.id] || '';
      const ub = ultimoUso[b.id] || '';
      if (ua && ub) return ub.localeCompare(ua);
      if (ua && !ub) return -1;
      if (!ua && ub) return 1;
      return (a.cliente || '').localeCompare(b.cliente || '');
    });
  }, [proyectosActivos, movimientos]);

  const hoy = new Date().toISOString().split('T')[0];
  const [campos, setCampos] = useState({
    personaId: '',
    tipo: 'gasto_factura',
    fecha: hoy,
    monto: '',
    proveedor: '',
    rnc: '',
    ncf: '',
    categoria: '',
    concepto: '',
    proyectoId: '',
    empresaReceptora: '',
    sinFactura: false,
  });
  const [foto, setFoto] = useState(null); // { dataUrl, name }
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setCampos(prev => ({ ...prev, [k]: v }));

  const onFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto({ dataUrl: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };

  const validar = () => {
    if (!campos.personaId) return 'Selecciona la persona titular de la caja.';
    if (!campos.fecha) return 'Falta la fecha.';
    const monto = Number(campos.monto);
    if (!Number.isFinite(monto) || monto <= 0) return 'Monto debe ser mayor a 0.';
    if (campos.tipo === 'gasto_factura' && !campos.sinFactura) {
      const rnc = limpiarRNC(campos.rnc);
      if (!rnc) return 'RNC del proveedor es requerido para facturas con CF.';
    }
    return null;
  };

  const guardar = async () => {
    const errVal = validar();
    if (errVal) { setError(errVal); return; }
    setGuardando(true); setError('');
    try {
      const rncLimpio = limpiarRNC(campos.rnc);
      await db.crearMovimientoCajaChica({
        personaId: campos.personaId,
        tipo: campos.tipo,
        fecha: campos.fecha,
        monto: Number(campos.monto),
        proveedor: campos.proveedor || null,
        rnc: rncLimpio ? formatRNC(rncLimpio) : null,
        concepto: campos.concepto || null,
        proyectoId: campos.proyectoId || null,
        empresaReceptora: campos.empresaReceptora || null,
        datosIA: {
          ncf: campos.ncf || null,
          categoria_sugerida: campos.categoria || null,
          sin_factura: !!campos.sinFactura,
          // Marcamos creación manual por admin para distinguir de la AI
          creado_manual_admin: true,
        },
        fotoDataUrl: foto?.dataUrl || null,
        status: 'pendiente_revision',
        creadoPorId: usuario.id,
      });
      onCreado?.();
      onCerrar();
    } catch (e) {
      setError(e.message || 'Error guardando');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onCerrar}>
      <div
        className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 flex-shrink-0 bg-zinc-900">
          <div className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-red-500" /> Nuevo gasto manual
          </div>
          <button
            onClick={onCerrar}
            className="bg-zinc-800 hover:bg-red-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Persona + Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Persona titular *" icon={<UserIcon className="w-3 h-3" />}>
              <select
                value={campos.personaId}
                onChange={e => set('personaId', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              >
                <option value="">— Seleccionar —</option>
                {personalConCaja.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo *" icon={<FileText className="w-3 h-3" />}>
              <select
                value={campos.tipo}
                onChange={e => set('tipo', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              >
                <option value="gasto_factura">Gasto con factura</option>
                <option value="ajuste">Ajuste manual</option>
              </select>
            </Field>
          </div>

          {/* Fecha + Monto */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fecha *" icon={<Calendar className="w-3 h-3" />}>
              <input
                type="date"
                value={campos.fecha}
                onChange={e => set('fecha', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
              />
            </Field>
            <Field label="Monto RD$ *" icon={<DollarSign className="w-3 h-3" />}>
              <input
                type="number"
                step="0.01"
                value={campos.monto}
                onChange={e => set('monto', e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-base font-bold text-right text-orange-400"
              />
              {Number(campos.monto) > 0 && (
                <div className="text-[10px] text-zinc-500 mt-0.5 text-right font-mono">{formatRD(campos.monto)}</div>
              )}
            </Field>
          </div>

          {/* v8.17.80: Empresa receptora disponible para cualquier tipo, no solo
              gasto_factura. Para ajustes manuales el admin igual quiere atribuir
              el movimiento contablemente a una empresa (Super Techos / Prouco). */}
          <Field label={campos.tipo === 'gasto_factura' ? 'Empresa receptora · ¿a nombre de quién?' : 'Empresa que asume el gasto'}>
            <select
              value={campos.empresaReceptora}
              onChange={e => set('empresaReceptora', e.target.value)}
              className={`w-full bg-zinc-950 border ${campos.empresaReceptora ? 'border-zinc-700' : (campos.tipo === 'gasto_factura' ? 'border-amber-700' : 'border-zinc-800')} focus:border-red-600 outline-none px-2 py-2 text-white text-sm`}
            >
              <option value="">— Sin asignar —</option>
              {Object.entries(EMPRESAS_RECEPTORAS).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label} (RNC {meta.rnc})</option>
              ))}
            </select>
          </Field>

          {campos.tipo === 'gasto_factura' && (
            <>
              {/* Sin factura toggle */}
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={campos.sinFactura}
                  onChange={e => set('sinFactura', e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                Sin comprobante fiscal (compra informal sin RNC/NCF)
              </label>

              <Field label="Proveedor (razón social)">
                <input
                  type="text"
                  value={campos.proveedor}
                  onChange={e => set('proveedor', e.target.value)}
                  placeholder="Razón social del emisor"
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
                />
              </Field>

              {!campos.sinFactura && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="RNC del proveedor *">
                    <input
                      type="text"
                      value={campos.rnc}
                      onChange={e => set('rnc', e.target.value)}
                      onBlur={e => {
                        const d = limpiarRNC(e.target.value);
                        if (d) set('rnc', formatRNC(d));
                      }}
                      placeholder="000-00000-0"
                      inputMode="numeric"
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono"
                    />
                  </Field>
                  <Field label="NCF">
                    <input
                      type="text"
                      value={campos.ncf}
                      onChange={e => set('ncf', e.target.value.toUpperCase())}
                      placeholder="B0100..."
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm font-mono"
                    />
                  </Field>
                </div>
              )}

              <Field label="Categoría">
                <select
                  value={campos.categoria}
                  onChange={e => set('categoria', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
                >
                  <option value="">— Seleccionar —</option>
                  {categoriasActivas.map(c => (
                    <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label="Concepto">
            <textarea
              value={campos.concepto}
              onChange={e => set('concepto', e.target.value)}
              rows={2}
              placeholder="Descripción breve"
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-2 py-2 text-white text-sm"
            />
          </Field>

          <Field label="Proyecto / obra">
            <ProyectoSelector
              value={campos.proyectoId}
              onChange={(id) => set('proyectoId', id)}
              proyectos={proyectosOrdenados}
              etiquetaVacio="— Sin proyecto —"
            />
          </Field>

          {/* Foto opcional */}
          <Field label="Foto de la factura (opcional)" icon={<Camera className="w-3 h-3" />}>
            <input
              type="file"
              accept="image/*"
              onChange={onFotoChange}
              className="w-full text-xs text-zinc-400 file:mr-2 file:bg-zinc-800 file:border-0 file:text-white file:px-3 file:py-2 file:text-xs file:uppercase file:font-bold hover:file:bg-zinc-700"
            />
            {foto && (
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
                <img src={foto.dataUrl} alt="" className="w-16 h-16 object-cover border border-zinc-700" />
                <div className="truncate flex-1">{foto.name}</div>
                <button onClick={() => setFoto(null)} className="text-zinc-500 hover:text-red-400 text-[10px] uppercase font-bold">Quitar</button>
              </div>
            )}
          </Field>

          {error && (
            <div className="bg-red-950/40 border border-red-800 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-zinc-800 px-3 py-2.5 flex items-center justify-end gap-2 flex-shrink-0 bg-zinc-950">
          <button
            onClick={onCerrar}
            disabled={guardando}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase tracking-wider px-3 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-wider px-4 py-2 text-xs flex items-center gap-1"
          >
            {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Crear gasto
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-500 font-bold mb-0.5">
        {icon}{label}
      </div>
      {children}
    </div>
  );
}
