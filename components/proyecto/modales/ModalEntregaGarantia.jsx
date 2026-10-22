'use client';

// v8.71.0 — CARTA DE GARANTÍA DESDE LA OBRA (decisión de Leonardo, 21-oct-2026).
//
// Antes, para sacar una carta había que mover la obra a "recibido conforme" y
// devolverla, porque la garantía solo nacía con ese estado. Miguel hizo eso con tres
// obras en veinte minutos el 21-oct, y las tres garantías quedaron arrancando ese día
// aunque las obras habían terminado 10, 12 y 14 días antes.
//
// Ahora:
//   · BORRADOR — se saca cuando sea, para enseñarle al cliente qué va a recibir. No
//     crea la garantía ni toca el estado de la obra. Lleva marca de agua.
//   · ORIGINAL — se habilita cuando Odoo dice que la factura está saldada. Ahí sí se
//     crea la garantía, con fecha de inicio = fecha de ENTREGA de la obra.
//
// El saldo se consulta a Odoo porque el ERP no lo tiene: ninguna obra llega al estado
// 'cobrado' ni tiene fecha_cobro.

import React, { useEffect, useState } from 'react';
import { X, Loader2, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';
import * as db from '../../../lib/db';
import { tipoSugeridoParaSistema, getTipoGarantia } from '../../../lib/garantiasCatalogo';
import ModalCartaGarantia from '../../garantias/ModalCartaGarantia';

const fmtRD = (n) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtF = (s) => { if (!s) return '—'; try { return new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return s; } };

export default function ModalEntregaGarantia({ proyecto, sistema, data, usuario, onCerrar, onCambio }) {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(null);   // respuesta de /api/obra/estado-entrega
  const [error, setError] = useState('');
  const [emitiendo, setEmitiendo] = useState(false);
  const [carta, setCarta] = useState(null);     // { garantia, borrador, fechaEntrega, motivo }

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/obra/estado-entrega', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proyectoId: proyecto.id }),
        });
        const j = await r.json();
        if (!vivo) return;
        if (!j.ok) setError(j.error || 'No se pudo consultar el estado de la obra');
        else setEstado(j);
      } catch (e) {
        if (vivo) setError(e?.message || 'No se pudo consultar el estado de la obra');
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [proyecto.id]);

  const garantiaExistente = (data?.garantias || []).find(g => g.proyectoId === proyecto.id) || null;
  const clienteNombre = proyecto.cliente || (data?.clientes || []).find(c => c.id === proyecto.clienteId)?.nombre || '';
  // v8.72.0: tipoSugeridoParaSistema lee sistema.data.nombre / sistema.nombre / su id, así que
  // recibe el OBJETO. Pasándole el nombre suelto, ningún campo resolvía, el nombre quedaba vacío
  // y devolvía siempre 'imper_liquida': una carta de silicona sobre lona, de piso epóxico o de un
  // simple lavado salía garantizando estanqueidad de impermeabilización líquida.
  const tipo = garantiaExistente?.tipo || tipoSugeridoParaSistema(sistema);
  const cat = getTipoGarantia(tipo);
  // v8.72.3: la duración la decide quien emite. Default: la del sistema; Towers and Sites
  // va a 10 años (todas sus obras están en un mismo contrato); si no, la del tipo.
  const esTowers = /towers\s*(and|&)?\s*sites/i.test(`${proyecto.cliente || ''} ${proyecto.nombre || ''} ${clienteNombre}`);
  const mesesDefault = sistema?.garantia_meses || sistema?.garantiaMeses || (esTowers ? 120 : null) || cat?.duracionMeses || null;
  const [anos, setAnos] = useState(mesesDefault ? String(mesesDefault / 12) : '');
  const mesesElegidos = Math.round((parseFloat(anos) || 0) * 12) || null;

  // Garantía "de mentira" para que el borrador se vea igual que la carta buena.
  const garantiaBorrador = {
    ...(garantiaExistente || {}),
    tipo, sistemaNombre: sistema?.nombre || sistema?.data?.nombre || garantiaExistente?.sistemaNombre || '',
    duracionMeses: garantiaExistente?.duracionMeses || mesesElegidos,
    cobertura: garantiaExistente?.cobertura || cat?.cobertura || '',
    condicion: garantiaExistente?.condicion || cat?.condicion || '',
    referenciaCotizacion: proyecto.referenciaOdoo || '',
    fechaInicio: estado?.fechaEntrega || null,
  };

  const emitirOriginal = async () => {
    setEmitiendo(true); setError('');
    try {
      // La garantía nace con la fecha de ENTREGA, no con la de hoy.
      const creada = garantiaExistente || await db.crearGarantiaDesdeProyecto(proyecto, sistema, {
        fechaInicio: estado?.fechaEntrega || undefined, tipo,
        cobertura: cat?.cobertura || null, condicion: cat?.condicion || null,
        duracionMeses: mesesElegidos,
      });
      await onCambio?.();
      setCarta({ garantia: creada || garantiaBorrador, borrador: false });
    } catch (e) {
      setError(e?.message || 'No se pudo emitir la garantía');
    } finally { setEmitiendo(false); }
  };

  if (carta) {
    return (
      <ModalCartaGarantia
        garantia={carta.garantia}
        clienteNombre={clienteNombre}
        proyecto={proyecto}
        ubicacionNombre={proyecto.ubicacionDireccionTexto || ''}
        mantenimientos={data?.mantenimientos || []}
        borrador={carta.borrador}
        fechaEntrega={estado?.fechaEntrega}
        motivoBorrador={carta.motivo}
        onCerrar={() => setCarta(null)}
      />
    );
  }

  const pago = estado?.pago;
  const puedeOriginal = estado?.carta?.modo === 'original';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">Carta de garantía</div>
              <div className="text-[11px] text-zinc-500 truncate">{proyecto.referenciaOdoo || proyecto.nombre}</div>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          {cargando && <div className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Consultando el estado de la factura en Odoo…</div>}
          {error && <div className="text-[11px] text-red-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}</div>}

          {!cargando && estado && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Entregada</div>
                  <div className="text-sm font-bold mt-0.5">{fmtF(estado.fechaEntrega)}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">la garantía corre desde aquí</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Factura</div>
                  <div className={`text-sm font-bold mt-0.5 ${pago?.saldada ? 'text-green-500' : 'text-amber-500'}`}>
                    {!pago?.hayFactura ? 'Sin emitir' : pago.saldada ? 'Saldada' : 'Pendiente'}
                  </div>
                  {pago?.hayFactura && !pago.saldada && (
                    <div className="text-[10px] text-zinc-500 mt-0.5">faltan {fmtRD(pago.pendiente)}</div>
                  )}
                </div>
              </div>

              {garantiaExistente && (
                <div className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2">
                  Esta obra ya tiene su garantía emitida{garantiaExistente.fechaInicio ? <> desde el {fmtF(garantiaExistente.fechaInicio)}</> : null}.
                </div>
              )}

              {!garantiaExistente && (
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-card px-3 py-2">
                  <span>Años de garantía{esTowers ? <span className="text-[10px] text-zinc-500"> · contrato Towers and Sites</span> : null}</span>
                  <input type="number" min="0" step="0.5" inputMode="decimal" value={anos} onChange={e => setAnos(e.target.value)}
                    className="w-20 bg-zinc-900 border border-zinc-700 rounded-card px-2 py-1 text-right text-white" />
                </label>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={() => setCarta({ garantia: garantiaBorrador, borrador: true, motivo: estado.carta?.motivo })}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-card py-2.5 text-xs font-bold"
                >
                  <FileText className="w-4 h-4" /> Ver borrador
                </button>
                <button
                  onClick={emitirOriginal}
                  disabled={!puedeOriginal || emitiendo}
                  title={puedeOriginal ? '' : estado.carta?.motivo || ''}
                  className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-card py-2.5 text-xs font-bold"
                >
                  {emitiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {garantiaExistente ? 'Ver carta original' : 'Emitir carta original'}
                </button>
                {!puedeOriginal && (
                  <div className="text-[10px] text-zinc-500 text-center">{estado.carta?.motivo}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
