'use client';
// Formulario PÚBLICO de solicitud de levantamiento (sin login). Postea a /api/solicitud
// (que corre con service_role). Ruta hermana de la app SPA → no arrastra el shell/login.
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { validarRNC } from '../../lib/validacionFiscal';

const MapaPicker = dynamic(() => import('../../components/solicitud/MapaPicker'), { ssr: false });

const CSS = `
:root{--paper:#FBF9F7;--ink:#1A1613;--muted:#6E665F;--line:#E8E2DB;--card:#fff;--red:#CC0000;--red-deep:#A30000;--roof:#171310;--good:#1E7A46;--field:#FCFBFA}
.sw *{box-sizing:border-box}
.sw{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;padding:22px 16px 44px;line-height:1.5;-webkit-font-smoothing:antialiased}
.sc{max-width:520px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(23,19,16,.04),0 12px 32px rgba(23,19,16,.08)}
.sh{background:#fff;padding:22px 22px 15px;position:relative;text-align:center}
.sh::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--red)}
.sh img{width:212px;max-width:66%;height:auto;display:block;margin:0 auto}
.si{padding:22px 22px 4px}
.si h1{margin:0;font-size:clamp(1.4rem,5.2vw,1.75rem);font-weight:800;letter-spacing:-.01em}
.si p{margin:7px 0 0;color:var(--muted);font-size:.95rem}
.sf{padding:16px 22px 22px;display:flex;flex-direction:column;gap:17px}
.fl{display:flex;flex-direction:column;gap:7px}
.lb{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.lb .rq{color:var(--red)}.lb .op{color:#A9A29B;font-weight:600;text-transform:none;letter-spacing:0}
.hn{font-size:.78rem;color:var(--muted);margin-top:-2px}
.sf input,.sf textarea,.sf select{width:100%;font:inherit;font-size:1rem;color:var(--ink);background:var(--field);border:1.5px solid var(--line);border-radius:11px;padding:12px 13px;transition:.15s}
.sf textarea{resize:vertical;min-height:92px}
.sf input:focus,.sf textarea:focus,.sf select:focus{outline:none;border-color:var(--red);box-shadow:0 0 0 3px rgba(204,0,0,.12)}
.fl.er input,.fl.er textarea,.fl.er .cg{border-color:var(--red)}
.em{display:none;color:var(--red);font-size:.78rem;font-weight:600}.fl.er .em{display:block}
.cg{display:flex;flex-wrap:wrap;gap:8px}
.cp{font:inherit;font-size:.9rem;font-weight:600;cursor:pointer;background:var(--field);border:1.5px solid var(--line);border-radius:999px;padding:9px 14px;color:var(--ink);transition:.14s;display:inline-flex;align-items:center;gap:7px}
.cp:hover{border-color:#D8CFC6}.cp.on{background:#FFF1F1;border-color:var(--red);color:var(--red-deep)}
.dt{width:8px;height:8px;border-radius:50%;background:#C9C1B9}.cp.on .dt{background:var(--red)}
.rr{display:flex;gap:8px;align-items:stretch}.rr input{flex:1;min-width:0}
.rb{display:flex;align-items:center;padding:0 13px;border-radius:11px;border:1.5px solid var(--line);background:var(--field);font-size:.7rem;font-weight:800;color:#A9A29B;white-space:nowrap}
.rb.on{border-color:var(--red);color:var(--red-deep);background:#FFF1F1}
.rnote{font-size:.78rem;font-weight:600;margin-top:-1px}.rnote.ok{color:var(--good)}.rnote.warn{color:#9a6a15}
.la{display:flex;gap:8px;flex-wrap:wrap}
.lbtn{font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;background:var(--field);border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;color:var(--ink);display:inline-flex;align-items:center;gap:6px;transition:.14s}
.lbtn:hover,.lbtn.on{border-color:var(--red);color:var(--red-deep)}.lbtn.on{background:#FFF1F1}
.cr{display:flex;align-items:flex-start;gap:11px;cursor:pointer;font-size:.94rem;background:var(--field);border:1.5px solid var(--line);border-radius:11px;padding:13px}
.cr input{width:19px;height:19px;accent-color:var(--red);flex:none;margin-top:1px}
.cr small{display:block;color:var(--muted);font-size:.8rem;margin-top:2px}
.sub{display:flex;flex-direction:column;gap:15px;padding:16px;border:1.5px solid var(--line);border-left:3px solid var(--red);border-radius:12px;background:#FDFBFA}
.subh{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--red-deep)}
.drop{border:1.5px dashed #D8CFC6;border-radius:12px;background:var(--field);padding:16px;text-align:center;cursor:pointer;color:var(--muted)}
.drop:hover{border-color:var(--red);color:var(--ink)}.drop b{color:var(--ink)}.drop small{display:block;font-size:.76rem;margin-top:3px}
.th{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.th img{width:60px;height:60px;object-fit:cover;border-radius:9px;border:1px solid var(--line)}
.snd{margin-top:4px;font:inherit;font-size:1.02rem;font-weight:800;color:#fff;background:var(--red);border:none;border-radius:12px;padding:15px;cursor:pointer;transition:.15s;box-shadow:0 8px 18px rgba(204,0,0,.22)}
.snd:hover{background:var(--red-deep)}.snd:disabled{opacity:.6;cursor:default}
.ft{padding:15px 22px 20px;border-top:1px solid var(--line);color:var(--muted);font-size:.76rem;text-align:center;line-height:1.6}.ft b{color:var(--ink)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.dn{padding:32px 24px 30px;text-align:center}
.ck{width:66px;height:66px;border-radius:50%;background:#EAF6EE;color:var(--good);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:32px}
.dn h2{margin:0 0 6px;font-size:1.5rem;font-weight:800}.dn p{margin:0 auto;color:var(--muted);max-width:34ch}
.fo{margin:18px auto 4px;display:inline-block;background:var(--roof);color:#fff;border-radius:11px;padding:11px 18px;font-weight:800;letter-spacing:.04em}
.fo small{display:block;font-weight:500;letter-spacing:.14em;font-size:.6rem;text-transform:uppercase;color:#B9B2AB;margin-bottom:3px}
`;

