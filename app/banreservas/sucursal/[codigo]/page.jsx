'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, notFound } from 'next/navigation';
import { obtenerSucursal } from '../../../../lib/data/banreservas-mock';

const COLOR_CAT = { A: '#16a34a', B: '#84cc16', C: '#f59e0b', D: '#dc2626' };
const COLOR_SEV = {
  'CRÍTICA': 'bg-red-600 text-white',
  'ALTA':    'bg-amber-500 text-white',
  'MEDIA':   'bg-yellow-400 text-zinc-900',
  'PREVIA':  'bg-zinc-400 text-white',
};

const HOY = new Date('2026-05-21');

function fmt(d) { return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtCorta(d) { return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtRD(n) {
  if (n == null) return 'Por cotizar';
  return `RD$ ${Number(n).toLocaleString('es-DO')}`;
}
function diasAtras(d) { return Math.floor((HOY - new Date(d)) / (1000 * 60 * 60 * 24)); }

const TABS = [
  { id: 'resumen',       label: 'Resumen' },
  { id: 'visitas',       label: 'Visitas',       counter: 'n_visitas' },
  { id: 'hallazgos',     label: 'Hallazgos',     counter: 'n_hallazgos' },
  { id: 'fotos',         label: 'Fotos',         counter: 'n_fotos' },
  { id: 'garantia',      label: 'Garantía' },
  { id: 'cotizaciones',  label: 'Cotizaciones',  counter: 'n_cotizaciones' },
  { id: 'facturacion',   label: 'Facturación' },
];

const FOTOS_GRID_RESUMEN = [
  { titulo: 'Vista general',         color: '#bfdbfe' },
  { titulo: 'Filtración detectada',  color: '#fed7aa' },
  { titulo: 'Pitch pan HVAC',        color: '#fecaca' },
  { titulo: 'Empozamiento NE',       color: '#bbf7d0' },
  { titulo: 'Imbornal limpio',       color: '#fde68a' },
  { titulo: 'Junta perimetral',      color: '#a5f3fc' },
];

export default function FichaSucursal() {
  const params = useParams();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get('tab') || 'resumen';
  const s = useMemo(() => obtenerSucursal(decodeURIComponent(params.codigo)), [params.codigo]);
  const [tab, setTab] = useState(initialTab);

  // Si cambia el query ?tab=... navegando, actualizar la pestaña
  useEffect(() => {
    const t = searchParams?.get('tab');
    if (t && TABS.some(x => x.id === t)) setTab(t);
  }, [searchParams]);

  if (!s) return notFound();

  const colorCat = COLOR_CAT[s.categoria];

  // Clasificación S/M/L determinística por código
  const tamañoCode = ((s.codigo || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 100;
  const tamaño = tamañoCode < 30 ? 'S' : (tamañoCode < 80 ? 'M' : 'L');
  const tamañoColor = { S: '#0ea5e9', M: '#8b5cf6', L: '#f97316' }[tamaño];
  const tamañoLabel = tamaño === 'S' ? 'S · Pequeña' : tamaño === 'M' ? 'M · Mediana' : 'L · Grande';

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-5">
      {/* Breadcrumb */}
      <div className="text-xs text-zinc-500 mb-3">
        <Link href="/banreservas" className="hover:text-zinc-900">Dashboard</Link>
        <span className="mx-1.5">›</span>
        <Link href="/banreservas/sucursales" className="hover:text-zinc-900">Oficinas</Link>
        <span className="mx-1.5">›</span>
        <span className="text-zinc-700">Banreservas {s.zona}</span>
      </div>

      {/* Header oficina */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Oficina Banreservas {s.zona}</h1>
          <div className="text-xs text-zinc-500 mt-1">
            Código {s.codigo_br} · {s.regional} · {s.provincia} · {s.area_m2} m² techo
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Tamaño</span>
            <span className="px-3 py-1.5 text-white font-bold text-xs uppercase tracking-wider rounded"
              style={{ background: tamañoColor }}>
              {tamañoLabel}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Estado</span>
            <button
              className="px-3 py-1.5 text-white font-bold text-xs uppercase tracking-wider rounded"
              style={{ background: colorCat }}
            >
              {s.categoria}
            </button>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${s.latitud},${s.longitud}`}
            target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 text-xs font-semibold rounded hover:bg-zinc-50 ml-2 flex items-center gap-1.5"
          >
            <span>📍</span> Ver en Maps
          </a>
          <button className="px-4 py-2 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800">
            Programar Visita
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 mt-5 mb-5 overflow-x-auto">
        <div className="flex items-center gap-6 min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-2 text-sm border-b-2 transition whitespace-nowrap ${
                tab === t.id
                  ? 'text-zinc-900 border-zinc-900 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-800 border-transparent'
              }`}
            >
              {t.label}
              {t.counter && <span className="text-zinc-400 ml-1">({s[t.counter]})</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resumen'      && <TabResumen      s={s} />}
      {tab === 'visitas'      && <TabVisitas      s={s} />}
      {tab === 'hallazgos'    && <TabHallazgos    s={s} />}
      {tab === 'fotos'        && <TabFotos        s={s} />}
      {tab === 'garantia'     && <TabGarantia     s={s} />}
      {tab === 'cotizaciones' && <TabCotizaciones s={s} />}
      {tab === 'facturacion'  && <TabFacturacion  s={s} />}
    </div>
  );
}

// ════════════ TAB RESUMEN ════════════
function TabResumen({ s }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Section title="Información Técnica">
          <Row k="Sistema actual"        v={s.sistema} />
          <Row k="Marca producto"        v={s.marca_producto} />
          <Row k="Fecha instalación"     v={fmt(s.fecha_instalacion)} />
          <Row k="Aplicador original"    v={s.aplicador_original} />
          <Row k="Área techo"            v={`${s.area_m2} m² (${fmtCorta(s.fecha_instalacion)})`} />
          <Row k="Tamaño operativo"      v={(() => {
            const c = ((s.codigo || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 100;
            return c < 30 ? 'S · Pequeña (<200 m²)' : c < 80 ? 'M · Mediana (200-500 m²)' : 'L · Grande (>500 m²)';
          })()} />
          <Row k="Unidades de AC"        v={`${s.penetraciones_hvac} unidades en cubierta`} />
          {s.n_tinacos > 0 && <Row k="Tinacos"               v={`${s.n_tinacos} unidad${s.n_tinacos > 1 ? 'es' : ''}`} />}
          <Row k="Bajantes"              v={`${s.n_bajantes} imbornales`} />
          {s.areas_detalle && (
            <div className="text-[11px] text-zinc-500 mt-2 pt-2 border-t border-zinc-100">
              <div className="text-zinc-700 font-semibold mb-1">Áreas medidas en levantamiento:</div>
              {s.areas_detalle.map((a, i) => (
                <div key={i} className="flex justify-between">
                  <span>{a.nombre}</span>
                  <span className="font-mono text-zinc-600">{a.medida} = {a.m2.toFixed(2)} m²</span>
                </div>
              ))}
            </div>
          )}
          <Row k="Accesos"               v={s.accesos} />
          <Row k="Contacto local"        v={s.contacto_local} />
          <Row k="Última visita"         v={`${fmt(s.ultima_visita)} (hace ${diasAtras(s.ultima_visita)} días)`} />
          <Row k="Próxima visita"        v={fmt(s.proxima_visita)} />
        </Section>

        <Section title="Última Inspección · Fotos" sub={fmtCorta(s.ultima_visita)}>
          {s.fotos_reales && s.fotos_reales.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {s.fotos_reales.map((f, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/oficinas/${s.codigo_br}/${f.archivo}`}
                    alt={f.caption}
                    className="w-full aspect-square object-cover rounded border border-zinc-200"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/85 text-white text-[9px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition rounded-b">
                    {f.caption}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {FOTOS_GRID_RESUMEN.map((f, i) => (
                <div key={i} className="aspect-square rounded border border-zinc-200 flex items-center justify-center text-[10px] text-zinc-700 font-medium px-1 text-center" style={{ background: f.color }}>
                  {f.titulo}
                </div>
              ))}
            </div>
          )}
          {s.levantamiento_real && (
            <div className="mt-3 text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
              ✓ Fotos del levantamiento real ejecutado el {fmtCorta(s.ultima_visita)}
            </div>
          )}
        </Section>

        <Section title="Historial de Visitas">
          <div className="space-y-3">
            {s.historial.map((h, i) => {
              const dotColor = h.nota.includes('degradado') ? '#dc2626'
                             : h.nota.includes('reemplazado') ? '#f59e0b'
                             : h.nota.includes('Sin novedad') ? '#16a34a'
                             : '#84cc16';
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: dotColor }} />
                  <div>
                    <div className="font-semibold text-zinc-900">{fmt(h.fecha)}</div>
                    <div className="text-zinc-500">{h.tipo}</div>
                    <div className="text-[11px]" style={{ color: dotColor }}>{h.nota}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Mapa Google Maps */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm mb-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Ubicación</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.direccion}</div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitud},${s.longitud}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-semibold flex items-center gap-1.5"
            >
              🚗 Cómo llegar
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${s.latitud},${s.longitud}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 border border-zinc-300 text-zinc-700 rounded hover:bg-zinc-50 font-semibold flex items-center gap-1.5"
            >
              📍 Abrir en Maps
            </a>
          </div>
        </div>
        <iframe
          title="Mapa de la oficina"
          src={`https://www.google.com/maps?q=${s.latitud},${s.longitud}&z=17&output=embed`}
          width="100%"
          height="380"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Coordenadas: <strong className="font-mono text-zinc-700">{s.latitud}, {s.longitud}</strong></span>
          <span>{s.provincia} · {s.regional}</span>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Hallazgos Críticos Pendientes</div>
            <div className="text-xs text-red-600 mt-0.5">Generar Cotización Correctiva</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-4 py-2">ID</th>
              <th className="text-left px-4 py-2">Hallazgo</th>
              <th className="text-left px-4 py-2">Ubicación</th>
              <th className="text-left px-4 py-2">Severidad</th>
              <th className="text-left px-4 py-2">Recomendación</th>
              <th className="text-right px-4 py-2">Costo Est.</th>
              <th className="text-left px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {s.hallazgos_criticos.map(h => (
              <tr key={h.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{h.id}</td>
                <td className="px-4 py-2.5 text-zinc-900 font-medium">{h.tipo}</td>
                <td className="px-4 py-2.5 text-zinc-600 text-xs">{h.ubicacion}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${COLOR_SEV[h.severidad]}`}>
                    {h.severidad}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-600 text-xs">{h.accion}</td>
                <td className="px-4 py-2.5 text-right text-zinc-900 font-semibold tabular-nums">{fmtRD(h.costo)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${
                    h.estado === 'En curso' ? 'text-red-600'
                    : h.estado === 'Cotizar' ? 'text-amber-600'
                    : 'text-zinc-700'
                  }`}>
                    {h.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ════════════ TAB VISITAS ════════════
function TabVisitas({ s }) {
  return (
    <Card>
      <CardHeader title={`Historial completo · ${s.visitas_completas.length} visitas`} sub="Reportes formales de cada visita programada y ejecutada" />
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
          <tr>
            <th className="text-left px-4 py-2">Folio</th>
            <th className="text-left px-4 py-2">Fecha</th>
            <th className="text-left px-4 py-2">Tipo</th>
            <th className="text-left px-4 py-2">Brigada · Supervisor</th>
            <th className="text-center px-4 py-2">Cat.</th>
            <th className="text-right px-4 py-2">Hallazgos</th>
            <th className="text-right px-4 py-2">Fotos</th>
            <th className="text-left px-4 py-2">Reporte</th>
            <th className="text-left px-4 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {s.visitas_completas.map(v => (
            <tr key={v.id} className="hover:bg-zinc-50">
              <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{v.folio}</td>
              <td className="px-4 py-2.5 text-zinc-900">{fmt(v.fecha)}</td>
              <td className="px-4 py-2.5">
                <TipoBadge tipo={v.tipo} />
              </td>
              <td className="px-4 py-2.5 text-zinc-700 text-xs">
                <div className="font-medium">{v.supervisor}</div>
                <div className="text-zinc-500">{v.brigada}</div>
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className="inline-block w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center" style={{ background: COLOR_CAT[v.categoria_asignada], lineHeight: '24px' }}>
                  {v.categoria_asignada}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{v.n_hallazgos}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{v.n_fotos}</td>
              <td className="px-4 py-2.5 text-xs">
                {v.reporte_pdf
                  ? <button className="text-red-600 hover:underline">↓ PDF</button>
                  : <span className="text-zinc-400">—</span>
                }
              </td>
              <td className="px-4 py-2.5 text-xs">
                {v.estado === 'pendiente_revision'
                  ? <span className="text-amber-600 font-medium">Pendiente revisión</span>
                  : <span className="text-green-700">Notificada banco</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function TipoBadge({ tipo }) {
  const cls = tipo === 'Emergencia' ? 'bg-red-100 text-red-700 border-red-200'
            : tipo === 'Correctiva' ? 'bg-amber-100 text-amber-700 border-amber-200'
            : 'bg-blue-100 text-blue-700 border-blue-200';
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wider ${cls}`}>{tipo}</span>;
}

// ════════════ TAB HALLAZGOS ════════════
function TabHallazgos({ s }) {
  const [sevFiltro, setSevFiltro] = useState(null);
  const filtrados = sevFiltro ? s.hallazgos_todos.filter(h => h.severidad === sevFiltro) : s.hallazgos_todos;

  const conteo = { 'CRÍTICA': 0, 'ALTA': 0, 'MEDIA': 0, 'PREVIA': 0 };
  s.hallazgos_todos.forEach(h => { conteo[h.severidad] = (conteo[h.severidad] || 0) + 1; });

  return (
    <Card>
      <CardHeader title={`Hallazgos detectados · ${s.hallazgos_todos.length}`} sub="Vista consolidada de todos los hallazgos registrados en visitas">
        <div className="flex items-center gap-1.5 mt-1.5">
          {['CRÍTICA','ALTA','MEDIA','PREVIA'].map(sev => (
            <button
              key={sev}
              onClick={() => setSevFiltro(sevFiltro === sev ? null : sev)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider transition ${
                sevFiltro === sev ? COLOR_SEV[sev] + ' ring-2 ring-offset-1 ring-zinc-400' : `${COLOR_SEV[sev]} opacity-60 hover:opacity-100`
              }`}
            >
              {sev} · {conteo[sev]}
            </button>
          ))}
          {sevFiltro && (
            <button onClick={() => setSevFiltro(null)} className="text-[11px] text-zinc-500 hover:text-zinc-700 ml-2">Limpiar</button>
          )}
        </div>
      </CardHeader>
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
          <tr>
            <th className="text-left px-4 py-2">ID</th>
            <th className="text-left px-4 py-2">Detectado</th>
            <th className="text-left px-4 py-2">Hallazgo</th>
            <th className="text-left px-4 py-2">Ubicación</th>
            <th className="text-left px-4 py-2">Severidad</th>
            <th className="text-right px-4 py-2">Costo Est.</th>
            <th className="text-left px-4 py-2">OS</th>
            <th className="text-left px-4 py-2">Estado</th>
            <th className="text-left px-4 py-2">Supervisor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {filtrados.map(h => (
            <tr key={h.id} className="hover:bg-zinc-50">
              <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{h.id}</td>
              <td className="px-4 py-2.5 text-zinc-700 text-xs">{fmtCorta(h.fecha_detectado)}</td>
              <td className="px-4 py-2.5 text-zinc-900 font-medium">{h.tipo}</td>
              <td className="px-4 py-2.5 text-zinc-600 text-xs">{h.ubicacion}</td>
              <td className="px-4 py-2.5">
                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${COLOR_SEV[h.severidad]}`}>
                  {h.severidad}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-900 font-semibold tabular-nums text-xs">{fmtRD(h.costo)}</td>
              <td className="px-4 py-2.5 text-xs">
                {h.os_folio
                  ? <span className="text-blue-700 font-mono">{h.os_folio}</span>
                  : <span className="text-zinc-400">—</span>
                }
              </td>
              <td className="px-4 py-2.5 text-xs text-zinc-700">{h.estado}</td>
              <td className="px-4 py-2.5 text-xs text-zinc-500">{h.detectado_por}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ════════════ TAB FOTOS ════════════
function TabFotos({ s }) {
  const [sevFiltro, setSevFiltro] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  // Si tiene fotos reales, las usa; si no, los placeholders mock
  const tieneReales = s.fotos_reales && s.fotos_reales.length > 0;

  if (tieneReales) {
    return (
      <Card>
        <CardHeader
          title={`Galería · ${s.fotos_reales.length} fotos`}
          sub={`Levantamiento real del ${fmtCorta(s.ultima_visita)}`}
        />
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {s.fotos_reales.map((f, i) => (
            <div
              key={i}
              className="group relative aspect-square rounded overflow-hidden border border-zinc-200 cursor-pointer hover:shadow-lg transition"
              onClick={() => setLightbox(f)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/oficinas/${s.codigo_br}/${f.archivo}`}
                alt={f.caption}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] bg-zinc-900/85 text-white rounded font-mono">
                {String(i + 1).padStart(2, '0')}/{s.fotos_reales.length}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-900/95 to-transparent text-white text-[10px] px-2 py-3 pt-6">
                {f.caption}
              </div>
            </div>
          ))}
        </div>

        {/* Lightbox */}
        {lightbox && (
          <div
            onClick={() => setLightbox(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="max-w-5xl w-full max-h-[90vh] flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/oficinas/${s.codigo_br}/${lightbox.archivo}`}
                alt={lightbox.caption}
                className="max-w-full max-h-[80vh] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="text-white text-center mt-4 text-sm">
                {lightbox.caption}
              </div>
              <div className="text-zinc-400 text-xs mt-1">
                Click fuera para cerrar
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  // Versión con placeholders mock (oficinas sin levantamiento real cargado)
  const fotos = sevFiltro ? s.fotos.filter(f => f.severidad === sevFiltro) : s.fotos;
  return (
    <Card>
      <CardHeader title={`Galería · ${s.fotos.length} fotos`} sub="Evidencia visual capturada en todas las visitas a la oficina">
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] uppercase tracking-wider font-semibold">
          {[
            { k: 'ok', label: 'OK',        cls: 'bg-green-600 text-white' },
            { k: 'atencion', label: 'Atención', cls: 'bg-amber-500 text-white' },
            { k: 'critico', label: 'Crítico', cls: 'bg-red-600 text-white' },
          ].map(b => (
            <button
              key={b.k}
              onClick={() => setSevFiltro(sevFiltro === b.k ? null : b.k)}
              className={`px-2 py-0.5 rounded transition ${sevFiltro === b.k ? b.cls : `${b.cls} opacity-60 hover:opacity-100`}`}
            >
              {b.label} · {s.fotos.filter(f => f.severidad === b.k).length}
            </button>
          ))}
          {sevFiltro && <button onClick={() => setSevFiltro(null)} className="normal-case tracking-normal text-zinc-500 hover:text-zinc-700 text-[11px]">Limpiar</button>}
        </div>
      </CardHeader>
      <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {fotos.slice(0, 96).map(f => {
          const sevColor = f.severidad === 'critico' ? '#dc2626' : f.severidad === 'atencion' ? '#f59e0b' : '#16a34a';
          return (
            <div key={f.id} className="group relative aspect-square rounded overflow-hidden border border-zinc-200 cursor-pointer">
              <div className="w-full h-full flex items-center justify-center text-[9px] text-zinc-700 font-medium p-1 text-center" style={{ background: f.color }}>
                {f.caption}
              </div>
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white" style={{ background: sevColor }} />
              <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/80 text-white text-[9px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                <div className="truncate">{fmtCorta(f.fecha)}</div>
                <div className="truncate text-zinc-300">{f.supervisor}</div>
              </div>
            </div>
          );
        })}
      </div>
      {fotos.length > 96 && (
        <div className="px-4 py-3 border-t border-zinc-200 text-xs text-zinc-500">
          Mostrando 96 de {fotos.length}. Aplica filtros para ver el resto.
        </div>
      )}
    </Card>
  );
}

// ════════════ TAB GARANTÍA ════════════
function TabGarantia({ s }) {
  const dias = Math.floor((s.vencimiento_garantia - HOY) / (1000 * 60 * 60 * 24));
  const meses = Math.floor(Math.abs(dias) / 30);
  const colorEstado = s.garantia_estado === 'vencida' ? '#dc2626' : s.garantia_estado === 'por_vencer' ? '#f59e0b' : '#16a34a';
  const labelEstado = s.garantia_estado === 'vencida' ? 'VENCIDA' : s.garantia_estado === 'por_vencer' ? 'POR VENCER' : 'VIGENTE';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader title="Garantía vigente" sub="Información del contrato de garantía original con el aplicador">
            <span className="inline-block mt-1.5 px-3 py-0.5 text-[11px] font-bold text-white rounded uppercase tracking-wider" style={{ background: colorEstado }}>
              {labelEstado}
            </span>
          </CardHeader>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Sistema garantizado"   v={s.sistema} />
            <Row k="Marca producto"        v={s.marca_producto} />
            <Row k="Aplicador original"    v={s.aplicador_original} />
            <Row k="Fecha instalación"     v={fmt(s.fecha_instalacion)} />
            <Row k="Vigencia"              v={`${s.vigencia_garantia_años} años`} />
            <Row k="Vencimiento"           v={fmt(s.vencimiento_garantia)} />
            <Row k="Tiempo restante"       v={dias > 0 ? `${meses} meses` : `Vencida hace ${meses} meses`} />
            <Row k="Próxima inspección"    v={fmt(s.proxima_visita)} />
          </div>
        </Card>

        {s.garantia_estado !== 'vigente' && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-4">
            <div className="text-sm font-semibold text-amber-900">⚠ Acción recomendada</div>
            <div className="text-xs text-amber-800 mt-1">
              {s.garantia_estado === 'vencida'
                ? `La garantía venció hace ${meses} meses. La sucursal opera sin cobertura — programar inspección de cierre + auditoría completa con el aplicador.`
                : `Quedan ${meses} meses de vigencia. Programar inspección formal de cierre antes de la fecha límite para activar reclamo de garantía si se identifican defectos cubiertos.`
              }
            </div>
            <button className="mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded">
              Programar inspección de cierre
            </button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader title="Reclamos históricos" sub="Defectos cubiertos por garantía reportados al aplicador" />
        <div className="p-4 text-xs text-zinc-500">
          Sin reclamos registrados en esta sucursal.
          <div className="mt-3">
            <button className="text-red-600 hover:underline text-xs font-semibold">+ Registrar nuevo reclamo</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ════════════ TAB COTIZACIONES ════════════
function TabCotizaciones({ s }) {
  const totalAprobado = s.cotizaciones
    .filter(c => ['Aprobada','Programada','En ejecución','Ejecutada','Facturada','Pagada'].includes(c.estado))
    .reduce((a, c) => a + c.total, 0);
  const totalPendiente = s.cotizaciones
    .filter(c => c.estado === 'Pendiente aprobación')
    .reduce((a, c) => a + c.total, 0);

  if (s.cotizaciones.length === 0) {
    return (
      <Card>
        <CardHeader title="Órdenes de Servicio" sub="Sin cotizaciones registradas en esta sucursal" />
        <div className="p-12 text-center text-zinc-500 text-sm">
          Esta sucursal no tiene órdenes de servicio adicionales.
          Los trabajos correctivos menores se ejecutan bajo cuota fija mensual.
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <MiniKpi label="Total OS" value={s.cotizaciones.length} stripe="#3b82f6" />
        <MiniKpi label="Aprobado/Ejecutado" value={fmtRD(totalAprobado)} stripe="#16a34a" />
        <MiniKpi label="Pendiente aprobación" value={fmtRD(totalPendiente)} stripe="#f59e0b" />
      </div>

      <Card>
        <CardHeader title="Listado de cotizaciones" sub="Órdenes de servicio generadas para esta sucursal" />
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-4 py-2">Folio</th>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Descripción</th>
              <th className="text-center px-4 py-2">Líneas</th>
              <th className="text-right px-4 py-2">Subtotal</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Aprobado por</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {s.cotizaciones.map(c => (
              <tr key={c.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5 text-blue-700 font-mono text-xs">{c.folio}</td>
                <td className="px-4 py-2.5 text-zinc-700 text-xs">{fmtCorta(c.fecha)}</td>
                <td className="px-4 py-2.5 text-zinc-900 text-xs">{c.descripcion}</td>
                <td className="px-4 py-2.5 text-center text-zinc-500 text-xs">{c.n_lineas}</td>
                <td className="px-4 py-2.5 text-right text-zinc-700 tabular-nums text-xs">{fmtRD(c.subtotal)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-900 font-semibold tabular-nums text-xs">{fmtRD(c.total)}</td>
                <td className="px-4 py-2.5">
                  <EstadoOsBadge estado={c.estado} />
                </td>
                <td className="px-4 py-2.5 text-zinc-500 text-xs">{c.aprobado_por || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function EstadoOsBadge({ estado }) {
  const map = {
    'Borrador':              'bg-zinc-100 text-zinc-700 border-zinc-200',
    'Pendiente aprobación':  'bg-amber-100 text-amber-700 border-amber-300',
    'Aprobada':              'bg-blue-100 text-blue-700 border-blue-300',
    'Programada':            'bg-blue-100 text-blue-700 border-blue-300',
    'En ejecución':          'bg-purple-100 text-purple-700 border-purple-300',
    'Ejecutada':             'bg-green-100 text-green-700 border-green-300',
    'Facturada':             'bg-green-100 text-green-700 border-green-300',
    'Pagada':                'bg-green-600 text-white border-green-700',
    'Rechazada':             'bg-red-100 text-red-700 border-red-300',
  };
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wider ${map[estado] || map['Borrador']}`}>{estado}</span>;
}

// ════════════ TAB FACTURACIÓN ════════════
function TabFacturacion({ s }) {
  if (s.facturas.length === 0) {
    return (
      <Card>
        <CardHeader title="Facturación" sub="Cuota fija mensual del Programa PNM (incluye esta sucursal)" />
        <div className="p-6 text-sm text-zinc-700">
          Esta sucursal está cubierta por la <strong>cuota fija mensual del Programa Nacional de Mantenimiento</strong> (RD$ 950,000 / mes total programa).
          <div className="mt-3 text-xs text-zinc-500">
            No tiene facturas individuales — los trabajos preventivos y correctivos menores se incluyen en el contrato base.
            Las facturas adicionales solo se generan cuando hay OS aprobadas fuera de cuota.
          </div>
        </div>
      </Card>
    );
  }

  const totalFacturado = s.facturas.reduce((a, f) => a + f.total, 0);
  const totalPagado = s.facturas.filter(f => f.estado_pago === 'Pagada').reduce((a, f) => a + f.total, 0);
  const totalPendiente = totalFacturado - totalPagado;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <MiniKpi label="Total facturado" value={fmtRD(totalFacturado)} stripe="#3b82f6" />
        <MiniKpi label="Pagado" value={fmtRD(totalPagado)} stripe="#16a34a" />
        <MiniKpi label="Por cobrar" value={fmtRD(totalPendiente)} stripe="#f59e0b" />
      </div>

      <Card>
        <CardHeader title="Facturas emitidas" sub="OS facturadas adicionales a la cuota fija del programa" />
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            <tr>
              <th className="text-left px-4 py-2">NCF</th>
              <th className="text-left px-4 py-2">Fecha</th>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-right px-4 py-2">Monto</th>
              <th className="text-right px-4 py-2">ITBIS</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-left px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {s.facturas.map(f => (
              <tr key={f.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5 text-zinc-700 font-mono text-xs">{f.ncf}</td>
                <td className="px-4 py-2.5 text-zinc-700 text-xs">{fmtCorta(f.fecha_emision)}</td>
                <td className="px-4 py-2.5 text-zinc-900 text-xs">{f.concepto}</td>
                <td className="px-4 py-2.5 text-right text-zinc-700 tabular-nums text-xs">{fmtRD(f.monto)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-500 tabular-nums text-xs">{fmtRD(f.itbis)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-900 font-semibold tabular-nums text-xs">{fmtRD(f.total)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wider ${
                    f.estado_pago === 'Pagada'    ? 'bg-green-100 text-green-700 border-green-300'
                    : f.estado_pago === 'Vencida' ? 'bg-red-100 text-red-700 border-red-300'
                    : 'bg-amber-100 text-amber-700 border-amber-300'
                  }`}>
                    {f.estado_pago}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4">
        <Card>
          <CardHeader title="Documentos asociados" sub="Planos, contratos, fichas técnicas y reportes" />
          <div className="divide-y divide-zinc-100">
            {s.documentos.map(d => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-50">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-400 text-xs">📄</span>
                  <div>
                    <div className="text-sm text-zinc-900">{d.nombre}</div>
                    <div className="text-[11px] text-zinc-500">
                      {d.tipo} · {fmtCorta(d.fecha)} · {d.tamano_kb.toLocaleString()} KB · subido por {d.subido_por}
                    </div>
                  </div>
                </div>
                <button className="text-red-600 hover:underline text-xs font-semibold">↓ Descargar</button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

// ════════════ HELPERS UI ════════════
function Card({ children }) {
  return <div className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">{children}</div>;
}

function CardHeader({ title, sub, children }) {
  return (
    <div className="px-4 py-3 border-b border-zinc-200">
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
      {children}
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-200">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
      </div>
      <div className="p-4 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-zinc-500 flex-shrink-0">{k}</span>
      <span className="text-zinc-900 text-right">{v}</span>
    </div>
  );
}

function MiniKpi({ label, value, stripe }) {
  return (
    <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 relative overflow-hidden">
      <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: stripe }} />
      <div className="text-[10px] text-zinc-500 uppercase tracking-[1.5px] font-semibold">{label}</div>
      <div className="text-xl font-bold text-zinc-900 mt-1 tabular-nums">{value}</div>
    </div>
  );
}
