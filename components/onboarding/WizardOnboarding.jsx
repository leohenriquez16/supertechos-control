'use client';

// v8.14: Wizard de onboarding obligatorio para maestros recién invitados.
// Bloqueante hasta que se complete. Recopila: datos personales, WhatsApp,
// contacto de emergencia, selfie, fotos de cédula, datos bancarios, y
// opcionalmente registra biometría (Face ID / huella).

import React, { useState, useEffect } from 'react';
import { Loader2, ArrowLeft, ArrowRight, Camera, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import * as db from '../../lib/db';
import { comprimirImagen } from '../../lib/imports';
import { registrarBiometria, biometriaSoportada } from '../../lib/biometria';
import InstructivoInstalar from './InstructivoInstalar';

const BANCOS_RD = [
  'Banco Popular Dominicano',
  'Banreservas',
  'BHD',
  'Banco Santa Cruz',
  'Banco BDI',
  'Banco Caribe',
  'Banco Lopez de Haro',
  'Banco Promerica',
  'APAP',
  'Asociación Cibao',
  'Asociación La Nacional',
  'Banco Vimenca',
  'Otro',
];

const TIPOS_SANGRE = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'No sé'];

const RELACIONES = ['Esposa/Esposo', 'Padre', 'Madre', 'Hijo/a', 'Hermano/a', 'Otro familiar', 'Amigo/a'];

