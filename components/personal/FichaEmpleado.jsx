'use client';

// v8.87.0: Empleado 360 — vista de RR.HH. de una persona del ERP, complementada con Odoo
// (puesto, departamento, contrato y volantes de nómina fija). Odoo solo se LEE y solo se
// muestran personas que ya existen en el ERP. Sueldos y pagos: solo owner / nomina.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Calendar, Wallet, AlertTriangle, ShieldCheck, Users, Loader2, Pencil, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchConSesion } from '../../lib/fetchConSesion';
import { completitudPersona } from '../../lib/helpers/personas';
import FamiliaEmpleado from './FamiliaEmpleado';

const rd = (n) => 'RD$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (f) => f ? new Date(String(f).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const dig = (x) => String(x || '').replace(/\D/g, '');
const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const antig = (desde) => {
  if (!desde) return null;
  const d = new Date(String(desde).slice(0, 10)); const h = new Date();
  let m = (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth());
  if (m < 0) return null;
  return m >= 12 ? `${Math.floor(m / 12)} año${m >= 24 ? 's' : ''}${m % 12 ? ` ${m % 12} m` : ''}` : `${m} mes${m === 1 ? '' : 'es'}`;
};
const ROLES = { admin: 'Admin', owner: 'Dueño', supervisor: 'Supervisor', maestro: 'Maestro', ayudante: 'Ayudante', chofer: 'Chofer', almacen: 'Almacén', nomina: 'Nómina', rentabilidad: 'Rentabilidad' };

