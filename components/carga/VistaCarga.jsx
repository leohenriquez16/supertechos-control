'use client';

// v8.30.2: "Carga y Actividad" — quién hace qué y cuánto tarda cada cosa, medido
// SOLO de los sistemas (ERP + Odoo), sin que nadie reporte nada a mano.
// Para qué: detectar duplicidad de funciones, redistribuir trabajo y decidir
// contrataciones con datos (las señales de la tabla de carga del organigrama).
// Rutina: revisión mensual de 30 min — tendencias, no vigilancia diaria.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Zap, RefreshCw } from 'lucide-react';
import * as db from '../../lib/db';

const RANGOS = [{ v: 7, label: '7 días' }, { v: 30, label: '30 días' }, { v: 90, label: '90 días' }];

const COLS_ERP = [
  ['jornadasAbiertas', 'Jorn. abiertas'], ['jornadasCerradas', 'Jorn. cerradas'], ['reportes', 'Reportes'],
  ['estados', 'Estados'], ['ajustes', 'Ajustes'], ['pedidos', 'Pedidos'], ['paradas', 'Paradas 🚚'],
  ['facturas', 'Fact. capt.'], ['cajaReportada', 'Caja rep.'], ['cajaAprobada', 'Caja apr.'],
  ['tareas', 'Tareas ✓'], ['cubicaciones', 'Cubic.'], ['ordenesCambio', 'OCs cambio'],
];
const COLS_ODOO = [
  ['ocs', 'Órdenes de compra'], ['factProv', 'Fact. proveedor'], ['factCli', 'Fact. cliente'],
  ['pagos', 'Pagos'], ['contactos', 'Contactos nuevos'], ['banco', 'Líneas banco'],
];

