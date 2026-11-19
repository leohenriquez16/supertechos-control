'use client';

// v8.76: lee de Odoo (solo lectura) las salidas de almacén (AL/OUT) de una lista de pedidos,
// por código REQ y por cotización de la obra — GET /api/odoo/salidas-pedidos con sesión.
// Solo vuelve a pedir cuando cambia lo que se busca (refs/códigos/desde) o con recargar().
// v8.84.0: además reparte cada salida a UN pedido (amarrarSalidas) mirando TODOS los pedidos
// (no solo los que se ven en pantalla) — así la misma salida sale amarrada igual en Almacén y
// en Rutas. Va en resp.amarre. universo (opcional): todos los pedidos ya cargados (Almacén);
// si no, se leen todos. Mientras no estén, no se pinta amarre (sale "Buscando en Odoo…").
// → { resp, cargando, error, recargar }

import { useEffect, useMemo, useState } from 'react';
import { fetchConSesion } from '../../lib/fetchConSesion';
import * as db from '../../lib/db';
import { consultaSalidas, urlSalidasPedidos, referenciaPedido } from '../../lib/helpers/porMontar';
import { amarrarSalidas } from '../../lib/helpers/amarreSalidas';

export default function useSalidasPedidos(pedidos, proyectoDe, { universo = null } = {}) {
  const url = useMemo(() => urlSalidasPedidos(consultaSalidas(pedidos, proyectoDe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidos]);
  const [estado, setEstado] = useState({ url: null, resp: null, error: null });
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [leidos, setLeidos] = useState({ lista: null, error: null }); // universo leído de la base cuando no lo pasan

  // se vuelve a leer cuando cambian los pedidos que se buscan (Rutas recarga tras cada acción)
  useEffect(() => {
    if (universo || !url) return;
    let vivo = true;
    db.listarRequisiciones()
      .then(rs => { if (vivo) setLeidos({ lista: rs || [], error: null }); })
      .catch(e => { if (vivo) setLeidos(l => ({ lista: l.lista, error: e?.message || 'No se pudieron leer los pedidos' })); });
    return () => { vivo = false; };
  }, [universo, url, vuelta]);

  useEffect(() => {
    if (!url) { setEstado({ url: null, resp: null, error: null }); return; }
    let vivo = true;
    setCargando(true);
    fetchConSesion(url)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || `Error ${r.status}`); return d; })
      .then(d => { if (vivo) setEstado({ url, resp: d, error: null }); })
      .catch(e => { if (vivo) setEstado(s => ({ url, resp: s.url === url ? s.resp : null, error: e?.message || 'No se pudo leer Odoo' })); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [url, vuelta]);

  // Reparto de salidas con todos los pedidos (los visibles mandan: vienen frescos).
  // si la lectura falla, se reparte solo con los pedidos visibles (mejor eso que nada)
  const base = universo || leidos.lista || (leidos.error ? [] : null);
  const resp = useMemo(() => {
    if (!estado.resp || !base) return null;
    const porId = new Map();
    [...base, ...(pedidos || [])].forEach(p => { if (p?.id) porId.set(p.id, p); });
    const amarre = amarrarSalidas([...porId.values()], estado.resp, (p) => referenciaPedido(p, proyectoDe(p)));
    return { ...estado.resp, amarre };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.resp, base, pedidos]);

  // La respuesta vieja sirve mientras llega la nueva (mismos pedidos casi siempre).
  return {
    resp,
    cargando: cargando || (!!estado.resp && !base),
    error: estado.error,
    recargar: () => setVuelta(v => v + 1),
  };
}
