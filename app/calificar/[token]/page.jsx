'use client';
// Página PÚBLICA de calificación del cliente (CSAT). Sin login. Postea a /api/calificar/[token].
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const CSS = `
:root{--paper:#FBF9F7;--ink:#1A1613;--muted:#6E665F;--line:#E8E2DB;--card:#fff;--red:#CC0000;--good:#1E7A46}
.cw *{box-sizing:border-box}
.cw{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;padding:22px 16px 44px;line-height:1.5}
.cc{max-width:460px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(23,19,16,.08)}
.ch{background:#fff;padding:22px 22px 15px;text-align:center;position:relative}
.ch::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--red)}
.ch img{width:200px;max-width:62%;height:auto;margin:0 auto;display:block}
.ci{padding:22px 22px 6px;text-align:center}
.ci h1{margin:0;font-size:1.4rem;font-weight:800;letter-spacing:-.01em}
.ci p{margin:8px 0 0;color:var(--muted);font-size:.95rem}
.stars{display:flex;justify-content:center;gap:8px;padding:20px 12px 6px}
.star{font-size:2.5rem;cursor:pointer;line-height:1;color:#E0DAD2;transition:transform .1s,color .1s;user-select:none;background:none;border:none;padding:0}
.star.on{color:#F5A623}
.star:active{transform:scale(.9)}
.lbl{text-align:center;color:var(--muted);font-size:.85rem;min-height:1.2em;font-weight:600}
.cf{padding:6px 22px 22px;display:flex;flex-direction:column;gap:14px}
.cf textarea{width:100%;font:inherit;font-size:1rem;background:#FCFBFA;border:1.5px solid var(--line);border-radius:11px;padding:12px 13px;resize:vertical;min-height:80px}
.cf textarea:focus{outline:none;border-color:var(--red);box-shadow:0 0 0 3px rgba(204,0,0,.12)}
.btn{width:100%;font:inherit;font-weight:800;font-size:1rem;color:#fff;background:var(--red);border:none;border-radius:12px;padding:14px;cursor:pointer}
.btn:disabled{opacity:.5;cursor:not-allowed}
.done{padding:30px 22px 34px;text-align:center}
.done .big{font-size:3rem}
.done h2{margin:10px 0 4px;font-size:1.3rem;font-weight:800}
.done p{color:var(--muted);margin:0}
.foot{text-align:center;color:#A9A29B;font-size:.75rem;padding:0 22px 18px}
`;

const ETIQUETAS = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];

export default function CalificarPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cal, setCal] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/calificar/${token}`);
        const j = await r.json();
        if (j?.ok) { setCtx(j); if (j.yaRespondido) setListo(true); }
        else setCtx({ error: true });
      } catch { setCtx({ error: true }); }
      setCargando(false);
    })();
  }, [token]);

  const enviar = async () => {
    if (!cal || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/calificar/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calificacion: cal, comentario }),
      });
      const j = await r.json();
      if (j?.ok) setListo(true);
      else alert('No se pudo enviar. Intenta de nuevo.');
    } catch { alert('No se pudo enviar. Revisa tu conexión.'); }
    setEnviando(false);
  };

  const marca = <div className="ch"><img src="/logo-supertechos.png" alt="Super Techos" /></div>;

  return (
    <div className="cw">
      <style>{CSS}</style>
      <div className="cc">
        {marca}
        {cargando ? (
          <div className="ci"><p>Cargando…</p></div>
        ) : ctx?.error ? (
          <div className="done"><div className="big">🔗</div><h2>Enlace no válido</h2><p>Este enlace de calificación no existe o expiró.</p></div>
        ) : listo ? (
          <div className="done"><div className="big">🙌</div><h2>¡Gracias por tu opinión!</h2><p>Nos ayuda a seguir mejorando para ti.</p></div>
        ) : (
          <>
            <div className="ci">
              <h1>¿Cómo lo hicimos?</h1>
              <p>{ctx?.clienteNombre ? `${ctx.clienteNombre}, cuéntanos` : 'Cuéntanos'} cómo fue tu experiencia{ctx?.contexto ? ` con ${ctx.contexto}` : ' con Super Techos'}.</p>
            </div>
            <div className="stars" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`star ${(hover || cal) >= n ? 'on' : ''}`}
                  onMouseEnter={() => setHover(n)} onClick={() => setCal(n)} aria-label={`${n} estrellas`}>★</button>
              ))}
            </div>
            <div className="lbl">{ETIQUETAS[hover || cal] || 'Toca una estrella'}</div>
            <div className="cf">
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="¿Algo que quieras contarnos? (opcional)" />
              <button className="btn" disabled={!cal || enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar calificación'}</button>
            </div>
          </>
        )}
        <div className="foot">Super Techos · Impermeabilizantes y Aislantes</div>
      </div>
    </div>
  );
}