export default function VistaCarga({ usuario, data, onVolver }) {
  const [dias, setDias] = useState(30);
  const [erp, setErp] = useState(null);
  const [odoo, setOdoo] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    const d = new Date(); d.setDate(d.getDate() - dias);
    const desde = d.toISOString().slice(0, 10);
    const [e, o] = await Promise.all([
      db.resumenActividadERP(desde).catch(err => ({ error: err?.message })),
      fetch(`/api/carga?dias=${dias}`).then(r => r.json()).catch(err => ({ ok: false, error: String(err) })),
    ]);
    setErp(e); setOdoo(o);
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [dias]);

  const nombreDe = (id) => (data.personal || []).find(p => p.id === id)?.nombre || id;

  // Filas ERP ordenadas por total de acciones
  const filasErp = useMemo(() => {
    if (!erp?.porPersona) return [];
    return Object.entries(erp.porPersona)
      .map(([id, acc]) => ({ id, nombre: nombreDe(id), acc, total: Object.values(acc).reduce((s, n) => s + n, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [erp, data.personal]);

  // Filas Odoo: unir los mapas {usuario: count} por usuario
  const filasOdoo = useMemo(() => {
    if (!odoo?.ok) return [];
    const usuarios = new Set();
    COLS_ODOO.forEach(([k]) => Object.keys(odoo[k] || {}).forEach(u => { if (u !== '_error') usuarios.add(u); }));
    return [...usuarios].map(u => {
      const fila = { nombre: u };
      let total = 0;
      COLS_ODOO.forEach(([k]) => { fila[k] = (odoo[k] || {})[u] || 0; total += fila[k]; });
      return { ...fila, total };
    }).sort((a, b) => b.total - a.total);
  }, [odoo]);

  // Colas y datos del ERP ya cargados en `data`
  const sinProgramar = (data.proyectos || []).filter(p => !p.archivado && ['aprobado', 'planificado', 'en_ejecucion'].includes(p.estado) && (!p.fecha_inicio || !p.fecha_entrega)).length;
  const terminadasSinFacturar = (data.proyectos || []).filter(p => !p.archivado && (p.estado === 'finalizado_no_entregado' || p.estado === 'finalizado_recibido_conforme')).length;

  const fmtH = (h) => h == null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
  const num = (n) => n ? <span className="font-bold">{n}</span> : <span className="text-zinc-700">·</span>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {onVolver && <button onClick={onVolver} className="text-zinc-500 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>}
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Zap className="w-6 h-6 text-amber-400" /> Carga y Actividad</h1>
            <div className="text-[11px] text-zinc-500">Quién hace qué (ERP + Odoo) y cuánto tarda cada cosa — para redistribuir y decidir contrataciones con datos</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGOS.map(r => (
            <button key={r.v} onClick={() => setDias(r.v)} className={`text-xs px-3 py-1.5 border rounded-card ${dias === r.v ? 'bg-amber-600 border-amber-600 text-white font-bold' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}>{r.label}</button>
          ))}
          <button onClick={cargar} className="text-zinc-500 hover:text-white ml-1"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : (
        <>
          {/* Ciclos + colas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Pedido → listo (almacén)</div>
              <div className="text-lg font-black text-amber-400">{fmtH(erp?.ciclos?.pedidoALista)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Listo → entregado (ruta)</div>
              <div className="text-lg font-black text-amber-400">{fmtH(erp?.ciclos?.listaAEntrega)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] text-zinc-500 uppercase">OC Odoo borrador → confirmada</div>
              <div className="text-lg font-black text-amber-400">{fmtH(odoo?.cicloOcHoras)}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
              <div className="text-[10px] text-zinc-500 uppercase">Colas ahora</div>
              <div className="text-[11px] text-zinc-300 leading-relaxed">
                📦 {erp?.colas?.pedidosEnCola ?? '—'} pedidos · 📝 {odoo?.ocsEnBorrador ?? '—'} OCs borrador<br />
                📅 {sinProgramar} sin programar · 💰 {terminadasSinFacturar} sin facturar
              </div>
            </div>
          </div>

          {/* Actividad ERP */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Actividad en el ERP · últimos {dias} días</div>
            {erp?.error ? <div className="text-xs text-amber-400">{erp.error}</div> : filasErp.length === 0 ? <div className="text-xs text-zinc-500">Sin actividad registrada en el rango.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-[9px] uppercase text-zinc-500">
                    <th className="text-left p-1">Persona</th>
                    {COLS_ERP.map(([k, l]) => <th key={k} className="text-right p-1 whitespace-nowrap">{l}</th>)}
                    <th className="text-right p-1">Total</th>
                  </tr></thead>
                  <tbody>
                    {filasErp.map(f => (
                      <tr key={f.id} className="border-t border-zinc-800">
                        <td className="p-1 font-bold whitespace-nowrap">{f.nombre}</td>
                        {COLS_ERP.map(([k]) => <td key={k} className="p-1 text-right">{num(f.acc[k])}</td>)}
                        <td className="p-1 text-right font-black text-amber-400">{f.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actividad Odoo */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3">
            <div className="text-[10px] tracking-widest uppercase text-zinc-400 font-bold mb-2">Actividad en Odoo · últimos {dias} días</div>
            {!odoo?.ok ? <div className="text-xs text-amber-400">No se pudo leer Odoo: {odoo?.error || 'error'}</div> : filasOdoo.length === 0 ? <div className="text-xs text-zinc-500">Sin actividad en el rango.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-[9px] uppercase text-zinc-500">
                    <th className="text-left p-1">Usuario Odoo</th>
                    {COLS_ODOO.map(([k, l]) => <th key={k} className="text-right p-1 whitespace-nowrap">{l}</th>)}
                    <th className="text-right p-1">Total</th>
                  </tr></thead>
                  <tbody>
                    {filasOdoo.map(f => (
                      <tr key={f.nombre} className="border-t border-zinc-800">
                        <td className="p-1 font-bold whitespace-nowrap">{f.nombre}</td>
                        {COLS_ODOO.map(([k]) => <td key={k} className="p-1 text-right">{num(f[k])}</td>)}
                        <td className="p-1 text-right font-black text-amber-400">{f.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-[10px] text-zinc-600">
            💡 Cómo leerlo: si un tipo de trabajo se concentra en una sola persona o aparece repartido en 4 (duplicidad), ahí hay algo que redistribuir o traer al ERP. Un ciclo que crece = sobrecarga o proceso trabado. Revisión recomendada: una vez al mes, con la tabla de señales del organigrama. El detalle acción por acción está en Seguridad → Registro de actividad.
          </div>
        </>
      )}
    </div>
  );
}
