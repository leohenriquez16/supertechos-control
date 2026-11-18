// v8.74.13: tema claro / oscuro del ERP. Preferencia por dispositivo (localStorage).
// La clase `tema-claro` en <html> invierte la paleta (ver tailwind.config.js).
// El script de app/layout.jsx la aplica antes de pintar para que no parpadee.
export const TEMA_KEY = 'supertechos_tema';

export const leerTema = () => {
  try { return localStorage.getItem(TEMA_KEY) === 'claro' ? 'claro' : 'oscuro'; } catch { return 'oscuro'; }
};

export const aplicarTema = (tema) => {
  try { document.documentElement.classList.toggle('tema-claro', tema === 'claro'); } catch {}
  try { localStorage.setItem(TEMA_KEY, tema); } catch {}
};

// Solo el ERP (/) usa la preferencia; las páginas públicas (solicitud, programa,
// calificar…) se ven siempre como fueron diseñadas.
export const SCRIPT_TEMA_INICIAL = `try{if(location.pathname==='/'&&localStorage.getItem('${TEMA_KEY}')==='claro')document.documentElement.classList.add('tema-claro')}catch(e){}`;
