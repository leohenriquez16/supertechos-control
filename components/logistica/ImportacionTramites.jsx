'use client';

// v8.77.0: trámites de una carga importada — checklist de documentos y pagos (se marca solo
// con los archivos de la carpeta Dropbox de la carga; también a mano) y correos estándar
// (aduanero Pick n Send, comprobantes, pedir documentos, entrega en Noxida).
// Los correos quedan en cola (importaciones_envios) y la Mac los manda por SMTP desde el
// buzón de quien los ejecuta, con copia a Leo y copia en su carpeta Enviados.

import React, { useEffect, useMemo, useState } from 'react';
import { Send, Loader2, X, Mail, CheckCircle2, Circle, Paperclip, AlertTriangle } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';

// Checklist estándar de una carga (orden del flujo real de Lily)
export const CHECKLIST = [
  { etapa: 'Proveedor', items: [
    { k: 'proforma', label: 'Proforma', re: /^P-?I\b|proforma/i },
    { k: 'anticipo', label: 'Comprobante anticipo 30%', re: /receipt|comprobante|swift/i, auto: i => i.anticipo > 0 },
    { k: 'factura_comercial', label: 'Factura comercial', re: /commercial invoice|^CI\b|^CI -/i },
    { k: 'packing', label: 'Packing list', re: /packing|^PL\b/i },
    { k: 'bl', label: 'BL', re: /\bBL\b|bill of lading|^INSUTECH\d+|MEDU[A-Z]{2,3}\d+|^CFA\d+/i },
    { k: 'fssd', label: 'FSSD', re: /FSSD/i },
    { k: 'saldo', label: 'Saldo 70% pagado', auto: i => i.saldo <= 0.01 && i.montoTotal > 0 },
  ]},
  { etapa: 'Naviera', items: [
    { k: 'telex', label: 'Telex / BL liberado', re: /telex|liberaci|BL ORIGINAL/i },
    { k: 'aviso_llegada', label: 'Aviso de llegada', re: /aviso|llegada|arribo|^ARR_/i },
    { k: 'factura_naviera', label: 'Factura naviera pagada', re: /freight|naviera/i },
  ]},
  { etapa: 'Aduana y puerto', items: [
    { k: 'docs_aduanero', label: 'Documentos enviados al aduanero', envio: 'aduanero' },
    { k: 'puerto', label: 'Puerto pagado (Portcollect / DPH / DPW)', re: /portcollect|porcollet|DPW|DPH|preliq/i },
    { k: 'liquidacion', label: 'Liquidación de aduana', re: /liquidaci|^LIQ\b|pre ?liq/i },
    { k: 'dga', label: 'Recibo DGA / DOIM', re: /DGA|DOIM/i },
    { k: 'pns', label: 'Factura Pick n Send', re: /PNS|pick ?n/i },
  ]},
  { etapa: 'Entrega', items: [
    { k: 'noxida', label: 'Entrega coordinada (Noxida / almacén)', envio: 'noxida' },
    { k: 'recepcion', label: 'Recepción en Odoo', auto: i => i.recepcionEstado === 'done' },
  ]},
];

const CONTACTOS = {
  aduanero: { nombre: 'Pick n Send (aduanero)', para: ['tramites@picknsend.com', 'ventas@picknsend.com', 'aduanas@picknsend.com'] },
  insutech: { nombre: 'Insutech (Ebthal)', para: ['ebthal.saeed@insutech-eg.com'] },
  msc: { nombre: 'MSC Dominicana', para: ['DOM-customerservice@msc.com'] },
  portcollect: { nombre: 'Portcollect', para: ['informacion@portcollect.com'] },
  dph: { nombre: 'DPH (DP World)', para: ['atencionalcliente@dph.com.do'] },
  noxida: { nombre: 'Noxida (2do almacén)', para: ['almacen@noxida.com', 'lia@noxida.com'] },
};

