'use client';

// v8.14: Instructivo visual para "agregar a pantalla de inicio".
// Detecta plataforma (iOS Safari, iOS Chrome, Android Chrome, otros) y
// muestra pasos específicos. Si la app ya está abierta como PWA standalone,
// muestra un mensaje de éxito.
//
// Se usa en dos lugares:
// - Como paso del WizardOnboarding (con onListo/onMasTarde).
// - Como página pública /instalar (sin callbacks, modo standalone-detect).

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';

const detectarPlataforma = () => {
  if (typeof window === 'undefined') return { id: 'desconocida' };
  const ua = navigator.userAgent || '';
  const esIOS = /iPhone|iPad|iPod/.test(ua);
  const esAndroid = /Android/.test(ua);
  const esChromeIOS = esIOS && /CriOS/.test(ua);
  const esFirefoxIOS = esIOS && /FxiOS/.test(ua);
  const esSafariIOS = esIOS && !esChromeIOS && !esFirefoxIOS;
  const esChromeAndroid = esAndroid && /Chrome/.test(ua) && !/SamsungBrowser/.test(ua);
  const esSamsungAndroid = esAndroid && /SamsungBrowser/.test(ua);

  if (esSafariIOS) return { id: 'ios_safari', nombre: 'iPhone (Safari)' };
  if (esChromeIOS || esFirefoxIOS) return { id: 'ios_otro', nombre: 'iPhone (otro navegador)' };
  if (esIOS) return { id: 'ios_otro', nombre: 'iPhone' };
  if (esChromeAndroid) return { id: 'android_chrome', nombre: 'Android (Chrome)' };
  if (esSamsungAndroid) return { id: 'android_samsung', nombre: 'Android (Samsung Browser)' };
  if (esAndroid) return { id: 'android_otro', nombre: 'Android' };
  return { id: 'desktop', nombre: 'Computadora' };
};

const yaInstalada = () => {
  if (typeof window === 'undefined') return false;
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );
};

export default function InstructivoInstalar({ onListo, onMasTarde, modo = 'wizard' }) {
  const [plataforma, setPlataforma] = useState({ id: 'detectando' });
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    setPlataforma(detectarPlataforma());
    setInstalada(yaInstalada());
  }, []);

  if (instalada) {
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-9 h-9 text-white" />
        </div>
        <h2 className="text-xl font-black mb-2">Ya tienes la app instalada</h2>
        <p className="text-sm text-zinc-300">
          Estás abriendo Super Techos como app. ¡Listo!
        </p>
        {modo === 'wizard' && onListo && (
          <button
            onClick={onListo}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wider py-3 px-6"
          >
            Continuar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-14 h-14 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-2">
          <Smartphone className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-black">Agrega Super Techos a tu pantalla</h2>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
          Que se vea y se sienta como una app de verdad — más rápida, sin barra del navegador.
        </p>
      </div>

      <PasosPorPlataforma plataforma={plataforma.id} />

      {modo === 'wizard' && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={onMasTarde}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase text-xs py-3"
          >
            Más tarde
          </button>
          <button
            onClick={onListo}
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider text-xs py-3"
          >
            Ya lo hice
          </button>
        </div>
      )}

      <div className="text-[10px] text-zinc-500 text-center mt-3">
        ¿Tienes problemas? Pídele al supervisor que te ayude la primera vez.
      </div>
    </div>
  );
}

function PasosPorPlataforma({ plataforma }) {
  if (plataforma === 'detectando') {
    return <div className="text-center text-xs text-zinc-500 py-4">Detectando tu dispositivo…</div>;
  }
  if (plataforma === 'ios_safari') return <PasosIOSSafari />;
  if (plataforma === 'ios_otro') return <AvisoIOSChrome />;
  if (plataforma === 'android_chrome') return <PasosAndroidChrome />;
  if (plataforma === 'android_samsung') return <PasosAndroidSamsung />;
  if (plataforma === 'android_otro') return <PasosAndroidGenerico />;
  if (plataforma === 'desktop') return <PasosDesktop />;
  return <PasosAndroidGenerico />;
}

function Paso({ numero, children }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 w-7 h-7 bg-red-600 text-white font-black flex items-center justify-center text-sm">
        {numero}
      </div>
      <div className="flex-1 text-sm text-zinc-200 leading-relaxed pt-0.5">{children}</div>
    </div>
  );
}

// SVG inline del icono "Compartir" de iOS (cuadrado con flecha arriba)
function IconoCompartirIOS({ className = 'w-4 h-4 inline-block' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function IconoMasCuadrado({ className = 'w-4 h-4 inline-block' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function IconoTresPuntos({ className = 'w-4 h-4 inline-block' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function PasosIOSSafari() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <Paso numero="1">
        Toca el botón <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700">
          <IconoCompartirIOS /> Compartir
        </span> que está abajo en el centro.
      </Paso>
      <Paso numero="2">
        Desliza hacia abajo y toca <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700">
          <IconoMasCuadrado /> Añadir a pantalla de inicio
        </span>.
      </Paso>
      <Paso numero="3">
        Toca <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Añadir</span> arriba a la derecha. El ícono rojo de Super Techos aparecerá en tu pantalla.
      </Paso>
    </div>
  );
}

function AvisoIOSChrome() {
  return (
    <div className="bg-yellow-950/30 border border-yellow-800 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-100">
          <strong>En iPhone solo se puede instalar desde Safari.</strong>
        </div>
      </div>
      <div className="text-xs text-yellow-200/80 leading-relaxed">
        Sal de este navegador, abre <strong>Safari</strong> y vuelve a entrar al mismo link.
        Después sigue los 3 pasos para añadirlo a tu pantalla.
      </div>
    </div>
  );
}

function PasosAndroidChrome() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <Paso numero="1">
        Toca los <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700">
          <IconoTresPuntos /> tres puntos
        </span> arriba a la derecha.
      </Paso>
      <Paso numero="2">
        Toca <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Instalar app</span> o <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Añadir a pantalla principal</span>.
      </Paso>
      <Paso numero="3">
        Confirma <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Instalar</span>. El ícono rojo aparecerá en tu menú de apps.
      </Paso>
    </div>
  );
}

function PasosAndroidSamsung() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <Paso numero="1">
        Toca el menú <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-mono">≡</span> abajo a la derecha (Samsung Internet).
      </Paso>
      <Paso numero="2">
        Toca <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Añadir página a</span>, luego <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Pantalla principal</span>.
      </Paso>
      <Paso numero="3">
        Confirma <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700 font-bold">Añadir</span>.
      </Paso>
    </div>
  );
}

function PasosAndroidGenerico() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <Paso numero="1">
        Busca el menú de tu navegador (<span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700"><IconoTresPuntos /></span> o <span className="font-mono">≡</span>).
      </Paso>
      <Paso numero="2">
        Busca la opción <strong>Añadir a pantalla principal</strong>, <strong>Instalar app</strong> o similar.
      </Paso>
      <Paso numero="3">Confirma. Si no la encuentras, abre la página en <strong>Chrome</strong>.</Paso>
    </div>
  );
}

function PasosDesktop() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 space-y-3">
      <Paso numero="1">
        En la barra de direcciones de Chrome o Edge, busca el ícono <span className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 border border-zinc-700">
          <IconoMasCuadrado /> Instalar
        </span> a la derecha del URL.
      </Paso>
      <Paso numero="2">
        Toca <strong>Instalar</strong>.
      </Paso>
      <Paso numero="3">La app se abrirá en su propia ventana, sin pestañas.</Paso>
    </div>
  );
}
