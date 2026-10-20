// v8.68.0 (ticket Edwin): datos del INFORME DE VISITA de una reclamación (PDF al
// cliente). Lógica pura — el modal solo dibuja lo que esto devuelve. Nada de notas
// internas: solo lo que el cliente debe leer.

const limpio = (s) => String(s ?? '').trim();

// Etiqueta legible de la causa raíz desde el catálogo [[valor, etiqueta], …].
export function etiquetaCausaRaiz(causa, catalogo = []) {
  if (!causa) return '';
  const f = (catalogo || []).find(c => c[0] === causa);
  return f ? f[1] : String(causa);
}

// Filas de identificación (se omiten las vacías, salvo Cliente).
export function filasIdentificacion({ clienteNombre, contacto, ubicacionNombre, proyecto, referenciaCotizacion }) {
  const contactoTxt = contacto
    ? [limpio(contacto.nombre), limpio(contacto.tel), limpio(contacto.email)].filter(Boolean).join(' · ')
    : '';
  const obra = proyecto ? [limpio(proyecto.referenciaOdoo), limpio(proyecto.nombre || proyecto.referenciaProyecto)].filter(Boolean).join(' · ') : '';
  const filas = [
    ['Cliente', limpio(clienteNombre) || '—'],
    ['Contacto', contactoTxt],
    ['Ubicación', limpio(ubicacionNombre) || limpio(proyecto?.ubicacionDireccion)],
    ['Obra', obra],
    ['Cotización', limpio(referenciaCotizacion) || limpio(proyecto?.referenciaOdoo)],
  ];
  // Si obra y cotización dicen lo mismo, no repetir.
  return filas.filter(([k, v], i) => (i === 0 || v) && !(k === 'Cotización' && obra && obra.includes(v)));
}

// Secciones de texto del informe (título + cuerpo), en orden. Las vacías se omiten.
export function seccionesInforme({ descripcion, observaciones, causaRaizTxt, trabajoRealizado, recomendacion }) {
  const s = [];
  const hallazgo = [limpio(descripcion) && `Reporte del cliente: ${limpio(descripcion)}`, limpio(observaciones) && `Observaciones de la visita: ${limpio(observaciones)}`].filter(Boolean).join('\n\n');
  if (hallazgo) s.push({ titulo: 'HALLAZGO', texto: hallazgo });
  if (limpio(causaRaizTxt)) s.push({ titulo: 'CAUSA', texto: limpio(causaRaizTxt) });
  if (limpio(trabajoRealizado)) s.push({ titulo: 'TRABAJO REALIZADO', texto: limpio(trabajoRealizado) });
  if (limpio(recomendacion)) s.push({ titulo: 'RECOMENDACIÓN', texto: limpio(recomendacion) });
  return s;
}

// Nombre del archivo: "Informe-visita-<código>-<fecha>.pdf" (sin caracteres raros).
export function nombreArchivoInforme(r, fecha) {
  const ref = limpio(r?.codigo || r?.referenciaCotizacion || r?.id || 'reclamacion').replace(/[^\w-]+/g, '_');
  return `Informe-visita-${ref}-${limpio(fecha) || 'sin-fecha'}.pdf`;
}
