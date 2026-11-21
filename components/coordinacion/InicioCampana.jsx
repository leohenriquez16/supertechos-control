'use client';

// v8.96.0 — Pantalla completa del TÉCNICO DE CAMPAÑA (rol exclusivo «campana», ej. técnicos externos de Banreservas).
// Ve SOLO las oficinas que le asignan (hoy, para corregir, atrasadas y próximas) y abre el formulario a pantalla completa.
// Nada de Super Techos: ni proyectos, ni citas, ni reclamaciones, ni asistente.

import React, { useState } from 'react';
import TarjetaMisOficinasHoy from './TarjetaMisOficinasHoy';
import DynamicSurveyForm from '../surveys/DynamicSurveyForm';

export default function InicioCampana({ usuario }) {
  const [form, setForm] = useState(null); // { proyecto, site }
  const [recarga, setRecarga] = useState(0);
  const cerrar = () => { setForm(null); setRecarga((n) => n + 1); };
  const nombre = String(usuario?.nombre || '').trim().split(/\s+/)[0];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
      <div className="text-lg font-black">Hola{nombre ? `, ${nombre}` : ''}</div>
      <TarjetaMisOficinasHoy key={recarga} usuario={usuario} mostrarVacio
        onAbrirOficina={(proyecto, site) => setForm({ proyecto, site })} />
      {form && (
        <DynamicSurveyForm site={form.site} proyecto={form.proyecto} usuario={usuario} onCerrar={cerrar} onCompletado={cerrar} />
      )}
    </div>
  );
}
