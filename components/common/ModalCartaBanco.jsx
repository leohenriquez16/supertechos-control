'use client';

// v8.57.0 — CARTA DE TRABAJO PARA EL BANCO, desde la ficha del colaborador.
// Nace del plazo de oct-2026 para que cada quien cobre en su propia cuenta: el banco
// pide una carta de la empresa para abrirla, y hasta ahora había que redactarla a mano.
// Yamel (o cualquier admin) la genera desde el perfil, elige el banco y la descarga.
// Mismo patrón de PDF que ModalCartaGarantia: html2canvas + jsPDF desde CDN, Letter.

import React, { useRef, useState } from 'react';
import { X, FileDown, Loader2, Landmark } from 'lucide-react';

const cargarScriptCDN = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
  document.head.appendChild(s);
});

const EMPRESAS = {
  super_techos: {
    razonSocial: 'LH SUPER TECHOS, SRL', rnc: '130-77433-1',
    logo: '/logo-super-techos.png', logoMaxHeight: 56, accent: '#CC0000',
  },
  prouco: {
    razonSocial: 'PROUCO GROUP DOMINICANA, SRL', rnc: '1-31-51554-1',
    logo: '/logo-prouco.png', logoMaxHeight: 48, accent: '#65A30D',
  },
};
const DIRECCION = 'C/ Arena #1, Urb. Mar Azul, Km 7½ Carretera Sánchez, Santo Domingo, R.D.';
const TEL = '809-535-9293';

const BANCOS = ['Banco Popular Dominicano', 'Banreservas', 'Banco BHD', 'Asociación Popular de Ahorros y Préstamos (APAP)', 'Scotiabank', 'Banco Santa Cruz', 'Banco Caribe'];

const hoyLargo = () => new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = (f) => { if (!f) return null; try { return new Date(f + 'T12:00:00').toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return null; } };