const SERV = ['Filtración / gotera', 'Mantenimiento', 'Nueva impermeabilización', 'Inspección / diagnóstico', 'Otro'];
const INMUEBLE = ['Casa', 'Edificio / torre', 'Comercial / plaza', 'Industrial / nave', 'Institución'];
const AREA = ['No sé', '< 100 m²', '100–500 m²', '500–1,000 m²', '> 1,000 m²'];
const ACCESO = ['Acceso directo (azotea)', 'Por escalera del edificio', 'Hay que llevar escalera / andamio', 'No estoy seguro'];
const URG = ['Puedo esperar', 'Esta semana', 'Urgente (filtración activa)'];
const PREF = ['Mañana', 'Tarde', 'Fin de semana', 'Cualquier momento'];
const COMO = ['Me lo recomendó un conocido', 'Google / búsqueda web', 'Instagram / Facebook', 'Ya soy cliente de Super Techos', 'Valla / rótulo / vehículo', 'Otro'];

function comprimir(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => res(null); img.src = r.result;
    };
    r.onerror = () => res(null); r.readAsDataURL(file);
  });
}

export default function SolicitudPage() {
  const [f, setF] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e && e.target ? e.target.value : e }));
  const [otro, setOtro] = useState(false);
  const [pos, setPos] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [fotos, setFotos] = useState([]);
  const [err, setErr] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [done, setDone] = useState(null); // { ticket }
  const [apiErr, setApiErr] = useState('');

  const rncV = validarRNC(f.rnc || '');
  const badge = rncV.tipo === 'cedula' ? 'CÉDULA' : rncV.tipo === 'rnc' ? 'RNC' : '—';

  const Chips = ({ opts, k }) => (
    <div className="cg">
      {opts.map((o) => (
        <button type="button" key={o} className={'cp' + (f[k] === o ? ' on' : '')}
          onClick={() => setF((p) => ({ ...p, [k]: o }))}>
          <span className="dt" />{o}
        </button>
      ))}
    </div>
  );

  async function addFotos(e) {
    const files = [...e.target.files].slice(0, 8 - fotos.length);
    const nuevas = [];
    for (const file of files) { const d = await comprimir(file); if (d) nuevas.push(d); }
    setFotos((p) => [...p, ...nuevas].slice(0, 8));
  }

  function usarGPS() {
    if (!navigator.geolocation) return alert('Tu dispositivo no permite ubicación por GPS. Escribe la dirección o márcala en el mapa.');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos([p.coords.latitude, p.coords.longitude]); setShowMap(true); },
      () => alert('No pudimos detectar tu ubicación. Escribe la dirección o márcala en el mapa.'),
      { timeout: 8000 }
    );
  }

  async function enviar(e) {
    e.preventDefault();
    const er = {};
    if (!rncV.ok) er.rnc = 1;
    if (!(f.cliente_nombre || '').trim()) er.cliente_nombre = 1;
    if (!(f.contacto_telefono || '').trim()) er.contacto_telefono = 1;
    if (!(f.direccion || '').trim() && !pos) er.ubicacion = 1;
    if (!f.tipo_servicio) er.tipo_servicio = 1;
    if (!(f.descripcion || '').trim()) er.descripcion = 1;
    if (otro) { if (!(f.recibe_nombre || '').trim()) er.recibe_nombre = 1; if (!(f.recibe_telefono || '').trim()) er.recibe_telefono = 1; }
    setErr(er);
    if (Object.keys(er).length) { const el = document.querySelector('.fl.er'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

    setEnviando(true); setApiErr('');
    const payload = {
      rnc: f.rnc, cliente_nombre: f.cliente_nombre, contacto_telefono: f.contacto_telefono,
      contacto_email: f.contacto_email, direccion: f.direccion, punto_referencia: f.punto_referencia,
      locacion_nombre: f.locacion_nombre, lat: pos ? pos[0] : null, lng: pos ? pos[1] : null,
      recibe_nombre: otro ? f.recibe_nombre : '', recibe_telefono: otro ? f.recibe_telefono : '',
      recibe_cargo: otro ? f.recibe_cargo : '', tipo_servicio: f.tipo_servicio, tipo_inmueble: f.tipo_inmueble,
      area_aprox: f.area_aprox, acceso_techo: f.acceso_techo, descripcion: f.descripcion,
      urgencia: f.urgencia, preferencia_visita: f.preferencia_visita, como_conocio: f.como_conocio,
      referencia_previa: f.referencia_previa, consentimiento: !!f.consentimiento, fotos,
      website: f.website || '',
    };
    try {
      const r = await fetch('/api/solicitud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (r.ok && j.ok) setDone({ ticket: j.ticket });
      else setApiErr(j.error || 'No pudimos enviar la solicitud. Intenta de nuevo.');
    } catch { setApiErr('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
    setEnviando(false);
  }

  return (
    <div className="sw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sc">
        <div className="sh"><img src="/logo-supertechos.png" alt="Super Techos — Impermeabilizantes y Aislantes" /></div>

        {done ? (
          <div className="dn">
            <div className="ck" aria-hidden="true">✓</div>
            <h2>¡Solicitud recibida!</h2>
            <p>Gracias. Un asesor de Super Techos te contactará por teléfono o WhatsApp en menos de <b>24 horas hábiles</b> para coordinar la visita.</p>
            {done.ticket && <div className="fo"><small>Tu número de solicitud</small>{done.ticket}</div>}
          </div>
        ) : (
          <>
            <div className="si">
              <h1>Solicitar levantamiento</h1>
              <p>Cuéntanos qué pasa con el techo y te contactamos para agendar la visita. Toma menos de 1 minuto.</p>
            </div>
            <form className="sf" onSubmit={enviar} noValidate>
              {/* honeypot */}
              <input className="hp" tabIndex={-1} autoComplete="off" value={f.website || ''} onChange={set('website')} placeholder="No llenar" aria-hidden="true" />

              <div className={'fl' + (err.rnc ? ' er' : '')}>
                <label className="lb" htmlFor="rnc">RNC o Cédula <span className="rq">*</span></label>
                <div className="rr">
                  <input id="rnc" inputMode="numeric" value={f.rnc || ''} onChange={set('rnc')} placeholder="Ej. 130774331 (RNC) o 001-0000000-0 (cédula)" />
                  <div className={'rb' + (rncV.ok ? ' on' : '')}>{badge}</div>
                </div>
                {f.rnc && rncV.ok && <div className={'rnote ' + (rncV.digito === 'ok' ? 'ok' : 'warn')}>{rncV.digito === 'ok' ? '✓ ' + (rncV.tipo === 'cedula' ? 'Cédula' : 'RNC') + ' válido' : rncV.mensaje}</div>}
                <div className="hn">Con el RNC o cédula asociamos tu solicitud a tu ficha de cliente.</div>
                <div className="em">Escribe un RNC (9 díg.) o cédula (11 díg.) válido.</div>
              </div>

              <div className={'fl' + (err.cliente_nombre ? ' er' : '')}>
                <label className="lb" htmlFor="nom">Nombre o empresa <span className="rq">*</span></label>
                <input id="nom" value={f.cliente_nombre || ''} onChange={set('cliente_nombre')} placeholder="Ej. Constructora Pérez / Juan Pérez" />
                <div className="em">Escribe tu nombre o el de la empresa.</div>
              </div>

              <div className={'fl' + (err.contacto_telefono ? ' er' : '')}>
                <label className="lb" htmlFor="tel">Teléfono / WhatsApp <span className="rq">*</span></label>
                <input id="tel" type="tel" value={f.contacto_telefono || ''} onChange={set('contacto_telefono')} placeholder="809-000-0000" />
                <div className="em">Necesitamos un teléfono para contactarte.</div>
              </div>

              <div className="fl">
                <label className="lb" htmlFor="mail">Correo electrónico</label>
                <input id="mail" type="email" value={f.contacto_email || ''} onChange={set('contacto_email')} placeholder="tucorreo@ejemplo.com" />
              </div>

              <div className={'fl' + (err.ubicacion ? ' er' : '')}>
                <label className="lb" htmlFor="dir">Ubicación de la obra <span className="rq">*</span></label>
                <input id="dir" value={f.direccion || ''} onChange={set('direccion')} placeholder="Calle, sector, ciudad — o pega un link de Google Maps" />
                <div className="la">
                  <button type="button" className={'lbtn' + (pos ? ' on' : '')} onClick={usarGPS}>📍 {pos ? 'Ubicación detectada' : 'Usar mi ubicación actual'}</button>
                  <button type="button" className={'lbtn' + (showMap ? ' on' : '')} onClick={() => setShowMap((v) => !v)}>🗺️ Elegir en el mapa</button>
                </div>
                {showMap && <MapaPicker pos={pos} onPick={(la, ln) => setPos([la, ln])} />}
                {pos && <div className="hn">📍 Punto marcado: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}</div>}
                <div className="hn">Escribe la dirección, detéctala por GPS o márcala en el mapa.</div>
                <div className="em">Dinos dónde queda la obra.</div>
              </div>

              <div className="fl">
                <label className="lb" htmlFor="ref">Punto de referencia <span className="op">(opcional)</span></label>
                <input id="ref" value={f.punto_referencia || ''} onChange={set('punto_referencia')} placeholder="Ej. Frente a la Farmacia Carol · portón negro" />
                <div className="hn">Algo cercano y visible que ayude a nuestro técnico a ubicar la entrada.</div>
              </div>

              <div className="fl">
                <label className="lb" htmlFor="loc">Nombre de esta locación <span className="op">(opcional)</span></label>
                <input id="loc" value={f.locacion_nombre || ''} onChange={set('locacion_nombre')} placeholder="Ej. Torre Norte · Sucursal Naco · Local 3" />
                <div className="hn">Si tu empresa tiene varias obras o sucursales, ponle un nombre para identificar esta.</div>
              </div>

              <div className="fl">
                <label className="cr">
                  <input type="checkbox" checked={otro} onChange={(e) => setOtro(e.target.checked)} />
                  <span>Otra persona recibirá a nuestro equipo en la obra<small>Actívalo si tú no vas a estar en la visita.</small></span>
                </label>
              </div>
              {otro && (
                <div className="sub">
                  <div className="subh">Datos de quien recibe en la obra</div>
                  <div className={'fl' + (err.recibe_nombre ? ' er' : '')}>
                    <label className="lb">Nombre de quien recibe <span className="rq">*</span></label>
                    <input value={f.recibe_nombre || ''} onChange={set('recibe_nombre')} placeholder="Ej. María, encargada del edificio" />
                    <div className="em">Escribe el nombre de quien recibe.</div>
                  </div>
                  <div className={'fl' + (err.recibe_telefono ? ' er' : '')}>
                    <label className="lb">Teléfono de quien recibe <span className="rq">*</span></label>
                    <input type="tel" value={f.recibe_telefono || ''} onChange={set('recibe_telefono')} placeholder="809-000-0000" />
                    <div className="em">Necesitamos su teléfono para coordinar.</div>
                  </div>
                  <div className="fl">
                    <label className="lb">Cargo / relación <span className="op">(opcional)</span></label>
                    <input value={f.recibe_cargo || ''} onChange={set('recibe_cargo')} placeholder="Ej. Encargado, conserje, administrador…" />
                  </div>
                </div>
              )}

              <div className={'fl' + (err.tipo_servicio ? ' er' : '')}>
                <label className="lb">Tipo de servicio <span className="rq">*</span></label>
                <Chips opts={SERV} k="tipo_servicio" />
                <div className="em">Elige el tipo de servicio.</div>
              </div>

              <div className="fl"><label className="lb">Tipo de inmueble <span className="op">(opcional)</span></label><Chips opts={INMUEBLE} k="tipo_inmueble" /></div>
              <div className="fl"><label className="lb">Área aproximada del techo <span className="op">(opcional)</span></label><Chips opts={AREA} k="area_aprox" /></div>
              <div className="fl"><label className="lb">¿Hay acceso al techo? <span className="op">(opcional)</span></label><Chips opts={ACCESO} k="acceso_techo" /><div className="hn">Nos ayuda a llevar el equipo correcto (escalera, andamio).</div></div>

              <div className={'fl' + (err.descripcion ? ' er' : '')}>
                <label className="lb" htmlFor="desc">¿Qué está pasando? <span className="rq">*</span></label>
                <textarea id="desc" value={f.descripcion || ''} onChange={set('descripcion')} placeholder="Ej. Filtración en el techo del 3er piso cada vez que llueve, mancha de humedad en dos habitaciones…" />
                <div className="em">Cuéntanos un poco del problema.</div>
              </div>

              <div className="fl"><label className="lb">¿Qué tan urgente es? <span className="op">(opcional)</span></label><Chips opts={URG} k="urgencia" /></div>
              <div className="fl"><label className="lb">Preferencia para la visita <span className="op">(opcional)</span></label><Chips opts={PREF} k="preferencia_visita" /></div>

              <div className="fl">
                <label className="lb" htmlFor="rp">¿Ya tienes cotización con nosotros? <span className="op">(opcional)</span></label>
                <input id="rp" value={f.referencia_previa || ''} onChange={set('referencia_previa')} placeholder="Ej. ST-C5459 (número de cotización o ticket)" />
              </div>

              <div className="fl">
                <label className="lb" htmlFor="cm">¿Cómo nos conociste? <span className="op">(opcional)</span></label>
                <select id="cm" value={f.como_conocio || ''} onChange={set('como_conocio')}>
                  <option value="">Selecciona…</option>
                  {COMO.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>

              <div className="fl">
                <label className="lb">Fotos del área <span className="op">(opcional)</span></label>
                <label className="drop" htmlFor="fotos"><b>{fotos.length ? `${fotos.length} foto${fotos.length !== 1 ? 's' : ''} · toca para más` : 'Toca para agregar fotos'}</b><small>Una foto del techo o la filtración ayuda a diagnosticar más rápido.</small></label>
                <input id="fotos" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={addFotos} />
                {fotos.length > 0 && <div className="th">{fotos.map((d, i) => <img key={i} src={d} alt="" />)}</div>}
              </div>

              <label className="cr">
                <input type="checkbox" checked={!!f.consentimiento} onChange={(e) => setF((p) => ({ ...p, consentimiento: e.target.checked }))} />
                <span>Acepto que Super Techos me contacte por teléfono o WhatsApp sobre esta solicitud.</span>
              </label>

              {apiErr && <div style={{ color: 'var(--red)', fontWeight: 600, fontSize: '.9rem' }}>{apiErr}</div>}
              <button type="submit" className="snd" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
            </form>
            <div className="ft"><b>LH Super Techos, SRL</b> · RNC 130-77433-1 · Tel. 809-535-9293<br />Enviar esta solicitud no tiene ningún costo ni compromiso.</div>
          </>
        )}
      </div>
    </div>
  );
}
