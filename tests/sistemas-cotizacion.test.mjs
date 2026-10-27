import { sistemasDeCotizacion } from '../lib/helpers/sistemasCotizacion.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const sistemas = [
  { id: 'sil', nombre: 'Sistema Silicona', keywords_cotizacion: ['silicona'] },
  { id: 'lav', nombre: 'Lavado a presión', keywords_cotizacion: ['lavado'] },
];
const cot = { areas: [
  { nombre: 'Techo A', productos: [{ producto: 'AP - Silicona capa base', cantidad: 200 }, { producto: 'AP - Silicona capa final', cantidad: 200 }, { producto: 'Lavado a presión', cantidad: 210 }] },
  { nombre: 'Techo B', productos: [{ producto: 'AP - Silicona', cantidad: 50 }] },
  { nombre: 'Anticipos', productos: [{ producto: 'Silicona anticipo', cantidad: 1 }] },
  { nombre: 'Otros', productos: [{ producto: 'Movilización', cantidad: 1 }] },
] };
const r = sistemasDeCotizacion(cot, sistemas);
t('silicona primero (lleva garantía)', r[0].sistemaId === 'sil');
t('m² por área = la línea mayor, no la suma de capas', r[0].m2 === 250);
t('lavado queda como auxiliar', r[1].sistemaId === 'lav' && r[1].auxiliar);
t('anticipos fuera', r.length === 2);
// Caso real ST-C5338: silicona sobre lona + mantenimiento de lona + lavado
const sis2 = [
  { id: 'lona', nombre: 'Lona Asfáltica ', keywords_cotizacion: ['lona asfáltica', 'lona asfaltica', 'AP - Lona'] },
  { id: 'mant', nombre: 'Mantenimiento Lona Asfaltica Lisa' },
  { id: 'hs', nombre: 'Ever Silic HS (Silicona Sobre Lona Asfáltica)' },
  { id: 'lav', nombre: 'Lavado a Presion' },
  { id: 'gen', nombre: 'Silicona Sobre Lona Asfaltica' },
];
const r2 = sistemasDeCotizacion({ areas: [{ nombre: 'General', productos: [
  { producto: '[32004333] AP - Lavado a Presión Superficie', cantidad: 310.59 },
  { producto: '[32004334] AP - Mantenimiento Lona Asfaltica', cantidad: 310.59 },
  { producto: 'AP - Ever Silic HS - Sobre Lona Asfaltica', cantidad: 310.59 },
  { producto: 'AP - Movilización Tinacos', cantidad: 1 },
] }] }, sis2);
t('5338: Ever Silic HS sobre lona se garantiza como silicona sobre lona genérica', r2[0].sistemaId === 'gen' && r2[0].m2 === 310.59);
t('5338: mantenimiento y lavado quedan auxiliares', r2.filter(x => x.auxiliar).map(x => x.sistemaId).sort().join() === 'lav,mant');
console.log(`sistemas-cotizacion: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
