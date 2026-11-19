import { urlWaze, urlGoogleDestino, urlGoogleRuta, tramosRuta, rotuloTramo } from '../lib/helpers/navegacion.js';
let ok = 0, ko = 0;
const t = (n, c) => { if (c) ok++; else { ko++; console.error('FALLA:', n); } };

t('waze', urlWaze(18.4861, -69.9312) === 'https://waze.com/ul?ll=18.4861,-69.9312&navigate=yes');
t('waze acepta strings numéricos', urlWaze('18.5', '-69.9') === 'https://waze.com/ul?ll=18.5,-69.9&navigate=yes');
t('waze sin coords', urlWaze(null, -69.9) === null);
t('google destino', urlGoogleDestino(18.4861, -69.9312) === 'https://www.google.com/maps/dir/?api=1&destination=18.4861,-69.9312&travelmode=driving&dir_action=navigate');
t('google destino sin coords', urlGoogleDestino(undefined, undefined) === null);

const p = (n) => ({ lat: 18 + n / 100, lng: -69 - n / 100, numero: n });
t('ruta vacía', urlGoogleRuta([]).length === 0);
t('ruta null', urlGoogleRuta(null).length === 0);

const una = urlGoogleRuta([p(1)]);
t('una parada = solo destino', una.length === 1 && una[0] === 'https://www.google.com/maps/dir/?api=1&destination=18.01,-69.01&travelmode=driving&dir_action=navigate');

const tres = urlGoogleRuta([p(1), p(2), p(3)]);
t('tres paradas: destino la última', tres[0].includes('destination=18.03,-69.03'));
t('tres paradas: waypoints separados por %7C', tres[0].includes('waypoints=18.01,-69.01%7C18.02,-69.02&'));

const sinCoords = urlGoogleRuta([p(1), { lat: null, lng: null, numero: 2 }, p(3)]);
t('ignora paradas sin coords', sinCoords.length === 1 && sinCoords[0].includes('waypoints=18.01,-69.01&') && sinCoords[0].includes('destination=18.03,-69.03'));

const doce = Array.from({ length: 12 }, (_, i) => p(i + 1));
const tr = tramosRuta(doce, 9);
t('12 paradas = 2 tramos', tr.length === 2 && urlGoogleRuta(doce).length === 2);
t('tramo 1 tiene 9', tr[0].paradas.length === 9 && tr[0].url.includes('destination=18.09,-69.09'));
t('tramo 1 tiene 8 waypoints', (tr[0].url.match(/%7C/g) || []).length === 7);
t('tramo 2 tiene 3', tr[1].paradas.length === 3 && tr[1].url.includes('destination=18.12,-69.12'));
t('rótulo tramo 1', rotuloTramo(tr[0], 0) === 'Ruta 1–9');
t('rótulo tramo 2', rotuloTramo(tr[1], 1) === 'Ruta 10–12');
t('rótulo una sola', rotuloTramo(tramosRuta([p(13)])[0], 0) === 'Ruta 13');
t('rótulo sin numero', rotuloTramo({ paradas: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] }, 1, 9) === 'Ruta 10–11');
t('max personalizado', urlGoogleRuta(doce, 5).length === 3);

console.log(`navegacion: ${ok} ok, ${ko} fallas`);
if (ko) process.exit(1);
