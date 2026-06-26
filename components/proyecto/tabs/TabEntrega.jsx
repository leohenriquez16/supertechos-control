'use client';

// v8.27.18+: Tab "Entrega" del proyecto — actas firmadas vía DocuSeal.
// v8.27.20 (Fase 1): una acta cubre VARIAS áreas; se ve qué áreas están
// entregadas (con fecha) vs pendientes; un contacto firma y otros van en copia;
// botón "Ver acta" para el preview del documento.

import React, { useState, useEffect } from 'react';
import { FileSignature, Plus, X, Send, Copy, ExternalLink, CheckCircle2, Clock, Eye, MessageCircle, Loader2 } from 'lucide-react';
import * as db from '../../../lib/db';

const STATUS_META = {
  borrador:  { label: 'Borrador', cls: 'bg-zinc-800 text-zinc-300 border-zinc-700', Icon: Clock },
  enviada:   { label: 'Enviada',  cls: 'bg-blue-900/40 text-blue-300 border-blue-700/60', Icon: Send },
  vista:     { label: 'Vista',    cls: 'bg-amber-900/40 text-amber-300 border-amber-700/60', Icon: Eye },
  firmada:   { label: 'Firmada',  cls: 'bg-green-900/40 text-green-300 border-green-700/60', Icon: CheckCircle2 },
  rechazada: { label: 'Rechazada',cls: 'bg-red-900/40 text-red-300 border-red-700/60', Icon: X },
  expirada:  { label: 'Expirada', cls: 'bg-zinc-800 text-zinc-500 border-zinc-700', Icon: Clock },
};
function EstadoBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.borrador; const Icon = m.Icon;
  return <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider border rounded-card px-1.5 py-0.5 ${m.cls}`}><Icon className="w-2.5 h-2.5" /> {m.label}</span>;
}
const TIPO_LABEL = { entrega_proyecto: 'Proyecto completo', entrega_area: 'Por área', cubicacion: 'Cubicación', carta_garantia: 'Carta de garantía' };
const fmtFecha = (s) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } };

// Áreas cubiertas por un acta (soporta el legacy area_id y el nuevo area_ids).
const areasDeActa = (a) => (a.areaIds && a.areaIds.length ? a.areaIds : (a.areaId ? [a.areaId] : []));

export default function TabEntrega({ proyecto, data, usuario, onRecargar }) {
  const [actas, setActas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try { setActas(await db.listarActas({ proyectoId: proyecto.id })); } catch (e) { console.warn('listarActas:', e?.message); }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [proyecto.id]);

  const areas = proyecto.areas || [];
  const areaNombre = (id) => areas.find(a => a.id === id)?.nombre || '—';
  const copiar = (txt) => { try { navigator.clipboard.writeText(txt); } catch {} };

  // Estado de entrega por área (de las actas de entrega)
  const entregaPorArea = {};
  actas.filter(a => a.tipo === 'entrega_area' || a.tipo === 'entrega_proyecto').forEach(a => {
    areasDeActa(a).forEach(aid => {
      if (!entregaPorArea[aid] || (a.status === 'firmada')) {
        entregaPorArea[aid] = { fecha: a.firmadaAt || a.enviadaAt, status: a.status };
      }
    });
  });
  const pendientes = areas.filter(a => !entregaPorArea[a.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-red-500" />
          <span className="text-sm font-bold text-white">Entregas y actas</span>
          <span className="text-[10px] text-zinc-500">{actas.length}</span>
        </div>
        <button onClick={() => setModal(true)} className="bg-red-600 hover:bg-red-700 text-white rounded-card px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nueva acta de entrega
        </button>
      </div>

      {/* Estado de áreas: entregadas vs pendientes */}
      {areas.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
          <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Áreas del proyecto · {areas.length - pendientes.length}/{areas.length} entregadas</div>
          <div className="flex flex-wrap gap-1.5">
            {areas.map(a => {
              const e = entregaPorArea[a.id];
              return (
                <span key={a.id} className={`inline-flex items-center gap-1 text-[10px] rounded-card px-2 py-1 border ${e ? 'bg-green-900/30 text-green-300 border-green-800' : 'bg-zinc-800/60 text-zinc-400 border-zinc-700'}`}>
                  {e ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {a.nombre}{e ? ` · ${fmtFecha(e.fecha)}` : ' · pendiente'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-zinc-500 text-xs py-4"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : actas.length === 0 ? (
        <div className="text-center text-zinc-600 text-xs py-8 border border-dashed border-zinc-800 rounded-card">Aún no hay actas. Crea la primera con el botón de arriba.</div>
      ) : (
        <div className="space-y-2">
          {actas.map(a => {
            const cubiertas = areasDeActa(a).map(areaNombre).filter(Boolean);
            return (
              <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{TIPO_LABEL[a.tipo] || a.tipo}</span>
                      {cubiertas.length > 0 && <span className="text-[10px] text-zinc-400">📍 {cubiertas.join(', ')}</span>}
                      <EstadoBadge status={a.status} />
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      {a.clienteNombre || 'Sin cliente'} · {a.clienteViaEnvio === 'whatsapp' ? '📱' : '✉️'}
                      {a.ccEmails?.length ? ` · copia a ${a.ccEmails.length}` : ''}
                      {' · '}📤 {fmtFecha(a.enviadaAt)}{a.firmadaAt ? ` · ✍️ ${fmtFecha(a.firmadaAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.docusealUrlFirmante && (
                      <>
                        <a href={a.docusealUrlFirmante} target="_blank" rel="noreferrer" title="Ver acta / preview" className="px-2 py-1 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Ver acta</a>
                        <button onClick={() => copiar(a.docusealUrlFirmante)} title="Copiar link" className="p-1.5 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-300"><Copy className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ModalNuevaActa proyecto={proyecto} usuario={usuario}
          contactos={(data?.contactos || []).filter(c => c.clienteId && c.clienteId === proyecto.clienteId)}
          pendientes={pendientes} entregaPorArea={entregaPorArea} areas={areas}
          onCerrar={() => setModal(false)}
          onCreada={() => { setModal(false); cargar(); onRecargar?.(); }} />
      )}
    </div>
  );
}