const descripcionCarga = (imp) => {
  const d = new Set();
  for (const p of imp.productos || []) {
    if (/insugrand|lona|membrane/i.test(p.producto)) d.add('Lonas asfálticas');
    else if (/primer/i.test(p.producto)) d.add('Primer asfáltico base agua');
    else d.add(p.producto);
  }
  return [...d].join(', ') || 'Materiales de impermeabilización';
};
const ref = (imp) => [imp.oc, imp.bl && `BL ${imp.bl}`, imp.contenedor && `Cont. ${imp.contenedor}`].filter(Boolean).join(' · ');
const firma = (u) => `\n\nSaludos,\n\n${u?.nombre || ''}\nSuper Techos SRL\nwww.supertechos.com.do\nT. 809-535-9293\nC/ Arena #1, Mar Azul\nSanto Domingo, R.D.`;

const clasifica = (archivo, item) => item.re && item.re.test(archivo);

// Plantillas de correo por tipo
function plantilla(tipo, imp, usuario, archivos, extra = {}) {
  const sel = (...items) => archivos.filter(a => items.some(it => clasifica(a, it)));
  const it = Object.fromEntries(CHECKLIST.flatMap(e => e.items).map(i => [i.k, i]));
  switch (tipo) {
    case 'aduanero': return {
      contacto: 'aduanero',
      asunto: `Documentos - LH Super Techos - ${ref(imp)}`,
      cuerpo: `Buenos días,\n\nAdjunto documentación de la carga ${ref(imp)}:\n\n- Factura comercial${imp.facturaComercial ? ` ${imp.facturaComercial}` : ''}\n- Packing list\n- BL\n- FSSD\n- Aviso de llegada\n\nDescripción: ${descripcionCarga(imp)}.\nProveedor: ${imp.proveedor}. Origen: ${imp.puertoOrigen || 'Egipto'}.\n\nCualquier pregunta estamos a la orden.` + firma(usuario),
      adjuntos: sel(it.factura_comercial, it.packing, it.bl, it.fssd, it.aviso_llegada),
    };
    case 'comprobante': return {
      contacto: extra.contacto || 'insutech',
      asunto: `Comprobante de pago - LH Super Techos - ${ref(imp)}`,
      cuerpo: (extra.contacto === 'insutech' || !extra.contacto)
        ? `Hello,\n\nPlease find attached the payment receipt for ${imp.oc}${imp.proforma ? ` / PI ${imp.proforma}` : ''}${imp.bl ? ` / BL ${imp.bl}` : ''}.\n\nRegards,\n\n${usuario?.nombre || ''}\nSuper Techos SRL`
        : `Buenos días,\n\nAdjunto comprobante de pago correspondiente a ${ref(imp)}, RNC 130774331.\n\nFavor confirmar recibido.` + firma(usuario),
      adjuntos: sel(it.anticipo).slice(-1),
    };
    case 'pedir': return {
      contacto: extra.contacto || 'insutech',
      asunto: `Pending documents - ${imp.oc}${imp.proforma ? ` / PI ${imp.proforma}` : ''}`,
      cuerpo: `Hello,\n\nFor ${imp.oc}${imp.proforma ? ` (PI ${imp.proforma})` : ''} we are still missing:\n\n${(extra.faltan || []).map(f => `- ${f}`).join('\n') || '- '}\n\nCould you please send them at your earliest convenience?\n\nRegards,\n\n${usuario?.nombre || ''}\nSuper Techos SRL`,
      adjuntos: [],
    };
    case 'noxida': return {
      contacto: 'noxida',
      asunto: 'Entrega de Mercancía - LH Super Techos srl',
      cuerpo: `Buenos días,\n\nLes informamos que estaremos entregando la carga ${ref(imp)} (${descripcionCarga(imp)}).\nAdjunto packing list con el detalle.\n\nFavor confirmar disponibilidad para la recepción.` + firma(usuario),
      adjuntos: sel(it.packing),
    };
    default: return { contacto: 'aduanero', asunto: ref(imp), cuerpo: firma(usuario), adjuntos: [] };
  }
}

