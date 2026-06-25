'use client';

// v8.27.18: Tab "Entrega" del proyecto — actas de entrega firmadas vía DocuSeal.
// El cliente recibe un link (email/WhatsApp), firma en su celular y queda el PDF.
// Soporta entrega del proyecto completo y por área/edificio (entregas parciales).

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
  const m = STATUS_META[status] || STATUS_META.borrador;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider border rounded-card px-1.5 py-0.5 ${m.cls}`}>
      <Icon className="w-2.5 h-2.5" /> {m.label}
    </span>
  );
}

const TIPO_LABEL = { entrega_proyecto: 'Proyecto completo', entrega_area: 'Por área', cubicacion: 'Cubicación', carta_garantia: 'Carta de garantía' };

export default function TabEntrega({ proyecto, data, usuario, onRecargar }) {
  const [actas, setActas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try { setActas(await db.listarActas({ proyectoId: proyecto.id })); }
    catch (e) { console.warn('listarActas:', e?.message); }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [proyecto.id]);

  const copiar = (txt) => { try { navigator.clipboard.writeText(txt); } catch {} };
  const areaNombre = (areaId) => (proyecto.areas || []).find(a => a.id === areaId)?.nombre || '—';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-red-500" />
          <span className="text-sm font-bold text-white">Actas de entrega</span>
          <span className="text-[10px] text-zinc-500">{actas.length}</span>
        </div>
        <button onClick={() => setModal(true)}
          className="bg-red-600 hover:bg-red-700 text-white rounded-card px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nueva acta de entrega
        </button>
      </div>

      <p className="text-[11px] text-zinc-500">
        El cliente recibe un link por email o WhatsApp, firma en su celular y queda el PDF firmado. Las entregas por área permiten entregar un edificio aunque el proyecto cierre después.
      </p>

      {cargando ? (
        <div className="flex items-center gap-2 text-zinc-500 text-xs py-4"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : actas.length === 0 ? (
        <div className="text-center text-zinc-600 text-xs py-8 border border-dashed border-zinc-800 rounded-card">
          Aún no hay actas de entrega. Crea la primera con el botón de arriba.
        </div>
      ) : (
        <div className="space-y-2">
          {actas.map(a => (
            <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{TIPO_LABEL[a.tipo] || a.tipo}</span>
                    {a.areaId && <span className="text-[10px] text-zinc-400">📍 {areaNombre(a.areaId)}</span>}
                    <EstadoBadge status={a.status} />
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{a.clienteNombre || 'Sin cliente'} · {a.clienteViaEnvio === 'whatsapp' ? '📱 WhatsApp' : '✉️ Email'}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.docusealUrlFirmante && (
                    <>
                      <button onClick={() => copiar(a.docusealUrlFirmante)} title="Copiar link de firma"
                        className="p-1.5 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-300"><Copy className="w-3.5 h-3.5" /></button>
                      <a href={a.docusealUrlFirmante} target="_blank" rel="noreferrer" title="Abrir link de firma"
                        className="p-1.5 rounded-card bg-zinc-800 hover:bg-zinc-700 text-zinc-300"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalNuevaActa proyecto={proyecto} usuario={usuario}
          contactos={(data?.contactos || []).filter(c => c.clienteId && c.clienteId === proyecto.clienteId)}
          onCerrar={() => setModal(false)}
          onCreada={() => { setModal(false); cargar(); onRecargar?.(); }} />
      )}
    </div>
  );
}

function ModalNuevaActa({ proyecto, usuario, contactos = [], onCerrar, onCreada }) {
  const [tipo, setTipo] = useState('entrega_proyecto');
  const [areaId, setAreaId] = useState((proyecto.areas || [])[0]?.id || '');
  const [clienteNombre, setClienteNombre] = useState(proyecto.cliente || '');
  const [canal, setCanal] = useState('email');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contactoId, setContactoId] = useState('');

  // Al elegir un contacto del cliente, se autollenan nombre + email/teléfono y el canal.
  const elegirContacto = (id) => {
    setContactoId(id);
    const c = contactos.find(x => x.id === id);
    if (!c) return;
    setClienteNombre(c.nombre || '');
    if (c.email) setEmail(c.email);
    const tel = c.whatsapp || c.telefono || '';
    if (tel) setTelefono(tel);
    setCanal(c.whatsapp ? 'whatsapp' : (c.email ? 'email' : (tel ? 'whatsapp' : 'email')));
  };
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const generar = async () => {
    setError('');
    if (!clienteNombre.trim()) { setError('Falta el nombre del cliente.'); return; }
    if (canal === 'email' && !email.trim()) { setError('Falta el email del cliente.'); return; }
    if (canal === 'whatsapp' && !telefono.trim()) { setError('Falta el teléfono del cliente.'); return; }
    setEnviando(true);
    try {
      const areaNom = (proyecto.areas || []).find(a => a.id === areaId)?.nombre || '';
      const { urlFirmante } = await db.crearActaProyecto({
        tipo,
        proyectoId: proyecto.id,
        areaId: tipo === 'entrega_area' ? areaId : null,
        empresa: proyecto.empresaEjecutora || null,
        cliente: { nombre: clienteNombre.trim(), email: email.trim() || null, telefono: telefono.trim() || null, viaEnvio: canal },
        snapshotDatos: { referenciaOdoo: proyecto.referenciaOdoo || '', proyecto: proyecto.nombre || proyecto.cliente || '', area: areaNom },
        generadaPorId: usuario.id,
        docusealValues: {
          cliente: clienteNombre.trim(),
          fecha: new Date().toLocaleDateString('es-DO'),
          ref_cotizacion: proyecto.referenciaOdoo || '',
          trabajo: proyecto.nombre || '',
          ubicacion: proyecto.ubicacionDireccionTexto || areaNom || '',
        },
      });
      setResultado({ urlFirmante, canal, telefono: telefono.trim() });
    } catch (e) {
      setError(e?.message || 'No se pudo crear el acta.');
    } finally {
      setEnviando(false);
    }
  };

  const waLink = (() => {
    const d = (telefono || '').replace(/\D/g, '');
    const num = d.length === 10 ? '1' + d : d; // RD: anteponer 1 si faltó
    const msg = `Hola, le compartimos el acta de entrega de Super Techos para su firma: ${resultado?.urlFirmante || ''}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  });

  const inpCls = 'w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2 text-white text-sm placeholder-zinc-600 transition-colors';
  const labCls = 'text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCerrar}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-md max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950">
          <span className="text-sm font-bold text-white">Nueva acta de entrega</span>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {resultado ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400 text-sm font-bold"><CheckCircle2 className="w-5 h-5" /> Acta creada y enviada</div>
            <p className="text-xs text-zinc-400">
              {resultado.canal === 'email'
                ? 'DocuSeal le envió el link de firma al correo del cliente.'
                : 'Comparte el link al cliente por WhatsApp con el botón de abajo.'}
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-2 text-[11px] text-zinc-300 break-all">{resultado.urlFirmante}</div>
            <div className="flex gap-2">
              <button onClick={() => { try { navigator.clipboard.writeText(resultado.urlFirmante); } catch {} }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-card px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar link</button>
              {resultado.canal === 'whatsapp' && (
                <a href={waLink()} target="_blank" rel="noreferrer"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-card px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp</a>
              )}
            </div>
            <button onClick={onCreada} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-card px-3 py-2 text-xs font-bold mt-1">Listo</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <div className={labCls}>Tipo de entrega</div>
              <div className="grid grid-cols-2 gap-2">
                {[['entrega_proyecto', 'Proyecto completo'], ['entrega_area', 'Por área / edificio']].map(([v, l]) => (
                  <button key={v} onClick={() => setTipo(v)}
                    className={`p-2 text-xs font-bold border-2 rounded-card ${tipo === v ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{l}</button>
                ))}
              </div>
            </div>

            {tipo === 'entrega_area' && (
              <div>
                <div className={labCls}>Área / edificio</div>
                <select value={areaId} onChange={e => setAreaId(e.target.value)} className={inpCls}>
                  {(proyecto.areas || []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  {(proyecto.areas || []).length === 0 && <option value="">El proyecto no tiene áreas</option>}
                </select>
              </div>
            )}

            {contactos.length > 0 && (
              <div>
                <div className={labCls}>Contacto del cliente</div>
                <select value={contactoId} onChange={e => elegirContacto(e.target.value)} className={inpCls}>
                  <option value="">— Escribir manual —</option>
                  {contactos.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{c.cargo ? ` · ${c.cargo}` : ''}{(c.whatsapp || c.telefono) ? ` · 📱 ${c.whatsapp || c.telefono}` : ''}{c.email ? ` · ✉️` : ''}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-zinc-500 mt-1">Elige un contacto y se llenan nombre y datos de envío solos.</div>
              </div>
            )}

            <div>
              <div className={labCls}>Cliente</div>
              <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" className={inpCls} />
            </div>

            <div>
              <div className={labCls}>Enviar el link por</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[['email', '✉️ Email'], ['whatsapp', '📱 WhatsApp']].map(([v, l]) => (
                  <button key={v} onClick={() => setCanal(v)}
                    className={`p-2 text-xs font-bold border-2 rounded-card ${canal === v ? 'bg-red-600/10 border-red-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>{l}</button>
                ))}
              </div>
              {canal === 'email'
                ? <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@cliente.com" type="email" className={inpCls} />
                : <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="809-000-0000" className={inpCls} />}
            </div>

            {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded-card p-2">{error}</div>}

            <button onClick={generar} disabled={enviando}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-card px-3 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2">
              {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Send className="w-4 h-4" /> Generar y enviar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
