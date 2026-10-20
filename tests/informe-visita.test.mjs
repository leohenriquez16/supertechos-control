import { etiquetaCausaRaiz, filasIdentificacion, seccionesInforme, nombreArchivoInforme } from '../lib/helpers/informeVisita.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };
const CAT = [['aplicacion', 'Falla de aplicación (nuestra)'], ['otro', 'Otro']];
t('causa etiqueta', etiquetaCausaRaiz('aplicacion', CAT) === 'Falla de aplicación (nuestra)');
t('causa desconocida', etiquetaCausaRaiz('rara', CAT) === 'rara');
t('causa vacía', etiquetaCausaRaiz(null, CAT) === '');

const f = filasIdentificacion({ clienteNombre: 'Banco X', contacto: { nombre: 'Ana', tel: '809', email: '' }, ubicacionNombre: 'Sucursal Norte', proyecto: { referenciaOdoo: 'ST-C5001', nombre: 'Techo nave' }, referenciaCotizacion: 'ST-C5001' });
t('filas: contacto unido', f.find(x => x[0] === 'Contacto')[1] === 'Ana · 809');
t('filas: obra', f.find(x => x[0] === 'Obra')[1] === 'ST-C5001 · Techo nave');
t('filas: no repite cotización', !f.some(x => x[0] === 'Cotización'));
const f2 = filasIdentificacion({ clienteNombre: '', contacto: null, ubicacionNombre: '', proyecto: null, referenciaCotizacion: 'PG-C12' });
t('filas: cliente siempre', f2[0][0] === 'Cliente' && f2[0][1] === '—');
t('filas: cotización sin obra', f2.some(x => x[0] === 'Cotización' && x[1] === 'PG-C12'));
t('filas: sin vacías', !f2.some(x => x[0] === 'Contacto' || x[0] === 'Obra'));

const s = seccionesInforme({ descripcion: 'Filtración en la sala', observaciones: ' Traslape abierto ', causaRaizTxt: 'Otro', trabajoRealizado: '', recomendacion: 'Inspección en 6 meses' });
t('secciones orden', s.map(x => x.titulo).join() === 'HALLAZGO,CAUSA,RECOMENDACIÓN');
t('hallazgo une', s[0].texto === 'Reporte del cliente: Filtración en la sala\n\nObservaciones de la visita: Traslape abierto');
t('secciones vacías', seccionesInforme({}).length === 0);

t('archivo', nombreArchivoInforme({ codigo: 'REC 0012/A' }, '2026-10-20') === 'Informe-visita-REC_0012_A-2026-10-20.pdf');
t('archivo sin código', nombreArchivoInforme({ id: 'rec_1' }, '') === 'Informe-visita-rec_1-sin-fecha.pdf');
console.log(`informe-visita: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