function Compositor({ imp, usuario, tipo, extra, onCerrar, onEnviado }) {
  const archivos = imp.archivos || [];
  const base = useMemo(() => plantilla(tipo, imp, usuario, archivos, extra), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [contacto, setContacto] = useState(base.contacto);
  const [para, setPara] = useState(CONTACTOS[base.contacto]?.para.join(', ') || '');
  const [cc, setCc] = useState('lhenriquez@supertechos.com.do');
  const [asunto, setAsunto] = useState(base.asunto);
  const [cuerpo, setCuerpo] = useState(base.cuerpo);
  const [adj, setAdj] = useState(new Set(base.adjuntos));
  const [enviando, setEnviando] = useState(false);
  const cambiarContacto = (c) => { setContacto(c); setPara(CONTACTOS[c].para.join(', ')); if (tipo === 'comprobante') setCuerpo(plantilla(tipo, imp, usuario, archivos, { contacto: c }).cuerpo); };
  const lista = (s) => s.split(/[,;\s]+/).map(x => x.trim()).filter(x => /.+@.+\..+/.test(x));

  const enviar = async () => {
    if (!usuario?.email) { toast.error('Tu usuario no tiene correo registrado'); return; }
    if (!lista(para).length) { toast.error('Falta destinatario'); return; }
    setEnviando(true);
    try {
      await db.encolarEnvioImportacion({ importacionId: imp.id, tipo, deEmail: usuario.email, deNombre: usuario.nombre, para: lista(para), cc: lista(cc), asunto, cuerpo, adjuntos: [...adj] });
      toast.success('En cola: sale desde tu correo en ~1 minuto');
      onEnviado();
    } catch (e) { toast.error('Error: ' + e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card w-full max-w-2xl my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="text-white font-bold flex items-center gap-2"><Mail className="w-4 h-4" /> Correo · {imp.oc}</div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="text-xs text-zinc-400">Sale desde <b className="text-white">{usuario?.email || '—'}</b> con copia en tus Enviados.</div>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">A quién</span>
            <select value={contacto} onChange={e => cambiarContacto(e.target.value)} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white">
              {Object.entries(CONTACTOS).map(([k, c]) => <option key={k} value={k}>{c.nombre}</option>)}
            </select></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">Para</span>
            <input value={para} onChange={e => setPara(e.target.value)} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">CC</span>
            <input value={cc} onChange={e => setCc(e.target.value)} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">Asunto</span>
            <input value={asunto} onChange={e => setAsunto(e.target.value)} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white" /></label>
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">Mensaje</span>
            <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={12} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-white font-mono text-xs" /></label>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Adjuntos (carpeta Dropbox «{imp.carpeta || 'sin carpeta'}»)</div>
            {archivos.length === 0 ? <div className="text-xs text-zinc-500">La carpeta no tiene archivos todavía.</div> : (
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {archivos.map(a => (
                  <label key={a} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={adj.has(a)} onChange={e => { const n = new Set(adj); e.target.checked ? n.add(a) : n.delete(a); setAdj(n); }} />
                    <Paperclip className="w-3 h-3 text-zinc-500" />{a}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onCerrar} className="px-3 py-1.5 rounded text-zinc-300 hover:text-white">Cancelar</button>
            <button onClick={enviar} disabled={enviando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function estadoChecklist(imp, envios = []) {
  const archivos = imp.archivos || [];
  const man = imp.checklist || {};
  const enviados = new Set(envios.filter(e => e.estado === 'enviado').map(e => e.tipo));
  const r = {};
  for (const e of CHECKLIST) for (const it of e.items) {
    let auto = false, fuente = null;
    if (it.auto && it.auto(imp)) { auto = true; fuente = 'Odoo'; }
    if (!auto && it.re) { const a = archivos.find(x => clasifica(x, it)); if (a) { auto = true; fuente = a; } }
    if (!auto && it.envio && enviados.has(it.envio)) { auto = true; fuente = 'correo enviado'; }
    r[it.k] = { ok: man[it.k] === true || (auto && man[it.k] !== false), auto, fuente, manual: man[it.k] };
  }
  return r;
}

export default function ImportacionTramites({ imp, usuario, onCambio }) {
  const [envios, setEnvios] = useState([]);
  const [comp, setComp] = useState(null); // { tipo, extra }
  const [check, setCheck] = useState(imp.checklist || {});
  const cargarEnvios = async () => setEnvios(await db.listarEnviosImportacion(imp.id));
  useEffect(() => { cargarEnvios(); const t = setInterval(cargarEnvios, 20000); return () => clearInterval(t); }, [imp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const estado = estadoChecklist({ ...imp, checklist: check }, envios);
  const faltanProveedor = CHECKLIST[0].items.filter(i => i.re && !estado[i.k].ok && i.k !== 'anticipo').map(i => i.label);

  const toggle = async (k) => {
    const n = { ...check, [k]: !estado[k].ok };
    setCheck(n);
    try { await db.guardarChecklistImportacion(imp.id, n); onCambio?.(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="px-5 pb-4 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Checklist de la carga</div>
        <div className="grid md:grid-cols-4 gap-3">
          {CHECKLIST.map(e => (
            <div key={e.etapa} className="bg-zinc-950/60 border border-zinc-800 rounded p-2">
              <div className="text-xs font-semibold text-zinc-300 mb-1">{e.etapa}</div>
              {e.items.map(it => {
                const s = estado[it.k];
                return (
                  <button key={it.k} onClick={() => toggle(it.k)} title={s.fuente ? `Detectado: ${s.fuente}` : 'Marcar a mano'}
                    className="w-full flex items-start gap-1.5 text-left text-xs py-0.5 hover:bg-zinc-800/50 rounded">
                    {s.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" /> : <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />}
                    <span className={s.ok ? 'text-zinc-200' : 'text-zinc-500'}>{it.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Correos</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setComp({ tipo: 'aduanero' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs"><Send className="w-3.5 h-3.5" /> Enviar documentos al aduanero</button>
          <button onClick={() => setComp({ tipo: 'comprobante', extra: { contacto: 'insutech' } })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs"><Paperclip className="w-3.5 h-3.5" /> Enviar comprobante</button>
          <button onClick={() => setComp({ tipo: 'pedir', extra: { contacto: 'insutech', faltan: faltanProveedor } })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Pedir documentos faltantes{faltanProveedor.length ? ` (${faltanProveedor.length})` : ''}</button>
          <button onClick={() => setComp({ tipo: 'noxida' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs"><Mail className="w-3.5 h-3.5" /> Coordinar entrega Noxida</button>
        </div>
        {envios.length > 0 && (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><tbody>
            {envios.map(e => (
              <tr key={e.id} className="border-t border-zinc-800">
                <td className="py-1 pr-3 whitespace-nowrap text-zinc-400">{new Date(e.createdAt).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="pr-3 text-white">{e.asunto}</td>
                <td className="pr-3 text-zinc-400">{e.deNombre} → {e.para.join(', ')}</td>
                <td className="pr-3 text-zinc-500">{e.adjuntos.length ? `📎 ${e.adjuntos.length}` : ''}</td>
                <td className={e.estado === 'enviado' ? 'text-green-400' : e.estado === 'error' ? 'text-red-400' : 'text-amber-300'} title={e.error || ''}>
                  {e.estado === 'enviado' ? '✓ enviado' : e.estado === 'error' ? `error: ${e.error}` : 'en cola…'}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>

      {comp && <Compositor imp={imp} usuario={usuario} tipo={comp.tipo} extra={comp.extra} onCerrar={() => setComp(null)} onEnviado={() => { setComp(null); cargarEnvios(); }} />}
    </div>
  );
}
