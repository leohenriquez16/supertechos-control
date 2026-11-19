'use client';

// v8.76: lee de Odoo (solo lectura) las salidas de almacén (AL/OUT) de una lista de pedidos,
// por cotización de la obra y por código REQ — GET /api/odoo/salidas-pedidos con sesión.
// Solo vuelve a pedir cuando cambia lo que se busca (refs/códigos/desde) o con recargar().
// → { resp, cargando, error, recargar }

import { useEffect, useMemo, useState } from 'react';
import { fetchConSesion } from '../../lib/fetchConSesion';
import { consultaSalidas, urlSalidasPedidos } from '../../lib/helpers/porMontar';

export default function useSalidasPedidos(pedidos, proyectoDe) {
  const url = useMemo(() => urlSalidasPedidos(consultaSalidas(pedidos, proyectoDe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidos]);
  const [estado, setEstado] = useState({ url: null, resp: null, error: null });
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);

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

  // La respuesta vieja sirve mientras llega la nueva (mismos pedidos casi siempre).
  return { resp: estado.resp, cargando, error: estado.error, recargar: () => setVuelta(v => v + 1) };
}
