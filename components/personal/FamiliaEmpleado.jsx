'use client';

// v8.89.0: Datos personales (estado civil, estudios…) y familia del empleado.
// Se lee/escribe por /api/personal/familia (tablas con RLS, solo servidor).
// Lo ven y editan: la propia persona y admin/owner/nómina. Supervisores no.
import React, { useEffect, useState } from 'react';
import { Users, Pencil, Plus, Trash2, Save, X, Loader2 } from 'lucide-react';
import { fetchConSesion } from '../../lib/fetchConSesion';

const PARENTESCOS = ['Cónyuge', 'Hijo/a', 'Padre', 'Madre', 'Hermano/a', 'Otro'];
const ESTADO_CIVIL = ['Soltero/a', 'Casado/a', 'Unión libre', 'Divorciado/a', 'Viudo/a'];
const ESTUDIOS = ['Primaria', 'Secundaria / Bachiller', 'Técnico', 'Universitario', 'Postgrado', 'Ninguno'];
const fecha = (f) => f ? new Date(String(f).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const edad = (f) => { if (!f) return null; const d = new Date(String(f).slice(0, 10) + 'T00:00:00'), h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--; return a >= 0 ? a : null; };
const inp = 'w-full bg-zinc-950 border border-zinc-800 rounded-card px-2 py-1.5 text-sm text-white outline-none focus:border-red-500';

export default function FamiliaEmpleado({ personaId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let c = false; setD(null); setErr(null); setEdit(null);
    fetchConSesion(`/api/personal/familia?personaId=${encodeURIComponent(personaId)}`).then(r => r.json())
      .then(j => { if (!c) j?.error ? setErr(j.error) : setD(j); }).catch(e => !c && setErr(e?.message || 'Error'));
    return () => { c = true; };
  }, [personaId]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetchConSesion('/api/personal/familia', { method: 'POST', body: JSON.stringify({ personaId, rrhh: edit.rrhh, familia: edit.familia }) });
      const j = await r.json(); if (j?.error) throw new Error(j.error);
      setD(j); setEdit(null);
    } catch (e) { alert('No se pudo guardar: ' + (e?.message || e)); }
    setGuardando(false);
  };

  const card = 'bg-zinc-900 border border-zinc-800 rounded-card p-3';
  if (err) return <div className={card + ' text-sm text-zinc-500'}>Familia: {err}</div>;
  if (!d) return <div className={card + ' text-sm text-zinc-500 flex items-center gap-2'}><Loader2 className="w-4 h-4 animate-spin" /> Cargando familia…</div>;

  if (edit) {
    const setR = (k, v) => setEdit(e => ({ ...e, rrhh: { ...e.rrhh, [k]: v } }));
    const setF = (i, k, v) => setEdit(e => ({ ...e, familia: e.familia.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
    const sel = (k, ops) => <select value={edit.rrhh[k] || ''} onChange={e => setR(k, e.target.value)} className={inp}><option value="">—</option>{ops.map(o => <option key={o}>{o}</option>)}</select>;
    return (
      <div className={card + ' space-y-3'}>
        <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">Datos personales y familia</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <label className="space-y-1"><span className="text-zinc-500">Estado civil</span>{sel('estado_civil', ESTADO_CIVIL)}</label>
          <label className="space-y-1"><span className="text-zinc-500">Sexo</span>{sel('sexo', ['Masculino', 'Femenino'])}</label>
          <label className="space-y-1"><span className="text-zinc-500">Nacionalidad</span><input value={edit.rrhh.nacionalidad || ''} onChange={e => setR('nacionalidad', e.target.value)} className={inp} placeholder="Dominicana" /></label>
          <label className="space-y-1"><span className="text-zinc-500">Nivel de estudios</span>{sel('nivel_estudios', ESTUDIOS)}</label>
          <label className="space-y-1"><span className="text-zinc-500">Profesión / oficio</span><input value={edit.rrhh.profesion || ''} onChange={e => setR('profesion', e.target.value)} className={inp} /></label>
        </div>
        <div className="space-y-2">
          {edit.familia.map((f, i) => (
            <div key={f.id || i} className="grid grid-cols-2 lg:grid-cols-[130px_1fr_150px_140px_140px_auto_auto] gap-2 items-center border-t border-zinc-800 pt-2">
              <select value={f.parentesco || ''} onChange={e => setF(i, 'parentesco', e.target.value)} className={inp}><option value="">Parentesco</option>{PARENTESCOS.map(o => <option key={o}>{o}</option>)}</select>
              <input value={f.nombre || ''} onChange={e => setF(i, 'nombre', e.target.value)} className={inp} placeholder="Nombre completo" />
              <input type="date" value={f.fecha_nacimiento || ''} onChange={e => setF(i, 'fecha_nacimiento', e.target.value)} className={inp} />
              <input value={f.cedula || ''} onChange={e => setF(i, 'cedula', e.target.value)} className={inp} placeholder="Cédula" />
              <input value={f.telefono || ''} onChange={e => setF(i, 'telefono', e.target.value)} className={inp} placeholder="Teléfono" />
              <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={!!f.dependiente} onChange={e => setF(i, 'dependiente', e.target.checked)} className="accent-red-600" /> Depende</label>
              <button onClick={() => setEdit(e => ({ ...e, familia: e.familia.filter((_, j) => j !== i) }))} className="text-zinc-500 hover:text-red-400 justify-self-end"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setEdit(e => ({ ...e, familia: [...e.familia, { parentesco: '', nombre: '', dependiente: false }] }))} className="flex items-center gap-1 text-xs font-bold text-zinc-300 hover:text-white"><Plus className="w-3.5 h-3.5" /> Agregar familiar</button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEdit(null)} className="flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs font-bold px-3 py-2 rounded-card"><X className="w-3.5 h-3.5" /> Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 text-white text-xs font-black px-3 py-2 rounded-card">{guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar</button>
        </div>
      </div>
    );
  }

  const r = d.rrhh || {}; const fam = d.familia || [];
  const hijos = fam.filter(f => f.parentesco === 'Hijo/a');
  return (
    <div className={card + ' space-y-2'}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Datos personales y familia</div>
        <button onClick={() => setEdit({ rrhh: { ...r }, familia: fam.map(f => ({ ...f })) })} className="flex items-center gap-1 text-xs font-bold text-zinc-300 hover:text-white"><Pencil className="w-3.5 h-3.5" /> Editar</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-1 text-sm">
        {[['Estado civil', r.estado_civil], ['Sexo', r.sexo], ['Nacionalidad', r.nacionalidad], ['Estudios', r.nivel_estudios], ['Profesión', r.profesion], ['Hijos', hijos.length ? `${hijos.length}` : '0']].map(([k, v]) => (
          <div key={k} className="min-w-0"><div className="text-[10px] text-zinc-500 uppercase tracking-wider">{k}</div><div className="text-zinc-200 truncate">{v || '—'}</div></div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800"><th className="text-left py-1.5 pr-2">Parentesco</th><th className="text-left py-1.5 pr-2">Nombre</th><th className="text-left py-1.5 pr-2">Nacimiento</th><th className="text-left py-1.5 pr-2">Cédula</th><th className="text-left py-1.5 pr-2">Teléfono</th><th className="text-left py-1.5">Depende</th></tr></thead>
          <tbody>
            {fam.map(f => (
              <tr key={f.id} className="border-t border-zinc-800"><td className="py-1.5 pr-2 text-zinc-300">{f.parentesco}</td><td className="py-1.5 pr-2 text-white">{f.nombre}</td>
                <td className="py-1.5 pr-2 text-zinc-400 whitespace-nowrap">{fecha(f.fecha_nacimiento)}{edad(f.fecha_nacimiento) != null ? ` (${edad(f.fecha_nacimiento)} años)` : ''}</td>
                <td className="py-1.5 pr-2 text-zinc-400 tabular-nums">{f.cedula || '—'}</td><td className="py-1.5 pr-2 text-zinc-400">{f.telefono || '—'}</td><td className="py-1.5 text-zinc-400">{f.dependiente ? 'Sí' : '—'}</td></tr>
            ))}
            {!fam.length && <tr><td colSpan={6} className="py-4 text-center text-zinc-500">Sin familiares registrados. Toca Editar para agregar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
