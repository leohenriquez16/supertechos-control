import { buscarPersonasParecidas, telefonosParecidos, normalizarNombre } from '../lib/helpers/personasParecidas.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const personal = [
  { id: 'a', nombre: 'Gerbacio De Leon - Lino -', telefono: '8299261046', cedulaNumero: '00110839958' },
  { id: 'b', nombre: 'Oliver Reyes De Los Santos', telefono: '' },
  { id: 'c', nombre: 'Yarmin Made Made' },
  { id: 'd', nombre: 'Juan Pérez', telefono: '8091112222' },
  { id: 'e', nombre: 'Juan Rodríguez' },
  { id: 'x', nombre: 'Gerbacio De Leon (DUPLICADO)' },
];
const r1 = buscarPersonasParecidas(personal, { nombre: 'Gerbacio De Leon', telefono: '829-826-1046' });
t('Gerbacio por nombre y teléfono casi igual', r1[0]?.persona.id === 'a' && r1[0].motivos.includes('teléfono casi igual') && r1[0].motivos.includes('mismo nombre'));
t('no sugiere fichas DUPLICADO', !r1.some(r => r.persona.id === 'x'));
t('Oliver con minúscula en "de"', buscarPersonasParecidas(personal, { nombre: 'Oliver Reyes de los Santos' })[0]?.persona.id === 'b');
t('acentos', buscarPersonasParecidas(personal, { nombre: 'Juan Perez' }).map(r => r.persona.id).join() === 'd');
t('Juan Rodríguez no es Juan Pérez', !buscarPersonasParecidas(personal, { nombre: 'Juan Pérez' }).some(r => r.persona.id === 'e'));
t('cédula', buscarPersonasParecidas(personal, { nombre: 'Lino', cedula: '001-1083995-8' })[0]?.motivos.includes('misma cédula'));
t('solo un nombre no dispara', buscarPersonasParecidas(personal, { nombre: 'Juan' }).length === 0);
t('excluirId', buscarPersonasParecidas(personal, { nombre: 'Yarmin Made', excluirId: 'c' }).length === 0);
t('teléfono 2 dígitos distinto no', !telefonosParecidos('8299261046', '8298261047'));
t('normalizar', normalizarNombre('Gerbacio De León - Lino -').join(' ') === 'gerbacio leon lino');
console.log(`${ok} pasadas, ${ko} fallidas`); if (ko) process.exit(1);
