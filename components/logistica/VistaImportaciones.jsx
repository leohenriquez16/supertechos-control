'use client';

// v8.77.0: Control de importaciones — una fila por carga (OC de Odoo).
// Datos de Odoo (OC, pagos, factura, recepción) y tracking de la naviera los llena
// ~/erp-agente/importaciones/sync_importaciones.py cada 15 min desde la Mac.
// v8.101.0: «Lista para zarpar» = el suplidor ya despachó (factura comercial o aviso con salida estimada) y el buque no ha salido.
// Aquí solo se capturan a mano BL / contenedor / naviera / factura comercial / notas.
// Los documentos del correo los archiva archivar_correo.py en la carpeta Dropbox de la carga.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, Ship, AlertTriangle, X, Save, Search } from 'lucide-react';
import * as db from '../../lib/db';
import { toast } from '../../lib/toast';
import TablaDatos from '../common/TablaDatos';
import ImportacionTramites from './ImportacionTramites';
import ForecastInventario from './ForecastInventario';

const ESTADOS = {
  produccion: { label: 'En producción', cls: 'bg-zinc-700 text-zinc-200' },
  por_zarpar: { label: 'Lista para zarpar', cls: 'bg-cyan-900/60 text-cyan-200' },
  transito: { label: 'En tránsito', cls: 'bg-blue-900/60 text-blue-200' },
  puerto: { label: 'En puerto', cls: 'bg-amber-900/60 text-amber-200' },
  despachado: { label: 'Despachado', cls: 'bg-purple-900/60 text-purple-200' },
  almacen: { label: 'En almacén', cls: 'bg-green-900/60 text-green-200' },
};
const ORDEN_ESTADO = ['produccion', 'por_zarpar', 'transito', 'puerto', 'despachado', 'almacen'];

const usd = (n) => (n || n === 0) ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fecha = (f) => {
  if (!f) return '—';
  const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' });
};
const diasHasta = (f) => {
  if (!f) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(String(f).slice(0, 10) + 'T00:00:00') - hoy) / 86400000);
};

// Alertas por carga
function alertas(i) {
  const a = [];
  const dEta = diasHasta(i.eta);
  if (i.saldo > 0.01 && i.estado !== 'produccion' && dEta !== null && dEta <= 15) a.push({ nivel: 'rojo', txt: `Saldo ${usd(i.saldo)} sin pagar y llega en ${dEta} días` });
  if (i.etaOriginal && i.eta && i.eta !== i.etaOriginal) {
    const dif = Math.round((new Date(i.eta) - new Date(i.etaOriginal)) / 86400000);
    if (dif) a.push({ nivel: 'ambar', txt: `ETA ${dif > 0 ? 'se atrasó' : 'se adelantó'} ${Math.abs(dif)} días (era ${fecha(i.etaOriginal)})` });
  }
  if (i.estado === 'puerto' && i.recepcionEstado !== 'done') a.push({ nivel: 'ambar', txt: 'En puerto: falta despacho y recepción en Odoo' });
  if (dEta !== null && dEta < 0 && i.estado !== 'almacen') a.push({ nivel: 'rojo', txt: `ETA vencida hace ${-dEta} días sin recepción` });
  if (!['produccion', 'por_zarpar'].includes(i.estado) && !i.facturaOdoo) a.push({ nivel: 'ambar', txt: 'Embarcada sin factura en Odoo' });
  return a;
}

