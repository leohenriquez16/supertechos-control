'use client';

// v8.14: Página pública /instalar — el admin puede compartir este link
// junto con la invitación. Detecta plataforma y muestra los pasos.

import React from 'react';
import Link from 'next/link';
import InstructivoInstalar from '../../components/onboarding/InstructivoInstalar';

export default function PaginaInstalar() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-red-600 flex items-center justify-center font-black text-white text-xl mb-2" style={{ transform: 'skewX(-12deg)' }}>
            <span style={{ transform: 'skewX(12deg)' }}>ST</span>
          </div>
          <div className="font-black tracking-tight text-xl">SUPER TECHOS</div>
          <div className="text-[10px] text-zinc-500 tracking-widest uppercase">Cómo instalar la app</div>
        </div>

        <div className="bg-zinc-900 border-2 border-zinc-800 p-5">
          <InstructivoInstalar modo="publico" />
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="inline-block text-xs text-zinc-400 hover:text-white tracking-widest uppercase border border-zinc-700 hover:border-red-600 px-4 py-2">
            ← Volver al inicio
          </Link>
        </div>

        <div className="text-[10px] text-zinc-600 text-center mt-6 leading-relaxed">
          ¿No funciona? Pídele a tu supervisor o al administrador que te ayude. La primera vez puede ser un poco confuso, pero después abres la app de un toque.
        </div>
      </div>
    </div>
  );
}