const formatearTelefono = (s) => {
  const d = String(s || '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

const formatearCedula = (s) => {
  const d = String(s || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 10)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
};

const TOTAL_PASOS = 8;

export default function WizardOnboarding({ usuario, onListo }) {
  const [paso, setPaso] = useState(1);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [bioSoportadoState, setBioSoportadoState] = useState(false);
  // v8.17.86: guard contra cache stale. Verificamos contra DB que
  // realmente el onboarding NO está completo antes de mostrar el wizard.
  const [verificandoEstado, setVerificandoEstado] = useState(true);

  const [datos, setDatos] = useState({
    cedulaNumero: usuario.cedulaNumero || '',
    fechaNacimiento: usuario.fechaNacimiento || '',
    direccion: usuario.direccion || '',
    tipoSangre: usuario.tipoSangre || '',
    whatsapp: usuario.whatsapp || usuario.telefono || '',
    contactoEmergenciaNombre: usuario.contactoEmergenciaNombre || '',
    contactoEmergenciaTelefono: usuario.contactoEmergenciaTelefono || '',
    contactoEmergenciaRelacion: usuario.contactoEmergenciaRelacion || '',
    foto2x2: usuario.foto2x2 || '',
    cedulaFrente: usuario.cedulaFrente || '',
    cedulaReverso: usuario.cedulaReverso || '',
    banco: usuario.banco || '',
    bancoTipoCuenta: usuario.bancoTipoCuenta || '',
    bancoNumeroCuenta: usuario.bancoNumeroCuenta || '',
    titularEsOtro: !!(usuario.bancoTitularNombre && usuario.bancoTitularNombre !== usuario.nombre),
    bancoTitularNombre: usuario.bancoTitularNombre || '',
    bancoTitularCedula: usuario.bancoTitularCedula || '',
  });

  useEffect(() => {
    biometriaSoportada().then(setBioSoportadoState);
  }, []);

  // v8.17.86: guard defensivo — al montar, re-fetch estado real desde DB.
  // Si la DB dice que el onboarding ya está completo (state cliente stale),
  // saltamos el wizard inmediatamente. Una sola query barata.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const estado = await db.obtenerEstadoOnboardingPersona(usuario.id);
        if (cancelado) return;
        if (estado?.onboardingCompletado) {
          // DB ya está en true → saltar wizard. Auditamos para tener evidencia.
          try {
            db.registrarAudit({
              usuarioId: usuario.id,
              usuarioNombre: usuario.nombre,
              accion: 'persona.wizard_skipped_guard',
              recursoTipo: 'persona',
              recursoId: usuario.id,
              severidad: 'warning',
              metadata: {
                motivo: 'cliente_tenia_onboardingCompletado_false_pero_db_true',
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
              },
            });
          } catch {}
          onListo({ ...usuario, onboardingCompletado: true });
        } else {
          setVerificandoEstado(false);
        }
      } catch {
        // Si falla el guard, mostramos el wizard igual (no bloquear al usuario).
        if (!cancelado) setVerificandoEstado(false);
      }
    })();
    return () => { cancelado = true; };
  }, [usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setDatos(prev => ({ ...prev, [k]: v }));

  const validarPaso = (p) => {
    if (p === 2) {
      const ced = datos.cedulaNumero.replace(/\D/g, '');
      if (ced.length !== 11) return 'La cédula debe tener 11 dígitos.';
      if (!datos.fechaNacimiento) return 'Fecha de nacimiento requerida.';
      const edad = (Date.now() - new Date(datos.fechaNacimiento).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (edad < 16 || edad > 90) return 'Fecha de nacimiento no parece correcta.';
      if (!datos.direccion.trim()) return 'Dirección requerida.';
    }
    if (p === 3) {
      if (datos.whatsapp.replace(/\D/g, '').length !== 10) return 'WhatsApp debe ser de 10 dígitos.';
      if (!datos.contactoEmergenciaNombre.trim()) return 'Nombre del contacto de emergencia requerido.';
      if (datos.contactoEmergenciaTelefono.replace(/\D/g, '').length !== 10) return 'Teléfono del contacto debe ser de 10 dígitos.';
      if (!datos.contactoEmergenciaRelacion) return 'Selecciona la relación con el contacto de emergencia.';
    }
    // Pasos 4 y 5 (selfie + cédula) son opcionales en el wizard.
    // El maestro puede subirlas más tarde desde su perfil.
    if (p === 6) {
      if (!datos.banco) return 'Selecciona el banco.';
      if (!datos.bancoTipoCuenta) return 'Selecciona el tipo de cuenta.';
      if (!datos.bancoNumeroCuenta.replace(/\D/g, '')) return 'Número de cuenta requerido.';
      if (datos.titularEsOtro) {
        if (!datos.bancoTitularNombre.trim()) return 'Nombre del titular requerido.';
        if (datos.bancoTitularCedula.replace(/\D/g, '').length !== 11) return 'Cédula del titular debe tener 11 dígitos.';
      }
    }
    return null;
  };

  const siguiente = () => {
    const err = validarPaso(paso);
    if (err) { setError(err); return; }
    setError('');
    if (paso < TOTAL_PASOS) setPaso(paso + 1);
  };

  const anterior = () => {
    setError('');
    if (paso > 1) setPaso(paso - 1);
  };

  const finalizar = async () => {
    if (guardando) return;
    setGuardando(true); setError('');
    try {
      const titularNombre = datos.titularEsOtro ? datos.bancoTitularNombre : usuario.nombre;
      const titularCedula = datos.titularEsOtro ? datos.bancoTitularCedula.replace(/\D/g, '') : datos.cedulaNumero.replace(/\D/g, '');
      await db.completarOnboarding(usuario.id, {
        cedulaNumero: datos.cedulaNumero.replace(/\D/g, ''),
        fechaNacimiento: datos.fechaNacimiento,
        direccion: datos.direccion.trim(),
        tipoSangre: datos.tipoSangre || null,
        whatsapp: datos.whatsapp,
        contactoEmergenciaNombre: datos.contactoEmergenciaNombre.trim(),
        contactoEmergenciaTelefono: datos.contactoEmergenciaTelefono,
        contactoEmergenciaRelacion: datos.contactoEmergenciaRelacion,
        banco: datos.banco,
        bancoTipoCuenta: datos.bancoTipoCuenta,
        bancoNumeroCuenta: datos.bancoNumeroCuenta.replace(/\D/g, ''),
        bancoTitularNombre: titularNombre,
        bancoTitularCedula: titularCedula,
        foto2x2: datos.foto2x2,
        cedulaFrente: datos.cedulaFrente,
        cedulaReverso: datos.cedulaReverso,
      });
      db.registrarAcceso({ personaId: usuario.id, tipo: 'onboarding.completado' });
      onListo({
        ...usuario,
        onboardingCompletado: true,
        cedulaNumero: datos.cedulaNumero.replace(/\D/g, ''),
        fechaNacimiento: datos.fechaNacimiento,
        direccion: datos.direccion.trim(),
        whatsapp: datos.whatsapp,
        foto2x2: datos.foto2x2,
        cedulaFrente: datos.cedulaFrente,
        cedulaReverso: datos.cedulaReverso,
        banco: datos.banco,
      });
    } catch (e) {
      setError(e.message || 'Error guardando los datos');
      setGuardando(false);
    }
  };

  // v8.17.86: mientras verifica el estado real contra DB, mostrar pantalla
  // neutra (evita parpadeo del wizard si el guard va a saltarlo en ms).
  if (verificandoEstado) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-md mx-auto">
        <BarraPasos paso={paso} total={TOTAL_PASOS} />

        <div className="bg-zinc-900 border-2 border-zinc-800 p-5 mt-4">
          {paso === 1 && <PasoBienvenida usuario={usuario} />}
          {paso === 2 && <PasoDatosPersonales datos={datos} set={set} />}
          {paso === 3 && <PasoContacto datos={datos} set={set} />}
          {paso === 4 && <PasoSelfie datos={datos} set={set} />}
          {paso === 5 && <PasoCedula datos={datos} set={set} />}
          {paso === 6 && <PasoBancarios datos={datos} set={set} />}
          {paso === 7 && <PasoBiometria usuario={usuario} bioSoportado={bioSoportadoState} />}
          {paso === 8 && (
            <InstructivoInstalar
              modo="wizard"
              onListo={finalizar}
              onMasTarde={finalizar}
            />
          )}

          {error && (
            <div className="mt-4 bg-red-950/50 border border-red-800 px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-300">{error}</div>
            </div>
          )}

          {/* Paso 8 maneja sus propios botones (Más tarde / Ya lo hice) */}
          {paso !== 8 && (
            <div className="flex gap-2 mt-5">
              {paso > 1 && (
                <button
                  onClick={anterior}
                  disabled={guardando}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold uppercase tracking-wider py-3 flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
              )}
              <button
                onClick={siguiente}
                disabled={guardando}
                className="flex-[2] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black tracking-wider uppercase py-3 flex items-center justify-center gap-1"
              >
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {paso === 8 && guardando && (
            <div className="mt-3 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BarraPasos({ paso, total }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div
          key={n}
          className={`flex-1 h-1.5 ${n <= paso ? 'bg-red-600' : 'bg-zinc-800'}`}
        />
      ))}
    </div>
  );
}

function PasoBienvenida({ usuario }) {
  const primerNombre = usuario.nombre.split(' ')[0];
  return (
    <div className="text-center py-4">
      <div className="text-4xl mb-3">👋</div>
      <h2 className="text-2xl font-black mb-2">Hola {primerNombre}</h2>
      <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
        Bienvenido al app de Super Techos. Antes de empezar, necesitamos completar tu perfil.
      </p>
      <div className="bg-zinc-950 border border-zinc-800 p-3 text-left text-xs text-zinc-400 space-y-1.5">
        <div>📋 Datos personales y de contacto</div>
        <div>📸 Tu foto y la de tu cédula</div>
        <div>🏦 Cuenta bancaria para pagos</div>
        <div>🔐 Activar Face ID o huella (opcional)</div>
      </div>
      <p className="text-[10px] text-zinc-500 mt-4 leading-relaxed">
        Toda la información es confidencial y solo la verá el administrador.
      </p>
    </div>
  );
}

function PasoDatosPersonales({ datos, set }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-black mb-1">Tus datos</h2>
      <Field label="Cédula">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={formatearCedula(datos.cedulaNumero)}
          onChange={e => set('cedulaNumero', e.target.value)}
          placeholder="402-1234567-8"
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white tracking-wider"
        />
      </Field>
      <Field label="Fecha de nacimiento">
        <input
          type="date"
          value={datos.fechaNacimiento}
          onChange={e => set('fechaNacimiento', e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
        />
      </Field>
      <Field label="Dirección de residencia">
        <textarea
          value={datos.direccion}
          onChange={e => set('direccion', e.target.value)}
          placeholder="Calle, sector, ciudad"
          rows={2}
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-2 text-white"
        />
      </Field>
      <Field label="Tipo de sangre (opcional)">
        <select
          value={datos.tipoSangre}
          onChange={e => set('tipoSangre', e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
        >
          <option value="">— Seleccionar —</option>
          {TIPOS_SANGRE.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  );
}

function PasoContacto({ datos, set }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-black mb-1">Contacto</h2>
      <Field label="Tu WhatsApp" hint="Te enviaremos avisos del trabajo">
        <input
          type="tel"
          inputMode="numeric"
          value={formatearTelefono(datos.whatsapp)}
          onChange={e => set('whatsapp', e.target.value)}
          placeholder="809-555-1234"
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white tracking-wider"
        />
      </Field>

      <div className="border-t border-zinc-800 pt-3 mt-3">
        <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-2">
          ⚠️ Contacto de emergencia
        </div>
        <div className="text-[10px] text-zinc-500 mb-3">A quién llamar si pasa algo en la obra.</div>

        <div className="space-y-3">
          <Field label="Nombre completo">
            <input
              type="text"
              value={datos.contactoEmergenciaNombre}
              onChange={e => set('contactoEmergenciaNombre', e.target.value)}
              placeholder="María Pérez"
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
            />
          </Field>
          <Field label="Teléfono">
            <input
              type="tel"
              inputMode="numeric"
              value={formatearTelefono(datos.contactoEmergenciaTelefono)}
              onChange={e => set('contactoEmergenciaTelefono', e.target.value)}
              placeholder="809-555-1234"
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white tracking-wider"
            />
          </Field>
          <Field label="Relación contigo">
            <select
              value={datos.contactoEmergenciaRelacion}
              onChange={e => set('contactoEmergenciaRelacion', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
            >
              <option value="">— Seleccionar —</option>
              {RELACIONES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function PasoSelfie({ datos, set }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-black">Tu foto</h2>
        <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 tracking-wider uppercase font-bold">Opcional</span>
      </div>
      <p className="text-xs text-zinc-400 mb-2">
        Tómate un selfie con buena luz. Si ahora no es buen momento, puedes saltarlo y subirlo después desde tu perfil.
      </p>
      <CapturaFoto
        valor={datos.foto2x2}
        onCapturar={(d) => set('foto2x2', d)}
        label="Tomar selfie o subir del carrete"
      />
    </div>
  );
}

function PasoCedula({ datos, set }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-black">Tu cédula</h2>
        <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 tracking-wider uppercase font-bold">Opcional</span>
      </div>
      <p className="text-xs text-zinc-400 mb-2">
        Toma fotos de ambos lados de tu cédula sobre una superficie plana. Si no la tienes a mano, puedes subirlas más tarde desde tu perfil.
      </p>
      <div className="space-y-3">
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Frente</div>
          <CapturaFoto
            valor={datos.cedulaFrente}
            onCapturar={(d) => set('cedulaFrente', d)}
            label="Foto del frente"
          />
        </div>
        <div>
          <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Reverso</div>
          <CapturaFoto
            valor={datos.cedulaReverso}
            onCapturar={(d) => set('cedulaReverso', d)}
            label="Foto del reverso"
          />
        </div>
      </div>
    </div>
  );
}

function PasoBancarios({ datos, set }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-black mb-1">Cuenta bancaria</h2>
      <p className="text-xs text-zinc-400 mb-2">
        Aquí depositaremos tus pagos quincenales y tu caja chica.
      </p>
      <Field label="Banco">
        <select
          value={datos.banco}
          onChange={e => set('banco', e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
        >
          <option value="">— Seleccionar —</option>
          {BANCOS_RD.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Tipo de cuenta">
        <div className="grid grid-cols-2 gap-2">
          {['Ahorros', 'Corriente'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => set('bancoTipoCuenta', t.toLowerCase())}
              className={`py-3 font-bold uppercase text-sm border-2 ${datos.bancoTipoCuenta === t.toLowerCase() ? 'border-red-600 bg-red-950/30 text-white' : 'border-zinc-700 bg-zinc-950 text-zinc-400'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Número de cuenta">
        <input
          type="text"
          inputMode="numeric"
          value={datos.bancoNumeroCuenta}
          onChange={e => set('bancoNumeroCuenta', e.target.value.replace(/\D/g, '').slice(0, 20))}
          placeholder="000000000000"
          className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white font-mono tracking-wider"
        />
      </Field>

      <label className="flex items-start gap-2 mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={datos.titularEsOtro}
          onChange={e => set('titularEsOtro', e.target.checked)}
          className="mt-1 accent-red-600"
        />
        <div className="text-xs text-zinc-300">La cuenta está a nombre de otra persona</div>
      </label>

      {datos.titularEsOtro && (
        <div className="space-y-3 bg-zinc-950 border border-zinc-800 p-3">
          <Field label="Nombre del titular">
            <input
              type="text"
              value={datos.bancoTitularNombre}
              onChange={e => set('bancoTitularNombre', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white"
            />
          </Field>
          <Field label="Cédula del titular">
            <input
              type="text"
              inputMode="numeric"
              value={formatearCedula(datos.bancoTitularCedula)}
              onChange={e => set('bancoTitularCedula', e.target.value)}
              placeholder="402-1234567-8"
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-red-600 outline-none px-3 py-3 text-white tracking-wider"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function PasoBiometria({ usuario, bioSoportado }) {
  const [registrado, setRegistrado] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [errorBio, setErrorBio] = useState('');

  const activar = async () => {
    setRegistrando(true); setErrorBio('');
    try {
      await registrarBiometria(usuario.id, usuario.nombre);
      setRegistrado(true);
    } catch (e) {
      setErrorBio(e.message || 'No se pudo activar');
    }
    setRegistrando(false);
  };

  if (!bioSoportado) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-2">✅</div>
        <h2 className="text-lg font-black mb-2">¡Casi listo!</h2>
        <p className="text-sm text-zinc-300">
          Tu dispositivo no tiene Face ID ni huella, pero puedes seguir usando tu PIN para entrar.
        </p>
        <p className="text-xs text-zinc-500 mt-3">
          Toca <span className="font-bold text-green-400">Finalizar</span> para empezar a usar el app.
        </p>
      </div>
    );
  }

  if (registrado) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-2">🎉</div>
        <h2 className="text-lg font-black mb-2">Face ID activado</h2>
        <p className="text-sm text-zinc-300">
          La próxima vez podrás entrar al app con un toque, sin teclear tu PIN.
        </p>
        <p className="text-xs text-zinc-500 mt-3">
          Toca <span className="font-bold text-green-400">Finalizar</span> para terminar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-2">
          <ShieldCheck className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-black">Activa Face ID o huella</h2>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          Usa tu rostro o huella en lugar del PIN. Más rápido y más seguro: tu PIN se queda solo en este dispositivo.
        </p>
      </div>

      {errorBio && (
        <div className="bg-red-950/50 border border-red-800 px-3 py-2 text-xs text-red-300 text-center">
          {errorBio}
        </div>
      )}

      <button
        onClick={activar}
        disabled={registrando}
        className="w-full bg-gradient-to-br from-red-600 to-red-800 hover:brightness-110 disabled:opacity-50 text-white font-black uppercase tracking-widest py-4 flex items-center justify-center gap-2"
      >
        {registrando ? <Loader2 className="w-5 h-5 animate-spin" /> : '🔐'}
        {registrando ? 'Activando...' : 'Activar Face ID / Huella'}
      </button>

      <div className="text-[10px] text-zinc-500 text-center">
        Es opcional. Puedes saltarlo y seguir con tu PIN.
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

function CapturaFoto({ valor, onCapturar, label }) {
  const [cargando, setCargando] = useState(false);
  const inputId = 'foto_' + label.replace(/\s/g, '_');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    try {
      const dataUrl = await comprimirImagen(file, 1200, 0.7);
      onCapturar(dataUrl);
    } catch (err) {
      console.error(err);
      alert('Error procesando la imagen');
    }
    setCargando(false);
    e.target.value = '';
  };

  return (
    <div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
      />
      {valor ? (
        <div className="relative">
          <img src={valor} alt={label} className="w-full max-h-72 object-contain bg-black border border-zinc-800" />
          <label htmlFor={inputId} className="absolute bottom-2 right-2 bg-zinc-900/90 hover:bg-zinc-800 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-2 cursor-pointer flex items-center gap-1">
            <Camera className="w-3 h-3" /> Cambiar
          </label>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="block w-full bg-zinc-950 border-2 border-dashed border-zinc-700 hover:border-red-600 cursor-pointer p-8 text-center"
        >
          {cargando ? (
            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mx-auto" />
          ) : (
            <>
              <Camera className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <div className="text-xs text-zinc-300 font-bold uppercase tracking-widest">{label}</div>
            </>
          )}
        </label>
      )}
    </div>
  );
}
