// lib/constants.js
// Constantes globales del ERP Super Techos
export const APP_VERSION = '8.17.29';

// v8.17.25: RNCs de las dos empresas que reciben facturas de proveedores.
// La AI usa estos para identificar si la factura está dirigida a Super
// Techos o a Prouco. El admin puede corregir manualmente.
export const RNC_SUPER_TECHOS = '130774331';
export const RNC_PROUCO = '131515541';
export const EMPRESAS_RECEPTORAS = {
  super_techos: { label: 'Super Techos', rnc: RNC_SUPER_TECHOS, short: 'ST', color: 'bg-red-700',    textColor: 'text-red-300',    borderColor: 'border-red-700' },
  prouco:       { label: 'Prouco',       rnc: RNC_PROUCO,        short: 'P',  color: 'bg-purple-700', textColor: 'text-purple-300', borderColor: 'border-purple-700' },
};
// Mapa RNC → key. Útil para que la AI clasifique al ver el RNC del cliente.
export const RNC_A_EMPRESA = {
  [RNC_SUPER_TECHOS]: 'super_techos',
  [RNC_PROUCO]:        'prouco',
};
