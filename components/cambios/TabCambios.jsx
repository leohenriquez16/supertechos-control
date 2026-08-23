'use client';

// v8.30.0: Tab "Cambios" del proyecto — Órdenes de Cambio con constancia.
// Resuelve el caso clásico: se cotizó 150 m² y en campo son 180, o el cliente va
// abriendo etapas (La Sirena) y el ERP se queda con la volumetría original.
// Flujo: BORRADOR → ENVIADA al cliente por escrito (correo desde aquí, o se marca
// enviada si fue por WhatsApp) → APROBADA por el cliente (queda quién y por qué vía)
// → APLICADA: ajusta las áreas y el valor del proyecto, y crea la tarea de ajustar
// la cotización en Odoo. Nada de volumen extra sin papel.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, Trash2, FileText, Send, CheckCircle2, Hammer } from 'lucide-react';
import * as db from '../../lib/db';
import { formatRD, formatFechaCorta } from '../../lib/helpers/formato';

const ESTADOS_OC = {
  borrador:         { label: 'Borrador', color: 'bg-zinc-700/40 text-zinc-300' },
  enviada:          { label: 'Enviada al cliente', color: 'bg-blue-600/20 text-blue-400' },
  aprobada_cliente: { label: 'Aprobada por cliente ✓', color: 'bg-purple-600/20 text-purple-400' },
  aplicada:         { label: 'Aplicada al proyecto ✓', color: 'bg-green-600/20 text-green-400' },
  rechazada:        { label: 'Rechazada', color: 'bg-red-600/20 text-red-400' },
};
const TIPOS = {
  aumento: 'Aumento de volumen', nueva_area: 'Área nueva', etapa: 'Etapa adicional', otro: 'Otro cambio',
};

const lineaVacia = () => ({ areaId: '', nombreArea: '', m2: '', precioM2: '', monto: 0 });