function Kpi({ icon: Icon, titulo, valor, sub, alerta }) {
  return (
    <div className={`bg-zinc-900 border rounded-card p-3 min-w-0 ${alerta ? 'border-amber-600/60' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-zinc-500"><Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{titulo}</span></div>
      <div className={`text-lg 2xl:text-xl font-black mt-1 tabular-nums break-words ${alerta ? 'text-amber-300' : 'text-white'}`}>{valor}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// v8.89.0: `propio` = el empleado viendo su propia ficha (ve sus pagos; no ve acciones de admin).
// `acciones` = botones de admin (editar, documentos, experiencia…) que antes estaban en el menú.
export default function FichaEmpleado({ persona, usuario, data, onVolver, onEditar, onVerProyecto, propio = false, acciones = [] }) {
  const roles = usuario?.roles || [];
  const verMontos = propio || roles.includes('owner') || roles.includes('nomina');
  const [tab, setTab] = useState('obras');
  const [erp, setErp] = useState(null);
  const [odoo, setOdoo] = useState(null);

  useEffect(() => {
    let cancel = false;
    setErp(null); setOdoo(null);
    const id = persona.id;
    const hace90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      supabase.from('checkins').select('fecha, proyecto_id').eq('persona_id', id).gte('fecha', hace90),
      supabase.from('ausencias').select('fecha_desde, fecha_hasta, motivo, nota').eq('persona_id', id).order('fecha_desde', { ascending: false }).limit(50),
      verMontos ? supabase.from('detalle_nomina').select('corte_id, proyecto_nombre, monto_total, monto_adelantos, dias_trabajados, m2_producidos, created_at').eq('persona_id', id).order('created_at', { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
      verMontos ? supabase.from('ajustes_nomina').select('fecha, tipo, monto, concepto, aplicado_a_corte_id').eq('persona_id', id).order('fecha', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
      supabase.from('caja_chica_saldos').select('*').eq('persona_id', id).maybeSingle(),
      supabase.from('credenciales').select('numero, fecha_vencimiento, activa, tipo_credencial_id').eq('persona_id', id),
      supabase.from('viajes').select('id, fecha').eq('chofer_id', id).gte('fecha', hace90),
    ]).then(([ck, au, dn, aj, cc, cr, vj]) => {
      if (cancel) return;
      setErp({ checkins: ck.data || [], ausencias: au.data || [], detalles: dn.data || [], ajustes: aj.data || [], caja: cc.data || null, credenciales: cr.data || [], viajes: vj.data || [] });
    }).catch(() => { if (!cancel) setErp({ checkins: [], ausencias: [], detalles: [], ajustes: [], caja: null, credenciales: [], viajes: [] }); });
    fetchConSesion(`/api/odoo/empleado?personaId=${encodeURIComponent(id)}`).then(r => r.json())
      .then(j => { if (!cancel) setOdoo(j?.error ? { error: j.error } : j); })
      .catch(e => { if (!cancel) setOdoo({ error: e?.message || 'Error' }); });
    return () => { cancel = true; };
  }, [persona.id, verMontos]);

  const proyectos = data?.proyectos || [];
  const obras = useMemo(() => proyectos.filter(p => !p.archivado && (p.maestroId === persona.id || p.supervisorId === persona.id || (p.ayudantesIds || []).includes(persona.id)))
    .map(p => ({ p, papel: p.maestroId === persona.id ? 'Maestro' : p.supervisorId === persona.id ? 'Supervisor' : 'Ayudante' })), [proyectos, persona.id]);
  const activas = obras.filter(o => ['aprobado', 'planificado', 'en_ejecucion'].includes(o.p.estado));
  const ayudantes = (data?.personal || []).filter(x => x.maestroId === persona.id && x.activo !== false);
  const comp = completitudPersona(persona);

  const anio = String(new Date().getFullYear());
  const destajoAnio = (erp?.detalles || []).filter(d => String(d.created_at).startsWith(anio)).reduce((s, d) => s + Number(d.monto_total || 0), 0);
  const fijoAnio = (odoo?.volantes || []).filter(v => String(v.hasta).startsWith(anio)).reduce((s, v) => s + v.neto, 0);
  const mes = new Date().toISOString().slice(0, 7);
  const diasMes = new Set((erp?.checkins || []).filter(c => String(c.fecha).startsWith(mes)).map(c => c.fecha)).size;
  const ajustesPend = (erp?.ajustes || []).filter(a => !a.aplicado_a_corte_id);
  const credVencen = (erp?.credenciales || []).filter(c => c.activa !== false && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date(Date.now() + 30 * 864e5));
  const inicio = odoo?.inicioContrato || persona.fechaIngreso;

  // Diferencias ERP vs Odoo (para limpiar las dos bases)
  const difs = [];
  if (odoo?.encontrado) {
    if (odoo.cedula && persona.cedulaNumero && dig(odoo.cedula) !== dig(persona.cedulaNumero)) difs.push(`Cédula: ERP ${persona.cedulaNumero} · Odoo ${odoo.cedula}`);
    if (!persona.cedulaNumero && odoo.cedula) difs.push(`El ERP no tiene cédula; Odoo: ${odoo.cedula}`);
    if (odoo.telefono && persona.telefono && dig(odoo.telefono).slice(-10) !== dig(persona.telefono).slice(-10)) difs.push(`Teléfono: ERP ${persona.telefono} · Odoo ${odoo.telefono}`);
    if ((persona.activo !== false) !== odoo.activo) difs.push(`Estado: ${persona.activo !== false ? 'activo' : 'inactivo'} en el ERP, ${odoo.activo ? 'activo' : 'archivado'} en Odoo`);
    if (norm(odoo.nombre) !== norm(persona.nombre)) difs.push(`Nombre en Odoo: ${odoo.nombre}`);
  }

  const pagos = useMemo(() => {
    if (!verMontos) return [];
    const porCorte = {};
    (erp?.detalles || []).forEach(d => {
      const k = d.corte_id || String(d.created_at).slice(0, 10);
      (porCorte[k] ||= { fecha: String(d.created_at).slice(0, 10), fuente: 'ERP · destajo', monto: 0, detalle: new Set() });
      porCorte[k].monto += Number(d.monto_total || 0); if (d.proyecto_nombre) porCorte[k].detalle.add(d.proyecto_nombre);
    });
    const a = Object.values(porCorte).map(x => ({ ...x, detalle: [...x.detalle].slice(0, 3).join(' · ') }));
    const b = (odoo?.volantes || []).map(v => ({ fecha: v.hasta, fuente: 'Odoo · nómina fija', monto: v.neto, detalle: `${v.numero || ''} · ${fecha(v.desde)} – ${fecha(v.hasta)}` }));
    return [...a, ...b].sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
  }, [erp, odoo, verMontos]);

  const TABS = [['obras', `Obras ${obras.length}`], ...(verMontos ? [['pagos', `Pagos ${pagos.length}`], ['ajustes', `Ajustes ${erp?.ajustes?.length || 0}`]] : []), ['asistencia', `Asistencia y ausencias`], ['credenciales', `Credenciales ${erp?.credenciales?.length || 0}`], ...(ayudantes.length ? [['equipo', `Equipo ${ayudantes.length}`]] : [])];

  return (
    <div className="space-y-4">
      <button onClick={onVolver} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> {propio ? 'Volver' : 'Volver a personal'}</button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-card p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {persona.foto2x2 ? <div className="w-16 h-16 rounded-card shrink-0 bg-zinc-800" style={{ backgroundImage: `url(${persona.foto2x2})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            : <div className="w-16 h-16 rounded-card shrink-0 bg-zinc-800 flex items-center justify-center text-xl font-black text-zinc-400">{(persona.nombre || '?').split(' ').map(x => x[0]).slice(0, 2).join('')}</div>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-white break-words">{persona.nombre}</h1>
              <span className={`text-[10px] uppercase tracking-wider font-bold border px-1.5 py-0.5 ${persona.activo !== false ? 'border-green-700 text-green-400' : 'border-zinc-600 text-zinc-500'}`}>{persona.activo !== false ? 'Activo' : 'Inactivo'}</span>
              {(persona.roles || []).map(r => <span key={r} className="text-[10px] uppercase tracking-wider border border-zinc-700 text-zinc-300 px-1.5 py-0.5">{ROLES[r] || r}</span>)}
            </div>
            <div className="text-sm text-zinc-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {odoo?.puesto && <span>{odoo.puesto}{odoo.departamento ? ` · ${odoo.departamento}` : ''}</span>}
              {odoo?.supervisor && <span>Reporta a {odoo.supervisor}</span>}
              {inicio && <span>Desde {fecha(inicio)}{antig(inicio) ? ` (${antig(inicio)})` : ''}</span>}
              {comp.pct < 100 && <span className="text-amber-400" title={'Faltan: ' + comp.faltan.join(', ')}>Ficha {comp.pct}%</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onEditar && <button onClick={onEditar} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm font-bold px-3 py-2 rounded-card"><Pencil className="w-4 h-4" /> {propio ? 'Actualizar mis datos' : 'Perfil y documentos'}</button>}
          {acciones.map(a => <button key={a.label} onClick={a.onClick} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm font-bold px-3 py-2 rounded-card">{a.icon ? <a.icon className="w-4 h-4" /> : null} {a.label}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={Calendar} titulo="Asistencia del mes" valor={erp ? `${diasMes} días` : '…'} sub={erp ? `${erp.ausencias.filter(a => String(a.fecha_hasta || a.fecha_desde) >= mes).length} ausencias este mes` : ''} />
        <Kpi icon={Briefcase} titulo="Obras" valor={`${activas.length} activas`} sub={`${obras.length} en total`} />
        {verMontos && <Kpi icon={Wallet} titulo={`Pagado ${anio}`} valor={erp && odoo ? rd(destajoAnio + fijoAnio) : '…'} sub={`destajo ${rd(destajoAnio)} · fija ${rd(fijoAnio)}`} />}
        {verMontos && <Kpi icon={Wallet} titulo="Salario contrato" valor={odoo?.contrato?.salario ? rd(odoo.contrato.salario) : '—'} sub={odoo?.contrato ? `${odoo.contrato.estructura || ''}${odoo.contrato.inicio ? ' · desde ' + fecha(odoo.contrato.inicio) : ''}` : 'sin contrato en Odoo'} />}
        {verMontos && <Kpi icon={AlertTriangle} titulo="Ajustes pendientes" valor={erp ? ajustesPend.length : '…'} sub={erp ? rd(ajustesPend.reduce((s, a) => s + Number(a.monto || 0), 0)) : ''} alerta={ajustesPend.length > 0} />}
        <Kpi icon={Wallet} titulo="Caja chica" valor={erp?.caja ? rd(erp.caja.saldo) : '—'} sub={erp?.caja?.pendientes ? `${erp.caja.pendientes} por liquidar` : ''} alerta={!!erp?.caja?.pendientes} />
        <Kpi icon={ShieldCheck} titulo="Credenciales" valor={erp ? erp.credenciales.filter(c => c.activa !== false).length : '…'} sub={credVencen.length ? `${credVencen.length} vencen en 30 días` : 'al día'} alerta={credVencen.length > 0} />
      </div>

      <FamiliaEmpleado personaId={persona.id} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-1 border-b border-zinc-800">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 ${tab === k ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{l}</button>
            ))}
          </div>
          {!erp ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div> : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-x-auto">
              {tab === 'obras' && (
                <table className="w-full text-sm min-w-[520px]"><thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><th className="text-left px-3 py-2">Ref.</th><th className="text-left px-3 py-2">Obra</th><th className="text-left px-3 py-2">Papel</th><th className="text-left px-3 py-2">Estado</th></tr></thead>
                  <tbody>{obras.map(({ p, papel }) => (
                    <tr key={p.id} onClick={() => onVerProyecto?.(p)} className="border-t border-zinc-800 hover:bg-zinc-800/40 cursor-pointer">
                      <td className="px-3 py-2 tabular-nums text-zinc-400">{p.referenciaOdoo || '—'}</td><td className="px-3 py-2 text-white">{p.cliente}{p.nombre && p.nombre !== p.cliente ? <span className="text-zinc-500"> · {p.nombre}</span> : null}</td>
                      <td className="px-3 py-2 text-zinc-300">{papel}</td><td className="px-3 py-2 text-zinc-400">{String(p.estado || '').replace(/_/g, ' ')}</td></tr>))}
                    {!obras.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Sin obras asignadas.</td></tr>}</tbody></table>
              )}
              {tab === 'pagos' && (
                <table className="w-full text-sm min-w-[520px]"><thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><th className="text-left px-3 py-2">Fecha</th><th className="text-left px-3 py-2">Fuente</th><th className="text-left px-3 py-2">Detalle</th><th className="text-right px-3 py-2">Monto</th></tr></thead>
                  <tbody>{pagos.map((x, i) => (
                    <tr key={i} className="border-t border-zinc-800"><td className="px-3 py-2 whitespace-nowrap">{fecha(x.fecha)}</td><td className={`px-3 py-2 whitespace-nowrap ${x.fuente.startsWith('Odoo') ? 'text-purple-300' : 'text-sky-300'}`}>{x.fuente}</td>
                      <td className="px-3 py-2 text-zinc-400">{x.detalle}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold">{rd(x.monto)}</td></tr>))}
                    {!pagos.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Sin pagos registrados.</td></tr>}</tbody></table>
              )}
              {tab === 'ajustes' && (
                <table className="w-full text-sm min-w-[520px]"><thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><th className="text-left px-3 py-2">Fecha</th><th className="text-left px-3 py-2">Tipo</th><th className="text-left px-3 py-2">Concepto</th><th className="text-right px-3 py-2">Monto</th><th className="text-left px-3 py-2">Estado</th></tr></thead>
                  <tbody>{erp.ajustes.map((a, i) => (
                    <tr key={i} className="border-t border-zinc-800"><td className="px-3 py-2 whitespace-nowrap">{fecha(a.fecha)}</td><td className="px-3 py-2">{a.tipo}</td><td className="px-3 py-2 text-zinc-400">{a.concepto}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{rd(a.monto)}</td><td className="px-3 py-2">{a.aplicado_a_corte_id ? <span className="text-zinc-500">aplicado</span> : <span className="text-amber-400">pendiente</span>}</td></tr>))}
                    {!erp.ajustes.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-500">Sin ajustes ni adelantos.</td></tr>}</tbody></table>
              )}
              {tab === 'asistencia' && (
                <div className="p-3 space-y-3 text-sm">
                  <div><div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Check-ins últimos 90 días</div>
                    <div className="text-white">{new Set(erp.checkins.map(c => c.fecha)).size} días con check-in en {new Set(erp.checkins.map(c => c.proyecto_id)).size} obra(s){erp.viajes.length ? ` · ${erp.viajes.length} viajes como chofer` : ''}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Ausencias</div>
                    {erp.ausencias.map((a, i) => <div key={i} className="flex justify-between gap-3 border-t border-zinc-800 py-1.5"><span>{fecha(a.fecha_desde)}{a.fecha_hasta && a.fecha_hasta !== a.fecha_desde ? ` → ${fecha(a.fecha_hasta)}` : ''}</span><span className="text-zinc-400 text-right">{[a.motivo, a.nota].filter(Boolean).join(' · ')}</span></div>)}
                    {!erp.ausencias.length && <div className="text-zinc-500">Sin ausencias registradas.</div>}</div>
                </div>
              )}
              {tab === 'credenciales' && (
                <div className="p-3 text-sm">{erp.credenciales.map((c, i) => (
                  <div key={i} className="flex justify-between gap-3 border-t first:border-t-0 border-zinc-800 py-1.5"><span>{c.numero || 'Credencial'}{c.activa === false ? ' (inactiva)' : ''}</span>
                    <span className={credVencen.includes(c) ? 'text-amber-400' : 'text-zinc-400'}>{c.fecha_vencimiento ? `vence ${fecha(c.fecha_vencimiento)}` : 'sin vencimiento'}</span></div>))}
                  {!erp.credenciales.length && <div className="text-zinc-500">Sin credenciales.</div>}</div>
              )}
              {tab === 'equipo' && (
                <div className="p-3 text-sm">{ayudantes.map(a => <div key={a.id} className="border-t first:border-t-0 border-zinc-800 py-1.5 text-white">{a.nombre}<span className="text-zinc-500"> · {a.telefono || ''}</span></div>)}</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-sm space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Datos personales</div>
            {[['Cédula', persona.cedulaNumero || odoo?.cedula], ['Nacimiento', (() => { const f = persona.fechaNacimiento || odoo?.nacimiento; if (!f) return null; const d = new Date(String(f).slice(0, 10) + 'T00:00:00'), h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--; return `${fecha(f)} (${a} años)`; })()],
              ['Tipo de sangre', persona.tipoSangre], ['Teléfono', persona.telefono || odoo?.telefono], ['WhatsApp', persona.whatsapp], ['Correo', persona.email || odoo?.email], ['Dirección', persona.direccion],
              ['Emergencia', persona.contactoEmergenciaNombre ? `${persona.contactoEmergenciaNombre}${persona.contactoEmergenciaRelacion ? ' (' + persona.contactoEmergenciaRelacion + ')' : ''}${persona.contactoEmergenciaTelefono ? ' · ' + persona.contactoEmergenciaTelefono : ''}` : odoo?.emergencia],
              ['Puesto', persona.puesto || odoo?.puesto], ['Departamento', persona.departamento || odoo?.departamento], ['Ingreso', persona.fechaIngreso ? fecha(persona.fechaIngreso) : null], ['Recomendado por', persona.recomendadoPor],
              ['Licencia', persona.licenciaCategoria ? `${persona.licenciaCategoria}${persona.licenciaVence ? ' · vence ' + fecha(persona.licenciaVence) : ''}` : null],
              ...(verMontos ? [['Modo de pago', persona.modoPago ? `${persona.modoPago}${persona.tarifaM2 ? ' · RD$' + persona.tarifaM2 + '/m²' : ''}${persona.tarifaDia ? ' · RD$' + persona.tarifaDia + '/día' : ''}` : null]] : []),
              ['Banco', persona.banco ? `${persona.banco}${persona.bancoTipoCuenta ? ' ' + persona.bancoTipoCuenta : ''}${persona.bancoNumeroCuenta ? ' ····' + String(persona.bancoNumeroCuenta).slice(-4) : ''}` : null]]
              .map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 text-right break-words min-w-0">{v && v !== '—' ? v : '—'}</span></div>)}
            {comp.pct < 100 && <div className="text-[11px] text-amber-400 pt-1">Falta: {comp.faltan.join(', ')}</div>}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-sm space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1 flex items-center gap-1.5"><ExternalLink className="w-3 h-3" /> Odoo · RR.HH.</div>
            {!odoo ? <div className="text-zinc-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando…</div>
              : odoo.error ? <div className="text-zinc-500">No se pudo leer Odoo: {odoo.error}</div>
              : !odoo.encontrado ? <div className="text-zinc-500">No está como empleado en Odoo (se busca por cédula y nombre).</div>
              : <>
                {[['Empresa', odoo.empresa], ['Puesto', odoo.puesto], ['Departamento', odoo.departamento], ['Supervisor', odoo.supervisor], ['Contrato', odoo.contrato ? `${odoo.contrato.estado === 'open' ? 'vigente' : 'cerrado'} · desde ${fecha(odoo.contrato.inicio)}` : 'sin contrato'], ['Encontrado por', odoo.via]]
                  .map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-zinc-200 text-right">{v || '—'}</span></div>)}
              </>}
          </div>

          {difs.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-800/60 rounded-card p-3 text-xs space-y-1">
              <div className="text-[10px] uppercase tracking-widest font-bold text-amber-400">Diferencias ERP · Odoo</div>
              {difs.map((d, i) => <div key={i} className="text-amber-200">{d}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
