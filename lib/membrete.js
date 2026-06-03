// v8.25.2: membrete (hoja timbrada) reutilizable para PDFs — logo arriba a la izq
// + datos de la empresa a la derecha. La imagen del logo se sirve desde /public.

const EMPRESAS = {
  super_techos: { logo: '/logo-super-techos.png', nombre: 'Super Techos', sub: 'Sistema de Impermeabilización', dir: 'C/ Arena #1, Mar Azul, Santo Domingo R.D.', tel: '809-535-9293', web: 'www.supertechos.com.do', rnc: '130-77433-1' },
  shared:       { logo: '/logo-super-techos.png', nombre: 'Super Techos', sub: 'Sistema de Impermeabilización', dir: 'C/ Arena #1, Mar Azul, Santo Domingo R.D.', tel: '809-535-9293', web: 'www.supertechos.com.do', rnc: '130-77433-1' },
  prouco:       { logo: '/logo-prouco.png', nombre: 'Prouco Group', sub: '', dir: '', tel: '', web: '', rnc: '' },
};

export const MEMBRETE_CSS = `
  .membrete { border-bottom: 3px solid #CC0000; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .membrete-logo { display: flex; align-items: center; gap: 10px; }
  .membrete-logo img { height: 48px; width: auto; }
  .m-nombre { font-size: 18px; font-weight: 900; color: #CC0000; line-height: 1; }
  .m-sub { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .membrete-datos { font-size: 9px; color: #555; text-align: right; line-height: 1.5; }
`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function membreteHTML(company) {
  const e = EMPRESAS[company] || EMPRESAS.super_techos;
  const origin = (typeof window !== 'undefined' && window.location.origin) || '';
  const datos = [
    e.dir,
    e.tel ? `Tel. ${e.tel}${e.web ? ` · ${e.web}` : ''}` : (e.web || ''),
    e.rnc ? `RNC: ${e.rnc}` : '',
  ].filter(Boolean).map(esc).join('<br>');
  return `
  <div class="membrete">
    <div class="membrete-logo">
      <img src="${origin}${e.logo}" alt="" />
      <div>
        <div class="m-nombre">${esc(e.nombre)}</div>
        ${e.sub ? `<div class="m-sub">${esc(e.sub)}</div>` : ''}
      </div>
    </div>
    <div class="membrete-datos">${datos}</div>
  </div>`;
}
