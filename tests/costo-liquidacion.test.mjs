// v8.74.16: costo de liquidación para salidas mal valoradas (Bituguard 3KG a RD$14.70).
import { referenciaLiquidacion, liquidacionesValidas, costoFueraDeRango, liquidacionAFecha } from '../lib/helpers/costoLiquidacion.js';
let ok = 0, ko = 0;
const t = (n, c, v) => { if (c) ok++; else { ko++; console.error('FALLA:', n, v ?? ''); } };
const e3 = [
  { fecha: '2026-03-25', unit: 835.25, ref: 'AL/IN/01174' }, { fecha: '2026-03-27', unit: 14.7, ref: 'AL/IN/01250' },
  { fecha: '2026-06-30', unit: 14.7, ref: 'AL/IN/01357' }, { fecha: '2026-06-30', unit: 14.7, ref: 'AL/IN/01358' },
  { fecha: '2026-09-04', unit: 890.6, ref: 'AL/IN/01439' },
];
const L3 = liquidacionesValidas(e3);
t('3KG: referencia 835.25 aunque 14.70 se repita', L3.ref === 835.25, L3.ref);
t('3KG: válidas = las dos liquidaciones buenas', L3.validas.length === 2, L3.validas);
t('3KG: salida a 14.70 fuera de rango', costoFueraDeRango(14.7, L3.ref));
t('3KG: salida a 890 dentro de rango', !costoFueraDeRango(890.6, L3.ref));
t('3KG: salida de abril → liquidación de marzo', liquidacionAFecha(L3.validas, '2026-04-16 10:00:00').unit === 835.25);
t('3KG: salida de octubre → liquidación de septiembre', liquidacionAFecha(L3.validas, '2026-10-01').unit === 890.6);
t('3KG: salida anterior a todas → primera', liquidacionAFecha(L3.validas, '2026-01-01').unit === 835.25);
const e5 = [{ fecha: '2026-03-03', unit: 1201.56 }, { fecha: '2026-03-25', unit: 14938.125 }, { fecha: '2026-03-25', unit: 1298.97 }, { fecha: '2026-03-27', unit: 1195.05 }, { fecha: '2026-09-04', unit: 1281 }];
const L5 = liquidacionesValidas(e5);
t('5KG: 14,938 queda fuera', !L5.validas.some(e => e.unit > 10000), L5);
t('5KG mineral: 23.50 y 2,843.50 fuera', liquidacionesValidas([{ fecha: 'a', unit: 1336.4 }, { fecha: 'b', unit: 23.5 }, { fecha: 'c', unit: 2843.5 }]).validas.length === 1);
t('sin entradas → sin referencia', referenciaLiquidacion([]) === null && !costoFueraDeRango(5, null));
t('salida en 0 → fuera de rango', costoFueraDeRango(0, 1000));
console.log(`costo-liquidacion: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
