// v8.52.2: arma el correo diario de la Torre de Control (asunto + HTML).
// Puro (sin DB) — lo usa el cron y el generador de vista previa, para que se vean igual.
import { formatHoras } from './slaLevantamiento.js';

const C = { rojo: '#dc2626', amarillo: '#d97706', verde: '#16a34a', azul: '#0369a1', morado: '#7c3aed', marca: '#D71920', tinta: '#18181b', gris: '#71717a' };
const esc = (x) => String(x == null ? '' : x).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const urgColor = (u) => /urgente|filtraci/i.test(u || '') ? C.rojo : /semana/i.test(u || '') ? C.amarillo : C.gris;
const fmtFecha = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

export function construirCorreoTorre({ ayer, activos, atascados, enSla, cuello, nuevos, movidos, enviados, nombreProy, totalMes, totalAnio }) {
  const td = (x, extra = '') => `<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;${extra}">${x}</td>`;
  const chip = (t, col) => `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;color:#fff;background:${col}">${esc(t)}</span>`;
  const infoProy = (s) => s ? [s.locacion_nombre, s.tipo_servicio].filter(Boolean).map(esc).join(' · ') : '';
  const statCard = (n, label, col) => `<td width="25%" style="padding:4px"><div style="background:#fff;border:1px solid #ececec;border-radius:10px;padding:10px 6px;text-align:center"><div style="font-size:26px;font-weight:800;color:${col};line-height:1">${n}</div><div style="font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:${C.gris};font-weight:700;margin-top:3px">${label}</div></div></td>`;

  const filasAtasc = atascados.map(({ it, sla }) => `
    <tr>
      ${td(`<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C[sla.semaforo] || C.verde};margin-right:6px"></span><b>${esc(it.client_name || 'Sin cliente')}</b>${infoProy(it.sol) ? `<div style="color:${C.gris};font-size:11px;margin:2px 0 0 15px">${infoProy(it.sol)}${it.sol?.ticket ? ` · ${esc(it.sol.ticket)}` : ''}</div>` : ''}`)}
      ${td(esc(sla.etapa))}
      ${td(`<b style="color:${C[sla.semaforo] || C.tinta}">${formatHoras(sla.horasEnEtapa)}</b>${sla.slaEtapa != null ? ` <span style="color:#bbb">/ ${formatHoras(sla.slaEtapa)}</span>` : ''}`)}
      ${td(it.asignado_a_nombre ? esc(it.asignado_a_nombre) : `<span style="color:${C.amarillo}">Sin asignar</span>`)}
      ${td([sla.esComplejo ? '🔧' : '', sla.esperandoCliente ? '🔵' : ''].filter(Boolean).join(' ') || '', 'text-align:center')}
    </tr>`).join('');

  const seccionAtasc = atascados.length === 0
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center;color:${C.verde};font-weight:700;font-size:14px">✅ Nada atascado — todos los levantamientos activos dentro de SLA.</div>`
    : `<h3 style="color:${C.marca};font-size:15px;margin:20px 0 8px">🔴 Atascados (${atascados.length})</h3>
       ${cuello ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:10px">🔻 <b>Cuello de botella:</b> ${cuello[1]} en <b>${esc(cuello[0])}</b></div>` : ''}
       <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff;border:1px solid #ececec;border-radius:10px;overflow:hidden">
         <tr style="background:#fafafa">
           <th align="left" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris}">Cliente / proyecto</th>
           <th align="left" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris}">Etapa</th>
           <th align="left" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris}">En etapa / SLA</th>
           <th align="left" style="padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris}">Responsable</th>
           <th style="padding:8px 10px"></th>
         </tr>${filasAtasc}
       </table>`;

  const cardNuevo = (s) => `
    <div style="background:#fff;border:1px solid #ececec;border-left:3px solid ${C.azul};border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:14px;font-weight:700;color:${C.tinta}">${esc(s.cliente_nombre || 'Sin nombre')} ${s.urgencia ? chip(s.urgencia, urgColor(s.urgencia)) : ''}</div>
      <div style="font-size:12px;color:${C.gris};margin-top:3px">${[s.tipo_servicio, s.tipo_inmueble].filter(Boolean).map(esc).join(' · ')}${s.area_aprox ? ` · ~${esc(s.area_aprox)}` : ''}</div>
      <div style="font-size:12px;color:#444;margin-top:4px">📍 ${esc(s.locacion_nombre || s.direccion || s.punto_referencia || 'sin dirección')}${s.contacto_telefono ? ` &nbsp;·&nbsp; 📞 ${esc(s.contacto_telefono)}` : ''}</div>
      ${s.ticket ? `<div style="font-size:10px;color:#aaa;margin-top:4px">${esc(s.ticket)}</div>` : ''}
    </div>`;
  const seccionNuevos = `
    <h3 style="color:${C.azul};font-size:15px;margin:22px 0 8px">🆕 Tickets nuevos de ayer (${nuevos.length})</h3>
    ${nuevos.length ? nuevos.map(cardNuevo).join('') : `<div style="color:${C.gris};font-size:13px">Sin tickets nuevos ayer.</div>`}`;

  const li = (t) => `<li style="margin:3px 0">${t}</li>`;
  const seccionMov = `
    <table width="100%" cellspacing="0" cellpadding="0"><tr>
      <td width="50%" valign="top" style="padding-right:10px">
        <h4 style="margin:18px 0 6px;color:${C.morado};font-size:13px">↔ Movidos ayer (${movidos.length})</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#444">${movidos.slice(0, 12).map((m) => li(`${esc(nombreProy(m.project_id))}: ${esc(m.etapa_anterior || '—')} → <b>${esc(m.etapa_nueva)}</b>`)).join('') || '<li style="color:#aaa">—</li>'}</ul>
      </td>
      <td width="50%" valign="top" style="padding-left:10px">
        <h4 style="margin:18px 0 6px;color:${C.verde};font-size:13px">📤 Cotizaciones enviadas ayer (${enviados.length})</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#444">${enviados.slice(0, 12).map((p) => li(esc(p.client_name || 'Sin cliente'))).join('') || '<li style="color:#aaa">—</li>'}</ul>
      </td>
    </tr></table>`;

  const html = `
  <div style="background:#f4f4f5;padding:20px 0;font-family:'Segoe UI',Arial,sans-serif">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="background:${C.marca};padding:18px 22px">
        <div style="color:#fff;font-size:20px;font-weight:800">🗼 Torre de Control · Levantamientos</div>
        <div style="color:#ffd7da;font-size:12px;margin-top:2px">Resumen del ${fmtFecha(ayer)} · meta 72h del formulario a la cotización</div>
      </div>
      <div style="padding:16px 22px">
        <table width="100%" cellspacing="0" cellpadding="0"><tr>
          ${statCard(activos, 'Activos', C.tinta)}
          ${statCard(atascados.length, 'Atascados', C.rojo)}
          ${statCard(enSla, 'En SLA', C.verde)}
          ${statCard(enviados.length, 'Enviadas ayer', C.azul)}
        </tr></table>
        ${seccionAtasc}
        ${seccionNuevos}
        ${seccionMov}
        <div style="margin-top:22px;border-top:2px solid #f0f0f0;padding-top:12px">
          <table width="100%" cellspacing="0" cellpadding="0"><tr>
            <td width="50%" style="padding:4px"><div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:800;color:${C.morado}">${totalMes}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris};font-weight:700">Tickets este mes</div></div></td>
            <td width="50%" style="padding:4px"><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;text-align:center"><div style="font-size:24px;font-weight:800;color:${C.azul}">${totalAnio}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${C.gris};font-weight:700">Tickets este año</div></div></td>
          </tr></table>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:14px;text-align:center">🟡 pasó el SLA de la etapa · 🔴 el doble o más · 🔵 en pausa por fecha del cliente · 🔧 en consulta técnica<br>ERP Super Techos</div>
      </div>
    </div>
  </div>`;

  const asunto = atascados.length
    ? `🗼 Torre de Control — ${atascados.length} atascado${atascados.length !== 1 ? 's' : ''} · ${nuevos.length} nuevos · ${enviados.length} enviados`
    : `🗼 Torre de Control — ✅ al día · ${nuevos.length} nuevos · ${enviados.length} enviados`;
  return { asunto, html };
}
