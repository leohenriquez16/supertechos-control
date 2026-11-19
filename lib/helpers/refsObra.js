// v8.77.0: cotizaciones de Odoo de una obra = la original + sus sub-cotizaciones (ampliaciones
// del mismo proyecto que en Odoo se crean con la MISMA cuenta analítica; la sincronización
// diaria las guarda en proyecto.subCotizaciones). Las salidas de almacén pueden salir con
// cualquiera de esos números, así que costo real y "ya salió" las buscan todas.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function refsDeObra(proyecto) {
  const refs = [proyecto?.referenciaOdoo, ...((proyecto?.subCotizaciones || [])
    .filter(s => s && s.ref && s.estado !== 'cancel')
    .map(s => s.ref))]
    .map(r => String(r || '').trim()).filter(Boolean);
  return [...new Set(refs)];
}

// Une las salidas agrupadas por número de cotización (respuesta de
// /api/odoo/salidas-almacen?agrupar=1) de todas las cotizaciones de la obra.
// null si no hay ninguna referencia con número utilizable.
export function salidasDeObra(porReferencia, proyecto, numRef) {
  const nums = [...new Set(refsDeObra(proyecto).map(numRef).filter(Boolean))];
  if (!nums.length) return null;
  const g = {};
  for (const n of nums) {
    for (const p of (porReferencia?.[n]?.productos || [])) {
      const k = p.producto;
      if (!g[k]) g[k] = { ...p, cantidad: 0, costoRd: 0, fuentesCosto: [] };
      g[k].cantidad = r2(g[k].cantidad + (Number(p.cantidad) || 0));
      g[k].costoRd = r2(g[k].costoRd + (Number(p.costoRd) || 0));
      (p.fuentesCosto || []).forEach(f => { if (!g[k].fuentesCosto.includes(f)) g[k].fuentesCosto.push(f); });
    }
  }
  return { productos: Object.values(g).sort((a, b) => b.cantidad - a.cantidad) };
}