export default function ModalCartaBanco({ persona, firmante, onCerrar }) {
  const cartaRef = useRef(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [bancoDestino, setBancoDestino] = useState(BANCOS[0]);
  const [empresaId, setEmpresaId] = useState('super_techos');
  const [incluirSueldo, setIncluirSueldo] = useState(false);
  const empresa = EMPRESAS[empresaId];

  const puesto = persona?.puesto || (Array.isArray(persona?.roles) && persona.roles.includes('maestro') ? 'Maestro de obra' : 'Colaborador');
  const ingreso = fechaCorta(persona?.fechaIngreso);
  const doc = persona?.cedulaNumero || '';
  const tipoDoc = persona?.tipoDocumento === 'pasaporte' ? 'pasaporte' : 'cédula de identidad y electoral';

  const descargarPDF = async () => {
    setError(''); setGenerando(true);
    try {
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await cargarScriptCDN('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf;
      if (!html2canvas || !jsPDF) throw new Error('Librerías PDF no disponibles');
      const el = cartaRef.current;
      const ANCHO = 816; // 8.5" a 96dpi
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, width: ANCHO, windowWidth: ANCHO, windowHeight: el.scrollHeight });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h);
      pdf.save(`Carta banco - ${persona?.nombre || 'colaborador'}.pdf`);
    } catch (e) { setError(e.message || 'No se pudo generar el PDF'); }
    setGenerando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-3 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-card w-full max-w-3xl my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><Landmark className="w-4 h-4 text-red-500" /> Carta para el banco</h2>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 grid gap-3 sm:grid-cols-3 border-b border-zinc-800">
          <label className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">
            Banco
            <select value={bancoDestino} onChange={e => setBancoDestino(e.target.value)} className="mt-1 w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-2 text-white text-xs normal-case tracking-normal font-normal">
              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold">
            Empresa
            <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="mt-1 w-full bg-zinc-950 border-2 border-zinc-800 focus:border-red-600 outline-none px-2 py-2 text-white text-xs normal-case tracking-normal font-normal">
              <option value="super_techos">LH Super Techos</option>
              <option value="prouco">Prouco Group</option>
            </select>
          </label>
          <label className="text-[11px] uppercase tracking-widest text-zinc-400 font-bold flex items-end gap-2 pb-2">
            <input type="checkbox" checked={incluirSueldo} onChange={e => setIncluirSueldo(e.target.checked)} className="w-4 h-4 accent-red-600" />
            <span className="normal-case tracking-normal">Incluir ingreso promedio</span>
          </label>
        </div>

        {/* La carta */}
        <div className="p-3 bg-zinc-950 overflow-x-auto">
          <div ref={cartaRef} style={{ width: 816, background: '#fff', color: '#111', padding: '48px 64px', fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.65 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
              <img src={empresa.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: empresa.logoMaxHeight, display: 'block' }} />
              <div style={{ textAlign: 'right', fontSize: 10.5, color: '#555', fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: '#111' }}>{empresa.razonSocial}</div>
                <div>RNC {empresa.rnc}</div>
                <div>{DIRECCION}</div>
                <div>Tel. {TEL}</div>
              </div>
            </div>
            <div style={{ height: 3, background: empresa.accent, margin: '14px 0 26px' }} />

            <div style={{ textAlign: 'right', marginBottom: 22 }}>Santo Domingo, {hoyLargo()}</div>

            <div style={{ marginBottom: 20 }}>
              <div><strong>Señores</strong></div>
              <div><strong>{bancoDestino}</strong></div>
              <div>Ciudad</div>
            </div>

            <div style={{ marginBottom: 18 }}><strong>Ref.:</strong> Certificación laboral para apertura de cuenta</div>

            <p style={{ margin: '0 0 14px' }}>Distinguidos señores:</p>

            <p style={{ margin: '0 0 14px', textAlign: 'justify' }}>
              Por medio de la presente certificamos que el señor(a) <strong>{persona?.nombre || '—'}</strong>
              {doc ? <>, portador(a) de la {tipoDoc} No. <strong>{doc}</strong>,</> : ','} labora con nosotros
              {ingreso ? <> desde el <strong>{ingreso}</strong></> : null} desempeñando funciones de <strong>{puesto}</strong>.
            </p>

            <p style={{ margin: '0 0 14px', textAlign: 'justify' }}>
              Sus honorarios se pagan de forma quincenal{incluirSueldo && persona?.ingresoPromedio ? <> y promedian <strong>RD${Number(persona.ingresoPromedio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong> por quincena</> : null}.
              La presente se expide a solicitud del interesado, con el fin de que pueda aperturar una cuenta bancaria a su nombre
              en esa institución, para recibir sus pagos por transferencia.
            </p>

            <p style={{ margin: '0 0 30px', textAlign: 'justify' }}>
              Para cualquier verificación, pueden comunicarse con nosotros al teléfono {TEL}.
            </p>

            <p style={{ margin: '0 0 44px' }}>Atentamente,</p>

            <div style={{ borderTop: '1px solid #111', width: 280, paddingTop: 6 }}>
              <div style={{ fontWeight: 700 }}>{firmante?.nombre || 'Yamel Harris'}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{firmante?.puesto || 'Recursos Humanos'}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{empresa.razonSocial}</div>
            </div>

            <div style={{ marginTop: 40, borderTop: `2px solid ${empresa.accent}`, paddingTop: 8, textAlign: 'center', fontSize: 10, color: '#777', fontFamily: 'Helvetica, Arial, sans-serif' }}>
              {empresa.razonSocial} · RNC {empresa.rnc} · {DIRECCION} · Tel. {TEL}
            </div>
          </div>
        </div>

        {error && <div className="px-4 pb-2 text-xs text-red-400">{error}</div>}
        <div className="p-4 border-t border-zinc-800 flex gap-2">
          <button onClick={onCerrar} className="px-4 bg-zinc-800 text-zinc-300 font-bold uppercase py-3 text-xs rounded-card">Cerrar</button>
          <button onClick={descargarPDF} disabled={generando}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black uppercase py-3 text-xs rounded-card flex items-center justify-center gap-2">
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Descargar carta en PDF
          </button>
        </div>
      </div>
    </div>
  );
}
