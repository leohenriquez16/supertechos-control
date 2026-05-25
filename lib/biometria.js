// v8.14: Helpers de WebAuthn (Face ID / Touch ID / Huella).
// Extraídos de app/page.jsx para que el WizardOnboarding pueda registrar
// biometría sin duplicar la lógica.
//
// v8.17.91: tras un login WebAuthn exitoso, si el endpoint devuelve un
// OTP de magiclink, lo canjeamos por sesión Supabase. Mismo helper que
// loginConTelefono — vive en lib/db.js para no duplicar.

import { aplicarSesionSupabaseSiAplica } from './db';

// Convierte base64url a ArrayBuffer
const base64urlToBuffer = (base64url) => {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
};

// Convierte ArrayBuffer a base64url
const bufferToBase64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const detectarDispositivo = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|iPod/.test(ua)) return { tipo: 'iphone', nombre: 'iPhone' };
  if (/Mac OS/.test(ua)) return { tipo: 'mac', nombre: 'Mac' };
  if (/Android/.test(ua)) return { tipo: 'android', nombre: 'Android' };
  if (/Windows/.test(ua)) return { tipo: 'windows', nombre: 'Windows' };
  return { tipo: 'other', nombre: 'Dispositivo' };
};

export async function biometriaSoportada() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}

export async function registrarBiometria(personaId, personaNombre) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Este dispositivo no soporta biometría');
  }

  const beginRes = await fetch('/api/webauthn/register-begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId, personaNombre }),
  });
  const { options, challenge } = await beginRes.json();
  if (!options) throw new Error('No se pudo iniciar el registro');

  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error('No se pudo crear la credencial');

  const credData = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      publicKey: credential.response.getPublicKey ? bufferToBase64url(credential.response.getPublicKey()) : null,
      transports: credential.response.getTransports ? credential.response.getTransports() : [],
    },
  };

  const device = detectarDispositivo();
  const finishRes = await fetch('/api/webauthn/register-finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personaId,
      credential: credData,
      deviceName: device.nombre,
      deviceType: device.tipo,
      challenge,
    }),
  });
  const res = await finishRes.json();
  if (!res.success) throw new Error(res.error || 'Registro falló');
  return true;
}

export async function loginConBiometria(personaId = null) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Este dispositivo no soporta biometría');
  }

  const beginRes = await fetch('/api/webauthn/login-begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId }),
  });
  const beginData = await beginRes.json();
  if (!beginData.options) throw new Error(beginData.error || 'Sin credenciales');

  const publicKey = {
    ...beginData.options,
    challenge: base64urlToBuffer(beginData.options.challenge),
    allowCredentials: beginData.options.allowCredentials.map(c => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error('Autenticación cancelada');

  const credData = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      signature: bufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
    },
  };

  const finishRes = await fetch('/api/webauthn/login-finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: credData }),
  });
  const res = await finishRes.json();
  if (!res.persona) throw new Error(res.error || 'Login falló');
  // v8.17.91: si el endpoint emitió OTP de magiclink, canjearlo por sesión Supabase.
  await aplicarSesionSupabaseSiAplica(res.otp);
  return res.persona;
}
