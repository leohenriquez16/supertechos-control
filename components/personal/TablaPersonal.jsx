'use client';

// v8.89.0: Personal como base de datos — tabla filtrable/ordenable con lo que un gerente
// de RR.HH. necesita ver de todos, más indicadores arriba. Tocar una fila abre el Empleado 360.
import React, { useMemo, useState } from 'react';
import { UserCircle, ArrowUpDown, Download, Send } from 'lucide-react';
import { completitudPersona } from '../../lib/helpers/personas';

const ROLES = [['admin', 'Admin'], ['supervisor', 'Supervisor'], ['maestro', 'Maestro'], ['ayudante', 'Ayudante'], ['chofer', 'Chofer'], ['almacen', 'Almacén'], ['nomina', 'Nómina'], ['facturas', 'Facturas']];
const tiene = (p, r) => (p.roles || []).includes(r);
const rolPrincipal = (p) => (ROLES.find(([r]) => tiene(p, r)) || [null, 'Sin rol'])[1];
const d10 = (f) => (f ? String(f).slice(0, 10) : '');
const fecha = (f) => f ? new Date(d10(f) + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const meses = (desde) => { if (!desde) return null; const d = new Date(d10(desde)), h = new Date(); const m = (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth(); return m >= 0 ? m : null; };
const antig = (m) => m == null ? '—' : m >= 12 ? `${Math.floor(m / 12)}a ${m % 12}m` : `${m}m`;
const edad = (f) => { if (!f) return null; const d = new Date(d10(f) + 'T00:00:00'), h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const PAGO = { dia: 'Por día', m2: 'Por m²', m2_fijo: 'm² fijo', tarea: 'Por tarea', fijo: 'Nómina fija', quincena: 'Nómina fija' };

function Kpi({ titulo, valor, sub, tono, onClick, activo }) {
  const c = tono === 'alerta' ? 'text-amber-300' : tono === 'mal' ? 'text-red-400' : tono === 'bien' ? 'text-green-400' : 'text-white';
  return (
    <button onClick={onClick} className={`text-left bg-zinc-900 border rounded-card p-3 min-w-0 ${activo ? 'border-red-600' : 'border-zinc-800 hover:border-zinc-600'}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 truncate">{titulo}</div>
      <div className={`text-xl font-black tabular-nums ${c}`}>{valor}</div>
      {sub && <div className="text-[11px] text-zinc-500 truncate">{sub}</div>}
    </button>
  );
}

export default function TablaPersonal({ personal, proyectos = [], verMontos, docsPendientes, onAbrir, onActivar }) {
  const [q, setQ] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('activos');
  const [filtro, setFiltro] = useState(''); // atajo desde los KPIs
  const [orden, setOrden] = useState({ k: 'nombre', dir: 1 });

  const mesHoy = new Date().getMonth();
  const ymHoy = new Date().toISOString().slice(0, 7);
  const filas = useMemo(() => {
    const obraDe = {};
    proyectos.filter(p => !p.archivado && p.estado === 'en_ejecucion').forEach(p => {
      [p.maestroId, p.supervisorId, ...(p.ayudantesIds || [])].filter(Boolean).forEach(id => { (obraDe[id] ||= []).push(p.cliente || p.nombre); });
    });
    const porId = Object.fromEntries(personal.map(p => [p.id, p]));
    return personal.map(p => {
      const c = completitudPersona(p); const m = meses(p.fechaIngreso); const docs = docsPendientes ? docsPendientes(p) : [];
      const lic = p.licenciaVence ? Math.round((new Date(d10(p.licenciaVence)) - new Date()) / 864e5) : null;
      const nac = p.fechaNacimiento ? new Date(d10(p.fechaNacimiento) + 'T00:00:00') : null;
      return {
        p, rol: rolPrincipal(p), puesto: [p.puesto, p.departamento].filter(Boolean).join(' · '),
        jefe: p.maestroId ? porId[p.maestroId]?.nombre : p.gerenteNombre || '',
        meses: m, edad: edad(p.fechaNacimiento), cumpleMes: nac && nac.getMonth() === mesHoy, cumpleDia: nac ? nac.getDate() : null,
        pago: PAGO[p.modoPago] || p.modoPago || '—', obras: obraDe[p.id] || [], pct: c.pct, faltan: c.faltan, docs,
        lic, emergencia: !!(p.contactoEmergenciaNombre && p.contactoEmergenciaTelefono), login: p.pinTemporal ? 'Invitado' : p.tienePin ? 'Sí' : 'No',
        ingresoMes: d10(p.fechaIngreso).startsWith(ymHoy),
      };
    });
  }, [personal, proyectos, docsPendientes, mesHoy, ymHoy]);

  const base = filas.filter(f => estado === 'todos' ? true : estado === 'activos' ? f.p.activo !== false : f.p.activo === false);
  const kpi = {
    activos: filas.filter(f => f.p.activo !== false).length,
    completas: base.filter(f => f.pct >= 100).length,
    docs: base.filter(f => f.docs.length).length,
    emergencia: base.filter(f => !f.emergencia).length,
    cumple: base.filter(f => f.cumpleMes).length,
    enObra: base.filter(f => f.obras.length).length,
    licencia: base.filter(f => f.lic != null && f.lic < 30).length,
    ingresos: base.filter(f => f.ingresoMes).length,
  };

  const vis = base.filter(f => {
    if (rol && !tiene(f.p, rol)) return false;
    if (filtro === 'incompletas' && f.pct >= 100) return false;
    if (filtro === 'docs' && !f.docs.length) return false;
    if (filtro === 'emergencia' && f.emergencia) return false;
    if (filtro === 'cumple' && !f.cumpleMes) return false;
    if (filtro === 'enObra' && !f.obras.length) return false;
    if (filtro === 'licencia' && !(f.lic != null && f.lic < 30)) return false;
    if (q) { const h = `${f.p.nombre} ${f.p.telefono} ${f.p.whatsapp} ${f.p.cedulaNumero} ${f.puesto}`.toLowerCase(); if (!h.includes(q.toLowerCase().trim())) return false; }
    return true;
  });
  const val = (f, k) => ({ nombre: f.p.nombre || '', rol: f.rol, puesto: f.puesto, jefe: f.jefe || '', antig: f.meses ?? -1, edad: filtro === 'cumple' ? f.cumpleDia : f.edad ?? -1, pago: f.pago, obra: f.obras[0] || '', pct: f.pct, lic: f.lic ?? 99999, login: f.login })[k];
  vis.sort((a, b) => { const x = val(a, orden.k), y = val(b, orden.k); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * orden.dir; });

  const exportar = () => {
    const cab = ['Nombre', 'Rol', 'Puesto', 'Supervisor/Maestro', 'Cédula', 'Teléfono', 'Ingreso', 'Antigüedad (meses)', 'Edad', ...(verMontos ? ['Tipo de pago'] : []), 'Obra actual', 'Ficha %', 'Faltan', 'Docs pendientes', 'Licencia vence', 'Contacto emergencia', 'Login', 'Activo'];
    const rows = vis.map(f => [f.p.nombre, f.rol, f.puesto, f.jefe, f.p.cedulaNumero, f.p.telefono, d10(f.p.fechaIngreso), f.meses ?? '', f.edad ?? '', ...(verMontos ? [f.pago] : []), f.obras.join(' / '), f.pct, f.faltan.join(', '), f.docs.join(', '), d10(f.p.licenciaVence), f.emergencia ? 'Sí' : 'No', f.login, f.p.activo !== false ? 'Sí' : 'No']);
    const csv = '﻿' + [cab, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `personal-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const Th = ({ k, children, className = '' }) => (
    <th className={`text-left px-2 py-2 whitespace-nowrap ${className}`}><button onClick={() => setOrden(o => ({ k, dir: o.k === k ? -o.dir : 1 }))} className={`inline-flex items-center gap-1 uppercase tracking-wider ${orden.k === k ? 'text-white' : ''}`}>{children}<ArrowUpDown className="w-3 h-3 opacity-50" /></button></th>
  );
  const atajo = (k) => setFiltro(f => f === k ? '' : k);
  const pctCompletas = base.length ? Math.round(kpi.completas / base.length * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <Kpi titulo="Activos" valor={kpi.activos} sub={`${kpi.ingresos} ingresaron este mes`} onClick={() => { setEstado('activos'); setFiltro(''); }} activo={!filtro && estado === 'activos'} />
        <Kpi titulo="En obra hoy" valor={kpi.enObra} sub="en obras en ejecución" onClick={() => atajo('enObra')} activo={filtro === 'enObra'} />
        <Kpi titulo="Fichas completas" valor={`${pctCompletas}%`} sub={`${base.length - kpi.completas} incompletas`} tono={pctCompletas >= 80 ? 'bien' : 'alerta'} onClick={() => atajo('incompletas')} activo={filtro === 'incompletas'} />
        <Kpi titulo="Docs pendientes" valor={kpi.docs} tono={kpi.docs ? 'alerta' : 'bien'} onClick={() => atajo('docs')} activo={filtro === 'docs'} />
        <Kpi titulo="Sin contacto emergencia" valor={kpi.emergencia} sub="clave en trabajo en altura" tono={kpi.emergencia ? 'mal' : 'bien'} onClick={() => atajo('emergencia')} activo={filtro === 'emergencia'} />
        <Kpi titulo="Licencias" valor={kpi.licencia} sub="vencidas o vencen en 30 días" tono={kpi.licencia ? 'mal' : 'bien'} onClick={() => atajo('licencia')} activo={filtro === 'licencia'} />
        <Kpi titulo="Cumpleaños del mes" valor={kpi.cumple} sub={new Date().toLocaleDateString('es-DO', { month: 'long' })} onClick={() => { atajo('cumple'); setOrden({ k: 'edad', dir: 1 }); }} activo={filtro === 'cumple'} />
        <Kpi titulo="Total en el ERP" valor={filas.length} sub={`${filas.length - kpi.activos} inactivos`} onClick={() => { setEstado('todos'); setFiltro(''); }} activo={!filtro && estado === 'todos'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nombre, cédula, teléfono, puesto…" className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-card px-3 py-2 text-sm text-white outline-none focus:border-red-500" />
        <select value={rol} onChange={e => setRol(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-sm text-white"><option value="">Todos los roles</option>{ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select>
        <select value={estado} onChange={e => setEstado(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-card px-2 py-2 text-sm text-white"><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select>
        {filtro && <button onClick={() => setFiltro('')} className="text-xs text-red-400 font-bold px-2">Quitar filtro ✕</button>}
        <button onClick={exportar} className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold px-3 py-2 rounded-card"><Download className="w-3.5 h-3.5" /> Excel</button>
      </div>
      <div className="text-[11px] text-zinc-500">{vis.length} persona{vis.length === 1 ? '' : 's'}</div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead><tr className="text-[10px] text-zinc-500 border-b border-zinc-800">
            <Th k="nombre" className="pl-3">Nombre</Th><Th k="rol">Rol</Th><Th k="puesto">Puesto</Th><Th k="jefe">Reporta a</Th><Th k="antig">Antigüedad</Th><Th k="edad">{filtro === 'cumple' ? 'Cumple' : 'Edad'}</Th>
            {verMontos && <Th k="pago">Pago</Th>}<Th k="obra">Obra actual</Th><Th k="pct">Ficha</Th><Th k="lic">Licencia</Th><th className="px-2 py-2 uppercase tracking-wider text-left">Emerg.</th><Th k="login">Login</Th>
          </tr></thead>
          <tbody>
            {vis.map(f => { const p = f.p; return (
              <tr key={p.id} onClick={() => onAbrir(p)} className={`border-t border-zinc-800 hover:bg-zinc-800/50 cursor-pointer ${p.activo === false ? 'opacity-50' : ''}`}>
                <td className="pl-3 pr-2 py-2"><div className="flex items-center gap-2 min-w-0">
                  {p.foto2x2 ? <img src={p.foto2x2} alt="" className="w-8 h-8 object-cover rounded-sm border border-zinc-700 shrink-0" /> : <UserCircle className="w-8 h-8 text-zinc-600 shrink-0" />}
                  <div className="min-w-0"><div className="font-bold text-white truncate">{p.nombre}</div><div className="text-[11px] text-zinc-500 truncate">{p.telefono || p.whatsapp || '—'}</div></div></div></td>
                <td className="px-2 py-2 text-zinc-300 whitespace-nowrap">{f.rol}</td>
                <td className="px-2 py-2 text-zinc-300">{f.puesto || <span className="text-zinc-600">—</span>}</td>
                <td className="px-2 py-2 text-zinc-400">{f.jefe || '—'}</td>
                <td className="px-2 py-2 tabular-nums whitespace-nowrap" title={p.fechaIngreso ? 'Ingresó ' + fecha(p.fechaIngreso) : 'Sin fecha de ingreso'}>{antig(f.meses)}</td>
                <td className="px-2 py-2 tabular-nums whitespace-nowrap">{f.edad ?? '—'}{f.cumpleMes && <span className="ml-1" title={`Cumple el ${f.cumpleDia}`}>🎂 {f.cumpleDia}</span>}</td>
                {verMontos && <td className="px-2 py-2 text-zinc-400 whitespace-nowrap">{f.pago}</td>}
                <td className="px-2 py-2 text-zinc-300 max-w-[220px] truncate" title={f.obras.join(' / ')}>{f.obras[0] || <span className="text-zinc-600">—</span>}{f.obras.length > 1 && <span className="text-zinc-500"> +{f.obras.length - 1}</span>}</td>
                <td className="px-2 py-2 whitespace-nowrap" title={f.faltan.length ? 'Faltan: ' + f.faltan.join(', ') : 'Completa'}>
                  <div className="flex items-center gap-1.5"><div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full" style={{ width: f.pct + '%', background: f.pct >= 100 ? '#22c55e' : f.pct >= 60 ? '#f59e0b' : '#ef4444' }} /></div><span className="text-[11px] tabular-nums text-zinc-400">{f.pct}%</span>
                  {f.docs.length > 0 && <span className="text-[9px] border border-orange-700 text-orange-300 px-1 font-bold" title={'Faltan: ' + f.docs.join(', ')}>DOCS</span>}</div></td>
                <td className={`px-2 py-2 whitespace-nowrap text-[12px] ${f.lic == null ? 'text-zinc-600' : f.lic < 0 ? 'text-red-400 font-bold' : f.lic < 30 ? 'text-amber-300' : 'text-zinc-400'}`}>{f.lic == null ? '—' : f.lic < 0 ? 'Vencida' : fecha(p.licenciaVence)}</td>
                <td className={`px-2 py-2 ${f.emergencia ? 'text-green-400' : 'text-red-400'}`}>{f.emergencia ? '✓' : '✕'}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {onActivar && p.tienePin && !p.cedulaNumero && !tiene(p, 'admin')
                    ? <button onClick={e => { e.stopPropagation(); onActivar(p); }} className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 text-[10px] font-bold uppercase rounded-card inline-flex items-center gap-1"><Send className="w-3 h-3" /> {p.pinTemporal ? 'Reinvitar' : 'Activar'}</button>
                    : <span className={f.login === 'Sí' ? 'text-zinc-300' : 'text-zinc-500'}>{f.login}</span>}
                </td>
              </tr>); })}
            {!vis.length && <tr><td colSpan={12} className="text-center py-8 text-zinc-500">Nadie con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
