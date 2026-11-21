import { lentesDisponibles } from '../lib/helpers/camaraLentes.js';
let ok = 0, fallas = 0;
const t = (n, c) => { if (c) ok++; else { fallas++; console.log('FALLA:', n); } };
const D = (deviceId, label) => ({ kind: 'videoinput', deviceId, label });

t('sin nada: sin lentes', lentesDisponibles({}).length === 0);
const z = lentesDisponibles({ caps: { zoom: { min: 0.5, max: 10 } } });
t('zoom con mínimo 0.5: 0.5x y 1x por zoom', z.length === 2 && z[0].zoom === 0.5 && z[1].zoom === 1);
t('zoom mínimo 1: no ofrece 0.5x', lentesDisponibles({ caps: { zoom: { min: 1, max: 5 } } }).length === 0);
const ios = lentesDisponibles({ settings: { deviceId: 'tri' }, devices: [D('f', 'Front Camera'), D('tri', 'Back Triple Camera'), D('uw', 'Back Ultra Wide Camera'), D('w', 'Back Camera'), D('t', 'Back Telephoto Camera')] });
t('iPhone: 0.5x = ultra, 1x = la abierta', ios.length === 2 && ios[0].deviceId === 'uw' && ios[1].deviceId === 'tri');
const es = lentesDisponibles({ settings: { deviceId: 'uw' }, devices: [D('f', 'Cámara frontal'), D('uw', 'Cámara ultra gran angular posterior'), D('t', 'Cámara teleobjetivo posterior'), D('w', 'Cámara posterior')] });
t('en español y abierta en la ultra: 1x = trasera normal (no tele)', es.length === 2 && es[0].deviceId === 'uw' && es[1].deviceId === 'w');
t('sin ultra: sin lentes', lentesDisponibles({ devices: [D('w', 'Back Camera'), D('f', 'Front Camera')] }).length === 0);
t('ultra frontal no cuenta', lentesDisponibles({ devices: [D('w', 'Back Camera'), D('f', 'Front Ultra Wide Camera')] }).length === 0);
t('sin nombres (sin permiso): sin lentes', lentesDisponibles({ devices: [D('a', ''), D('b', '')] }).length === 0);
console.log(`camara-lentes: ${ok} ok, ${fallas} fallas`);
if (fallas) process.exit(1);