function ModalNuevaActa({ proyecto, usuario, contactos = [], pendientes = [], entregaPorArea = {}, areas = [], onCerrar, onCreada }) {
  const [tipo, setTipo] = useState('entrega_proyecto');
  const [areaIdsSel, setAreaIdsSel] = useState([]);
  const [clienteNombre, setClienteNombre] = useState(proyecto.cliente || '');
  const [canal, setCanal] = useState('email');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contactoId, setContactoId] = useState('');
  const [ccIds, setCcIds] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const elegirContacto = (id) => {
    setContactoId(id);
    const c = contactos.find(x => x.id === id);
    if (!c) return;
    setClienteNombre(c.nombre || '');
    if (c.email) setEmail(c.email);
    const tel = c.whatsapp || c.telefono || '';
    if (tel) setTelefono(tel);
    setCanal(c.whatsapp ? 'whatsapp' : (c.email ? 'email' : 'whatsapp'));
  };
  const toggleArea = (id) => setAreaIdsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleCc = (id) => setCcIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  // Muchos contactos traen la EMPRESA en "nombre"; lo que identifica a la persona
  // es el cargo y el email. Etiqueta legible para distinguirlos.
  const etiqCto = (c) => c ? (c.cargo ? `${c.cargo} · ${c.email || c.whatsapp || c.telefono || ''}`.trim().replace(/·\s*$/, '') : (c.email || c.nombre)) : '';
  const ccEmails = ccIds.map(id => contactos.find(c => c.id === id)?.email).filter(Boolean);
  const ccNombres = ccIds.map(id => etiqCto(contactos.find(c => c.id === id))).filter(Boolean);

  const generar = async () => {
    setError('');
    if (!clienteNombre.trim()) { setError('Falta el nombre de quien firma.'); return; }
    if (canal === 'email' && !email.trim()) { setError('Falta el email de quien firma.'); return; }
    if (canal === 'whatsapp' && !telefono.trim()) { setError('Falta el teléfono de quien firma.'); return; }
    if (tipo === 'entrega_area' && areaIdsSel.length === 0) { setError('Selecciona al menos un área a entregar.'); return; }
    setEnviando(true);
    try {
      const nombresAreas = (tipo === 'entrega_area' ? areaIdsSel : areas.map(a => a.id))
        .map(id => areas.find(a => a.id === id)?.nombre).filter(Boolean).join(', ');
      const { urlFirmante } = await db.crearActaProyecto({
        tipo,
        proyectoId: proyecto.id,
        areaIds: tipo === 'entrega_area' ? areaIdsSel : [],
        ccEmails,
        empresa: proyecto.empresaEjecutora || null,
        cliente: { nombre: clienteNombre.trim(), email: email.trim() || null, telefono: telefono.trim() || null, viaEnvio: canal },
        snapshotDatos: { referenciaOdoo: proyecto.referenciaOdoo || '', proyecto: proyecto.nombre || proyecto.cliente || '', areas: nombresAreas, ccNombres },
        generadaPorId: usuario.id,
        docusealValues: {
          cliente: clienteNombre.trim(),
          fecha: new Date().toLocaleDateString('es-DO'),
          ref_cotizacion: proyecto.referenciaOdoo || '',
          trabajo: proyecto.nombre || '',
          ubicacion: proyecto.ubicacionDireccionTexto || '',
          area: nombresAreas,
        },
      });
      setResultado({ urlFirmante, canal, telefono: telefono.trim(), ccNombres });
    } catch (e) { setError(e?.message || 'No se pudo crear el acta.'); }
    finally { setEnviando(false); }
  };

  const waLink = () => {
    const d = (telefono || '').replace(/\D/g, '');
    const num = d.length === 10 ? '1' + d : d;
    const msg = `Hola, le compartimos el acta de entrega de Super Techos para su firma: ${resultado?.urlFirmante || ''}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  };

  const inpCls = 'w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm placeholder-zinc-600 transition-colors';
  const labCls = 'text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCerrar}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-md max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <span className="text-sm font-bold text-white">Nueva acta de entrega</span>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {resultado ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400 text-sm font-bold"><CheckCircle2 className="w-5 h-5" /> Acta creada y enviada</div>
            <p className="text-xs text-zinc-400">{resultado.canal === 'email' ? 'DocuSeal le envió el link de firma al correo.' : 'Comparte el link por WhatsApp con el botón de abajo.'}{resultado.ccNombres?.length ? ` Copia a: ${resultado.ccNombres.join(', ')}.` : ''}</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-2 text-[11px] text-zinc-300 break-all">{resultado.urlFirmante}</div>
            <div className="flex gap-2">
              <button onClick={() => { try { navigator.clipboard.writeText(resultado.urlFirmante); } catch {} }} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-card px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar link</button>
              {resultado.canal === 'whatsapp' && <a href={waLink()} target="_blank" rel="noreferrer" className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-card px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
            </div>
            <button onClick={onCreada} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-card px-3 py-2 text-xs font-bold mt-1">Listo</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <div className={labCls}>Tipo de entrega</div>
              <div className="grid grid-cols-2 gap-2">
                {[['entrega_proyecto', 'Proyecto completo'], ['entrega_area', 'Por área / edificio']].map(([v, l]) => (
                  <button key={v} onClick={() => setTipo(v)} className={`p-2 text-xs font-bold border-2 rounded-card ${tipo === v ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{l}</button>
                ))}
              </div>
            </div>

            {tipo === 'entrega_area' && (
              <div>
                <div className={labCls}>Áreas a entregar (elige una o varias)</div>
                {areas.length === 0 ? <div className="text-[11px] text-zinc-500">El proyecto no tiene áreas.</div> : (
                  <div className="space-y-1 max-h-44 overflow-auto">
                    {areas.map(a => {
                      const ent = entregaPorArea[a.id];
                      const sel = areaIdsSel.includes(a.id);
                      return (
                        <button key={a.id} disabled={!!ent} onClick={() => toggleArea(a.id)}
                          className={`w-full flex items-center justify-between text-left px-2.5 py-2 rounded-card border text-xs ${ent ? 'bg-green-900/20 border-green-900 text-green-300/70 cursor-not-allowed' : sel ? 'bg-red-600/15 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'}`}>
                          <span>{a.nombre}</span>
                          <span className="text-[10px]">{ent ? `✓ entregada · ${fmtFecha(ent.fecha)}` : sel ? '● seleccionada' : 'pendiente'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {contactos.length > 0 && (
              <div>
                <div className={labCls}>Quién firma (contacto del cliente)</div>
                <select value={contactoId} onChange={e => elegirContacto(e.target.value)} className={inpCls}>
                  <option value="">— Escribir manual —</option>
                  {contactos.map(c => <option key={c.id} value={c.id}>{c.cargo ? `${c.cargo} — ` : ''}{c.email || c.whatsapp || c.telefono || c.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <div className={labCls}>Nombre de quien firma</div>
              <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre" className={inpCls} />
            </div>

            <div>
              <div className={labCls}>Enviar el link por</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[['email', '✉️ Email'], ['whatsapp', '📱 WhatsApp']].map(([v, l]) => (
                  <button key={v} onClick={() => setCanal(v)} className={`p-2 text-xs font-bold border-2 rounded-card ${canal === v ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{l}</button>
                ))}
              </div>
              {canal === 'email'
                ? <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@cliente.com" type="email" className={inpCls} />
                : <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="809-000-0000" className={inpCls} />}
            </div>

            {contactos.filter(c => c.id !== contactoId && c.email).length > 0 && (
              <div>
                <div className={labCls}>Copia a (opcional · reciben aviso, no firman)</div>
                <div className="flex flex-wrap gap-1.5">
                  {contactos.filter(c => c.id !== contactoId && c.email).map(c => (
                    <button key={c.id} title={`${c.nombre}${c.email ? ' · ' + c.email : ''}`} onClick={() => toggleCc(c.id)} className={`text-[11px] rounded-card px-2 py-1 border ${ccIds.includes(c.id) ? 'bg-blue-600/20 border-blue-600 text-blue-200' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{etiqCto(c)}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-2 text-[11px] text-zinc-400">
              <b className="text-zinc-300">Se enviará a:</b> {clienteNombre || '—'} <span className="text-zinc-600">(firma)</span>
              {ccNombres.length > 0 && <> · copia: {ccNombres.join(', ')}</>}
            </div>

            {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded-card p-2">{error}</div>}

            <button onClick={generar} disabled={enviando} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-card px-3 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2">
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Send className="w-4 h-4" /> Generar y enviar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
