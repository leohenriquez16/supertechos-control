'use client';

// v8.14: Modal admin "Invitar al app". Captura nombre + teléfono, genera PIN
// temporal y produce un texto listo para enviar por WhatsApp con las
// instrucciones de primer acceso.

import React, { useState, useEffect } from 'react';
import { Loader2, X, Copy, Check, Send, RefreshCw } from 'lucide-react';
import * as db from '../../lib/db';

const formatearTelefono = (s) => {
  const d = String(s || '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

const generarPin = () => Math.floor(Math.random() * 900000 + 100000).toString();

export default function ModalInvitarMaestro({ usuario, personaExistente = null, onCerrar, onInvitado }) {
  const esActivacion = !!personaExistente;
  const [paso, setPaso] = useState('form'); // 'form' | 'listo'
  const [nombre, setNombre] = useState(personaExistente?.nombre || '');
  const [telefono, setTelefono] = useState(personaExistente?.telefono || '');
  const [pin, setPin] = useState(generarPin());
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const invitar = async () => {
    if (guardando) return;
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (telefono.replace(/\D/g, '').length !== 10) { setError('El teléfono debe ser de 10 dígitos.'); return; }
    if (pin.length < 4 || pin.length > 6) { setError('El PIN debe tener 4-6 dígitos.'); return; }
    setGuardando(true); setError('');
    try {
      const res = await db.invitarMaestroAlApp({
        nombre: nombre.trim(),
        telefono,
        pinTemporal: pin,
        invitadoPorId: usuario.id,
        personaIdExistente: personaExistente?.id || null,
      });
      setResultado(res);
      setPaso('listo');
      onInvitado?.();
    } catch (e) {
      setError(e.message || 'Error invitando');
    }
    setGuardando(false);
  };

  const url = typeof window !== 'undefined' ? window.location.origin : '';
  const telefonoLimpio = resultado?.telefono || telefono.replace(/\D/g, '');

  const mensaje = resultado
    ? `Hola ${resultado.nombre}, te activamos en el app de Super Techos.

📱 Entra aquí: ${url}
👤 Tu usuario: ${formatearTelefono(resultado.telefono)}
🔑 Tu PIN temporal: ${resultado.pin}

En tu primer acceso te pedirá cambiar el PIN y completar tus datos.

📲 Si quieres tenerlo como app en tu pantalla principal, sigue estos pasos: ${url}/instalar

Cualquier duda me avisas.`
    : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert('No se pudo copiar. Selecciona el texto y copia manualmente.');
    }
  };

  const abrirWhatsApp = () => {
    const numeroIntl = '1' + telefonoLimpio; // RD = +1
    const url = `https://wa.me/${numeroIntl}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-zinc-800 w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="font-black uppercase tracking-wider text-sm">
            {paso === 'form'
              ? (esActivacion ? 'Activar para el app' : 'Invitar al app')
              : '✅ Invitación lista'}
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {paso === 'form' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400 mb-3">
                {esActivacion
                  ? `${personaExistente.nombre} ya está en el sistema. Confirma su teléfono y le generamos credenciales para que entre al app y complete su perfil.`
                  : 'Crea las credenciales del maestro. El sistema genera un PIN temporal y te da el texto listo para enviar por WhatsApp.'}
              </p>

              <Field label="Nombre completo">
                <input
                  type="text"
                  autoFocus={!esActivacion}
                  readOnly={esActivacion}
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setError(''); }}
                  placeholder="Adonis Heredia Jiménez"
                  className={`w-full bg-zinc-950 border border-zinc-700 ${esActivacion ? 'text-zinc-400' : 'focus:border-red-600 text-white'} outline-none px-3 py-3`}
                />
              </Field>

              <Field label="Teléfono (su WhatsApp)">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formatearTelefono(telefono)}
                  onChange={e => { setTelefono(e.target.value); setError(''); }}
                  placeholder="809-555-1234"
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white tracking-wider"
                />
              </Field>

              <Field label="PIN temporal (4-6 dígitos)">
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                    maxLength={6}
                    className="flex-1 bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white font-mono text-center text-lg tracking-[0.4em]"
                  />
                  <button
                    type="button"
                    onClick={() => { setPin(generarPin()); setError(''); }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-3"
                    title="Generar nuevo PIN"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </Field>

              {error && (
                <div className="bg-red-950/50 border border-red-800 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={onCerrar}
                  disabled={guardando}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold uppercase py-3"
                >
                  Cancelar
                </button>
                <button
                  onClick={invitar}
                  disabled={guardando}
                  className="flex-[2] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black uppercase tracking-wider py-3 flex items-center justify-center gap-2"
                >
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {guardando ? 'Creando...' : (esActivacion ? 'Activar y generar PIN' : 'Crear invitación')}
                </button>
              </div>
            </div>
          )}

          {paso === 'listo' && resultado && (
            <div className="space-y-3">
              <div className="bg-green-950/30 border border-green-800 px-3 py-2 text-xs text-green-300">
                {resultado.esNueva
                  ? `Se creó el usuario ${resultado.nombre}.`
                  : (esActivacion
                    ? `Se activó a ${resultado.nombre} para el app. Cuando entre, le pedirá cambiar el PIN y completar su perfil.`
                    : `Se reinvitó a ${resultado.nombre} (ya existía).`)}
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                  Mensaje listo para enviar
                </div>
                <pre className="text-xs text-zinc-200 whitespace-pre-wrap font-sans">{mensaje}</pre>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={copiar}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase py-3 flex items-center justify-center gap-2 text-sm"
                >
                  {copiado ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <button
                  onClick={abrirWhatsApp}
                  className="bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wider py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Send className="w-4 h-4" /> WhatsApp
                </button>
              </div>

              <div className="text-[10px] text-zinc-500 leading-relaxed">
                ⚠️ Guarda el PIN ahora. Después no podrás verlo de nuevo, solo regenerarlo.
              </div>

              <button
                onClick={onCerrar}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase py-3 mt-2"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">{label}</div>
      {children}
    </div>
  );
}
