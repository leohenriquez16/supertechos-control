'use client';
// Bandeja de Solicitudes de levantamiento (admin). Lee/actúa vía /api/solicitudes
// (service_role, porque la tabla tiene RLS ON). El admin revisa, aprueba (crea/enlaza
// cliente + locación + levantamiento) o descarta.
import { useState, useEffect, useCallback } from 'react';
import { Loader2, MapPin, Phone, Mail, Camera, CheckCircle2, X, ExternalLink, Inbox } from 'lucide-react';

const TABS = [
  { k: 'nueva', label: 'Nuevas' },
  { k: 'aprobada', label: 'Aprobadas' },
  { k: 'descartada', label: 'Descartadas' },
];

export default function ModuloSolicitudes({ usuario, onRecargar }) {
  const [tab, setTab] = useState('nueva');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const cargar = useCallback(async (estado) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/solicitudes?estado=${estado}`);
      const j = await r.json();
      setItems(j.ok ? j.items : []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(tab); }, [tab, cargar]);

  const aprobar = async (s) => {
    const quien = s.cliente_existente ? `la locación se agregará al cliente existente "${s.cliente_existente.nombre}"` : `se creará el cliente nuevo "${s.cliente_nombre}"`;
    if (!confirm(`Aprobar ${s.ticket}: ${quien}, se creará la locación y el levantamiento en el Kanban. ¿Continuar?`)) return;
    setBusy(s.id);
    try {
      const r = await fetch('/api/solicitudes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, accion: 'aprobar', usuarioId: usuario?.id }) });
      const j = await r.json();
      if (j.ok) { alert(`Aprobada. Levantamiento ${s.ticket} creado en el Kanban.`); cargar(tab); onRecargar && onRecargar(); }
      else alert('No se pudo aprobar: ' + (j.error || 'error'));
    } catch { alert('Error de conexión.'); }
    setBusy(null);
  };

  const descartar = async (s) => {
    const motivo = prompt(`Descartar ${s.ticket}. Motivo (opcional):`, '');
    if (motivo === null) return;
    setBusy(s.id);
    try {
      const r = await fetch('/api/solicitudes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, accion: 'descartar', motivo, usuarioId: usuario?.id }) });
      const j = await r.json();
      if (j.ok) cargar(tab); else alert('No se pudo descartar.');
    } catch { alert('Error de conexión.'); }
    setBusy(null);
  };

  const mapsUrl = (s) => s.lat && s.lng ? `https://www.google.com/maps?q=${s.lat},${s.lng}` : (s.direccion ? `https://www.google.com/maps/search/${encodeURIComponent(s.direccion)}` : null);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Inbox className="w-6 h-6 text-red-500" />
        <h1 className="text-2xl font-black tracking-tight">Solicitudes de levantamiento</h1>
      </div>
      <div className="flex gap-1 mb-4 bg-zinc-900 p-1 rounded-card w-fit">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded ${tab === t.k ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10"><Loader2 className="w-6 h-6 text-red-500 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <div className="font-bold">Sin solicitudes {tab === 'nueva' ? 'nuevas' : tab === 'aprobada' ? 'aprobadas' : 'descartadas'}</div>
          <div className="text-xs mt-1">Las solicitudes del formulario público <span className="text-zinc-400">/solicitud</span> aparecen aquí.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black bg-zinc-950 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded">{s.ticket}</span>
                    {s.cliente_existente
                      ? <span className="text-[10px] font-bold bg-green-900/40 border border-green-700 text-green-300 px-2 py-0.5 rounded">Cliente existente</span>
                      : <span className="text-[10px] font-bold bg-amber-900/40 border border-amber-700 text-amber-300 px-2 py-0.5 rounded">Cliente nuevo</span>}
                    {s.urgencia && <span className="text-[10px] font-bold bg-red-900/30 border border-red-800 text-red-300 px-2 py-0.5 rounded">{s.urgencia}</span>}
                  </div>
                  <div className="text-lg font-black mt-1.5 truncate">{s.cliente_nombre}</div>
                  <div className="text-xs text-zinc-500">{s.tipo_id} {s.rnc}{s.cliente_existente ? ` · ${s.cliente_existente.nombre}` : ''}</div>
                </div>
                <div className="text-[11px] text-zinc-500 text-right whitespace-nowrap">{new Date(s.created_at).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-sm">
                <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-zinc-500" /> {s.contacto_telefono}</div>
                {s.contacto_email && <div className="flex items-center gap-1.5 min-w-0"><Mail className="w-3.5 h-3.5 text-zinc-500 flex-none" /> <span className="truncate">{s.contacto_email}</span></div>}
                <div className="sm:col-span-2 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 flex-none mt-0.5" />
                  <span>{s.locacion_nombre ? <b>{s.locacion_nombre} — </b> : ''}{s.direccion || '(pin en mapa)'}{s.punto_referencia ? <span className="text-zinc-500"> · ref: {s.punto_referencia}</span> : ''}
                    {mapsUrl(s) && <a href={mapsUrl(s)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5 ml-1"><ExternalLink className="w-3 h-3" />mapa</a>}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {[s.tipo_servicio, s.tipo_inmueble, s.area_aprox, s.acceso_techo, s.preferencia_visita].filter(Boolean).map((c, i) => (
                  <span key={i} className="text-[11px] bg-zinc-950 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{c}</span>
                ))}
              </div>

              {s.descripcion && <div className="text-sm text-zinc-300 mt-3 bg-zinc-950 border border-zinc-800 rounded p-2.5">{s.descripcion}</div>}

              {s.recibe_nombre && <div className="text-xs text-zinc-400 mt-2">Recibe en obra: <b>{s.recibe_nombre}</b> · {s.recibe_telefono}{s.recibe_cargo ? ` (${s.recibe_cargo})` : ''}</div>}

              {Array.isArray(s.fotos) && s.fotos.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {s.fotos.map((f, i) => f?.url && <a key={i} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="" className="w-16 h-16 object-cover rounded border border-zinc-800" /></a>)}
                </div>
              )}

              {s.referencia_previa && <div className="text-xs text-zinc-400 mt-2">Cotización previa declarada: <b>{s.referencia_previa}</b></div>}

              {tab === 'nueva' ? (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => aprobar(s)} disabled={busy === s.id}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-zinc-800 text-white text-xs font-black uppercase py-2.5 rounded flex items-center justify-center gap-1.5">
                    {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aprobar
                  </button>
                  <button onClick={() => descartar(s)} disabled={busy === s.id}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-black uppercase py-2.5 rounded flex items-center gap-1.5"><X className="w-4 h-4" /> Descartar</button>
                </div>
              ) : tab === 'aprobada' ? (
                <div className="text-xs text-green-400 mt-3 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Aprobada · levantamiento {s.ticket} creado</div>
              ) : (
                <div className="text-xs text-zinc-500 mt-3">Descartada{s.motivo_descarte ? `: ${s.motivo_descarte}` : ''}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