export default function TabCambios({ usuario, proyecto, data, esAdmin, onRecargar }) {
  const [ocs, setOcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ tipo: 'aumento', motivo: '', lineas: [lineaVacia()] });
  const [modalEnvio, setModalEnvio] = useState(null);   // { oc, correo }
  const [modalAprobo, setModalAprobo] = useState(null); // { oc, nombre, via, nota }
  const [procesando, setProcesando] = useState(null);

  const recargar = async () => {
    setLoading(true);
    try { setOcs(await db.listarOrdenesCambio(proyecto.id)); }
    catch (e) { console.warn('OCs:', e?.message); }
    setLoading(false);
  };
  useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [proyecto.id]);

  const areas = proyecto.areas || [];
  const precioDeArea = (areaId) => {
    const a = areas.find(x => x.id === areaId);
    if (!a) return '';
    if (Number(a.precioVentaM2) > 0) return Number(a.precioVentaM2);
    const sis = data.sistemas?.[a.sistemaId || proyecto.sistema];
    return Number(sis?.precio_m2) || '';
  };

  const setLinea = (i, campo, v) => {
    const ls = form.lineas.map((l, n) => {
      if (n !== i) return l;
      const next = { ...l, [campo]: v };
      if (campo === 'areaId' && v) {
        const a = areas.find(x => x.id === v);
        next.nombreArea = a?.nombre || '';
        if (!next.precioM2) next.precioM2 = precioDeArea(v);
      }
      next.monto = (Number(next.m2) || 0) * (Number(next.precioM2) || 0);
      return next;
    });
    setForm({ ...form, lineas: ls });
  };
  const totalForm = useMemo(() => form.lineas.reduce((s, l) => s + (Number(l.m2) || 0) * (Number(l.precioM2) || 0), 0), [form.lineas]);

  const guardarOC = async () => {
    const lineas = form.lineas
      .filter(l => (Number(l.m2) || 0) > 0 && (l.areaId || (l.nombreArea || '').trim()))
      .map(l => ({
        areaId: l.areaId || null,
        nombreArea: l.areaId ? (areas.find(a => a.id === l.areaId)?.nombre || l.nombreArea) : l.nombreArea.trim(),
        m2: Number(l.m2), precioM2: Number(l.precioM2) || 0,
        sistemaId: l.areaId ? (areas.find(a => a.id === l.areaId)?.sistemaId || null) : null,
        monto: (Number(l.m2) || 0) * (Number(l.precioM2) || 0),
      }));
    if (lineas.length === 0) { alert('Agrega al menos una línea con m² y área.'); return; }
    setGuardando(true);
    try {
      await db.crearOrdenCambio({
        proyectoId: proyecto.id, tipo: form.tipo, motivo: form.motivo,
        lineas, montoTotal: lineas.reduce((s, l) => s + l.monto, 0),
        creadoPorId: usuario.id, creadoPorNombre: usuario.nombre,
      });
      setCreando(false); setForm({ tipo: 'aumento', motivo: '', lineas: [lineaVacia()] });
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setGuardando(false);
  };

  // --- Correo formal al cliente ---
  const contactoEmailSugerido = () => {
    const cli = (data.clientes || []).find(c => (c.nombre || '').trim().toLowerCase() === (proyecto.cliente || '').trim().toLowerCase());
    const cts = (data.contactos || []).filter(c => c.clienteId === cli?.id);
    return (cts.find(c => c.esPrincipal) || cts[0])?.email || '';
  };
  const htmlOC = (oc) => `
    <div style="font-family:Arial,sans-serif;max-width:620px">
      <h2 style="color:#D71920;margin-bottom:4px">Orden de Cambio No. ${oc.numero}</h2>
      <p style="margin:2px 0"><b>Proyecto:</b> ${proyecto.cliente || proyecto.nombre || ''} ${proyecto.referenciaOdoo ? '· Ref. ' + proyecto.referenciaOdoo : ''}</p>
      <p style="margin:2px 0 12px"><b>Tipo:</b> ${TIPOS[oc.tipo] || oc.tipo}${oc.motivo ? ' — ' + oc.motivo : ''}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f3f3f3"><th style="border:1px solid #ccc;padding:6px;text-align:left">Área</th><th style="border:1px solid #ccc;padding:6px;text-align:right">m² adicionales</th><th style="border:1px solid #ccc;padding:6px;text-align:right">Precio/m²</th><th style="border:1px solid #ccc;padding:6px;text-align:right">Monto</th></tr>
        ${(oc.lineas || []).map(l => `<tr><td style="border:1px solid #ccc;padding:6px">${l.nombreArea}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">${l.m2}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">RD$ ${Number(l.precioM2).toLocaleString()}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">RD$ ${Number(l.monto).toLocaleString()}</td></tr>`).join('')}
        <tr><td colspan="3" style="border:1px solid #ccc;padding:6px;text-align:right"><b>Total adicional (sin ITBIS)</b></td><td style="border:1px solid #ccc;padding:6px;text-align:right"><b>RD$ ${Number(oc.montoTotal).toLocaleString()}</b></td></tr>
      </table>
      <p style="font-size:13px;margin-top:14px">Agradecemos confirmar su aprobación respondiendo este correo para proceder con los trabajos adicionales descritos. Este monto se suma al valor de la cotización original.</p>
      <p style="font-size:13px;color:#666">LH Super Techos, SRL</p>
    </div>`;

  const enviarCorreo = async () => {
    const { oc, correo } = modalEnvio;
    const emails = String(correo || '').split(/[,;\s]+/).filter(Boolean);
    if (emails.length === 0) { alert('Escribe el correo del cliente.'); return; }
    setProcesando(oc.id);
    try {
      await db.enviarCorreoReporte(emails,
        `Orden de Cambio No. ${oc.numero} — ${proyecto.cliente || proyecto.nombre} (${proyecto.referenciaOdoo || 'Super Techos'})`,
        htmlOC(oc));
      await db.actualizarOrdenCambio(oc.id, { estado: 'enviada', enviadaA: emails.join(', ') });
      setModalEnvio(null);
      await recargar();
    } catch (e) { alert('Error enviando: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const marcarEnviadaManual = async (oc) => {
    const via = prompt('¿Por dónde se le envió al cliente? (ej: WhatsApp a Juan Pérez)');
    if (!via) return;
    await db.actualizarOrdenCambio(oc.id, { estado: 'enviada', enviadaA: via });
    await recargar();
  };

  const registrarAprobacion = async () => {
    const { oc, nombre, via, nota } = modalAprobo;
    if (!(nombre || '').trim()) { alert('¿Quién aprobó del lado del cliente?'); return; }
    setProcesando(oc.id);
    try {
      await db.actualizarOrdenCambio(oc.id, { estado: 'aprobada_cliente', aprobadaPorCliente: nombre.trim(), aprobadaVia: via, aprobadaNota: nota || '' });
      setModalAprobo(null);
      await recargar();
    } catch (e) { alert('Error: ' + (e?.message || e)); }
    setProcesando(null);
  };

  // --- Aplicar: ajusta áreas + valor del proyecto y crea la tarea de Odoo ---
  const aplicar = async (oc) => {
    if (!confirm(`Aplicar OC-${oc.numero}: suma ${oc.lineas.reduce((s, l) => s + l.m2, 0)} m² y ${formatRD(oc.montoTotal)} al proyecto. ¿Seguro?`)) return;
    setProcesando(oc.id);
    try {
      const nuevasAreas = [...(proyecto.areas || [])];
      for (const l of oc.lineas) {
        if (l.areaId) {
          const i = nuevasAreas.findIndex(a => a.id === l.areaId);
          if (i >= 0) nuevasAreas[i] = { ...nuevasAreas[i], m2: (Number(nuevasAreas[i].m2) || 0) + l.m2 };
        } else {
          nuevasAreas.push({
            id: 'a_' + Date.now() + Math.random().toString(36).slice(2, 5),
            nombre: `${l.nombreArea} (OC-${oc.numero})`, m2: l.m2,
            sistemaId: l.sistemaId || proyecto.sistema || null,
            ...(l.precioM2 > 0 ? { precioVentaM2: l.precioM2 } : {}),
          });
        }
      }
      await db.actualizarProyecto({
        ...proyecto, areas: nuevasAreas,
        valorCotizacion: (Number(proyecto.valorCotizacion) || 0) + oc.montoTotal,
      });
      await db.actualizarOrdenCambio(oc.id, { estado: 'aplicada', aplicadaPorId: usuario.id });
      // Tarea para ajustar la cotización en Odoo (Lily / facturación)
      const lily = (data.personal || []).find(p => (p.roles || []).includes('facturas'));
      try {
        await db.crearTarea({
          id: 't_' + Date.now() + Math.random(), proyectoId: proyecto.id, tipo: 'ajustar_cotizacion_odoo',
          titulo: `Ajustar cotización en Odoo: +${formatRD(oc.montoTotal)} (OC-${oc.numero} · ${proyecto.referenciaOdoo || proyecto.cliente})`,
          descripcion: `Orden de cambio aprobada por ${oc.aprobadaPorCliente} (${oc.aprobadaVia}). Agregar las líneas adicionales a la cotización ${proyecto.referenciaOdoo || ''} en Odoo: ${oc.lineas.map(l => `${l.nombreArea} +${l.m2} m² @ RD$${l.precioM2}`).join('; ')}.`,
          asignadaAId: lily?.id || null, asignadaANombre: lily?.nombre || null,
        });
      } catch (e) { console.warn('Tarea Odoo no creada:', e?.message); }
      await recargar();
      onRecargar?.();
      alert(`OC-${oc.numero} aplicada ✓ — áreas y valor actualizados. Se creó la tarea para ajustar la cotización en Odoo.`);
    } catch (e) { alert('Error aplicando: ' + (e?.message || e)); }
    setProcesando(null);
  };

  const rechazar = async (oc) => {
    if (!confirm('¿Marcar rechazada por el cliente?')) return;
    await db.actualizarOrdenCambio(oc.id, { estado: 'rechazada' });
    await recargar();
  };
  const borrarBorrador = async (oc) => {
    if (!confirm('¿Eliminar este borrador?')) return;
    await db.eliminarOrdenCambio(oc.id);
    await recargar();
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-zinc-500">
        Todo aumento de volumen o cambio de alcance necesita su Orden de Cambio: por escrito al cliente, aprobada y aplicada. Sin OC no se ejecuta volumen extra.
      </div>

      {!creando ? (
        <button onClick={() => setCreando(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase py-3 flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nueva orden de cambio
        </button>
      ) : (
        <div className="bg-zinc-900 border-2 border-red-600 rounded-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-widest uppercase font-bold text-red-500">Nueva orden de cambio</div>
            <button onClick={() => setCreando(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm">
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Motivo (ej: en campo el área real es mayor)" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm min-w-[180px]" />
          </div>
          {form.lineas.map((l, i) => (
            <div key={i} className="flex gap-1.5 items-center flex-wrap">
              <select value={l.areaId} onChange={e => setLinea(i, 'areaId', e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-[130px]">
                <option value="">➕ Área nueva…</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.nombre} ({a.m2} m²)</option>)}
              </select>
              {!l.areaId && <input value={l.nombreArea} onChange={e => setLinea(i, 'nombreArea', e.target.value)} placeholder="Nombre del área nueva" className="flex-1 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-xs min-w-[120px]" />}
              <input type="number" value={l.m2} onChange={e => setLinea(i, 'm2', e.target.value)} placeholder="m²" className="w-20 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
              <input type="number" value={l.precioM2} onChange={e => setLinea(i, 'precioM2', e.target.value)} placeholder="RD$/m²" className="w-24 bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-xs" />
              <span className="text-xs text-green-400 font-bold w-24 text-right">{formatRD((Number(l.m2) || 0) * (Number(l.precioM2) || 0))}</span>
              {form.lineas.length > 1 && <button onClick={() => setForm({ ...form, lineas: form.lineas.filter((_, n) => n !== i) })} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setForm({ ...form, lineas: [...form.lineas, lineaVacia()] })} className="text-xs text-blue-400 hover:text-blue-300 font-bold">+ Otra línea</button>
            <div className="text-sm font-black text-green-400">Total: {formatRD(totalForm)}</div>
          </div>
          <button onClick={guardarOC} disabled={guardando} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 flex items-center justify-center gap-1.5">
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Crear orden de cambio
          </button>
        </div>
      )}

      {ocs.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-5 text-center text-zinc-500 text-sm">Sin órdenes de cambio en esta obra.</div>
      ) : ocs.map(oc => {
        const est = ESTADOS_OC[oc.estado] || ESTADOS_OC.borrador;
        return (
          <div key={oc.id} className="bg-zinc-950 border border-zinc-800 rounded-card p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-black text-sm">OC-{oc.numero}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-card ${est.color}`}>{est.label}</span>
                <span className="text-[10px] text-zinc-500">{TIPOS[oc.tipo] || oc.tipo} · {formatFechaCorta((oc.createdAt || '').slice(0, 10))} · {oc.creadoPorNombre}</span>
              </div>
              <span className="font-black text-green-400">{formatRD(oc.montoTotal)}</span>
            </div>
            {oc.motivo && <div className="text-[11px] text-zinc-400">📝 {oc.motivo}</div>}
            <div className="space-y-0.5">
              {oc.lineas.map((l, i) => (
                <div key={i} className="text-xs text-zinc-300">• {l.nombreArea}: <b>+{l.m2} m²</b> @ {formatRD(l.precioM2)}/m² = {formatRD(l.monto)}</div>
              ))}
            </div>
            {oc.enviadaA && <div className="text-[10px] text-zinc-500">📤 Enviada a: {oc.enviadaA} · {formatFechaCorta((oc.enviadaAt || '').slice(0, 10))}</div>}
            {oc.aprobadaPorCliente && <div className="text-[10px] text-purple-400">✓ Aprobó: {oc.aprobadaPorCliente} ({oc.aprobadaVia}){oc.aprobadaNota ? ` — ${oc.aprobadaNota}` : ''}</div>}

            <div className="flex gap-1.5 flex-wrap pt-1">
              {oc.estado === 'borrador' && (<>
                <button onClick={() => setModalEnvio({ oc, correo: contactoEmailSugerido() })} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card flex items-center gap-1"><Send className="w-3 h-3" /> Enviar por correo</button>
                <button onClick={() => marcarEnviadaManual(oc)} className="border border-zinc-700 hover:border-blue-500 text-zinc-300 text-[10px] font-black uppercase px-3 py-2 rounded-card">Se envió por otra vía</button>
                <button onClick={() => borrarBorrador(oc)} className="text-zinc-600 hover:text-red-400 text-[10px] font-bold uppercase px-2">Eliminar</button>
              </>)}
              {oc.estado === 'enviada' && (<>
                <button onClick={() => setModalAprobo({ oc, nombre: '', via: 'correo', nota: '' })} className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Cliente aprobó</button>
                <button onClick={() => rechazar(oc)} className="border border-zinc-700 hover:border-red-500 text-zinc-400 text-[10px] font-black uppercase px-3 py-2 rounded-card">Rechazada</button>
              </>)}
              {oc.estado === 'aprobada_cliente' && esAdmin && (
                <button onClick={() => aplicar(oc)} disabled={procesando === oc.id} className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white text-[10px] font-black uppercase px-3 py-2 rounded-card flex items-center gap-1">
                  {procesando === oc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />} Aplicar al proyecto
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal: enviar por correo */}
      {modalEnvio && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModalEnvio(null)}>
          <div className="bg-zinc-900 border-2 border-blue-600 rounded-card p-4 w-full max-w-md space-y-2" onClick={e => e.stopPropagation()}>
            <div className="text-[11px] tracking-widest uppercase font-bold text-blue-400">Enviar OC-{modalEnvio.oc.numero} al cliente</div>
            <input value={modalEnvio.correo} onChange={e => setModalEnvio({ ...modalEnvio, correo: e.target.value })} placeholder="correo@cliente.com (varios con coma)" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <div className="text-[10px] text-zinc-500">Va un correo formal con la tabla de áreas, m², precios y el total adicional, pidiendo confirmación por escrito.</div>
            <div className="flex gap-2">
              <button onClick={enviarCorreo} disabled={procesando === modalEnvio.oc.id} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-black uppercase py-2.5 rounded-card">{procesando ? 'Enviando…' : 'Enviar'}</button>
              <button onClick={() => setModalEnvio(null)} className="text-xs text-zinc-400 uppercase font-bold px-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: registrar aprobación del cliente */}
      {modalAprobo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModalAprobo(null)}>
          <div className="bg-zinc-900 border-2 border-purple-600 rounded-card p-4 w-full max-w-md space-y-2" onClick={e => e.stopPropagation()}>
            <div className="text-[11px] tracking-widest uppercase font-bold text-purple-400">Constancia de aprobación · OC-{modalAprobo.oc.numero}</div>
            <input value={modalAprobo.nombre} onChange={e => setModalAprobo({ ...modalAprobo, nombre: e.target.value })} placeholder="¿Quién aprobó? (nombre y cargo del cliente)" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <select value={modalAprobo.via} onChange={e => setModalAprobo({ ...modalAprobo, via: e.target.value })} className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm">
              <option value="correo">Respondió el correo</option>
              <option value="whatsapp">Confirmó por WhatsApp</option>
              <option value="firma">Firmó el documento</option>
              <option value="orden_compra">Emitió orden de compra</option>
            </select>
            <input value={modalAprobo.nota} onChange={e => setModalAprobo({ ...modalAprobo, nota: e.target.value })} placeholder="Nota (opcional: # de OC del cliente, fecha del correo…)" className="w-full bg-zinc-950 border border-zinc-700 rounded-card px-2 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={registrarAprobacion} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase py-2.5 rounded-card">Registrar aprobación</button>
              <button onClick={() => setModalAprobo(null)} className="text-xs text-zinc-400 uppercase font-bold px-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
