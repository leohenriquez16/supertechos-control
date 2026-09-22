import fs from 'fs';
for (const line of fs.readFileSync('.env.prod','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
import { importarPeajes, listarPeajeTags, resumenPeajeMeses } from './lib/db.js';
const filas = JSON.parse(fs.readFileSync('/tmp/peajes.json','utf8'));
console.log('filas:', filas.length);
const res = await importarPeajes({ filas, archivo: 'movimientos_2026-08-10.xlsx',
  usuario: { id: 'seed', nombre: 'Carga inicial' } });
console.log('IMPORT:', JSON.stringify(res, null, 2));
const r = await resumenPeajeMeses();
console.log('MESES:', r.slice(0,3).map(x=>`${x.mes}: total ${x.total} · asignado ${x.asignado} · sin ${x.sinAsignar} · ${x.tagsSinVehiculo} tags sin vehículo`).join('\n       '));
