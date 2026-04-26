'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import * as db from '../../lib/db';
import { abrirEnMapa } from '../../lib/geo';
import { expandirYExtraer } from '../../lib/geoutils';
import { formatRD, formatNum } from '../../lib/helpers/formato';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Helpers locales (también están en page.jsx)
const tieneRol = (p, r) => p?.roles?.includes(r);
const getPersona = (personal, id) => personal.find(p => p.id === id);
const getMaestros = (personal) => personal.filter(p => tieneRol(p, 'maestro'));
const getSupervisores = (personal) => personal.filter(p => tieneRol(p, 'supervisor'));
const getAyudantesDeMaestro = (personal, mId) => personal.filter(p => tieneRol(p, 'ayudante') && p.maestroId === mId);

export default function ModalEditarProyecto({ proyecto, data, usuario, onCerrar, onGuardar, onArchivar, onEliminar }) {
  const [form, setForm] = useState({
    supervisorId: proyecto.supervisorId || '',
    maestroId: proyecto.maestroId || '',
    ayudantesIds: proyecto.ayudantesIds || [],
    cliente: proyecto.cliente || '',
    clienteId: proyecto.clienteId || '', // v8.9.10
    contactoPrincipalId: proyecto.contactoPrincipalId || null, // v8.9.10
    referenciaProyecto: proyecto.referenciaProyecto || '',
    referenciaOdoo: proyecto.referenciaOdoo || '',
    contactoClienteNombre: proyecto.contactoClienteNombre || '',
    contactoClienteTelefono: proyecto.contactoClienteTelefono || '',
    contactoClienteEmail: proyecto.contactoClienteEmail || '',
    googleMapsLink: proyecto.googleMapsLink || '',
    ubicacionLat: proyecto.ubicacionLat,
    ubicacionLng: proyecto.ubicacionLng,
    ubicacionDireccionTexto: proyecto.ubicacionDireccionTexto || '',
    fecha_inicio: proyecto.fecha_inicio,
    fecha_entrega: proyecto.fecha_entrega,
    modoPagoManoObra: proyecto.modoPagoManoObra || 'dia',
    preciosTareasM2: proyecto.preciosTareasM2 || {},
    preciosManoObraTareas: proyecto.preciosManoObraTareas || {},
    precioM2FijoMaestro: proyecto.precioM2FijoMaestro || 0,
    tipoAvance: proyecto.tipoAvance || 'tradicional',
    estructuraUnidades: proyecto.estructuraUnidades || [],
    areas: proyecto.areas ? proyecto.areas.map(a => ({ ...a })) : [],
    sistema: proyecto.sistema || '',
    cronogramaVisibleMaestro: proyecto.cronogramaVisibleMaestro !== false,
  });
  const [guardando, setGuardando] = useState(false);
  const [costosDia, setCostosDia] = useState([]);
  const [loadingCostos, setLoadingCostos] = useState(true);
  const sistema = data.sistemas[proyecto.sistema];
  const sistemasArray = Object.values(data.sistemas || {}); // v8.9

  useEffect(() => {
    (async () => {
      try { setCostosDia(await db.listarCostosDia(proyecto.id)); } catch {}
      setLoadingCostos(false);
    })();
  }, []);

  const supervisores = getSupervisores(data.personal);
  const maestros = getMaestros(data.personal);
  const ayudantesDisp = form.maestroId ? getAyudantesDeMaestro(data.personal, form.maestroId) : [];

  const [extrayendo, setExtrayendo] = useState(false);
  const extraerLinkMaps = async () => {
    setExtrayendo(true);
    try {
      const coords = await expandirYExtraer(form.googleMapsLink);
      if (coords) {
        setForm({ ...form, ubicacionLat: coords.lat, ubicacionLng: coords.lng });
        alert(`Coordenadas extraídas: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
      } else {
        alert('No se pudieron extraer coordenadas de ese link. Prueba con el link completo de Google Maps (barra de direcciones del navegador).');
      }
    } finally {
      setExtrayendo(false);
    }
  };

  const setCostoPersona = async (personaId, costo) => {
    if (costo > 0) await db.guardarCostoDia(proyecto.id, personaId, costo);
    else await db.eliminarCostoDia(proyecto.id, personaId);
    setCostosDia(await db.listarCostosDia(proyecto.id));
  };

  const getCostoPersona = (pid) => costosDia.find(c => c.personaId === pid)?.costoDia || '';

  const guardar = async () => {
    // v8.7.1: Ref Odoo obligatoria (no se permite vaciar)
    if (!form.referenciaOdoo || !form.referenciaOdoo.trim()) {
      alert('⚠️ La Referencia Odoo es obligatoria. No se puede dejar vacía.');
      return;
    }
    // v8.6: Si tiene supervisor o maestro asignado, exigir fecha de inicio
    const tienePersonal = form.supervisorId || form.maestroId || (form.ayudantesIds || []).length > 0;
    if (tienePersonal && !form.fecha_inicio) {
      alert('⚠️ Cuando se asigna personal al proyecto, debes establecer la fecha de inicio. Si aún está por definir, quita el personal asignado o define una fecha.');
      return;
    }
    setGuardando(true);
    // v8.9.27: audit log de cambios de precio custom por área
    try {
      const areasAntes = proyecto.areas || [];
      const areasDespues = form.areas || [];
      const mapAntes = {};
      areasAntes.forEach(a => { mapAntes[a.id] = a; });
      areasDespues.forEach(aNew => {
        const aOld = mapAntes[aNew.id];
        const precioOld = aOld?.precioVentaM2 ?? null;
        const precioNew = (aNew.precioVentaM2 === '' || aNew.precioVentaM2 === undefined) ? null : aNew.precioVentaM2;
        const oldNum = precioOld === null ? null : Number(precioOld);
        const newNum = precioNew === null ? null : Number(precioNew);
        if (oldNum !== newNum) {
          db.registrarAudit({
            usuarioId: usuario?.id,
            usuarioNombre: usuario?.nombre,
            accion: 'proyecto.precio_area_editado',
            recursoTipo: 'proyecto',
            recursoId: proyecto.id,
            recursoNombre: `${proyecto.referenciaOdoo || ''} ${proyecto.cliente || proyecto.nombre || ''}`.trim(),
            datosAntes: { areaId: aNew.id, areaNombre: aNew.nombre, precioVentaM2: oldNum },
            datosDespues: { areaId: aNew.id, areaNombre: aNew.nombre, precioVentaM2: newNum },
            severidad: 'warning',
          });
        }
      });
    } catch (e) { console.warn('Audit de precio no registrado:', e?.message); }
    await onGuardar({ ...proyecto, ...form });
    setGuardando(false);
    onCerrar();
  };

  const archivar = async () => {
    if (!confirm(`¿Archivar el proyecto "${proyecto.cliente}"? Ya no aparecerá en las listas, pero podemos restaurarlo después si es necesario.`)) return;
    setGuardando(true);
    await onArchivar(proyecto.id);
    setGuardando(false);
    onCerrar();
  };

  // v8.9.12: Eliminar permanentemente
  const eliminar = async () => {
    const nombreConfirmacion = proyecto.referenciaOdoo || proyecto.cliente || proyecto.nombre;
    const texto = prompt(`⚠️ ELIMINACIÓN PERMANENTE ⚠️\n\nEsto borrará el proyecto "${nombreConfirmacion}" junto con TODOS sus datos:\n• Reportes de avance\n• Envíos de materiales\n• Jornadas\n• Fotos\n• Nóminas\n• Comentarios\n\nEsta acción NO SE PUEDE DESHACER.\n\nPara confirmar, escribe exactamente el nombre o referencia:\n${nombreConfirmacion}`);
    if (!texto || texto.trim() !== nombreConfirmacion.trim()) {
      if (texto !== null) alert('El nombre no coincide. Operación cancelada.');
      return;
    }
    setGuardando(true);
    try {
      if (onEliminar) await onEliminar(proyecto.id);
      onCerrar();
    } catch (e) {
      alert('Error al eliminar: ' + (e.message || e));
      setGuardando(false);
    }
  };

  const setPrecio = (tareaId, precio) => {
    setForm({ ...form, preciosTareasM2: { ...form.preciosTareasM2, [tareaId]: parseFloat(precio) || 0 } });
  };

  const personasProyecto = [form.supervisorId, form.maestroId, ...form.ayudantesIds].filter(Boolean).map(id => getPersona(data.personal, id)).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-zinc-900 border-2 border-red-600 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto my-8">
        <div className="flex justify-between items-start sticky top-0 bg-zinc-900 pb-2 border-b border-zinc-800"><div className="text-xs tracking-widest uppercase text-red-500 font-bold">Editar proyecto</div><button onClick={onCerrar} className="text-zinc-500"><X className="w-4 h-4" /></button></div>

        <div className="space-y-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Información</div>
          {/* v8.9.10: Selector de cliente */}
          <Campo label="Cliente">
            <div className="space-y-2">
              <select
                value={form.clienteId || ''}
                onChange={e => {
                  const cliId = e.target.value;
                  if (cliId) {
                    const cli = (data.clientes || []).find(c => c.id === cliId);
                    const contsCliente = (data.contactos || []).filter(ct => ct.clienteId === cliId);
                    const contPrincipal = contsCliente.find(ct => ct.esPrincipal) || contsCliente[0];
                    setForm({
                      ...form,
                      clienteId: cliId,
                      cliente: cli?.nombre || form.cliente,
                      contactoPrincipalId: contPrincipal?.id || null,
                      contactoClienteNombre: contPrincipal?.nombre || form.contactoClienteNombre,
                      contactoClienteTelefono: contPrincipal?.telefono || form.contactoClienteTelefono,
                      contactoClienteEmail: contPrincipal?.email || form.contactoClienteEmail,
                    });
                  } else {
                    setForm({ ...form, clienteId: '', contactoPrincipalId: null });
                  }
                }}
                className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-2 text-white text-sm"
              >
                <option value="">— Seleccionar cliente registrado —</option>
                {(data.clientes || []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · RNC ${c.rnc}` : ''}</option>)}
              </select>
              <Input value={form.cliente} onChange={v => setForm({ ...form, cliente: v })} placeholder="Nombre del cliente" />
              {form.clienteId && (() => {
                const contsCliente = (data.contactos || []).filter(ct => ct.clienteId === form.clienteId);
                if (contsCliente.length > 1) {
                  return (
                    <select
                      value={form.contactoPrincipalId || ''}
                      onChange={e => {
                        const contId = e.target.value;
                        const cont = (data.contactos || []).find(ct => ct.id === contId);
                        setForm({
                          ...form,
                          contactoPrincipalId: contId || null,
                          contactoClienteNombre: cont?.nombre || form.contactoClienteNombre,
                          contactoClienteTelefono: cont?.telefono || form.contactoClienteTelefono,
                          contactoClienteEmail: cont?.email || form.contactoClienteEmail,
                        });
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-white text-xs"
                    >
                      <option value="">— Contacto principal —</option>
                      {contsCliente.map(ct => <option key={ct.id} value={ct.id}>{ct.esPrincipal ? '⭐ ' : ''}{ct.nombre}{ct.cargo ? ` · ${ct.cargo}` : ''}</option>)}
                    </select>
                  );
                }
                return null;
              })()}
            </div>
          </Campo>
          <div className="grid grid-cols-2 gap-3"><Campo label="Ref. Odoo *"><Input value={form.referenciaOdoo} onChange={v => setForm({ ...form, referenciaOdoo: v })} placeholder="Ej: ST-C5437" /></Campo><Campo label="Ref. Proyecto"><Input value={form.referenciaProyecto} onChange={v => setForm({ ...form, referenciaProyecto: v })} /></Campo></div>
          <div className="grid grid-cols-2 gap-3"><Campo label="Fecha inicio"><Input type="date" value={form.fecha_inicio} onChange={v => setForm({ ...form, fecha_inicio: v })} /></Campo><Campo label="Fecha entrega"><Input type="date" value={form.fecha_entrega} onChange={v => setForm({ ...form, fecha_entrega: v })} /></Campo></div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Equipo</div>
          <Campo label="Supervisor"><select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
          <Campo label="Maestro"><select value={form.maestroId} onChange={e => setForm({ ...form, maestroId: e.target.value, ayudantesIds: [] })} className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white"><option value="">Sin asignar</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
          {ayudantesDisp.length > 0 && <Campo label="Ayudantes"><div className="space-y-1">{ayudantesDisp.map(a => <label key={a.id} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer hover:border-red-600"><input type="checkbox" checked={form.ayudantesIds.includes(a.id)} onChange={e => setForm({ ...form, ayudantesIds: e.target.checked ? [...form.ayudantesIds, a.id] : form.ayudantesIds.filter(x => x !== a.id) })} className="w-4 h-4 accent-red-600" /><span className="text-sm">{a.nombre}</span></label>)}</div></Campo>}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Ubicación</div>
          <Campo label="Link de Google Maps">
            <div className="flex gap-2">
              <input type="text" value={form.googleMapsLink} onChange={e => setForm({ ...form, googleMapsLink: e.target.value })} placeholder="https://maps.google.com/..." className="flex-1 bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white text-sm" />
              <button onClick={extraerLinkMaps} disabled={!form.googleMapsLink || extrayendo} className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase px-3 flex items-center gap-1">{extrayendo ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Extraer'}</button>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Pega un link de Google Maps y clic "Extraer" para obtener las coordenadas.</div>
          </Campo>
          <Campo label="Dirección (texto)"><Input value={form.ubicacionDireccionTexto} onChange={v => setForm({ ...form, ubicacionDireccionTexto: v })} placeholder="Ej: C/ Duarte 45, Santo Domingo" /></Campo>
          {form.ubicacionLat != null && form.ubicacionLng != null && (
            <div className="bg-green-900/20 border border-green-700 p-2 text-[11px] text-green-300">✓ Coordenadas: <span className="font-mono">{form.ubicacionLat.toFixed(5)}, {form.ubicacionLng.toFixed(5)}</span> <button onClick={() => abrirEnMapa(form.ubicacionLat, form.ubicacionLng)} className="underline ml-2">Ver</button></div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Contacto del cliente</div>
          <Campo label="Nombre contacto"><Input value={form.contactoClienteNombre} onChange={v => setForm({ ...form, contactoClienteNombre: v })} /></Campo>
          <div className="grid grid-cols-2 gap-3"><Campo label="Teléfono"><Input value={form.contactoClienteTelefono} onChange={v => setForm({ ...form, contactoClienteTelefono: v })} /></Campo><Campo label="Email"><Input type="email" value={form.contactoClienteEmail} onChange={v => setForm({ ...form, contactoClienteEmail: v })} /></Campo></div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Áreas ({form.areas.length})</div>
            <button onClick={() => setForm({ ...form, areas: [...form.areas, { id: 'a_' + Date.now() + Math.random().toString(36).slice(2, 6), nombre: '', m2: 0 }] })} className="text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
          </div>
          {form.areas.map((area, i) => {
            const sistemaArea = area.sistemaId || form.sistema;
            const sistemaAreaObj = sistemaArea ? data.sistemas[sistemaArea] : null;
            return (
              <div key={area.id} className="bg-zinc-950 border border-zinc-800 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <input type="text" value={area.nombre} onChange={e => { const n = [...form.areas]; n[i] = { ...area, nombre: e.target.value }; setForm({ ...form, areas: n }); }} placeholder="Nombre (ej: Techo Hombres)" className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-xs" />
                  <input type="number" value={area.m2 || ''} onChange={e => { const n = [...form.areas]; n[i] = { ...area, m2: parseFloat(e.target.value) || 0 }; setForm({ ...form, areas: n }); }} placeholder="m²" className="w-20 bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-xs text-right" />
                  <button onClick={() => { if (confirm('¿Eliminar esta área? Se perderán los reportes asociados.')) { setForm({ ...form, areas: form.areas.filter(x => x.id !== area.id) }); } }} className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
                {/* v8.9: selector de sistema por área */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold shrink-0">Sistema:</span>
                  <select
                    value={area.sistemaId || ''}
                    onChange={e => { const n = [...form.areas]; n[i] = { ...area, sistemaId: e.target.value || null }; setForm({ ...form, areas: n }); }}
                    className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-[10px]"
                  >
                    <option value="">🔧 Por defecto del proyecto{form.sistema ? ` (${data.sistemas[form.sistema]?.nombre || ''})` : ''}</option>
                    {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  {sistemaAreaObj && <span className="text-[9px] text-green-500 shrink-0">RD${sistemaAreaObj.precio_m2 || 0}/m²</span>}
                </div>
                {/* v8.9.27: precio venta custom por área - solo admin */}
                {tieneRol(usuario, 'admin') && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[9px] tracking-widest uppercase text-zinc-500 font-bold shrink-0">Precio venta/m²:</span>
                    <input
                      type="number"
                      value={area.precioVentaM2 ?? ''}
                      onChange={e => {
                        const v = e.target.value;
                        const n = [...form.areas];
                        n[i] = { ...area, precioVentaM2: v === '' ? null : v };
                        setForm({ ...form, areas: n });
                      }}
                      placeholder={`${sistemaAreaObj?.precio_m2 || 0}`}
                      className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-[10px] text-right"
                    />
                    <span className="text-[9px] text-zinc-500 shrink-0">
                      {area.precioVentaM2 !== undefined && area.precioVentaM2 !== null && area.precioVentaM2 !== '' ? (
                        <span className="text-yellow-400">✏️ custom · {formatRD((area.m2 || 0) * Number(area.precioVentaM2))}</span>
                      ) : (
                        <span>usa el del sistema · {formatRD((area.m2 || 0) * (sistemaAreaObj?.precio_m2 || 0))}</span>
                      )}
                    </span>
                  </div>
                )}
                <select value={area.maestroAreaId || ''} onChange={e => { const n = [...form.areas]; n[i] = { ...area, maestroAreaId: e.target.value || null }; setForm({ ...form, areas: n }); }} className="w-full bg-zinc-900 border border-zinc-800 px-2 py-1.5 text-white text-[10px]">
                  <option value="">Usar maestro principal del proyecto</option>
                  {maestros.map(m => <option key={m.id} value={m.id}>🔨 {m.nombre}</option>)}
                </select>
              </div>
            );
          })}
          {form.areas.length === 0 && <div className="text-xs text-zinc-500 text-center py-2">Sin áreas. Click en "Agregar área" para crear.</div>}
          <div className="text-[10px] text-zinc-600">Total: {formatNum(form.areas.reduce((s, a) => s + (a.m2 || 0), 0))} m²</div>
          {(() => {
            const sistemasDistintos = new Set();
            form.areas.forEach(a => { const s = a.sistemaId || form.sistema; if (s) sistemasDistintos.add(s); });
            if (sistemasDistintos.size > 1) {
              return <div className="text-[10px] bg-blue-900/20 border border-blue-800 text-blue-300 p-2">💡 Este proyecto tiene <strong>{sistemasDistintos.size} sistemas distintos</strong> entre sus áreas.</div>;
            }
            return null;
          })()}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Configuración</div>
          <label className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-3 cursor-pointer">
            <input type="checkbox" checked={form.cronogramaVisibleMaestro} onChange={e => setForm({ ...form, cronogramaVisibleMaestro: e.target.checked })} className="w-4 h-4 accent-red-600" />
            <div className="flex-1">
              <div className="text-xs font-bold">Mostrar cronograma al maestro/supervisor</div>
              <div className="text-[10px] text-zinc-500">Si lo apagas, solo admin ve las fechas y el Gantt</div>
            </div>
          </label>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Tipo de reporte de avance</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => setForm({ ...form, tipoAvance: 'tradicional' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.tipoAvance === 'tradicional' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Tradicional (m²)</button>
            <button onClick={() => setForm({ ...form, tipoAvance: 'unidades' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.tipoAvance === 'unidades' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por unidades (edificios)</button>
          </div>
          {form.tipoAvance === 'unidades' && (
            <div className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 p-2">
              💡 Podrás configurar torres/niveles/espacios (baños, balcones, etc.) desde la tab "Unidades" del proyecto.
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Pago de mano de obra</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'dia' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'dia' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por día</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'm2_fijo' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'm2_fijo' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>m² fijo sistema</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'm2' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'm2' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>m² por tarea (venta)</button>
            <button onClick={() => setForm({ ...form, modoPagoManoObra: 'tarea' })} className={`p-2 text-xs font-bold uppercase border-2 ${form.modoPagoManoObra === 'tarea' ? 'bg-red-600 text-white border-transparent' : 'bg-zinc-950 border-zinc-800 text-zinc-400'}`}>Por tarea (venta + maestro)</button>
          </div>
          {form.modoPagoManoObra === 'm2_fijo' && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Precio fijo al maestro por m² ejecutado del sistema</div>
              <div className="text-[10px] text-zinc-500">Se paga el mismo precio sin importar qué tarea. Ej: RD$40/m² del sistema completo.</div>
              <div className="flex items-center gap-2">
                <span className="text-xs">RD$</span>
                <input
                  type="number"
                  value={form.precioM2FijoMaestro || ''}
                  onChange={e => setForm({ ...form, precioM2FijoMaestro: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="flex-1 bg-zinc-900 border border-green-800 px-2 py-2 text-green-400 text-sm font-bold text-right"
                />
                <span className="text-xs text-zinc-500">/m²</span>
              </div>
            </div>
          )}
          {form.modoPagoManoObra === 'm2' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Precio por tarea (RD$/m²)</div>
              {(sistema.tareas || []).map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="flex-1 text-xs">{t.nombre} <span className="text-zinc-600">({t.peso}%)</span></div>
                  <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="0" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                </div>
              ))}
            </div>
          )}
          {form.modoPagoManoObra === 'tarea' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio de venta al cliente (RD$/m²)</div>
                <div className="space-y-1.5">
                  {(sistema.tareas || []).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="flex-1 text-xs">{t.nombre}</div>
                      <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="venta" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-3">
                <div className="text-[10px] tracking-widest uppercase text-green-500 font-bold mb-1">Pago al maestro por tarea (RD$/m²)</div>
                <div className="text-[10px] text-zinc-500 mb-2">El maestro recibe este monto por cada m² ejecutado de cada tarea. Él cubre sus ayudantes.</div>
                <div className="space-y-1.5">
                  {(sistema.tareas || []).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="flex-1 text-xs">{t.nombre}</div>
                      <input
                        type="number"
                        value={(form.preciosManoObraTareas || {})[t.id] || ''}
                        onChange={e => setForm({ ...form, preciosManoObraTareas: { ...(form.preciosManoObraTareas || {}), [t.id]: e.target.value } })}
                        placeholder="maestro"
                        className="w-24 bg-zinc-950 border border-green-800 px-2 py-1 text-green-400 text-xs text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {form.modoPagoManoObra === 'dia' && personasProyecto.length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold">Costo por día (RD$)</div>
              {loadingCostos ? <Loader2 className="w-4 h-4 animate-spin" /> : personasProyecto.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="flex-1 text-xs">{p.nombre} <span className="text-zinc-600 text-[10px]">{p.id === form.supervisorId ? '(supervisor)' : p.id === form.maestroId ? '(maestro)' : '(ayudante)'}</span></div>
                  <input type="number" defaultValue={getCostoPersona(p.id)} onBlur={e => setCostoPersona(p.id, parseFloat(e.target.value) || 0)} placeholder="0" className="w-24 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 pt-3 border-t border-zinc-800 space-y-2">
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-1">{guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3" /> Guardar</>}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={archivar} className="bg-zinc-950 border border-zinc-700 text-zinc-400 hover:border-yellow-500 hover:text-yellow-400 text-[10px] font-bold uppercase py-2 flex items-center justify-center gap-1">
              <Trash2 className="w-3 h-3" /> Archivar
            </button>
            {onEliminar && (
              <button onClick={eliminar} className="bg-zinc-950 border border-red-900 text-red-500 hover:border-red-500 hover:bg-red-900/20 text-[10px] font-bold uppercase py-2 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Eliminar permanente
              </button>
            )}
          </div>
          <div className="text-[9px] text-zinc-600 text-center italic">
            Archivar = esconder (reversible) · Eliminar = borrar todo (permanente)
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// DETALLE DE PROYECTO
// ============================================================
