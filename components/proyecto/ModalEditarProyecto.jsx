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

// Tarjeta visual para seleccionar modo de pago de mano de obra
function ModoPagoCard({ activo, onClick, titulo, icono, descripcion, preview }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 border-2 transition ${
        activo
          ? 'bg-red-600/10 border-red-600 text-white'
          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base leading-none">{icono}</span>
        <span className="text-[11px] font-black uppercase tracking-wider">{titulo}</span>
      </div>
      <div className="text-[10px] leading-tight text-zinc-500 mb-1">{descripcion}</div>
      {preview ? <div className="text-[10px] font-bold text-green-400">{preview}</div> : <div className="text-[10px] text-zinc-700 italic">— sin configurar —</div>}
    </button>
  );
}

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
    fechaAprobacion: proyecto.fechaAprobacion || '', // v8.10.22
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

  // Previews numéricos por modo de pago — usan m² total estimado y pesos del sistema
  const m2TotalProyecto = (form.areas || []).reduce((s, a) => s + (Number(a.m2) || 0), 0);
  const previewM2Fijo = m2TotalProyecto * (Number(form.precioM2FijoMaestro) || 0);
  const previewM2PorTarea = sistema
    ? (sistema.tareas || []).reduce((s, t) => s + (Number(form.preciosTareasM2[t.id]) || 0) * m2TotalProyecto * ((Number(t.peso) || 0) / 100), 0)
    : 0;
  const previewTareaVenta = sistema
    ? (sistema.tareas || []).reduce((s, t) => s + (Number(form.preciosTareasM2[t.id]) || 0) * m2TotalProyecto * ((Number(t.peso) || 0) / 100), 0)
    : 0;
  const previewTareaMaestro = sistema
    ? (sistema.tareas || []).reduce((s, t) => s + (Number((form.preciosManoObraTareas || {})[t.id]) || 0) * m2TotalProyecto * ((Number(t.peso) || 0) / 100), 0)
    : 0;
  const costoDiarioTotal = personasProyecto.reduce((s, p) => s + (Number(getCostoPersona(p.id)) || 0), 0);
  const diasReferencia = (form.fecha_inicio && form.fecha_entrega)
    ? Math.max(1, Math.round((new Date(form.fecha_entrega) - new Date(form.fecha_inicio)) / (1000 * 60 * 60 * 24)))
    : 14;
  const previewDia = costoDiarioTotal * diasReferencia;

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
          {/* v8.10.23: selector de sistema por defecto del proyecto */}
          <Campo label="Sistema por defecto del proyecto">
            <select
              value={form.sistema || ''}
              onChange={e => setForm({ ...form, sistema: e.target.value || '' })}
              className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-3 py-3 text-white text-sm"
            >
              <option value="">— Sin sistema asignado —</option>
              {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <div className="text-[10px] text-zinc-500 mt-1">Las áreas que no tengan un sistema específico usarán este. Puedes seguir asignando sistemas distintos por área abajo.</div>
          </Campo>
          {/* v8.10.22: Fecha de aprobación (cuándo el cliente aprobó) — separada de fecha_inicio */}
          <Campo label="Fecha de aprobación (cuándo se aprobó la cotización)">
            <Input type="date" value={form.fechaAprobacion || ''} onChange={v => setForm({ ...form, fechaAprobacion: v })} />
          </Campo>
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
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Pago de mano de obra</div>
            {m2TotalProyecto > 0 && <div className="text-[10px] text-zinc-500">Base: {formatNum(m2TotalProyecto)} m² · {sistema?.nombre || 'sin sistema'}</div>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ModoPagoCard
              activo={form.modoPagoManoObra === 'dia'}
              onClick={() => setForm({ ...form, modoPagoManoObra: 'dia' })}
              titulo="Por día"
              icono="📅"
              descripcion="Tarifa diaria fija por persona. Útil cuando no se sabe el alcance final."
              preview={costoDiarioTotal > 0 ? `RD$${formatNum(costoDiarioTotal)}/día × ${diasReferencia}d ≈ ${formatRD(previewDia)}` : null}
            />
            <ModoPagoCard
              activo={form.modoPagoManoObra === 'm2_fijo'}
              onClick={() => setForm({ ...form, modoPagoManoObra: 'm2_fijo' })}
              titulo="m² fijo sistema"
              icono="📐"
              descripcion="Un solo precio por m² ejecutado, sin distinguir tareas."
              preview={previewM2Fijo > 0 ? `≈ ${formatRD(previewM2Fijo)} al completar` : null}
            />
            <ModoPagoCard
              activo={form.modoPagoManoObra === 'm2'}
              onClick={() => setForm({ ...form, modoPagoManoObra: 'm2' })}
              titulo="m² por tarea"
              icono="🧱"
              descripcion="Precio distinto por cada paso/tarea del sistema."
              preview={previewM2PorTarea > 0 ? `≈ ${formatRD(previewM2PorTarea)} al completar` : null}
            />
            <ModoPagoCard
              activo={form.modoPagoManoObra === 'tarea'}
              onClick={() => setForm({ ...form, modoPagoManoObra: 'tarea' })}
              titulo="Tarea (venta + maestro)"
              icono="🔨"
              descripcion="Lleva por separado el precio de venta y el pago al maestro."
              preview={previewTareaMaestro > 0 ? `Maestro ≈ ${formatRD(previewTareaMaestro)}` : null}
            />
          </div>

          {/* Detalle según modo seleccionado */}
          {form.modoPagoManoObra === 'm2_fijo' && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio fijo al maestro por m² del sistema</div>
                <div className="text-[10px] text-zinc-500">Se paga este monto por cada m² ejecutado, sin importar qué tarea.</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 shrink-0">RD$</span>
                <input
                  type="number"
                  value={form.precioM2FijoMaestro || ''}
                  onChange={e => setForm({ ...form, precioM2FijoMaestro: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  className="flex-1 bg-zinc-900 border border-green-800 px-2 py-2 text-green-400 text-sm font-bold text-right"
                />
                <span className="text-xs text-zinc-500 shrink-0">/m²</span>
              </div>
              {previewM2Fijo > 0 && (
                <div className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 p-2">
                  💡 {formatNum(m2TotalProyecto)} m² × RD${formatNum(form.precioM2FijoMaestro || 0)}/m² = <span className="text-green-400 font-bold">{formatRD(previewM2Fijo)}</span> al maestro al completar el proyecto.
                </div>
              )}
            </div>
          )}

          {form.modoPagoManoObra === 'm2' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio al maestro por cada paso del sistema</div>
                <div className="text-[10px] text-zinc-500">Cada paso se paga al m² ejecutado de esa tarea.</div>
              </div>
              <div className="space-y-1.5">
                {(sistema.tareas || []).map(t => {
                  const precio = Number(form.preciosTareasM2[t.id]) || 0;
                  const m2Tarea = m2TotalProyecto * ((Number(t.peso) || 0) / 100);
                  const subtotal = precio * m2Tarea;
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate">{t.nombre}</div>
                        <div className="text-[9px] text-zinc-500">{t.peso}% · ≈ {formatNum(m2Tarea)} m²</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="0" className="w-20 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                        <span className="text-[9px] text-zinc-600 w-6">/m²</span>
                      </div>
                      <div className="text-[10px] text-green-400 font-bold w-24 text-right shrink-0">{subtotal > 0 ? formatRD(subtotal) : '—'}</div>
                    </div>
                  );
                })}
              </div>
              {previewM2PorTarea > 0 && (
                <div className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 p-2 flex justify-between">
                  <span>Total estimado al maestro:</span>
                  <span className="text-green-400 font-bold">{formatRD(previewM2PorTarea)}</span>
                </div>
              )}
            </div>
          )}

          {form.modoPagoManoObra === 'tarea' && sistema && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio de venta y pago al maestro por tarea</div>
                <div className="text-[10px] text-zinc-500">El maestro cubre sus ayudantes con su pago.</div>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-[9px] tracking-wider uppercase text-zinc-500 font-bold border-b border-zinc-800 pb-1">
                <div>Tarea</div>
                <div className="w-20 text-right">Venta/m²</div>
                <div className="w-20 text-right">Maestro/m²</div>
                <div className="w-16 text-right">Margen</div>
              </div>
              <div className="space-y-1.5">
                {(sistema.tareas || []).map(t => {
                  const venta = Number(form.preciosTareasM2[t.id]) || 0;
                  const maestro = Number((form.preciosManoObraTareas || {})[t.id]) || 0;
                  const margen = venta > 0 ? Math.round(((venta - maestro) / venta) * 100) : 0;
                  return (
                    <div key={t.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                      <div className="text-xs truncate">{t.nombre} <span className="text-zinc-600 text-[9px]">{t.peso}%</span></div>
                      <input type="number" value={form.preciosTareasM2[t.id] || ''} onChange={e => setPrecio(t.id, e.target.value)} placeholder="venta" className="w-20 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs text-right" />
                      <input
                        type="number"
                        value={(form.preciosManoObraTareas || {})[t.id] || ''}
                        onChange={e => setForm({ ...form, preciosManoObraTareas: { ...(form.preciosManoObraTareas || {}), [t.id]: e.target.value } })}
                        placeholder="maestro"
                        className="w-20 bg-zinc-950 border border-green-800 px-2 py-1 text-green-400 text-xs text-right"
                      />
                      <div className={`w-16 text-right text-[10px] font-bold ${margen >= 30 ? 'text-green-400' : margen > 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>
                        {venta > 0 && maestro > 0 ? `${margen}%` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(previewTareaVenta > 0 || previewTareaMaestro > 0) && (
                <div className="text-[10px] bg-zinc-900 border border-zinc-800 p-2 space-y-1">
                  <div className="flex justify-between"><span className="text-zinc-400">Venta total estimada:</span><span className="text-white font-bold">{formatRD(previewTareaVenta)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Pago al maestro estimado:</span><span className="text-green-400 font-bold">{formatRD(previewTareaMaestro)}</span></div>
                  <div className="flex justify-between border-t border-zinc-800 pt-1"><span className="text-zinc-400">Margen mano de obra:</span><span className={`font-bold ${(previewTareaVenta - previewTareaMaestro) > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatRD(previewTareaVenta - previewTareaMaestro)}</span></div>
                </div>
              )}
            </div>
          )}

          {form.modoPagoManoObra === 'dia' && (
            <div className="bg-zinc-950 border border-zinc-800 p-3 space-y-3">
              <div>
                <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Costo por día por persona (RD$)</div>
                <div className="text-[10px] text-zinc-500">Cada persona del proyecto cobra su tarifa diaria. Día doble cuenta como 2 días.</div>
              </div>
              {personasProyecto.length === 0 ? (
                <div className="text-xs text-yellow-400 bg-yellow-900/10 border border-yellow-900 p-2">⚠️ Asigna supervisor, maestro o ayudantes al proyecto para configurar sus tarifas diarias.</div>
              ) : loadingCostos ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              ) : (
                <div className="space-y-1.5">
                  {personasProyecto.map(p => {
                    const rol = p.id === form.supervisorId ? 'supervisor' : p.id === form.maestroId ? 'maestro' : 'ayudante';
                    const icono = rol === 'supervisor' ? '👔' : rol === 'maestro' ? '🔨' : '🧰';
                    const costo = Number(getCostoPersona(p.id)) || 0;
                    return (
                      <div key={p.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2">
                        <span className="text-base shrink-0">{icono}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{p.nombre}</div>
                          <div className="text-[9px] uppercase tracking-wider text-zinc-500">{rol}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-zinc-600">RD$</span>
                          <input
                            type="number"
                            defaultValue={getCostoPersona(p.id)}
                            onBlur={e => setCostoPersona(p.id, parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className={`w-24 border px-2 py-1.5 text-xs text-right font-bold ${costo > 0 ? 'bg-zinc-900 border-green-800 text-green-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                          />
                          <span className="text-[10px] text-zinc-600">/día</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {costoDiarioTotal > 0 && (
                <div className="text-[10px] bg-zinc-900 border border-zinc-800 p-2 space-y-1">
                  <div className="flex justify-between"><span className="text-zinc-400">Costo del equipo por día:</span><span className="text-white font-bold">{formatRD(costoDiarioTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Estimado para {diasReferencia} día{diasReferencia !== 1 ? 's' : ''}{form.fecha_inicio && form.fecha_entrega ? ' (calendario)' : ' (referencia)'}:</span><span className="text-green-400 font-bold">{formatRD(previewDia)}</span></div>
                </div>
              )}
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
