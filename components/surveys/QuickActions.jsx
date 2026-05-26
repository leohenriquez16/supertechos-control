'use client';

// v8.19.2: Botones de acción rápida para un site.
// - Llamar (tel:)
// - WhatsApp (mensaje pre-llenado)
// - Google Maps (lat,lng)
// - Waze (lat,lng)
//
// Recibe site + meta del proyecto (servicio + empresa) para construir
// el mensaje de WhatsApp contextual.

import React from 'react';
import { Phone, MessageCircle, Map, Navigation } from 'lucide-react';
import { COMPANIES, SERVICE_LINES } from '../../lib/surveys';

const SERVICE_DISPLAY = {
  paint: 'pintura',
  waterproofing: 'impermeabilización',
  thermal_insulation: 'aislamiento térmico',
  epoxy_floor: 'instalación de piso',
  urethane_cement: 'instalación de piso uretano-cemento',
  concrete_polishing: 'pulido de concreto',
  concrete_repair: 'reparación de concreto',
  other: 'servicio',
};

function normalizarTelefonoUrl(tel) {
  // Remueve todo lo que no es dígito. Espera 10 dígitos RD; agrega 1 para wa.me.
  const digitos = String(tel || '').replace(/\D/g, '');
  if (digitos.length === 10) return '1' + digitos;
  if (digitos.length === 11 && digitos.startsWith('1')) return digitos;
  return digitos;
}

export default function QuickActions({ site, proyecto, surveyorNombre }) {
  const tieneGeo = site.latitude != null && site.longitude != null;
  const telMovil = (site.mobile_phone || '').replace(/\D/g, '');
  const telOficina = (site.office_phone || '').replace(/\D/g, '');
  const tel = telMovil || telOficina;

  const empresaLabel = COMPANIES[proyecto?.company] || 'Super Techos';
  const servicioLabel = SERVICE_DISPLAY[proyecto?.service_line] || 'levantamiento';
  const nombreLevantador = surveyorNombre || 'el equipo de Super Techos';

  const mensajeWa = `Buenos días, soy ${nombreLevantador} de ${empresaLabel}.\nEstoy coordinando el levantamiento previo a ${servicioLabel} en ${site.name}. ¿Tiene disponibilidad para confirmar fecha y hora?`;

  const waNumero = normalizarTelefonoUrl(telMovil || telOficina);
  const waUrl = waNumero
    ? `https://wa.me/${waNumero}?text=${encodeURIComponent(mensajeWa)}`
    : null;

  const mapsUrl = tieneGeo
    ? `https://www.google.com/maps?q=${site.latitude},${site.longitude}`
    : null;

  const wazeUrl = tieneGeo
    ? `https://waze.com/ul?ll=${site.latitude},${site.longitude}&navigate=yes`
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <ActionButton
        icon={Phone}
        label="Llamar"
        disabled={!tel}
        href={tel ? `tel:${tel}` : null}
        title={tel ? `Llamar a ${tel}` : 'Sin teléfono'}
      />
      <ActionButton
        icon={MessageCircle}
        label="WhatsApp"
        disabled={!waUrl}
        href={waUrl}
        external
        color="#25d366"
        title={waUrl ? 'Abrir WhatsApp con mensaje' : 'Sin teléfono móvil'}
      />
      <ActionButton
        icon={Map}
        label="Maps"
        disabled={!mapsUrl}
        href={mapsUrl}
        external
        color="#4285f4"
        title={mapsUrl ? 'Abrir en Google Maps' : 'Sin georef'}
      />
      <ActionButton
        icon={Navigation}
        label="Waze"
        disabled={!wazeUrl}
        href={wazeUrl}
        external
        color="#33ccff"
        title={wazeUrl ? 'Navegar con Waze' : 'Sin georef'}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label, href, disabled, external, color, title }) {
  const baseStyle = disabled
    ? 'bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed'
    : 'bg-zinc-900 border-zinc-700 hover:border-red-600 text-zinc-100';

  if (disabled || !href) {
    return (
      <div
        className={`${baseStyle} border p-3 flex flex-col items-center gap-1 text-center transition-colors`}
        title={title}
      >
        <Icon className="w-5 h-5" style={{ color: disabled ? undefined : color }} />
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`${baseStyle} border p-3 flex flex-col items-center gap-1 text-center transition-colors`}
      title={title}
    >
      <Icon className="w-5 h-5" style={{ color }} />
      <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
    </a>
  );
}
