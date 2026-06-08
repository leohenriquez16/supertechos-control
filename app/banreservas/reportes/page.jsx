'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sucursales } from '../../../lib/data/banreservas-mock';

const HOY = new Date('2026-05-21');

export default function ReportesPage() {
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [preview, setPreview] = useState(null);

  // Generar lista de reportes — uno por visita con reporte_pdf
  const reportes = useMemo(() => {
    const lista = [];
    sucursales.forEach(s => {
      (s.visitas_completas || []).filter(v => v.reporte_pdf).forEach(v => {
        const diasDesdeVisita = Math.floor((HOY - new Date(v.fecha)) / (1000 * 60 * 60 * 24));
        lista.push({
          id: `RIT-2026-${String(Math.abs(v.id.charCodeAt(4) * 99 + v.id.charCodeAt(5)) % 99999).padStart(5, '0')}`,
          oficina: s.zona,
          codigo_br: s.codigo_br,
          regional: s.regional,
          provincia: s.provincia,
          fecha_visita: v.fecha,
          fecha_entrega: new Date(v.fecha.getTime() + 36 * 60 * 60 * 1000), // +36h hábiles aprox
          supervisor: v.supervisor,
          brigada: v.brigada,
          categoria: v.categoria_asignada,
          n_hallazgos: v.n_hallazgos,
          n_fotos: v.n_fotos,
          tipo_visita: v.tipo,
          diasDesdeVisita,
          estado: v.estado === 'pendiente_revision' ? 'En revisión' : 'Notificado al banco',
          oficinaCat: s.categoria,
        });
      });
    });
    return lista.sort((a, b) => new Date(b.fecha_visita) - new Date(a.fecha_visita));
  }, []);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hoy = new Date('2026-05-21');
    return reportes.filter(r => {
      if (tipoFiltro === 'este_mes') {
        const dias = Math.floor((hoy - r.fecha_visita) / (1000 * 60 * 60 * 24));
        if (dias > 30) return false;
      } else if (tipoFiltro === 'pendientes') {
        if (r.estado !== 'En revisión') return false;
      } else if (tipoFiltro === 'criticos') {
        if (r.categoria !== 'D' && r.categoria !== 'C') return false;
      }
      if (q) {
        const hs = [r.oficina, r.codigo_br, r.id, r.supervisor, r.regional].filter(Boolean).join(' ').toLowerCase();
        if (!hs.includes(q)) return false;
      }
      return true;
    });
  }, [search, tipoFiltro, reportes]);

  // KPIs
  const kpis = useMemo(() => {
    const esteMes = reportes.filter(r => r.diasDesdeVisita <= 30).length;
    const tiempoPromedio = '< 48h hábiles';
    const cumplimientoSLA = '100%';
    return { total: reportes.length, esteMes, tiempoPromedio, cumplimientoSLA };
  }, [reportes]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Reportes Técnicos · <span className="text-red-600">{reportes.length}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Reportes de inspección generados automáticamente al cierre de cada visita y entregados al banco en ≤48 horas hábiles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Descargar todos
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Total reportes" value={kpis.total} sub="Histórico del Programa" stripe="#3b82f6" />
        <KpiCard label="Entregados este mes" value={kpis.esteMes} sub="Últimos 30 días" stripe="#16a34a" />
        <KpiCard label="Tiempo promedio" value={kpis.tiempoPromedio} sub="Desde cierre de visita" stripe="#a855f7" />
        <KpiCard label="Cumplimiento SLA" value={kpis.cumplimientoSLA} sub="≤48 h hábiles" stripe="#16a34a" />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por oficina, código, ID reporte, supervisor…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
        </div>

        <div className="flex items-center gap-1">
          {[
            { v: 'todos', label: 'Todos' },
            { v: 'este_mes', label: 'Este mes' },
            { v: 'pendientes', label: 'Pendientes' },
            { v: 'criticos', label: 'Estado C/D' },
          ].map(t => (
            <button
              key={t.v}
              onClick={() => setTipoFiltro(t.v)}
              className={`text-xs px-3 py-2 rounded font-medium ${tipoFiltro === t.v ? 'bg-red-600 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-3 py-2.5">ID Reporte</th>
              <th className="text-left px-3 py-2.5">Fecha Visita</th>
              <th className="text-left px-3 py-2.5">Oficina</th>
              <th className="text-left px-3 py-2.5">Tipo</th>
              <th className="text-left px-3 py-2.5">Supervisor</th>
              <th className="text-center px-3 py-2.5">Categoría</th>
              <th className="text-right px-3 py-2.5">Hallazgos</th>
              <th className="text-right px-3 py-2.5">Fotos</th>
              <th className="text-left px-3 py-2.5">Estado</th>
              <th className="text-center px-3 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtrados.slice(0, 100).map(r => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2.5 text-zinc-700 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2.5 text-zinc-700 text-xs">
                  {new Date(r.fecha_visita).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/banreservas/sucursal/${r.codigo_br}`} className="text-zinc-900 font-medium hover:text-red-600 text-sm">
                    {r.oficina}
                  </Link>
                  <div className="text-[10px] text-zinc-400">{r.codigo_br}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded border border-blue-200 bg-blue-100 text-blue-700 uppercase tracking-wider">
                    {r.tipo_visita}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-600 text-xs">{r.supervisor}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs"
                    style={{ background: { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' }[r.categoria] }}>
                    {r.categoria}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-700 tabular-nums">{r.n_hallazgos}</td>
                <td className="px-3 py-2.5 text-right text-zinc-500 tabular-nums">{r.n_fotos}</td>
                <td className="px-3 py-2.5 text-xs">
                  {r.estado === 'En revisión'
                    ? <span className="text-amber-600 font-medium">En revisión</span>
                    : <span className="text-green-700">Notificado</span>
                  }
                </td>
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => setPreview(r)} className="text-red-600 hover:underline text-xs font-semibold mr-3">
                    Ver PDF
                  </button>
                  <button className="text-zinc-600 hover:underline text-xs">↓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length > 100 && (
          <div className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-200 bg-zinc-50">
            Mostrando 100 de {filtrados.length}.
          </div>
        )}
      </div>

      {/* Modal de preview PDF */}
      {preview && (
        <PreviewModal reporte={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function PreviewModal({ reporte, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-3 border-b border-zinc-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Preview PDF</div>
            <div className="text-sm font-bold text-zinc-900">{reporte.id}</div>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-red-600 px-2">×</button>
        </div>

        {/* Mock del PDF */}
        <div className="p-6 bg-zinc-50">
          <div className="bg-white shadow-xl border border-zinc-200 rounded max-w-[600px] mx-auto p-6">
            {/* Encabezado */}
            <div className="text-center pb-4 border-b-2 border-red-600">
              <div className="text-red-600 font-black text-xl tracking-tight">SUPER TECHOS</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{reporte.id}</div>
            </div>

            {/* Identificación */}
            <div className="bg-zinc-900 text-white px-3 py-2 mt-4 text-xs flex justify-between items-center">
              <span>Cliente: Banco de Reservas R.D.</span>
              <span>Sucursal: {reporte.oficina} ({reporte.codigo_br})</span>
              <span>{new Date(reporte.fecha_visita).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>

            {/* Datos */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
              <div className="flex justify-between border-b border-zinc-100 pb-1"><span className="text-zinc-500">Brigada:</span><span className="font-medium">{reporte.brigada}</span></div>
              <div className="flex justify-between border-b border-zinc-100 pb-1"><span className="text-zinc-500">Tipo de visita:</span><span className="font-medium">{reporte.tipo_visita}</span></div>
              <div className="flex justify-between border-b border-zinc-100 pb-1"><span className="text-zinc-500">Supervisor:</span><span className="font-medium">{reporte.supervisor}</span></div>
              <div className="flex justify-between border-b border-zinc-100 pb-1"><span className="text-zinc-500">Estado al cierre:</span>
                <span className="inline-block px-1.5 py-0 rounded text-white text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' }[reporte.categoria] }}>
                  {reporte.categoria}
                </span>
              </div>
            </div>

            {/* Sección 1 */}
            <div className="bg-red-600 text-white px-3 py-1 mt-4 text-[10px] font-bold uppercase tracking-wider">1. Resumen Ejecutivo</div>
            <div className="p-2 text-xs text-zinc-700 leading-relaxed">
              La visita {reporte.tipo_visita.toLowerCase()} del {new Date(reporte.fecha_visita).toLocaleDateString('es-DO')} evidenció {reporte.n_hallazgos > 0 ? `${reporte.n_hallazgos} hallazgos identificados` : 'condición estable del techo'}. Se ejecutaron las labores de mantenimiento preventivo incluidas en el alcance del Programa. Se asignó categoría {reporte.categoria} según rúbrica del Anexo B.
            </div>

            {/* Sección 2 */}
            <div className="bg-red-600 text-white px-3 py-1 mt-3 text-[10px] font-bold uppercase tracking-wider">2. Hallazgos Detectados ({reporte.n_hallazgos})</div>
            <div className="text-xs text-zinc-600 p-2 italic">
              Tabla detallada de hallazgos con ID, ubicación, severidad y acción recomendada — visible en el PDF completo.
            </div>

            {/* Sección 3 */}
            <div className="bg-red-600 text-white px-3 py-1 mt-3 text-[10px] font-bold uppercase tracking-wider">3. Registro Fotográfico ({reporte.n_fotos} fotos)</div>
            <div className="grid grid-cols-3 gap-1 p-2">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-square bg-zinc-200 rounded flex items-center justify-center text-zinc-500 text-[10px]">
                  IMG-{String(i).padStart(2,'0')}
                </div>
              ))}
            </div>

            {/* Firmas */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-zinc-200 text-xs">
              <div>
                <div className="text-zinc-500 text-[10px] mb-1">Firma técnico responsable</div>
                <div className="border-b border-zinc-300 h-6"></div>
                <div className="text-[10px] mt-1 text-zinc-700">{reporte.supervisor}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-[10px] mb-1">Recibí conforme — Sucursal</div>
                <div className="border-b border-zinc-300 h-6"></div>
                <div className="text-[10px] mt-1 text-zinc-700">Gerente Sucursal</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-zinc-200 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-2 border border-zinc-300 rounded hover:bg-zinc-50">Cerrar</button>
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded font-semibold hover:bg-red-700">↓ Descargar PDF</button>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, stripe }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 relative overflow-hidden">
      <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: stripe }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-xl font-bold text-zinc-900 mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}
