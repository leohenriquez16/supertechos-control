'use client';

// v8.93.0 — CANDADOS Y ACCESOS del programa (Sites).
// - LineaAcceso: en la tarjeta, el candado del sitio, si el acceso está pedido o la llave
//   asignada, y si la cuadrilla de la obra puede abrir un candado con usuario (Teleporte/iLoq).
// - PanelLlaves: quién tiene usuario de llave. Se pide una vez por persona y sirve para todos
//   los sitios con ese candado (como "los mismos datos que El Almirante").

import React, { useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import * as db from '../../lib/db';
import { CANDADO, cuadrillaPuedeAbrir } from '../../lib/helpers/programaSites';

const diasDesde = (f) => { if (!f) return null; const d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000); return d >= 0 ? d : null; };
export const cuadrillaDe = (obra) => [obra?.supervisorId, obra?.maestroId, ...(obra?.ayudantesIds || [])].filter(Boolean);

export function LineaAcceso({ l, obra, llaves = [], personal = [] }) {
  if (!l.acceso) return null;
  const c = l.candadoTipo ? CANDADO[l.candadoTipo] : null;
  const puede = c ? cuadrillaPuedeAbrir(l.candadoTipo, cuadrillaDe(obra), llaves) : null;
  const nombre = (id) => personal.find(p => p.id === id)?.nombre || '';
  const d = diasDesde(l.accesoPedidoAt);
  return (
    <div className="text-[10px] space-y-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        <KeyRound className="w-3 h-3 text-zinc-500" />
        {c ? <span className="text-zinc-300">{c.label}</span> : <span className="text-amber-400">Candado sin registrar</span>}
        <span className="text-zinc-600">·</span>
        {l.acceso === 'asignado' && <span className="text-green-400 font-bold">Llave asignada</span>}
        {l.acceso === 'pedido' && <span className="text-amber-400 font-bold">Acceso pedido{d != null ? ` hace ${d} d` : ''}</span>}
        {l.acceso === 'falta' && <span className="text-red-400 font-bold">Falta pedir acceso</span>}
      </div>
      {puede && !puede.ok && <div className="text-red-400 font-bold">Nadie de la cuadrilla tiene usuario {puede.tipo === 'iloq' ? 'iLoq' : 'Teleporte'}</div>}
      {puede?.ok && <div className="text-zinc-500">Abre: {puede.conUsuario.map(nombre).filter(Boolean).join(', ')}</div>}
    </div>
  );
}

export function PanelLlaves({ programaId, llaves = [], personal = [], onCambio }) {
  const [abierto, setAbierto] = useState(false);
  const [personaId, setPersonaId] = useState('');
  const [tipo, setTipo] = useState('teleporte');
  const [guardando, setGuardando] = useState(false);
  const activos = personal.filter(p => p.activo !== false).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const nombre = (id) => personal.find(p => p.id === id)?.nombre || id;
  const agregar = async () => {
    if (!personaId) return;
    setGuardando(true);
    try { await db.agregarLlavePrograma(programaId, personaId, tipo); setPersonaId(''); await onCambio?.(); }
    catch (e) { alert('No se pudo agregar: ' + (e.message || e)); }
    setGuardando(false);
  };
  const quitar = async (k) => {
    if (!confirm(`¿Quitar el usuario ${k.tipo === 'iloq' ? 'iLoq' : 'Teleporte'} de ${nombre(k.personaId)}?`)) return;
    try { await db.quitarLlavePrograma(k.id); await onCambio?.(); } catch (e) { alert('Error: ' + (e.message || e)); }
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3 text-[11px]">
      <button onClick={() => setAbierto(v => !v)} className="font-bold uppercase tracking-widest text-zinc-400 hover:text-white flex items-center gap-1.5">
        <KeyRound className="w-3.5 h-3.5" /> Usuarios de llave Teleporte / iLoq ({llaves.length}) {abierto ? '▴' : '▾'}
      </button>
      {abierto && (
        <div className="mt-2 space-y-2">
          <div className="text-zinc-500">Quién tiene usuario en la app del candado. Al programar un sitio con candado Bluetooth, el tablero avisa si nadie de la cuadrilla lo tiene. Recuerda: Sites prohíbe reemplazar, retirar o modificar los candados.</div>
          <div className="flex flex-wrap gap-1.5">
            {llaves.map(k => (
              <span key={k.id} className="inline-flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5">
                {nombre(k.personaId)} <span className="text-zinc-500">· {k.tipo === 'iloq' ? 'iLoq' : 'Teleporte'}</span>
                <button onClick={() => quitar(k)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
            {llaves.length === 0 && <span className="text-zinc-600">Nadie registrado todavía.</span>}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select id="llave-persona" value={personaId} onChange={e => setPersonaId(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1 text-white">
              <option value="">Persona…</option>
              {activos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select id="llave-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-card px-2 py-1 text-white">
              <option value="teleporte">Teleporte</option>
              <option value="iloq">iLoq</option>
            </select>
            <button onClick={agregar} disabled={!personaId || guardando} className="px-2 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold uppercase rounded-card flex items-center gap-1">
              <Plus className="w-3 h-3" /> Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