function Pill({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.produccion;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

function Ficha({ imp, usuario, onCerrar, onGuardado, onCambio }) {
  const [f, setF] = useState({ bl: imp.bl || '', contenedor: imp.contenedor || '', naviera: imp.naviera || '', facturaComercial: imp.facturaComercial || '', proforma: imp.proforma || '', notas: imp.notas || '' });
  const [guardando, setGuardando] = useState(false);
  const eventos = imp.tracking?.eventos || [];
  const hoy = new Date().toISOString().slice(0, 10);
  const guardar = async () => {
    setGuardando(true);
    try { await db.actualizarImportacion(imp.id, f); toast.success('Guardado'); onGuardado(); }
    catch (e) { toast.error('Error: ' + e.message); }
    finally { setGuardando(false); }
  };
  const campo = (k, label, ph) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <input value={f[k]} placeholder={ph} onChange={e => setF({ ...f, [k]: e.target.value })}
        className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card w-full max-w-5xl my-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div>
            <div className="text-white font-bold">{imp.oc} · {imp.proveedor} <span className="ml-2"><Pill estado={imp.estado} /></span></div>
            <div className="text-xs text-zinc-400">Proforma {imp.proforma || '—'} · orden {fecha(imp.fechaOrden)}</div>
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid md:grid-cols-3 gap-4 p-5">
          <div className="space-y-1 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pagos</div>
            <div className="flex justify-between"><span className="text-zinc-400">FOB</span><span className="tabular-nums">{usd(imp.montoFob)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Flete</span><span className="tabular-nums">{usd(imp.flete)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total CIF</span><span className="tabular-nums">{usd(imp.montoTotal)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Anticipo {fecha(imp.anticipoFecha)}</span><span className="tabular-nums">{usd(imp.anticipo)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Pagado total</span><span className="tabular-nums">{usd(imp.pagado)}</span></div>
            <div className={`flex justify-between font-semibold ${imp.saldo > 0.01 ? 'text-amber-300' : 'text-green-400'}`}><span>Saldo</span><span className="tabular-nums">{usd(imp.saldo)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Vence</span><span>{fecha(imp.vence)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Factura Odoo</span><span>{imp.facturaOdoo || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Recepción</span><span>{imp.recepcionOdoo || '—'} {imp.recepcionEstado === 'done' ? '✓' : ''}</span></div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Embarque</div>
            <div className="flex justify-between"><span className="text-zinc-400">Naviera</span><span>{imp.naviera || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Buque</span><span className="text-right">{imp.buque || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Origen</span><span>{imp.puertoOrigen || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Transbordo</span><span>{imp.puertoTransbordo || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Destino</span><span>{imp.puertoDestino || '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Salida (ETD){diasHasta(imp.etd) > 0 ? ' · estimada' : ''}</span><span>{fecha(imp.etd)}</span></div>
            <div className="flex justify-between font-semibold"><span>Llegada (ETA)</span><span>{fecha(imp.eta)}</span></div>
            {imp.etaOriginal && imp.etaOriginal !== imp.eta && <div className="flex justify-between text-xs"><span className="text-zinc-500">ETA original</span><span className="text-zinc-500">{fecha(imp.etaOriginal)}</span></div>}
            <div className="text-[11px] text-zinc-500 pt-1">Tracking: {imp.trackingActualizado ? new Date(imp.trackingActualizado).toLocaleString('es-DO') : 'sin consultar'}</div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Datos a mano</div>
            {campo('contenedor', 'Contenedor', 'MEDU1234567')}
            {campo('bl', 'BL', 'MEDU…')}
            {campo('naviera', 'Naviera', 'MSC')}
            {campo('facturaComercial', 'Factura comercial', 'E-0000-2026-DO')}
            {campo('proforma', 'Proforma', '')}
          </div>
        </div>
        <ImportacionTramites imp={imp} usuario={usuario} onCambio={onCambio} />
        <div className="px-5 pb-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Productos</div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-zinc-500 text-left"><th className="py-1">Producto</th><th className="text-right">Cantidad</th><th className="text-right">Recibido</th><th className="text-right">Precio</th><th className="text-right">Total</th></tr></thead>
            <tbody>{imp.productos.map((p, k) => (
              <tr key={k} className="border-t border-zinc-800"><td className="py-1 pr-2">{p.producto}</td><td className="text-right tabular-nums">{p.cantidad}</td><td className="text-right tabular-nums">{p.recibido}</td><td className="text-right tabular-nums">{usd(p.precio)}</td><td className="text-right tabular-nums">{usd(p.cantidad * p.precio)}</td></tr>
            ))}</tbody></table></div>
        </div>
        {imp.documentos?.length > 0 && (
          <div className="px-5 pb-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Documentos archivados del correo · Dropbox «Cargas ST - PG/{imp.carpeta}»</div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
              {[...imp.documentos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map((d, k) => (
                <tr key={k} className="border-t border-zinc-800"><td className="py-1 pr-3 whitespace-nowrap tabular-nums text-zinc-400">{fecha(d.fecha)}</td><td className="pr-3 text-white">{d.archivo}</td><td className="text-zinc-500">{d.asunto}</td></tr>
              ))}
            </tbody></table></div>
          </div>
        )}
        {eventos.length > 0 && (
          <div className="px-5 pb-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Tracking del contenedor</div>
            <ol className="relative border-l border-zinc-700 ml-2 space-y-2">
              {[...eventos].reverse().map((e, k) => {
                const futuro = (e.fecha || '') > hoy || /Estimated|Intended/.test(e.evento);
                return (
                  <li key={k} className="ml-4">
                    <span className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 ${futuro ? 'border-zinc-500 bg-zinc-900' : 'border-blue-400 bg-blue-500'}`} />
                    <div className={`text-xs ${futuro ? 'text-zinc-400' : 'text-white'}`}><span className="font-semibold tabular-nums">{fecha(e.fecha)}</span> · {e.evento} · {e.lugar}</div>
                    <div className="text-[11px] text-zinc-500">{[e.buque, e.terminal].filter(Boolean).join(' · ')}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        <div className="px-5 pb-5">
          <label className="block"><span className="text-[10px] uppercase tracking-wider text-zinc-500">Notas</span>
            <textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} rows={2} className="w-full mt-0.5 bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white" /></label>
          <div className="flex justify-end mt-3">
            <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VistaImportaciones({ usuario, onVolver }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ficha, setFicha] = useState(null);
  const [verRecibidas, setVerRecibidas] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('cargas'); // v8.79.0: cargas | inventario

  const cargar = async () => { setCargando(true); setItems(await db.listarImportaciones()); setCargando(false); };
  useEffect(() => { cargar(); }, []);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items
      .filter(i => verRecibidas || i.estado !== 'almacen')
      .filter(i => !t || [i.oc, i.proveedor, i.proforma, i.bl, i.contenedor, ...i.productos.map(p => p.producto)].join(' ').toLowerCase().includes(t))
      .map(i => ({ ...i, _alertas: alertas(i) }));
  }, [items, verRecibidas, q]);

  const kpi = useMemo(() => {
    const abiertas = items.filter(i => i.estado !== 'almacen');
    return {
      abiertas: abiertas.length,
      transito: abiertas.filter(i => i.estado === 'transito' || i.estado === 'puerto').length,
      saldo: abiertas.reduce((s, i) => s + (i.saldo || 0), 0),
      proxima: abiertas.filter(i => i.eta && i.estado !== 'produccion').sort((a, b) => a.eta.localeCompare(b.eta))[0],
    };
  }, [items]);

  const columnas = [
    { key: 'oc', label: 'OC', render: r => <span className="font-semibold text-white">{r.oc}</span> },
    { key: 'proveedor', label: 'Proveedor' },
    { key: 'estado', label: 'Estado', render: r => <Pill estado={r.estado} />, sortValue: r => ORDEN_ESTADO.indexOf(r.estado) },
    { key: 'productos', label: 'Productos', ordenable: false, render: r => <span className="text-zinc-300">{r.productos.map(p => `${p.cantidad} ${p.producto.replace(/^INSUTECH\s+/i, '').split(' - ')[0].trim()}`).join(' · ')}</span> },
    { key: 'contenedor', label: 'Contenedor / BL', render: r => <span className="text-zinc-300">{r.contenedor || '—'}<br /><span className="text-zinc-500">{r.bl || ''}</span></span> },
    { key: 'etd', label: 'Salida', render: r => fecha(r.etd) },
    { key: 'eta', label: 'Llegada', render: r => { const d = diasHasta(r.eta); return <span className="whitespace-nowrap"><b className="text-white">{fecha(r.eta)}</b>{d !== null && r.estado !== 'almacen' && <span className="text-zinc-500"> ({d >= 0 ? `${d}d` : `hace ${-d}d`})</span>}</span>; } },
    { key: 'tracking', label: 'Último evento', ordenable: false, render: r => <span className="text-zinc-400">{r.trackingUltimoEvento || '—'}</span> },
    { key: 'montoTotal', label: 'Total', align: 'right', render: r => <span className="tabular-nums">{usd(r.montoTotal)}</span> },
    { key: 'saldo', label: 'Saldo', align: 'right', render: r => <span className={`tabular-nums ${r.saldo > 0.01 ? 'text-amber-300' : 'text-green-400'}`}>{usd(r.saldo)}</span> },
    { key: 'vence', label: 'Vence', render: r => fecha(r.vence) },
    { key: '_alertas', label: '', ordenable: false, render: r => r._alertas.length ? (
      <span title={r._alertas.map(a => a.txt).join('\n')} className={`inline-flex items-center gap-1 ${r._alertas.some(a => a.nivel === 'rojo') ? 'text-red-400' : 'text-amber-400'}`}>
        <AlertTriangle className="w-3.5 h-3.5" />{r._alertas.length}
      </span>) : null },
  ];

  const todasAlertas = filas.flatMap(r => r._alertas.map(a => ({ ...a, oc: r.oc })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>}
          <Ship className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-bold text-white">Importaciones</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar OC, producto, contenedor…" className="pl-7 pr-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm text-white w-60" /></div>
          <label className="text-xs text-zinc-400 flex items-center gap-1"><input type="checkbox" checked={verRecibidas} onChange={e => setVerRecibidas(e.target.checked)} /> Ver recibidas</label>
          <button onClick={cargar} className="p-1.5 text-zinc-400 hover:text-white" title="Recargar"><RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {[['cargas', 'Cargas'], ['inventario', 'Inventario y llegadas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === k ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>{l}</button>
        ))}
      </div>

      {tab === 'inventario' ? <ForecastInventario importaciones={items} /> : (<>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500">Cargas abiertas</div><div className="text-xl font-bold text-white">{kpi.abiertas}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500">En tránsito / puerto</div><div className="text-xl font-bold text-white">{kpi.transito}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500">Saldo por pagar</div><div className="text-xl font-bold text-amber-300 tabular-nums">{usd(kpi.saldo)}</div></div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500">Próxima llegada</div><div className="text-xl font-bold text-white">{kpi.proxima ? fecha(kpi.proxima.eta) : '—'}</div><div className="text-xs text-zinc-500">{kpi.proxima?.oc || ''}</div></div>
      </div>

      {todasAlertas.length > 0 && (
        <div className="bg-zinc-900 border border-amber-900/50 rounded-card p-3 space-y-1">
          {todasAlertas.map((a, k) => (
            <div key={k} className={`text-sm flex items-center gap-2 ${a.nivel === 'rojo' ? 'text-red-300' : 'text-amber-300'}`}><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><b>{a.oc}</b> {a.txt}</div>
          ))}
        </div>
      )}

      {cargando ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div> : (
        <TablaDatos columnas={columnas} filas={filas} rowKey={r => r.id} onFilaClick={r => setFicha(r)}
          ordenInicial={{ key: 'eta', dir: 'asc' }} vacio="Sin importaciones abiertas." />
      )}
      <p className="text-[11px] text-zinc-500">Se actualiza solo cada 15 min desde Odoo (OC, pagos, factura, recepción) y desde la naviera (tracking, una vez al día). Clic en una fila para ver el detalle y capturar contenedor/BL.</p>
      </>)}

      {ficha && <Ficha imp={ficha} usuario={usuario} onCambio={cargar} onCerrar={() => setFicha(null)} onGuardado={() => { setFicha(null); cargar(); }} />}
    </div>
  );
}
