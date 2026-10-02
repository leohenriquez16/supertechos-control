'use client';
// v8.59.0 — PORTAL DEL CLIENTE de un programa multi-sitio (Towers and Sites).
// Sin login: se entra con la clave del programa. Lee y escribe solo por /api/programa/[codigo].
// Lo primero que ve el cliente es lo que depende de él (luz verde, cotizaciones, supervisores);
// después el avance de cada locación en mapa y en lista, con su línea de tiempo.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const MapaPrograma = dynamic(() => import('../../../components/programas/MapaPrograma'), { ssr: false, loading: () => <div className="pp-cargando">Cargando mapa…</div> });

// Misma paleta del ERP; "Entregado" va oscuro porque el portal es claro.
const COLOR = {
  sin_luz_verde: '#888780', por_levantar: '#BA7517', levantado: '#378ADD', cotizado: '#7F77DD',
  por_programar: '#D85A30', en_ejecucion: '#639922', terminado: '#1D9E75', entregado: '#2C2C2A',
};
const fmtRD = (n) => n == null ? '—' : 'RD$' + Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtF = (f) => { if (!f) return ''; try { return new Date(f).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }); } catch { return ''; } };

const CSS = `
:root{--paper:#F6F5F3;--ink:#17191C;--muted:#62676F;--line:#E3E1DD;--card:#fff;--red:#CC0000;--ok:#1E7A46;--warn:#B7791F}
.pp *{box-sizing:border-box}
.pp{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;line-height:1.5;font-size:15px}
.pp-wrap{max-width:1040px;margin:0 auto;padding:0 16px 48px}
.pp-top{background:#fff;border-bottom:4px solid var(--red)}
.pp-top .pp-wrap{display:flex;align-items:center;gap:16px;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
.pp-top img{height:38px;width:auto}
.pp-top h1{font-size:1.15rem;margin:0;font-weight:800;letter-spacing:-.01em}
.pp-top .pp-sub{color:var(--muted);font-size:.85rem}
.pp-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.pp-grid{display:grid;gap:14px}
.pp-kpis{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:18px}
.pp-kpi b{display:block;font-size:1.9rem;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.pp-kpi span{color:var(--muted);font-size:.8rem}
.pp-barra{display:flex;height:14px;border-radius:999px;overflow:hidden;background:#ECEAE6;margin:14px 0 8px}
.pp-barra div{height:100%}
.pp-ley{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.78rem;color:var(--muted)}
.pp-ley i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
.pp-h2{font-size:1rem;font-weight:800;margin:26px 0 10px;letter-spacing:-.005em}
.pp-pend{border-left:4px solid var(--warn)}
.pp-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.pp-fila:first-of-type{border-top:none}
.pp-fila .pp-n{font-weight:700}
.pp-fila .pp-d{color:var(--muted);font-size:.8rem}
.pp-btn{font:inherit;font-weight:700;font-size:.85rem;border:none;border-radius:9px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.pp-btn:disabled{opacity:.5;cursor:not-allowed}
.pp-btn.prim{background:var(--red);color:#fff}
.pp-btn.ok{background:var(--ok);color:#fff}
.pp-btn.sec{background:#EFEDEA;color:var(--ink)}
.pp-btn:focus-visible,.pp-in:focus-visible{outline:3px solid rgba(204,0,0,.35);outline-offset:2px}
.pp-tabs{display:flex;gap:6px;margin:26px 0 12px;flex-wrap:wrap}
.pp-tab{font:inherit;font-weight:700;font-size:.85rem;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:#fff;cursor:pointer}
.pp-tab.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.pp-in{font:inherit;font-size:.95rem;width:100%;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;background:#FCFBFA}
.pp-chip{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px;white-space:nowrap}
.pp-loc{border-top:1px solid var(--line);padding:12px 0}
.pp-loc:first-child{border-top:none}
.pp-loc-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;cursor:pointer}
.pp-tl{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin:12px 0 4px}
.pp-tl div{height:6px;border-radius:3px;background:#E6E3DE}
.pp-tl-l{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.02em}
.pp-det{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:12px;font-size:.88rem}
.pp-det dt{color:var(--muted);font-size:.75rem}
.pp-det dd{margin:0;font-weight:600}
.pp-login{max-width:420px;margin:60px auto;padding:0 16px}
.pp-err{color:var(--red);font-size:.88rem;margin-top:8px}
.pp-aviso{background:#EAF6EF;color:var(--ok);border-radius:10px;padding:10px 12px;font-size:.88rem;margin-top:12px}
.pp-cargando{padding:40px;text-align:center;color:var(--muted)}
.pp-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px;z-index:50}
.pp-modal .pp-card{width:100%;max-width:440px}
.pp-pie{margin-top:36px;color:var(--muted);font-size:.78rem;text-align:center}
.pp-ficha{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:40;overflow-y:auto;padding:16px}
.pp-ficha-in{max-width:860px;margin:0 auto;background:var(--paper);border-radius:16px;overflow:hidden}
.pp-ficha-cab{background:#fff;padding:18px 20px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:flex-start}
.pp-ficha-cuerpo{padding:18px 20px;display:grid;gap:14px}
.pp-pasos{display:grid;gap:0}
.pp-paso{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:6px 0;font-size:.88rem}
.pp-paso .pp-pt{width:14px;height:14px;border-radius:50%;border:2px solid #CFCAC3;background:#fff;margin:0 auto}
.pp-paso.hecho .pp-pt{border-color:var(--c);background:var(--c)}
.pp-paso.actual .pp-pt{border-color:var(--c);box-shadow:0 0 0 4px color-mix(in srgb, var(--c) 22%, transparent)}
.pp-paso.actual{font-weight:800}
.pp-paso.pend{color:var(--muted)}
.pp-galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.pp-galeria button{border:none;padding:0;background:#E9E6E1;border-radius:10px;overflow:hidden;cursor:zoom-in;aspect-ratio:4/3;position:relative}
.pp-galeria img{width:100%;height:100%;object-fit:cover;display:block}
.pp-galeria .pp-crit{position:absolute;top:6px;left:6px;background:var(--red);color:#fff;font-size:.65rem;font-weight:800;padding:2px 6px;border-radius:6px}
.pp-lb{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:60;display:grid;place-items:center;padding:16px}
.pp-lb img{max-width:100%;max-height:78vh;border-radius:8px}
.pp-lb-bar{color:#fff;display:flex;gap:10px;align-items:center;justify-content:center;margin-top:10px;font-size:.9rem;flex-wrap:wrap}
.pp-tabla{width:100%;border-collapse:collapse;font-size:.88rem}
.pp-tabla td{padding:7px 0;border-bottom:1px solid var(--line)}
.pp-tabla td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
@media (max-width:560px){.pp-tl-l{display:none}.pp-fila{flex-wrap:wrap}.pp-ficha{padding:0}.pp-ficha-in{border-radius:0}}
@media (prefers-reduced-motion:no-preference){.pp-btn,.pp-tab{transition:background .15s,opacity .15s}}
`;

