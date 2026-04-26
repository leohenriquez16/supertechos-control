'use client';

import React, { useState, useMemo } from 'react';
import { ArrowLeft, FileUp, Loader2, Plus, Sparkles, Utensils } from 'lucide-react';
import { formatRD, formatNum } from '../../lib/helpers/formato';
import { fileToBase64, cortarPDFaPrimerasPaginas } from '../../lib/helpers/pdf';
import Campo from '../common/Campo';
import Input from '../common/Input';

// Helpers locales (también están en page.jsx)
const tieneRol = (p, r) => p?.roles?.includes(r);
const getPersona = (personal, id) => personal.find(p => p.id === id);
const getMaestros = (personal) => personal.filter(p => tieneRol(p, 'maestro'));
const getSupervisores = (personal) => personal.filter(p => tieneRol(p, 'supervisor'));
const getAyudantesDeMaestro = (personal, mId) => personal.filter(p => tieneRol(p, 'ayudante') && p.maestroId === mId);

// Helpers para sistemas
const normalizarNombreSistema = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');
const buscarSistemaPorNombre = (sistemas, nombre) => {
  const buscado = normalizarNombreSistema(nombre);
  for (const id in sistemas) {
    const s = sistemas[id];
    if (normalizarNombreSistema(s.nombre) === buscado) return s;
  }
  return null;
};

