// v8.51.0: PROTOCOLO DE AVERÍAS imprimible para la GUANTERA de cada vehículo.
// Una hoja por lado con los protocolos por síntoma. window.print() como los
// demás imprimibles del ERP.

import { SINTOMAS_AVERIA } from '../../lib/protocolosAverias';

export function imprimirProtocoloGuantera() {
  const secciones = SINTOMAS_AVERIA.filter(s => s.k !== 'otro').map(s => `
    <section>
      <h2>${s.icon} ${s.label}</h2>
      <div class="cols">
        <div>
          <h3>✅ Haz esto, en orden</h3>
          <ol>${s.queHacer.map(x => `<li>${x}</li>`).join('')}</ol>
        </div>
        <div>
          ${s.queNoHacer.length ? `<h3 class="no">⛔ NO hagas esto</h3><ul>${s.queNoHacer.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
          ${s.grua ? `<p class="grua"><b>🚛 Grúa si:</b> ${s.grua}</p>` : ''}
        </div>
      </div>
    </section>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Protocolo de averías — Super Techos</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; padding: 10mm 12mm; color: #111; font-size: 10.5px; line-height: 1.35; }
    header { border-bottom: 3px solid #D71920; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: baseline; }
    header h1 { font-size: 15px; margin: 0; }
    header .sub { font-size: 9px; color: #666; }
    section { border: 1px solid #ddd; border-radius: 6px; padding: 7px 9px; margin-bottom: 7px; page-break-inside: avoid; }
    h2 { font-size: 12px; margin: 0 0 4px; color: #D71920; }
    h3 { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 3px; color: #1a7a3a; }
    h3.no { color: #b91c1c; }
    .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; }
    ol, ul { margin: 0; padding-left: 15px; }
    li { margin-bottom: 2px; }
    .grua { background: #fff7e0; border: 1px solid #e0c268; border-radius: 4px; padding: 4px 6px; margin: 4px 0 0; }
    footer { margin-top: 6px; font-size: 9px; color: #666; border-top: 1px solid #ddd; padding-top: 4px; }
    @media print { body { padding: 6mm 8mm; } }
  </style></head><body>
  <header>
    <h1>🚨 Protocolo de averías — qué hacer si el vehículo falla</h1>
    <div class="sub">Super Techos · guantera — reporta SIEMPRE por el ERP: Mi vehículo → 🚨 Se dañó</div>
  </header>
  ${secciones}
  <footer>Regla de oro: ante la duda, el vehículo NO se mueve y llamas a la oficina. Un motor fundido cuesta 30 veces más que una grúa. · Oficina: 809-535-9293</footer>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana de impresión.'); return; }
  w.document.write(html);
  w.document.close();
}