export default function PortalPrograma() {
  const { codigo } = useParams();
  const [clave, setClave] = useState('');
  const [quien, setQuien] = useState('');
  const [entrado, setEntrado] = useState(false);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [tab, setTab] = useState('lista');
  const [filtro, setFiltro] = useState('todas');
  const [buscar, setBuscar] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [modal, setModal] = useState(null); // { tipo, loc }
  const [form, setForm] = useState({});
  const [enviando, setEnviando] = useState(false);
  // v8.59.1: ficha completa de un sitio (datos, línea de tiempo, áreas y fotos)
  const [ficha, setFicha] = useState(null);       // locación abierta
  const [fichaData, setFichaData] = useState(null);
  const [fichaCargando, setFichaCargando] = useState(false);
  const [fotoGrande, setFotoGrande] = useState(null); // índice en la galería

  const llave = `portal-${codigo}`;
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(llave) || '{}');
      if (g.clave) setClave(g.clave);
      if (g.quien) setQuien(g.quien);
    } catch { /* sin almacenamiento */ }
  }, [llave]);

  const cargar = useCallback(async (c = clave) => {
    setCargando(true); setError('');
    try {
      const r = await fetch(`/api/programa/${codigo}`, { headers: { 'x-clave': c } });
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'No se pudo entrar.'); setEntrado(false); }
      else { setData(j); setEntrado(true); }
    } catch { setError('Sin conexión. Intenta de nuevo.'); }
    setCargando(false);
  }, [codigo, clave]);

  const entrar = (e) => {
    e.preventDefault();
    if (!clave.trim()) { setError('Escribe la clave del programa.'); return; }
    if (!quien.trim()) { setError('Escribe tu nombre: queda registrado en lo que apruebes.'); return; }
    try { localStorage.setItem(llave, JSON.stringify({ clave: clave.trim(), quien: quien.trim() })); } catch { /* noop */ }
    cargar(clave.trim());
  };

  // Entrada automática si ya había entrado antes en este equipo
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(llave) || '{}');
      if (g.clave && g.quien) cargar(g.clave);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirFicha = async (loc) => {
    setFicha(loc); setFichaData(null); setFichaCargando(true); setFotoGrande(null);
    try {
      const r = await fetch(`/api/programa/${codigo}/locacion/${loc.id}`, { headers: { 'x-clave': clave } });
      const j = await r.json();
      if (j.ok) setFichaData(j); else setError(j.error || 'No se pudo abrir la ficha.');
    } catch { setError('Sin conexión. Intenta de nuevo.'); }
    setFichaCargando(false);
  };

  const accion = async (tipo, loc, datos = {}) => {
    setEnviando(true); setError(''); setAviso('');
    try {
      const r = await fetch(`/api/programa/${codigo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-clave': clave },
        body: JSON.stringify({ accion: tipo, locacionId: loc.id, quien, datos }),
      });
      const j = await r.json();
      if (!j.ok) setError(j.error || 'No se pudo guardar.');
      else {
        setData(j); setAviso(`Listo: ${loc.nombre} — ${j.mensaje}. Super Techos ya recibió el aviso.`); setModal(null); setForm({});
        if (ficha && ficha.id === loc.id) { const nueva = (j.locaciones || []).find(x => x.id === loc.id); if (nueva) abrirFicha(nueva); }
      }
    } catch { setError('Sin conexión. Intenta de nuevo.'); }
    setEnviando(false);
  };

  const porId = useMemo(() => new Map((data?.locaciones || []).map(l => [l.id, l])), [data]);
  const etapaLabel = useMemo(() => Object.fromEntries((data?.etapas || []).map(e => [e.id, e.label])), [data]);
  const ordenEtapa = useMemo(() => Object.fromEntries((data?.etapas || []).map((e, i) => [e.id, i])), [data]);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (data?.locaciones || []).filter(l =>
      (filtro === 'todas' || l.etapa === filtro) &&
      (!q || `${l.nombre} ${l.codigoUt} ${l.direccion} ${l.cotizacionRef}`.toLowerCase().includes(q)));
  }, [data, filtro, buscar]);

  if (!entrado) {
    return (
      <div className="pp"><style>{CSS}</style>
        <div className="pp-top"><div className="pp-wrap"><img src="/logo-super-techos.png" alt="Super Techos" /></div></div>
        <div className="pp-login">
          <div className="pp-card">
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Portal del programa</h1>
            <p style={{ color: 'var(--muted)', margin: '6px 0 16px' }}>Avance de cada locación, desde el levantamiento hasta la entrega.</p>
            <form onSubmit={entrar} className="pp-grid">
              <label>
                <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 4 }}>Tu nombre</div>
                <input id="pp-quien" className="pp-in" value={quien} onChange={e => setQuien(e.target.value)} autoComplete="name" placeholder="Ej: Leanny Peña" />
              </label>
              <label>
                <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 4 }}>Clave del programa</div>
                <input id="pp-clave" className="pp-in" value={clave} onChange={e => setClave(e.target.value.toUpperCase())} autoComplete="off" placeholder="XXXX-XXXX-XXXX" style={{ letterSpacing: '.08em', fontWeight: 700 }} />
              </label>
              <button className="pp-btn prim" disabled={cargando} style={{ padding: 12 }}>{cargando ? 'Entrando…' : 'Entrar'}</button>
              {error && <div className="pp-err">{error}</div>}
            </form>
          </div>
          <p className="pp-pie">Super Techos · 809-535-9293</p>
        </div>
      </div>
    );
  }

  const { programa, resumen, pendientes, etapas } = data;
  const totalBarra = Math.max(1, resumen.total);
  const sinLuz = pendientes.sinLuzVerde.map(id => porId.get(id)).filter(Boolean);
  const porAprobar = pendientes.cotizacionesPorAprobar.map(id => porId.get(id)).filter(Boolean);
  const sinSup = pendientes.sinSupervisor.map(id => porId.get(id)).filter(Boolean);

  return (
    <div className="pp"><style>{CSS}</style>
      <div className="pp-top"><div className="pp-wrap">
        <img src="/logo-super-techos.png" alt="Super Techos" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{programa.nombre}</h1>
          <div className="pp-sub">{programa.cliente}{programa.fechaMeta ? ` · meta ${new Date(programa.fechaMeta + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</div>
        </div>
        <button className="pp-btn sec" onClick={() => cargar()} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
      </div></div>

      <div className="pp-wrap">
        {/* Avance */}
        <div className="pp-kpis">
          <div className="pp-card pp-kpi"><b>{resumen.pctAvance}%</b><span>del programa entregado</span></div>
          <div className="pp-card pp-kpi"><b>{resumen.entregadas}<span style={{ fontSize: '1rem', color: 'var(--muted)' }}> / {resumen.total}</span></b><span>locaciones entregadas</span></div>
          <div className="pp-card pp-kpi"><b>{resumen.porEtapa.en_ejecucion || 0}</b><span>en ejecución ahora</span></div>
          <div className="pp-card pp-kpi"><b style={{ color: 'var(--warn)' }}>{resumen.pendientesCliente}</b><span>esperan una respuesta de ustedes</span></div>
        </div>
        <div className="pp-card" style={{ marginTop: 10 }}>
          <div className="pp-barra" role="img" aria-label="Locaciones por etapa">
            {etapas.map(e => {
              const n = resumen.porEtapa[e.id] || 0;
              return n ? <div key={e.id} title={`${e.label}: ${n}`} style={{ width: `${(n / totalBarra) * 100}%`, background: COLOR[e.id] }} /> : null;
            })}
          </div>
          <div className="pp-ley">
            {etapas.map(e => <span key={e.id}><i style={{ background: COLOR[e.id] }} />{e.label} {resumen.porEtapa[e.id] || 0}</span>)}
          </div>
        </div>

        {aviso && <div className="pp-aviso" role="status">{aviso}</div>}
        {error && <div className="pp-err" role="alert">{error}</div>}

        {/* Lo que depende del cliente */}
        {(sinLuz.length > 0 || porAprobar.length > 0 || sinSup.length > 0) && <>
          <h2 className="pp-h2">Lo que necesitamos de ustedes</h2>
          <div className="pp-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {porAprobar.length > 0 && (
              <div className="pp-card pp-pend">
                <div style={{ fontWeight: 800 }}>Cotizaciones por aprobar ({porAprobar.length})</div>
                <div className="pp-d" style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: 6 }}>Al aprobar, programamos la ejecución.</div>
                {porAprobar.map(l => (
                  <div className="pp-fila" key={l.id}>
                    <div style={{ minWidth: 0 }}><div className="pp-n">{l.nombre}</div><div className="pp-d">{l.cotizacionRef} · {fmtRD(l.cotizacionMonto)}</div></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="pp-btn sec" onClick={() => { setModal({ tipo: 'rechazar_cotizacion', loc: l }); setForm({}); }}>Pedir cambios</button>
                      <button className="pp-btn ok" disabled={enviando} onClick={() => setModal({ tipo: 'aprobar_cotizacion', loc: l })}>Aprobar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sinLuz.length > 0 && (
              <div className="pp-card pp-pend">
                <div style={{ fontWeight: 800 }}>Falta la autorización del propietario ({sinLuz.length})</div>
                <div className="pp-d" style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: 6 }}>Márquenla cuando el propietario autorice el acceso para levantar.</div>
                {sinLuz.slice(0, 8).map(l => (
                  <div className="pp-fila" key={l.id}>
                    <div style={{ minWidth: 0 }}><div className="pp-n">{l.nombre}</div><div className="pp-d">{l.codigoUt}</div></div>
                    <button className="pp-btn prim" disabled={enviando} onClick={() => setModal({ tipo: 'luz_verde', loc: l })}>Autorizado</button>
                  </div>
                ))}
                {sinLuz.length > 8 && <div className="pp-d" style={{ paddingTop: 8, color: 'var(--muted)', fontSize: '.8rem' }}>…y {sinLuz.length - 8} más en la lista de abajo (filtro “Sin luz verde”).</div>}
              </div>
            )}
            {sinSup.length > 0 && (
              <div className="pp-card pp-pend">
                <div style={{ fontWeight: 800 }}>Sin supervisor asignado ({sinSup.length})</div>
                <div className="pp-d" style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: 6 }}>Con quién coordinamos el acceso y la entrega de cada sitio.</div>
                {sinSup.slice(0, 6).map(l => (
                  <div className="pp-fila" key={l.id}>
                    <div style={{ minWidth: 0 }}><div className="pp-n">{l.nombre}</div><div className="pp-d">{etapaLabel[l.etapa]}</div></div>
                    <button className="pp-btn sec" onClick={() => { setModal({ tipo: 'supervisor', loc: l }); setForm({}); }}>Asignar</button>
                  </div>
                ))}
                {sinSup.length > 6 && <div className="pp-d" style={{ paddingTop: 8, color: 'var(--muted)', fontSize: '.8rem' }}>…y {sinSup.length - 6} más.</div>}
              </div>
            )}
          </div>
        </>}

        {/* Mapa y lista */}
        <div className="pp-tabs" role="tablist">
          <button className={`pp-tab ${tab === 'lista' ? 'on' : ''}`} onClick={() => setTab('lista')}>Lista</button>
          <button className={`pp-tab ${tab === 'mapa' ? 'on' : ''}`} onClick={() => setTab('mapa')}>Mapa</button>
        </div>

        {tab === 'mapa' && (
          <div className="pp-card" style={{ padding: 8 }}>
            <MapaPrograma locaciones={data.locaciones} alto={460} onSeleccionar={(l) => abrirFicha(l)} />
          </div>
        )}

        {tab === 'lista' && (
          <div className="pp-card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <select id="pp-filtro" className="pp-in" style={{ width: 'auto', flex: '0 0 auto' }} value={filtro} onChange={e => setFiltro(e.target.value)}>
                <option value="todas">Todas ({resumen.total})</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.label} ({resumen.porEtapa[e.id] || 0})</option>)}
              </select>
              <input id="pp-buscar" className="pp-in" style={{ flex: 1, minWidth: 180 }} placeholder="Buscar locación, código o cotización" value={buscar} onChange={e => setBuscar(e.target.value)} />
            </div>
            {lista.map(l => {
              const idx = ordenEtapa[l.etapa] ?? 0;
              const ab = abierta === l.id;
              return (
                <div className="pp-loc" key={l.id}>
                  <div className="pp-loc-cab" onClick={() => abrirFicha(l)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') abrirFicha(l); }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>{l.nombre}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{l.codigoUt}{l.tipoTrabajo !== 'techo' ? ` · ${l.tipoTrabajo === 'pintura' ? 'Pintura' : 'Techo y pintura'}` : ''}</div>
                    </div>
                    <span className="pp-chip" style={{ background: `${COLOR[l.etapa]}1F`, color: COLOR[l.etapa] }}>
                      <i style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR[l.etapa], display: 'inline-block' }} />{etapaLabel[l.etapa]}
                    </span>
                  </div>
                  <div className="pp-tl" aria-hidden="true">
                    {etapas.map((e, i) => <div key={e.id} style={{ background: i <= idx ? COLOR[l.etapa] : undefined }} />)}
                  </div>
                  <div className="pp-tl-l" aria-hidden="true">{etapas.map(e => <span key={e.id}>{e.label}</span>)}</div>
                  <div style={{ marginTop: 6 }}><button className="pp-btn sec" style={{ padding: '6px 12px', fontSize: '.8rem' }} onClick={() => abrirFicha(l)}>Ver ficha completa</button></div>
                </div>
              );
            })}
            {lista.length === 0 && <div className="pp-cargando">No hay locaciones con ese filtro.</div>}
          </div>
        )}

        <p className="pp-pie">Super Techos · 809-535-9293 · Este portal se actualiza con el avance real de cada obra.</p>
      </div>

      {ficha && (() => {
        const l = (data.locaciones || []).find(x => x.id === ficha.id) || ficha;
        const idx = ordenEtapa[l.etapa] ?? 0;
        const lev = fichaData?.levantamiento;
        const fechaDe = (e) => ({
          sin_luz_verde: null, por_levantar: l.luzVerdeAt, levantado: l.levantadoAt,
          cotizado: l.levantadoAt && l.cotizacionRef ? null : null, por_programar: l.cotizacionAprobadaAt,
          en_ejecucion: l.inicioObra ? l.inicioObra + 'T12:00:00' : null,
        })[e];
        return (
          <div className="pp-ficha" onClick={() => setFicha(null)}>
            <div className="pp-ficha-in" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Ficha de ${l.nombre}`}>
              <div className="pp-ficha-cab">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.2 }}>{l.nombre}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{l.codigoUt}{l.tipoTrabajo !== 'techo' ? ` · ${l.tipoTrabajo === 'pintura' ? 'Pintura' : 'Techo y pintura'}` : ' · Impermeabilización'}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="pp-chip" style={{ background: `${COLOR[l.etapa]}1F`, color: COLOR[l.etapa] }}>
                      <i style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR[l.etapa], display: 'inline-block' }} />{etapaLabel[l.etapa]}
                    </span>
                    <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{(data.etapas.find(e => e.id === l.etapa) || {}).detalle}</span>
                  </div>
                </div>
                <button className="pp-btn sec" onClick={() => setFicha(null)} aria-label="Cerrar ficha">Cerrar</button>
              </div>

              <div className="pp-ficha-cuerpo">
                <div className="pp-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                  <div className="pp-card">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Estado del sitio</div>
                    <div className="pp-pasos">
                      {data.etapas.map((e, i) => {
                        const cls = i < idx ? 'hecho' : i === idx ? 'actual' : 'pend';
                        const f = i <= idx ? fechaDe(e.id) : null;
                        return (
                          <div key={e.id} className={`pp-paso ${cls}`} style={{ '--c': COLOR[l.etapa] }}>
                            <div className="pp-pt" />
                            <div>{e.label}</div>
                            <div style={{ color: 'var(--muted)', fontSize: '.78rem' }}>{f ? fmtF(f) : ''}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="pp-card">
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Datos</div>
                    <dl className="pp-det" style={{ gridTemplateColumns: '1fr', marginTop: 0 }}>
                      <div><dt>Dirección</dt><dd>{l.direccion || '—'}</dd></div>
                      <div><dt>Autorización del propietario</dt><dd>{l.luzVerde ? `Sí${l.luzVerdeAt ? ` · ${fmtF(l.luzVerdeAt)}` : ''}${l.luzVerdePor ? ` · ${l.luzVerdePor}` : ''}` : 'Pendiente'}</dd></div>
                      <div><dt>Cotización</dt><dd>{l.cotizacionRef ? `${l.cotizacionRef} · ${fmtRD(l.cotizacionMonto)}${l.cotizacionAprobada ? ' · Aprobada' : ' · Por aprobar'}` : 'Pendiente'}</dd></div>
                      <div><dt>Inicio de obra</dt><dd>{l.inicioObra ? fmtF(l.inicioObra + 'T12:00:00') : '—'}</dd></div>
                      <div><dt>Supervisor de ustedes</dt><dd>{l.supervisorClienteNombre ? `${l.supervisorClienteNombre}${l.supervisorClienteTelefono ? ` · ${l.supervisorClienteTelefono}` : ''}${l.supervisorClienteEmail ? ` · ${l.supervisorClienteEmail}` : ''}` : 'Sin asignar'}</dd></div>
                      {l.lat && l.lng && <div><dt>Ubicación</dt><dd><a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--red)' }}>Abrir en Google Maps</a></dd></div>}
                    </dl>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!l.luzVerde && <button className="pp-btn prim" onClick={() => setModal({ tipo: 'luz_verde', loc: l })}>Autorizado por el propietario</button>}
                  {l.etapa === 'cotizado' && <button className="pp-btn ok" onClick={() => setModal({ tipo: 'aprobar_cotizacion', loc: l })}>Aprobar cotización</button>}
                  {l.etapa === 'cotizado' && <button className="pp-btn sec" onClick={() => { setModal({ tipo: 'rechazar_cotizacion', loc: l }); setForm({}); }}>Pedir cambios</button>}
                  <button className="pp-btn sec" onClick={() => { setModal({ tipo: 'supervisor', loc: l }); setForm({ nombre: l.supervisorClienteNombre, telefono: l.supervisorClienteTelefono, email: l.supervisorClienteEmail }); }}>
                    {l.supervisorClienteNombre ? 'Cambiar supervisor' : 'Asignar supervisor'}
                  </button>
                  <button className="pp-btn sec" onClick={() => { setModal({ tipo: 'comentario', loc: l }); setForm({}); }}>Escribir un comentario</button>
                </div>

                <div className="pp-card">
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Levantamiento</div>
                  {fichaCargando && <div className="pp-cargando" style={{ padding: 20 }}>Cargando el levantamiento…</div>}
                  {!fichaCargando && !lev && <div style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{l.luzVerde ? 'Todavía no se ha hecho la visita. Aquí aparecerán las áreas medidas y las fotos.' : 'Se hará cuando el propietario autorice el acceso.'}</div>}
                  {!fichaCargando && lev && (
                    <div className="pp-grid">
                      <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                        {lev.fecha ? `Visita del ${fmtF(lev.fecha)}` : 'Visita realizada'}
                        {lev.sistemaRecomendado ? ` · Sistema recomendado: ${lev.sistemaRecomendado}` : ''}
                        {lev.diasEstimados ? ` · ${lev.diasEstimados} día(s) estimados de trabajo` : ''}
                      </div>
                      {lev.areas.length > 0 && (
                        <table className="pp-tabla"><tbody>
                          {lev.areas.map((a, i) => <tr key={i}><td>{a.nombre}</td><td>{a.m2 ? `${a.m2.toLocaleString('es-DO')} m²` : '—'}</td></tr>)}
                          <tr><td style={{ fontWeight: 800 }}>Total</td><td>{lev.totalM2.toLocaleString('es-DO')} m²</td></tr>
                        </tbody></table>
                      )}
                      {lev.fotos.length > 0 ? (
                        <>
                          <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Fotos ({lev.fotos.length})</div>
                          <div className="pp-galeria">
                            {lev.fotos.map((f, i) => (
                              <button key={i} onClick={() => setFotoGrande(i)} aria-label={`Ver foto: ${f.titulo}`}>
                                <img src={f.url} alt={f.titulo} loading="lazy" />
                                {f.critica && <span className="pp-crit">Atención</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : <div style={{ color: 'var(--muted)', fontSize: '.88rem' }}>Este levantamiento no tiene fotos cargadas.</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {fotoGrande != null && lev?.fotos?.[fotoGrande] && (
              <div className="pp-lb" onClick={(e) => { e.stopPropagation(); setFotoGrande(null); }}>
                <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  <img src={lev.fotos[fotoGrande].url} alt={lev.fotos[fotoGrande].titulo} />
                  <div className="pp-lb-bar">
                    <button className="pp-btn sec" disabled={fotoGrande === 0} onClick={() => setFotoGrande(fotoGrande - 1)}>Anterior</button>
                    <span>{lev.fotos[fotoGrande].titulo} · {fotoGrande + 1} de {lev.fotos.length}</span>
                    <button className="pp-btn sec" disabled={fotoGrande === lev.fotos.length - 1} onClick={() => setFotoGrande(fotoGrande + 1)}>Siguiente</button>
                    <button className="pp-btn sec" onClick={() => setFotoGrande(null)}>Cerrar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {modal && (
        <div className="pp-modal" onClick={() => !enviando && setModal(null)}>
          <div className="pp-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{modal.loc.nombre}</div>
            <div style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: 14 }}>{modal.loc.codigoUt}</div>

            {modal.tipo === 'luz_verde' && <p style={{ margin: '0 0 14px' }}>¿El propietario ya autorizó el acceso para levantar esta locación? Queda registrado a nombre de <b>{quien}</b>.</p>}
            {modal.tipo === 'aprobar_cotizacion' && <p style={{ margin: '0 0 14px' }}>¿Aprobar la cotización <b>{modal.loc.cotizacionRef}</b> por <b>{fmtRD(modal.loc.cotizacionMonto)}</b>? Queda registrada a nombre de <b>{quien}</b> y pasamos a programar la ejecución.</p>}
            {modal.tipo === 'rechazar_cotizacion' && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 4 }}>¿Qué hay que cambiar en la cotización {modal.loc.cotizacionRef}?</div>
                <textarea id="pp-motivo" className="pp-in" rows={4} value={form.motivo || ''} onChange={e => setForm({ ...form, motivo: e.target.value })} />
              </label>
            )}
            {modal.tipo === 'supervisor' && (
              <div className="pp-grid" style={{ marginBottom: 14 }}>
                <input id="pp-sup-nombre" className="pp-in" placeholder="Nombre del supervisor" value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                <input id="pp-sup-tel" className="pp-in" placeholder="Teléfono" inputMode="tel" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                <input id="pp-sup-email" className="pp-in" placeholder="Correo" inputMode="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            )}
            {modal.tipo === 'comentario' && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 4 }}>Comentario para Super Techos</div>
                <textarea id="pp-comentario" className="pp-in" rows={4} value={form.texto || ''} onChange={e => setForm({ ...form, texto: e.target.value })} />
              </label>
            )}
            {error && <div className="pp-err" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="pp-btn sec" disabled={enviando} onClick={() => setModal(null)}>Cancelar</button>
              <button className={`pp-btn ${modal.tipo === 'aprobar_cotizacion' ? 'ok' : 'prim'}`} disabled={enviando}
                onClick={() => accion(modal.tipo, modal.loc, form)}>
                {enviando ? 'Guardando…' : ({ luz_verde: 'Sí, está autorizado', aprobar_cotizacion: 'Aprobar', rechazar_cotizacion: 'Enviar', supervisor: 'Guardar', comentario: 'Enviar' })[modal.tipo]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
