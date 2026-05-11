// Generadores HTML de cuadre de caja chica para imprimir/PDF.
// Sigue el patrón de imprimirReciboNomina y imprimirCorteCompleto del módulo
// de nómina: window.open + window.print() con CSS A4/Letter.

import { calcularCuadre, TIPO_LABEL, CATEGORIA_LABEL } from '../../lib/helpers/cuadreCajaChica';
import { toast } from '../../lib/toast';

const fmt = (n) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtFecha = (s) => {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const HEAD = `
<style>
  @page { size: letter; margin: 0.4in; }
  body { font-family: Arial, sans-serif; color: #000; margin: 0; font-size: 10.5px; line-height: 1.35; }
  .letterhead { border-bottom: 3px solid #CC0000; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 22px; font-weight: 900; color: #CC0000; letter-spacing: -0.5px; }
  .logo-sub { font-size: 9px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
  .company-data { font-size: 9px; color: #555; text-align: right; line-height: 1.4; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #000; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; font-size: 11px; }
  .meta-row .label { color: #555; text-transform: uppercase; letter-spacing: 0.5px; font-size: 9px; }
  .meta-row .val { font-weight: bold; }
  .resumen { margin: 10px 0; }
  .resumen table { width: 100%; border-collapse: collapse; }
  .resumen td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #eee; }
  .resumen td.label { color: #555; }
  .resumen td.val { text-align: right; font-weight: bold; font-family: 'Courier New', monospace; }
  .resumen tr.total td { border-top: 2px solid #000; border-bottom: 2px solid #000; background: #f5f5f5; font-size: 13px; padding: 8px; }
  .resumen tr.add td.val { color: #2a8a2a; }
  .resumen tr.sub td.val { color: #CC0000; }

  table.movs { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.movs th, table.movs td { padding: 4px 6px; font-size: 10px; border-bottom: 1px solid #e5e5e5; text-align: left; vertical-align: top; }
  table.movs th { background: #f5f5f5; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; color: #555; border-bottom: 2px solid #000; }
  table.movs td.right { text-align: right; font-family: 'Courier New', monospace; }
  table.movs tr.entrega td.right { color: #2a8a2a; font-weight: bold; }
  table.movs tr.gasto td.right, table.movs tr.dieta td.right { color: #CC0000; }

  .signos { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 60px; }
  .signo-box { border-top: 1px solid #000; padding-top: 6px; font-size: 10px; color: #333; }
  .footer { margin-top: 20px; padding-top: 6px; border-top: 1px solid #eee; font-size: 9px; color: #888; text-align: center; }
  .page-break { page-break-before: always; }
  .badge { display: inline-block; padding: 1px 6px; font-size: 9px; text-transform: uppercase; font-weight: bold; }
  .badge-pendiente { background: #fef3c7; color: #92400e; border: 1px solid #d97706; }
  .badge-rechazado { background: #fee2e2; color: #991b1b; border: 1px solid #dc2626; }
  .nota-pequena { font-size: 9px; color: #888; font-style: italic; margin-top: 4px; }
  .anexo { margin-top: 18px; padding: 8px; background: #fafafa; border: 1px solid #ddd; }
  .anexo h3 { font-size: 11px; margin: 0 0 6px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
</style>`;

function letterheadHTML() {
  return `
<div class="letterhead">
  <div>
    <div class="logo">SUPER TECHOS</div>
    <div class="logo-sub">Sistema de Impermeabilización</div>
  </div>
  <div class="company-data">
    C/ Arena #1, Mar Azul, Santo Domingo R.D.<br>
    Tel. 809-535-9293 · www.supertechos.com.do<br>
    RNC: 130-77433-1
  </div>
</div>`;
}

// Genera el bloque de un titular (resumen + tabla detalle).
// Lo usamos tanto en individual (1 bloque) como en consolidado (N bloques).
function bloqueTitular({ persona, cuadre, fechaInicio, fechaFin, data, conSignaturas, esConsolidado }) {
  const limite = persona?.limiteCajaChica != null ? Number(persona.limiteCajaChica) : null;

  const filaResumen = (label, val, signo = 'neutral') => `
    <tr class="${signo === 'add' ? 'add' : signo === 'sub' ? 'sub' : ''}">
      <td class="label">${label}</td>
      <td class="val">${signo === 'sub' ? '−' : signo === 'add' ? '+' : ''} RD$ ${fmt(val)}</td>
    </tr>`;

  // Mapa de categorías (nombre canónico) — se usa en el detalle y en el resumen
  const catMap = {};
  (data?.categoriasCajaChica || []).forEach(cat => { catMap[cat.id] = cat; });
  const labelCategoria = (m) => {
    const id = m.datosIA?.categoria_sugerida;
    if (!id) return '';
    return catMap[id]?.nombre || CATEGORIA_LABEL[id] || id;
  };

  // Detalle de movimientos cronológico — solo aprobados (norma contable)
  const movsAprobados = cuadre.movimientosEnRango.filter(
    m => m.tipo === 'entrega' || m.tipo === 'ajuste' || m.status === 'aprobado'
  );

  const filasDetalle = movsAprobados.map(m => {
    const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
    const proyLbl = proy ? `${proy.referenciaOdoo || ''} ${proy.cliente || proy.nombre || ''}`.trim() : '';
    const ncf = m.datosIA?.ncf || '';
    const monto = aportePresentacion(m);
    const cat = labelCategoria(m);
    return `
      <tr class="${m.tipo === 'entrega' ? 'entrega' : m.tipo === 'gasto_factura' ? 'gasto' : m.tipo === 'dieta' ? 'dieta' : ''}">
        <td>${fmtFecha(m.fecha)}</td>
        <td><b>${TIPO_LABEL[m.tipo] || m.tipo}</b></td>
        <td>${m.proveedor || (m.tipo === 'entrega' ? '—' : m.tipo === 'dieta' ? 'Dieta diaria' : '—')}</td>
        <td>${m.rnc || ''}</td>
        <td>${ncf}</td>
        <td>${cat}</td>
        <td>${m.concepto || ''}${proyLbl ? `<br><span style="color:#888;font-size:9px;">${proyLbl}</span>` : ''}</td>
        <td class="right">${monto}</td>
      </tr>`;
  }).join('');

  // Resumen por categoría (usa nombre canónico de DB si está disponible)
  const filasCategoria = cuadre.categorias.map(c => {
    const nombre = catMap[c.categoria]?.nombre || CATEGORIA_LABEL[c.categoria] || c.categoria;
    return `
    <tr>
      <td class="label">${nombre} <span style="color:#888;">(${c.count})</span></td>
      <td class="val">RD$ ${fmt(c.total)}</td>
    </tr>`;
  }).join('');

  // Anexo: pendientes y rechazados (informativos, NO afectan saldo)
  let anexoHtml = '';
  if (cuadre.pendientes.length > 0 || cuadre.rechazados.length > 0) {
    const filasAnexo = [...cuadre.pendientes, ...cuadre.rechazados].map(m => `
      <tr>
        <td>${fmtFecha(m.fecha)}</td>
        <td><b>${TIPO_LABEL[m.tipo]}</b></td>
        <td>${m.proveedor || '—'}</td>
        <td>${labelCategoria(m)}</td>
        <td>${m.concepto || ''}</td>
        <td><span class="badge badge-${m.status === 'pendiente_revision' ? 'pendiente' : 'rechazado'}">${m.status === 'pendiente_revision' ? 'Pendiente' : 'Rechazado'}</span>${m.motivoRechazo ? `<br><span style="color:#888;font-size:9px;">${m.motivoRechazo}</span>` : ''}</td>
        <td class="right">RD$ ${fmt(m.monto)}</td>
      </tr>`).join('');
    anexoHtml = `
      <div class="anexo">
        <h3>Movimientos NO incluidos en el cuadre (informativo)</h3>
        <p style="font-size:10px;color:#555;margin:0 0 6px;">Los movimientos pendientes o rechazados no afectan el saldo del fondo. Se listan aquí para referencia y seguimiento.</p>
        <table class="movs"><thead><tr><th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Categoría</th><th>Concepto</th><th>Estado</th><th>Monto</th></tr></thead><tbody>${filasAnexo}</tbody></table>
      </div>`;
  }

  return `
    <div class="meta-row">
      <div><span class="label">Titular:</span> <span class="val">${persona?.nombre || persona?.id || '—'}</span>${persona?.cedulaNumero ? ` <span style="color:#888;font-size:10px;">· Cédula ${persona.cedulaNumero}</span>` : ''}</div>
      <div><span class="label">Período:</span> <span class="val">${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}</span></div>
    </div>
    ${limite != null && limite > 0 ? `<div class="meta-row"><div><span class="label">Fondo asignado:</span> <span class="val">RD$ ${fmt(limite)}</span></div></div>` : ''}

    <h2>Resumen del fondo</h2>
    <div class="resumen">
      <table>
        ${filaResumen('Saldo inicial del período', cuadre.saldoInicial)}
        ${cuadre.totalEntregas > 0 ? filaResumen('Entregas recibidas', cuadre.totalEntregas, 'add') : ''}
        ${cuadre.totalGastos > 0 ? filaResumen('Gastos con factura aprobados', cuadre.totalGastos, 'sub') : ''}
        ${cuadre.totalDietas > 0 ? filaResumen('Dietas aprobadas', cuadre.totalDietas, 'sub') : ''}
        ${cuadre.totalAjustes !== 0 ? filaResumen('Ajustes', Math.abs(cuadre.totalAjustes), cuadre.totalAjustes > 0 ? 'add' : 'sub') : ''}
        <tr class="total"><td class="label"><b>Saldo final del período</b></td><td class="val">RD$ ${fmt(cuadre.saldoFinal)}</td></tr>
      </table>
    </div>

    <h2>Detalle de movimientos del período</h2>
    ${filasDetalle ? `
    <table class="movs">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>RNC</th><th>NCF</th><th>Categoría</th><th>Concepto</th><th>Monto</th></tr></thead>
      <tbody>${filasDetalle}</tbody>
    </table>` : '<p style="color:#888;font-size:11px;">Sin movimientos aprobados en el período.</p>'}

    ${cuadre.categorias.length > 0 ? `
    <h2>Egresos por categoría</h2>
    <div class="resumen">
      <table>${filasCategoria}
        <tr class="total"><td class="label">Total egresos con factura</td><td class="val">RD$ ${fmt(cuadre.totalGastos)}</td></tr>
      </table>
    </div>` : ''}

    ${cuadre.sinFacturaAprob && cuadre.sinFacturaAprob.length > 0 ? `
    <h2 style="color:#CC0000;border-color:#CC0000;">⚠️ Gastos sin factura — atención auditoría</h2>
    <p style="font-size:10px;color:#555;margin:0 0 6px;">
      Compras informales sin comprobante fiscal (vendedor ambulante, ayudante ocasional, propina, etc.).
      Total: <b>RD$ ${fmt(cuadre.totalSinFactura)}</b> · ${cuadre.pctSinFactura.toFixed(1)}% del total de gastos del período
      ${cuadre.pctSinFactura > 20 ? '<span style="color:#CC0000;font-weight:bold;"> · ⚠ Alto porcentaje</span>' : ''}.
    </p>
    <table class="movs">
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Concepto</th><th>Monto</th></tr></thead>
      <tbody>
        ${cuadre.sinFacturaAprob.map(m => {
          const proy = m.proyectoId ? data.proyectos.find(p => p.id === m.proyectoId) : null;
          const proyLbl = proy ? `${proy.referenciaOdoo || ''} ${proy.cliente || proy.nombre || ''}`.trim() : '';
          return `
            <tr style="background:#fff5f5;">
              <td>${fmtFecha(m.fecha)}</td>
              <td>${labelCategoria(m)}</td>
              <td>${m.concepto || '—'}${proyLbl ? `<br><span style="color:#888;font-size:9px;">${proyLbl}</span>` : ''}</td>
              <td class="right" style="color:#CC0000;font-weight:bold;">RD$ ${fmt(m.monto)}</td>
            </tr>`;
        }).join('')}
        <tr class="total"><td colspan="3" class="label">Total sin factura</td><td class="val" style="color:#CC0000;">RD$ ${fmt(cuadre.totalSinFactura)}</td></tr>
      </tbody>
    </table>` : ''}

    <h2>Conciliación de fondos</h2>
    <div class="resumen">
      <table>
        <tr><td class="label">Saldo teórico al cierre del período</td><td class="val">RD$ ${fmt(cuadre.saldoFinal)}</td></tr>
        <tr><td class="label">Saldo físico declarado por el titular</td><td class="val" style="border-bottom:1px solid #000;color:#bbb;">_____________________</td></tr>
        <tr><td class="label">Diferencia</td><td class="val" style="border-bottom:1px solid #000;color:#bbb;">_____________________</td></tr>
      </table>
      ${cuadre.totalPendientes > 0 ? `<p class="nota-pequena">⚠️ Hay RD$ ${fmt(cuadre.totalPendientes)} en gastos pendientes de aprobación que no afectan el saldo teórico.</p>` : ''}
    </div>

    ${anexoHtml}

    ${conSignaturas ? `
    <div class="signos">
      <div class="signo-box">Firma del titular<br><b>${persona?.nombre || ''}</b><br>Fecha: __________________</div>
      <div class="signo-box">Firma de aprobación<br>(administración)<br>Fecha: __________________</div>
    </div>` : ''}
    ${esConsolidado ? '<div class="page-break"></div>' : ''}
  `;
}

// Aporte de un movimiento al saldo, formateado para presentación.
function aportePresentacion(m) {
  if (m.tipo === 'entrega') return `+ RD$ ${fmt(m.monto)}`;
  if (m.tipo === 'ajuste') {
    const signo = m.signoAjuste >= 0 ? '+' : '−';
    return `${signo} RD$ ${fmt(m.monto)}`;
  }
  return `− RD$ ${fmt(m.monto)}`;
}

function htmlBase(titulo, cuerpo) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>${HEAD}</head><body>${letterheadHTML()}${cuerpo}<div class="footer">Generado por Super Techos ERP · ${new Date().toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })} · Cuadre conforme a prácticas contables generalmente aceptadas</div><script>window.onload = function(){ window.print(); }</script></body></html>`;
}

// ============================================================
// Cuadre INDIVIDUAL
// ============================================================
// v8.17.15: ahora acepta `ventana` ya abierta (síncronamente desde el click)
// para evitar el bloqueador de popups cuando hay awaits antes de imprimir.
export function imprimirCuadreIndividual({ persona, movimientos, fechaInicio, fechaFin, data, ventana = null }) {
  const cuadre = calcularCuadre({ movimientos, fechaInicio, fechaFin });
  const cuerpo = `
    <h1>Cuadre de Caja Chica · Individual</h1>
    ${bloqueTitular({ persona, cuadre, fechaInicio, fechaFin, data, conSignaturas: true, esConsolidado: false })}
  `;
  abrirPrint(htmlBase(`Cuadre Caja Chica — ${persona?.nombre || ''}`, cuerpo), ventana);
}

// ============================================================
// Cuadre CONSOLIDADO (todas las cajas en un solo PDF)
// ============================================================
export function imprimirCuadreConsolidado({ titulares, movimientosPorPersona, fechaInicio, fechaFin, data, ventana = null }) {
  // Página de portada con totales
  let totGral = { entregas: 0, gastos: 0, dietas: 0, saldoFinal: 0, ajustes: 0, pendientes: 0 };
  const cuadres = titulares.map(p => {
    const movs = movimientosPorPersona[p.id] || [];
    const c = calcularCuadre({ movimientos: movs, fechaInicio, fechaFin });
    totGral.entregas += c.totalEntregas;
    totGral.gastos += c.totalGastos;
    totGral.dietas += c.totalDietas;
    totGral.saldoFinal += c.saldoFinal;
    totGral.ajustes += c.totalAjustes;
    totGral.pendientes += c.totalPendientes;
    return { persona: p, cuadre: c };
  });

  const filasResumenGral = cuadres.map(({ persona, cuadre }) => `
    <tr>
      <td>${persona.nombre}</td>
      <td class="right">RD$ ${fmt(cuadre.totalEntregas)}</td>
      <td class="right">RD$ ${fmt(cuadre.totalGastos)}</td>
      <td class="right">RD$ ${fmt(cuadre.totalDietas)}</td>
      <td class="right" style="font-weight:bold;${cuadre.saldoFinal < 0 ? 'color:#CC0000;' : ''}">RD$ ${fmt(cuadre.saldoFinal)}</td>
    </tr>`).join('');

  const portada = `
    <h1>Cuadre Semanal Consolidado de Caja Chica</h1>
    <div class="meta-row">
      <div><span class="label">Período:</span> <span class="val">${fmtFecha(fechaInicio)} → ${fmtFecha(fechaFin)}</span></div>
      <div><span class="label">Cajas activas:</span> <span class="val">${titulares.length}</span></div>
    </div>

    <h2>Resumen general por titular</h2>
    <table class="movs">
      <thead><tr><th>Titular</th><th>Entregas</th><th>Gastos aprobados</th><th>Dietas</th><th>Saldo final</th></tr></thead>
      <tbody>${filasResumenGral}
        <tr style="border-top:2px solid #000;background:#f5f5f5;">
          <td><b>TOTAL CONSOLIDADO</b></td>
          <td class="right" style="color:#2a8a2a;font-weight:bold;">RD$ ${fmt(totGral.entregas)}</td>
          <td class="right" style="color:#CC0000;font-weight:bold;">RD$ ${fmt(totGral.gastos)}</td>
          <td class="right" style="color:#CC0000;font-weight:bold;">RD$ ${fmt(totGral.dietas)}</td>
          <td class="right" style="font-weight:bold;font-size:13px;">RD$ ${fmt(totGral.saldoFinal)}</td>
        </tr>
      </tbody>
    </table>
    ${totGral.pendientes > 0 ? `<p class="nota-pequena">⚠️ Total RD$ ${fmt(totGral.pendientes)} en gastos pendientes globales (no incluidos en el cuadre).</p>` : ''}

    <div class="signos">
      <div class="signo-box">Preparado por<br>(administración)<br>Fecha: __________________</div>
      <div class="signo-box">Aprobado por<br>(gerencia)<br>Fecha: __________________</div>
    </div>
    <div class="page-break"></div>
  `;

  // Cuerpo: bloque por cada titular en su propia página
  const bloques = cuadres.map((c, i) =>
    `<h1 style="page-break-before:${i === 0 ? 'auto' : 'always'};">Cuadre individual · ${c.persona.nombre}</h1>` +
    bloqueTitular({ persona: c.persona, cuadre: c.cuadre, fechaInicio, fechaFin, data, conSignaturas: true, esConsolidado: i < cuadres.length - 1 })
  ).join('');

  abrirPrint(htmlBase(`Cuadre Consolidado ${fechaInicio} → ${fechaFin}`, portada + bloques), ventana);
}

// v8.17.15: si `ventanaExistente` se pasa (abierta síncronamente desde el click,
// antes de cualquier await), la usamos. Sino se intenta abrir aquí — pero esto
// suele fallar por el bloqueador de popups si hubo awaits antes.
function abrirPrint(html, ventanaExistente = null) {
  const w = ventanaExistente || window.open('', '_blank');
  if (!w) { toast.error('Bloqueador de popups activo. Permite popups para imprimir.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