export default function NuevoProyecto({ personal, sistemas, clientes = [], contactos = [], onCancelar, onCrear }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [extraido, setExtraido] = useState(null);
  const [mostrarRevision, setMostrarRevision] = useState(false);
  const sistemasArray = Object.values(sistemas);
  const [form, setForm] = useState({
    nombre: '', cliente: '', referenciaProyecto: '',
    clienteId: '', contactoPrincipalId: null, // v8.9.10
    supervisorId: '', maestroId: '', ayudantesIds: [],
    sistema: sistemasArray[0]?.id || '',
    fecha_inicio: '', fecha_entrega: '', referenciaOdoo: '',
    areas: [{ nombre: '', m2: '' }],
    dieta: { habilitada: false, tarifa_dia_persona: 800, dias_hombre_presupuestados: 0, personasIds: [] },
    contactoClienteNombre: '', contactoClienteTelefono: '', contactoClienteEmail: '',
    estadoInicial: 'aprobado', // v8.9.14
  });
  const supervisores = getSupervisores(personal);
  const maestros = getMaestros(personal);
  const ayudantesDisp = form.maestroId ? getAyudantesDeMaestro(personal, form.maestroId) : [];
  const sistema = sistemas[form.sistema];
  // v8.9: conteo de sistemas distintos en áreas
  const sistemasDelProyectoDelForm = React.useMemo(() => {
    const set = new Set();
    (form.areas || []).forEach(a => { const s = a.sistemaId || form.sistema; if (s) set.add(s); });
    return [...set];
  }, [form.areas, form.sistema]);

  const procesarPDF = async (file) => {
    setCargando(true); setError('');
    try {
      // v8.9.31: cortar a las primeras 2 páginas (evita que fichas técnicas/anexos rompan la extracción)
      const corte = await cortarPDFaPrimerasPaginas(file, 2);
      if (corte.cortado) {
        console.log(`[PDF] Cortado de ${corte.totalPaginas} a ${corte.paginasUsadas} páginas`);
      }
      const base64 = await fileToBase64(corte.file);
      const result = await extraerPDF(base64, 'cotizacion', sistemas);
      setExtraido(result);

      // v8.9.1: procesar áreas y detectar sistemas (existentes + nuevos a crear)
      const sistemasNuevosPorNombre = new Map(); // nombre_norm → { nombre, precio_m2, tareas }
      const areasDelForm = [];

      if (result.areas && Array.isArray(result.areas) && result.areas.length > 0) {
        result.areas.forEach((a, i) => {
          const nombreSistema = (a.sistemaNombre || '').trim();
          let sistemaId = null;
          let sistemaExistente = null;
          if (nombreSistema) {
            sistemaExistente = buscarSistemaPorNombre(sistemas, nombreSistema);
            if (sistemaExistente) {
              sistemaId = sistemaExistente.id;
            } else {
              // Marcar para crear
              const key = normalizarNombreSistema(nombreSistema);
              if (!sistemasNuevosPorNombre.has(key)) {
                const tareasInt = (a.tareasInternas && a.tareasInternas.length > 0) ? a.tareasInternas : ['Aplicación'];
                const peso = Math.floor(100 / tareasInt.length);
                const restoUltimo = 100 - peso * (tareasInt.length - 1);
                sistemasNuevosPorNombre.set(key, {
                  tempId: 's_new_' + Date.now() + '_' + sistemasNuevosPorNombre.size,
                  nombre: nombreSistema,
                  precio_m2: Number(a.sistemaPrecioM2) || 0,
                  tareas: tareasInt.map((nombreTarea, idx) => ({
                    id: 't_' + Date.now() + '_' + idx,
                    nombre: nombreTarea,
                    peso: idx === tareasInt.length - 1 ? restoUltimo : peso,
                    reporta: 'm2',
                  })),
                });
              }
              sistemaId = sistemasNuevosPorNombre.get(key).tempId;
            }
          }
          areasDelForm.push({
            nombre: a.nombre || ('Área ' + (i + 1)),
            m2: String(a.m2 || ''),
            sistemaId: sistemaId,
          });
        });
      } else {
        // Fallback: una sola área
        areasDelForm.push({ nombre: 'Área principal', m2: String(result.m2Principal || ''), sistemaId: null });
      }

      // Productos adicionales detectados
      const productosAdic = (result.productosAdicionales || []).map((p, i) => ({
        id: 'prod_' + Date.now() + '_' + i,
        nombre: p.nombre || 'Producto',
        cantidad: Number(p.cantidad) || 0,
        unidad: p.unidad || 'm²',
        precioVenta: Number(p.precioVenta) || 0,
        precioManoObraMaestro: 0, // admin completa después
        nota: '',
      }));

      setForm({
        ...form,
        nombre: result.referencia || result.cliente,
        referenciaProyecto: result.referencia || '',
        cliente: result.cliente,
        referenciaOdoo: result.numeroOrden,
        fecha_inicio: result.fecha || form.fecha_inicio,
        areas: areasDelForm,
        sistemasNuevosAutoCrear: [...sistemasNuevosPorNombre.values()],
        productosAdicionalesAutoCrear: productosAdic,
      });
    } catch (e) { setError('No se pudo extraer el PDF. Detalle: ' + (e.message || e)); console.error(e); }
    setCargando(false);
  };

  const crear = () => {
    if (!form.referenciaOdoo || !form.referenciaOdoo.trim()) { alert('⚠️ La Referencia Odoo es obligatoria. Ingresa el número de cotización/orden de Odoo.'); return; }
    if (!form.nombre && !form.cliente) { alert('Necesitas al menos un nombre o cliente'); return; }
    if (form.areas.some(a => !a.nombre || !a.m2)) { alert('Completa áreas o deja una sola'); return; }

    // v8.9.1: Si hay sistemas nuevos a crear, mostrar pantalla de revisión
    const sistemasNuevos = form.sistemasNuevosAutoCrear || [];
    if (sistemasNuevos.length > 0 && !form.revisionConfirmada) {
      setMostrarRevision(true);
      return;
    }

    const payload = {
      nombre: form.nombre || form.cliente, cliente: form.cliente, referenciaProyecto: form.referenciaProyecto,
      sistema: form.sistema || null, supervisorId: form.supervisorId || null, maestroId: form.maestroId || null, ayudantesIds: form.ayudantesIds,
      fecha_inicio: form.fecha_inicio || null, fecha_entrega: form.fecha_entrega || null, referenciaOdoo: form.referenciaOdoo,
      areas: form.areas.map((a, i) => ({
        id: 'a_' + Date.now() + '_' + i,
        nombre: a.nombre,
        m2: parseFloat(a.m2),
        sistemaId: a.sistemaId || form.sistema || null,
      })),
      dieta: form.dieta.habilitada ? { habilitada: true, tarifa_dia_persona: parseFloat(form.dieta.tarifa_dia_persona) || 0, dias_hombre_presupuestados: parseFloat(form.dieta.dias_hombre_presupuestados) || 0, personasIds: form.dieta.personasIds } : { habilitada: false },
      sistemaAdHoc: form.sistemaAdHoc || null,
      // v8.9.1: lista de sistemas nuevos a crear + productos adicionales extraídos
      sistemasNuevosAutoCrear: sistemasNuevos,
      productosAdicionales: form.productosAdicionalesAutoCrear || [],
      // v8.9.10: relación con clientes
      clienteId: form.clienteId || null,
      contactoPrincipalId: form.contactoPrincipalId || null,
      contactoClienteNombre: form.contactoClienteNombre || '',
      contactoClienteTelefono: form.contactoClienteTelefono || '',
      contactoClienteEmail: form.contactoClienteEmail || '',
      // v8.9.14: estado inicial del proyecto
      estado: form.estadoInicial || 'aprobado',
    };
    onCrear(payload);
  };

  const totalM2 = form.areas.reduce((acc, a) => acc + (parseFloat(a.m2) || 0), 0);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* v8.9.1: Modal de revisión de sistemas nuevos */}
      {mostrarRevision && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-zinc-900 border-2 border-yellow-500 max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs tracking-widest uppercase text-yellow-400 font-bold">⚠️ Sistemas nuevos detectados</div>
                <div className="text-sm text-zinc-400 mt-1">Estos sistemas no existen en el ERP. Se crearán automáticamente con las tareas detectadas del PDF. Podrás ajustarlos después en el módulo de Sistemas.</div>
              </div>
              <button onClick={() => setMostrarRevision(false)} className="text-zinc-500"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              {(form.sistemasNuevosAutoCrear || []).map((s, i) => (
                <div key={s.tempId} className="bg-zinc-950 border border-yellow-800 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 font-bold uppercase">Nuevo</span>
                    <div className="font-bold text-sm">{s.nombre}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-zinc-500 uppercase text-[10px]">Precio venta</div>
                      <div className="text-green-400 font-bold">RD${s.precio_m2}/m²</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 uppercase text-[10px]">Tareas internas ({s.tareas.length})</div>
                      <div className="font-bold">{s.tareas.map(t => `${t.nombre} (${t.peso}%)`).join(' · ')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(form.productosAdicionalesAutoCrear || []).length > 0 && (
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-[11px] tracking-widest uppercase text-green-400 font-bold mb-2">✨ Productos adicionales detectados</div>
                <div className="space-y-1">
                  {form.productosAdicionalesAutoCrear.map(p => (
                    <div key={p.id} className="bg-zinc-950 border border-green-800/50 p-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-bold">{p.nombre}</span>
                        <span className="text-zinc-500 ml-2">{p.cantidad} {p.unidad}</span>
                      </div>
                      <div className="text-green-400 font-bold">RD${p.precioVenta}/{p.unidad}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-900/20 border border-blue-800 text-blue-300 text-xs p-3">
              💡 <strong>Después de guardar</strong>, ve al módulo Sistemas para completar detalles de los sistemas nuevos (materiales, rendimientos, keywords, etc.).
            </div>

            <div className="flex gap-2">
              <button onClick={() => setMostrarRevision(false)} className="px-4 bg-zinc-800 text-zinc-400 text-xs font-bold uppercase py-3">Cancelar</button>
              <button
                onClick={() => {
                  setMostrarRevision(false);
                  setForm(f => ({ ...f, revisionConfirmada: true }));
                  // Disparar crear de nuevo
                  setTimeout(() => crear(), 50);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase py-3 flex items-center justify-center gap-2"
              >
                ✓ Confirmar y crear todo
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={onCancelar} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <h1 className="text-3xl font-black tracking-tight">Nuevo Proyecto</h1>
      {!extraido && (
        <div className="relative">
          <input type="file" accept="application/pdf" onChange={e => e.target.files[0] && procesarPDF(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" disabled={cargando} />
          <div className={`border-2 border-dashed p-8 text-center ${cargando ? 'border-red-600 bg-red-600/10' : 'border-zinc-700 hover:border-red-600'}`}>
            {cargando ? <div className="space-y-3"><Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto" /><div className="text-sm font-bold">Analizando con IA...</div></div> : <div className="space-y-2"><FileUp className="w-10 h-10 text-zinc-500 mx-auto" /><div className="text-sm font-bold">Sube la cotización en PDF</div></div>}
          </div>
        </div>
      )}
      {extraido && <div className="bg-green-900/20 border border-green-700 p-3 flex items-start gap-2"><Sparkles className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /><div className="flex-1"><div className="text-xs font-bold text-green-400">Extraído del PDF</div><div className="text-[11px] text-zinc-400 mt-1"><span className="font-mono">{extraido.numeroOrden}</span> · {formatRD(extraido.total)}</div></div><button onClick={() => setExtraido(null)} className="text-zinc-500"><X className="w-4 h-4" /></button></div>}
      {error && <div className="bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">{error}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3"><Campo label="Ref. Odoo *"><Input value={form.referenciaOdoo} onChange={v => setForm({ ...form, referenciaOdoo: v })} placeholder="Ej: ST-C5437" /></Campo><Campo label="Sistema (opcional)"><select value={form.sistema} onChange={e => {
          if (e.target.value === '__crear__') {
            const nombre = prompt('Nombre del nuevo sistema (podrás agregarle tareas desde Sistemas luego):');
            if (!nombre) return;
            const id = 's_' + Date.now();
            setForm({ ...form, sistema: id, sistemaAdHoc: { id, nombre: nombre.trim() } });
          } else {
            setForm({ ...form, sistema: e.target.value, sistemaAdHoc: null });
          }
        }} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white">
          <option value="">🔧 Por definir</option>
          {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          {form.sistemaAdHoc && <option value={form.sistemaAdHoc.id}>✨ {form.sistemaAdHoc.nombre} (nuevo)</option>}
          <option value="__crear__">+ Crear nuevo sistema...</option>
        </select></Campo></div>
        {/* v8.9.10: Selector de cliente */}
        <Campo label="Cliente">
          <div className="space-y-2">
            <select
              value={form.clienteId || ''}
              onChange={e => {
                const cliId = e.target.value;
                if (cliId) {
                  const cli = clientes.find(c => c.id === cliId);
                  const contsCliente = contactos.filter(ct => ct.clienteId === cliId);
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
              className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"
            >
              <option value="">— Seleccionar cliente o escribir abajo —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · RNC ${c.rnc}` : ''}</option>)}
            </select>
            <Input value={form.cliente} onChange={v => setForm({ ...form, cliente: v })} placeholder="O escribe nombre del cliente (se creará al guardar si no existe)" />
            {form.clienteId && (() => {
              const contsCliente = contactos.filter(ct => ct.clienteId === form.clienteId);
              if (contsCliente.length > 1) {
                return (
                  <select
                    value={form.contactoPrincipalId || ''}
                    onChange={e => {
                      const contId = e.target.value;
                      const cont = contactos.find(ct => ct.id === contId);
                      setForm({
                        ...form,
                        contactoPrincipalId: contId || null,
                        contactoClienteNombre: cont?.nombre || '',
                        contactoClienteTelefono: cont?.telefono || '',
                        contactoClienteEmail: cont?.email || '',
                      });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-white text-xs"
                  >
                    <option value="">— Seleccionar contacto —</option>
                    {contsCliente.map(ct => <option key={ct.id} value={ct.id}>{ct.esPrincipal ? '⭐ ' : ''}{ct.nombre}{ct.cargo ? ` · ${ct.cargo}` : ''}{ct.telefono ? ` · ${ct.telefono}` : ''}</option>)}
                  </select>
                );
              }
              return null;
            })()}
          </div>
        </Campo>
        <Campo label="Referencia del proyecto"><Input value={form.referenciaProyecto} onChange={v => setForm({ ...form, referenciaProyecto: v })} /></Campo>
        <Campo label="Nombre interno"><Input value={form.nombre} onChange={v => setForm({ ...form, nombre: v })} /></Campo>
        <div className="grid grid-cols-2 gap-3"><Campo label="Inicio (opcional — déjalo vacío si está por definir)"><Input type="date" value={form.fecha_inicio} onChange={v => setForm({ ...form, fecha_inicio: v })} /></Campo><Campo label="Entrega"><Input type="date" value={form.fecha_entrega} onChange={v => setForm({ ...form, fecha_entrega: v })} /></Campo></div>

        {/* v8.9.14: Estado inicial del proyecto */}
        <Campo label="¿Cuál es el estado actual del proyecto?">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'aprobado' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'aprobado' ? 'border-cyan-600 bg-cyan-600/10 text-cyan-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              📋 Aprobado<br /><span className="text-[9px] opacity-70 normal-case">Todavía no arranca</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'en_ejecucion' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'en_ejecucion' ? 'border-red-600 bg-red-600/10 text-red-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              🔨 En ejecución<br /><span className="text-[9px] opacity-70 normal-case">Ya empezamos</span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, estadoInicial: 'parado' })}
              className={`py-2 px-2 text-[10px] font-bold uppercase border-2 ${form.estadoInicial === 'parado' ? 'border-yellow-600 bg-yellow-600/10 text-yellow-400' : 'border-zinc-700 text-zinc-400'}`}
            >
              ⏸️ Parado<br /><span className="text-[9px] opacity-70 normal-case">Esperando algo</span>
            </button>
          </div>
        </Campo>
        <Campo label="Supervisor"><select value={form.supervisorId} onChange={e => setForm({ ...form, supervisorId: e.target.value })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></Campo>
        <Campo label="Maestro"><select value={form.maestroId} onChange={e => setForm({ ...form, maestroId: e.target.value, ayudantesIds: [] })} className="w-full bg-zinc-900 border-2 border-zinc-800 focus:border-red-600 outline-none px-4 py-3 text-white"><option value="">Seleccionar...</option>{maestros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
        {form.maestroId && ayudantesDisp.length > 0 && <Campo label="Ayudantes"><div className="space-y-1">{ayudantesDisp.map(a => <label key={a.id} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 cursor-pointer hover:border-red-600"><input type="checkbox" checked={form.ayudantesIds.includes(a.id)} onChange={e => { const n = e.target.checked ? [...form.ayudantesIds, a.id] : form.ayudantesIds.filter(x => x !== a.id); setForm({ ...form, ayudantesIds: n }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{a.nombre}</span></label>)}</div></Campo>}
        <div>
          <div className="flex justify-between items-center mb-2"><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold">Áreas</div><div className="text-xs text-zinc-500">{formatNum(totalM2)} m²</div></div>
          <div className="space-y-2">{form.areas.map((area, i) => {
            const sistemaArea = area.sistemaId || form.sistema;
            // v8.9.2: buscar en sistemas existentes O en sistemas nuevos a crear
            const sistemaAreaObj = sistemaArea ? sistemas[sistemaArea] : null;
            const sistemaNuevoObj = !sistemaAreaObj && sistemaArea ? (form.sistemasNuevosAutoCrear || []).find(s => s.tempId === sistemaArea) : null;
            const sistemaLabel = sistemaAreaObj?.nombre || sistemaNuevoObj?.nombre;
            const sistemaPrecio = sistemaAreaObj?.precio_m2 ?? sistemaNuevoObj?.precio_m2 ?? 0;
            return (
              <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 space-y-2">
                <div className="flex gap-2 items-center">
                  <Input value={area.nombre} onChange={v => { const n = [...form.areas]; n[i].nombre = v; setForm({ ...form, areas: n }); }} placeholder="Nombre del área" />
                  <div className="w-28"><Input type="number" value={area.m2} onChange={v => { const n = [...form.areas]; n[i].m2 = v; setForm({ ...form, areas: n }); }} placeholder="m²" /></div>
                  {form.areas.length > 1 && <button onClick={() => setForm({ ...form, areas: form.areas.filter((_, idx) => idx !== i) })} className="text-zinc-500 hover:text-red-400"><X className="w-4 h-4" /></button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Sistema:</span>
                  <select
                    value={area.sistemaId || ''}
                    onChange={e => { const n = [...form.areas]; n[i] = { ...n[i], sistemaId: e.target.value || null }; setForm({ ...form, areas: n }); }}
                    className="flex-1 bg-zinc-900 border border-zinc-800 px-2 py-1 text-white text-xs"
                  >
                    <option value="">🔧 Usar sistema del proyecto{form.sistema ? ` (${sistemas[form.sistema]?.nombre || ''})` : ''}</option>
                    {sistemasArray.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    {/* v8.9.2: sistemas nuevos pendientes de crear */}
                    {(form.sistemasNuevosAutoCrear || []).map(s => <option key={s.tempId} value={s.tempId}>⚠️ {s.nombre} (nuevo)</option>)}
                  </select>
                  {sistemaLabel && <span className="text-[10px] text-green-400">RD${sistemaPrecio}/m²</span>}
                </div>
                {/* v8.9.27: precio venta custom por área (NuevoProyecto ya es solo-admin por vista) */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-bold">Precio venta/m²:</span>
                  <div className="w-32">
                    <Input
                      type="number"
                      value={area.precioVentaM2 ?? ''}
                      onChange={v => {
                        const n = [...form.areas];
                        n[i] = { ...n[i], precioVentaM2: v === '' ? null : v };
                        setForm({ ...form, areas: n });
                      }}
                      placeholder={`${sistemaPrecio}`}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {area.precioVentaM2 !== undefined && area.precioVentaM2 !== null && area.precioVentaM2 !== '' ? (
                      <span className="text-yellow-400">✏️ custom · {formatRD(area.m2 * Number(area.precioVentaM2))}</span>
                    ) : (
                      <span>usa el del sistema · {formatRD((area.m2 || 0) * sistemaPrecio)}</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}</div>
          <button onClick={() => setForm({ ...form, areas: [...form.areas, { nombre: '', m2: '', sistemaId: null }] })} className="mt-2 text-xs text-red-500 flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar área</button>
          {sistemasDelProyectoDelForm.length > 1 && (
            <div className="mt-2 text-[10px] bg-blue-900/20 border border-blue-800 text-blue-300 p-2">
              💡 Este proyecto tiene <strong>{sistemasDelProyectoDelForm.length} sistemas distintos</strong> entre sus áreas.
            </div>
          )}
          {/* v8.9.1: avisos de auto-extracción desde PDF */}
          {(form.sistemasNuevosAutoCrear || []).length > 0 && (
            <div className="mt-2 text-[10px] bg-yellow-900/20 border border-yellow-800 text-yellow-300 p-2">
              ⚠️ Se crearán <strong>{form.sistemasNuevosAutoCrear.length} sistema{form.sistemasNuevosAutoCrear.length !== 1 ? 's' : ''} nuevo{form.sistemasNuevosAutoCrear.length !== 1 ? 's' : ''}</strong>: {form.sistemasNuevosAutoCrear.map(s => s.nombre).join(', ')}. Podrás ajustar sus tareas/materiales en el módulo de Sistemas después de guardar.
            </div>
          )}
          {(form.productosAdicionalesAutoCrear || []).length > 0 && (
            <div className="mt-2 text-[10px] bg-green-900/20 border border-green-800 text-green-300 p-2">
              ✨ Se agregarán <strong>{form.productosAdicionalesAutoCrear.length} producto{form.productosAdicionalesAutoCrear.length !== 1 ? 's' : ''} adicional{form.productosAdicionalesAutoCrear.length !== 1 ? 'es' : ''}</strong>: {form.productosAdicionalesAutoCrear.map(p => `${p.nombre} (${p.cantidad} ${p.unidad})`).join(' · ')}
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.dieta.habilitada} onChange={e => setForm({ ...form, dieta: { ...form.dieta, habilitada: e.target.checked } })} className="w-4 h-4 accent-red-600" /><div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold flex items-center gap-1"><Utensils className="w-3 h-3" /> Proyecto en el interior</div></label>
          {form.dieta.habilitada && <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-2"><Campo label="Tarifa día/persona"><Input type="number" value={form.dieta.tarifa_dia_persona} onChange={v => setForm({ ...form, dieta: { ...form.dieta, tarifa_dia_persona: v } })} /></Campo><Campo label="Días-hombre"><Input type="number" value={form.dieta.dias_hombre_presupuestados} onChange={v => setForm({ ...form, dieta: { ...form.dieta, dias_hombre_presupuestados: v } })} /></Campo></div>
            <Campo label="Personas"><div className="space-y-1">{[form.maestroId, ...form.ayudantesIds].filter(Boolean).map(pid => { const pe = getPersona(personal, pid); if (!pe) return null; return <label key={pid} className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 p-2 cursor-pointer"><input type="checkbox" checked={form.dieta.personasIds.includes(pid)} onChange={e => { const n = e.target.checked ? [...form.dieta.personasIds, pid] : form.dieta.personasIds.filter(x => x !== pid); setForm({ ...form, dieta: { ...form.dieta, personasIds: n } }); }} className="w-4 h-4 accent-red-600" /><span className="text-sm">{pe.nombre}</span></label>; })}</div></Campo>
          </div>}
        </div>
        <div className="flex gap-2 pt-4"><button onClick={onCancelar} className="px-6 bg-zinc-900 border-2 border-zinc-800 text-zinc-400 font-bold uppercase py-4">Cancelar</button>
          {(() => {
            const faltantes = [];
            if (!form.nombre) faltantes.push('nombre');
            if (!form.cliente) faltantes.push('cliente');
            if (!form.sistema) faltantes.push('sistema');
            if (form.areas.length === 0) faltantes.push('al menos un área');
            if (form.areas.some(a => !a.nombre || !a.m2)) faltantes.push('m² de todas las áreas');
            const puedeCrear = faltantes.length === 0;
            return (
              <div className="flex-1 flex flex-col gap-1">
                <button onClick={crear} disabled={!puedeCrear} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase py-4">Crear</button>
                {!puedeCrear && <div className="text-[10px] text-yellow-400 text-center">Falta: {faltantes.join(', ')}</div>}
                {puedeCrear && (!form.supervisorId || !form.maestroId) && <div className="text-[10px] text-zinc-500 text-center">💡 Puedes asignar supervisor/maestro después</div>}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MIS PROYECTOS (supervisor/maestro)
// ============================================================
