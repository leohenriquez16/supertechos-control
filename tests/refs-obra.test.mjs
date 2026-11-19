// tests de lib/helpers/refsObra.js (v8.77: cotización original + sub-cotizaciones)
import { refsDeObra, salidasDeObra } from '../lib/helpers/refsObra.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const numRef = (ref) => { const n = String(ref || '').replace(/\D+/g, ''); return n.length >= 3 ? n : null; };
const p = { referenciaOdoo: 'ST-C5000', subCotizaciones: [{ ref: 'ST-C6100', estado: 'sale' }, { ref: 'ST-C6101', estado: 'cancel' }, { ref: 'ST-C5000' }] };
t('refs', JSON.stringify(refsDeObra(p)) === JSON.stringify(['ST-C5000', 'ST-C6100']));
t('sin subs', JSON.stringify(refsDeObra({ referenciaOdoo: 'ST-C1' })) === JSON.stringify(['ST-C1']));
t('vacío', refsDeObra({}).length === 0);
const por = {
  5000: { productos: [{ producto: 'Lona', cantidad: 10, costoRd: 1000, fuentesCosto: ['fifo'] }] },
  6100: { productos: [{ producto: 'Lona', cantidad: 5, costoRd: 600, fuentesCosto: ['oc'] }, { producto: 'Primer', cantidad: 2, costoRd: 300 }] },
  6101: { productos: [{ producto: 'Lona', cantidad: 99, costoRd: 9999 }] },
};
const s = salidasDeObra(por, p, numRef);
const lona = s.productos.find(x => x.producto === 'Lona');
t('suma por producto', lona.cantidad === 15 && lona.costoRd === 1600 && lona.fuentesCosto.length === 2);
t('incluye producto de la sub', s.productos.some(x => x.producto === 'Primer'));
t('no suma cancelada', lona.cantidad !== 114);
t('sin ref = null', salidasDeObra(por, {}, numRef) === null);
t('ref sin salidas = vacío', salidasDeObra({}, { referenciaOdoo: 'ST-C7777' }, numRef).productos.length === 0);
console.log(`refsObra: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
