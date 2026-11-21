// v8.98.0 — Lentes traseros disponibles para la cámara en ráfaga (puro, con pruebas).
// Dos caminos para el 0.5x (gran angular):
//  1) Zoom del propio track con mínimo < 1 (Chrome Android y algunos iPhone con cámara «doble/triple»).
//  2) Un dispositivo aparte cuyo nombre dice «ultra» (Safari iPhone/iPad: «Back Ultra Wide Camera» /
//     «Cámara ultra gran angular posterior»). Los nombres solo existen después de dar permiso de cámara.
// Devuelve [] si no hay 0.5x (entonces no se muestran botones).

const FRONTAL = /front|frontal|delanter|facetime|user|selfie/i;
const ULTRA = /ultra/i;

export function lentesDisponibles({ caps = null, settings = null, devices = [] } = {}) {
  const z = caps && caps.zoom;
  if (z && typeof z.min === 'number' && z.min < 1) {
    return [
      { key: '0.5', label: '0.5x', zoom: Math.max(z.min, 0.5) },
      { key: '1', label: '1x', zoom: Math.min(Math.max(1, z.min), z.max ?? 1) },
    ];
  }
  const traseras = (devices || []).filter((d) => d && d.kind === 'videoinput' && d.label && !FRONTAL.test(d.label));
  const ultra = traseras.find((d) => ULTRA.test(d.label));
  if (!ultra) return [];
  const actual = settings && settings.deviceId;
  // 1x = la que está abierta (si no es la ultra) o la primera trasera que no sea ultra ni teleobjetivo.
  const principal = (actual && actual !== ultra.deviceId && traseras.find((d) => d.deviceId === actual))
    || traseras.find((d) => !ULTRA.test(d.label) && !/tele/i.test(d.label));
  if (!principal) return [];
  return [
    { key: '0.5', label: '0.5x', deviceId: ultra.deviceId },
    { key: '1', label: '1x', deviceId: principal.deviceId },
  ];
}
