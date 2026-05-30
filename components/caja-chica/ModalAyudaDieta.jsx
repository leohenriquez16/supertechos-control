'use client';

import React, { useState } from 'react';
import { X, UtensilsCrossed, Bed, AlertTriangle, CheckCircle2, FileText, Building2, Users } from 'lucide-react';
import { formatNum } from '../../lib/helpers/formato';

// v8.17.29 — Manual de uso de Dieta + Hospedaje
// Dos vistas:
//   - "maestro": cómo reportar y leer su tarjeta de Dieta del mes.
//   - "admin":   cómo interpretar la caja y manejar excepciones.
// Empieza en la vista pedida y permite cambiar (útil para admins curiosos).

export default function ModalAyudaDieta({ vista = 'maestro', configDieta, onCerrar }) {
  const [tab, setTab] = useState(vista);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border-2 border-orange-600 rounded-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-orange-400" />
            <div>
              <div className="text-xs tracking-widest uppercase text-orange-400 font-bold">Manual de Dieta + Hospedaje</div>
              <div className="text-[10px] text-zinc-500">Cómo funciona el presupuesto fijo de comida y hotel</div>
            </div>
          </div>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-zinc-800">
          <button
            onClick={() => setTab('maestro')}
            className={`p-3 text-xs font-bold uppercase tracking-wider ${tab === 'maestro' ? 'bg-orange-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
          >
            <Users className="w-3 h-3 inline mr-1" /> Maestro / Supervisor
          </button>
          <button
            onClick={() => setTab('admin')}
            className={`p-3 text-xs font-bold uppercase tracking-wider ${tab === 'admin' ? 'bg-orange-700 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
          >
            <Building2 className="w-3 h-3 inline mr-1" /> Oficina / Admin
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-sm">
          {tab === 'maestro' ? (
            <VistaMaestro configDieta={configDieta} />
          ) : (
            <VistaAdmin configDieta={configDieta} />
          )}
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-3">
          <button onClick={onCerrar} className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase py-2.5">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function VistaMaestro({ configDieta }) {
  const cd = configDieta || { desayunoRd: 200, comidaRd: 350, cenaRd: 350, hotelRd: 900 };
  return (
    <>
      <Seccion titulo="¿Qué es la dieta?" icono="🍽">
        <p>
          Cuando trabajas en un proyecto del <b>interior</b>, la empresa te paga un <b>presupuesto fijo</b> de comida y, si aplica, hotel.
        </p>
        <p>
          Esto sustituye al sistema viejo donde guardabas todas las facturas: ahora la empresa ya te dio el dinero por adelantado (en tu caja chica) y tú decides cómo gastarlo.
        </p>
      </Seccion>

      <Seccion titulo="Montos por día" icono="💵">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Monto label="🥐 Desayuno" valor={cd.desayunoRd} color="orange" />
          <Monto label="🍽 Comida"   valor={cd.comidaRd}   color="orange" />
          <Monto label="🌙 Cena"     valor={cd.cenaRd}     color="orange" />
          <Monto label="🛏 Hotel"    valor={cd.hotelRd}    color="purple" />
        </div>
        <p className="text-[10px] text-zinc-500 italic">Estos montos los fija la oficina y pueden cambiar.</p>
      </Seccion>

      <Seccion titulo="¿Cómo lo reporto?" icono="📲">
        <ol className="list-decimal list-inside space-y-1.5 text-xs">
          <li><b>Al cerrar la jornada del día</b>, marca qué comió cada miembro del equipo y si durmieron en hotel.</li>
          <li>Cada marca <b>debita el monto fijo</b> de la caja chica del <b>responsable</b> (típicamente el maestro). Los ayudantes no tienen caja propia.</li>
          <li><b>NO necesitas factura</b> para esos consumos — el presupuesto ya cubre.</li>
          <li>Si tienes factura de comida o hotel del interior, repórtala como gasto normal con foto. Si la categoría está marcada como "dieta" u "hospedaje", la oficina sabrá que descontó del presupuesto.</li>
        </ol>
      </Seccion>

      <Seccion titulo="Dieta del equipo, no individual" icono="👥">
        <p>
          El presupuesto de dieta/hospedaje se le da al <b>responsable de caja</b> (maestro o
          supervisor con caja chica habilitada) y cubre al <b>equipo completo</b> asignado al
          proyecto. Cuando marcas comidas al cerrar la jornada, se debita una vez por persona
          desde la misma caja del responsable. El concepto del movimiento dice quién comió.
        </p>
      </Seccion>

      <Seccion titulo="La diferencia es del responsable de caja" icono="✨">
        <div className="bg-green-950/50 border border-green-900/50 p-3 text-xs space-y-1">
          <div className="flex items-center gap-1 text-green-300 font-bold"><CheckCircle2 className="w-3 h-3" /> Sobró presupuesto</div>
          <p>Si el equipo comió por menos del presupuesto, la diferencia <b>se queda con el responsable de caja</b>. La oficina ya le entregó esa plata.</p>
        </div>
        <div className="bg-red-950/50 border border-red-900/50 p-3 text-xs space-y-1">
          <div className="flex items-center gap-1 text-red-300 font-bold"><AlertTriangle className="w-3 h-3" /> Se pasaron</div>
          <p>Si las facturas exceden el presupuesto, habla con la oficina <b>antes de exigir reembolso</b>. Caso por caso: lluvia que cierra opciones baratas, cliente que extendió la jornada, etc.</p>
        </div>
      </Seccion>

      <Seccion titulo="Atajos en la app" icono="🧭">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li>En "Mi Caja Chica" verás el bloque <b>Dieta + Hospedaje · este mes</b>: presupuesto, consumido y holgura.</li>
          <li>En cada factura que pertenece a una categoría de dieta/hospedaje verás el badge correspondiente (🍽 Dieta / 🛏 Hospedaje).</li>
          <li>Si te equivocaste al marcar (no tomaste la comida marcada), pídele a la oficina que lo ajuste — solo el admin puede borrar marcas ya aprobadas.</li>
        </ul>
      </Seccion>
    </>
  );
}

function VistaAdmin({ configDieta }) {
  const cd = configDieta || { desayunoRd: 200, comidaRd: 350, cenaRd: 350, hotelRd: 900 };
  return (
    <>
      <Seccion titulo="Configuración" icono="🔧">
        <p>
          v8.17.47 — La dieta es del <b>equipo</b>, no de cada persona individual.
          Se debita de la caja chica del responsable (maestro o supervisor con caja).
        </p>
        <div className="bg-zinc-950 border border-zinc-800 rounded-card p-2 text-xs space-y-1">
          <div><b>Proyecto → toggle:</b> <code>aplica_dieta</code> / <code>aplica_hospedaje</code> (en proyectos del interior).</div>
          <div><b>Personal → toggle:</b> <code>caja_chica_habilitada</code> en el maestro o supervisor del proyecto (es la caja desde donde se debita).</div>
          <div className="text-[10px] text-zinc-500 italic">El equipo completo (incluyendo ayudantes) puede recibir dieta — no hace falta que cada uno tenga su propio toggle.</div>
        </div>
      </Seccion>

      <Seccion titulo="Flujo del lado de la oficina" icono="📋">
        <ol className="list-decimal list-inside space-y-1.5 text-xs">
          <li>Configura los montos por desayuno/comida/cena/hotel en <b>Caja Chica → Categorías → Montos de dieta</b>.</li>
          <li>Marca categorías de gasto que <b>cuentan a dieta u hospedaje</b> con el dropdown "Cuenta a presupuesto de…".</li>
          <li>Activa <code>aplica_dieta</code> / <code>aplica_hospedaje</code> en cada proyecto del interior.</li>
          <li>Activa <code>dieta_habilitada</code> / <code>hospedaje_habilitado</code> en cada persona elegible.</li>
          <li>El maestro marca las comidas al cerrar jornada — los movimientos entran a su caja chica <b>ya aprobados</b>.</li>
        </ol>
      </Seccion>

      <Seccion titulo="Cómo leer la caja del maestro" icono="🔍">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li>Los <b>créditos de presupuesto</b> aparecen como movimientos tipo <code>dieta</code>/<code>hospedaje</code> con <code>sub_tipo</code> (desayuno, comida, cena, hotel).</li>
          <li>Las <b>facturas que descuentan</b> aparecen como <code>gasto_factura</code> con badge 🍽/🛏 (categoría con <code>aplica_a</code>).</li>
          <li>La <b>holgura</b> (presupuesto − consumido) se muestra en la tarjeta del mes del maestro y en su detalle desde la vista de admin.</li>
          <li>Si la holgura es positiva, el maestro se queda con la diferencia. Si es negativa, decide caso por caso si reembolsar o cuestionar.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Excepciones comunes" icono="⚠">
        <ul className="list-disc list-inside text-xs space-y-1.5">
          <li><b>Maestro marcó una comida que no tomó:</b> abre el movimiento en su caja y elimínalo (es un crédito de dieta, no una factura).</li>
          <li><b>Factura de comida en un proyecto sin dieta:</b> reembolso normal — el badge no aparece.</li>
          <li><b>Factura mucho más cara que el monto fijo:</b> el badge sigue marcando que descuenta del presupuesto. La holgura negativa avisa. Habla con el maestro.</li>
          <li><b>Cambio de monto histórico:</b> los movimientos viejos mantienen su monto original. El cambio solo afecta marcas nuevas.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Montos actuales configurados" icono="💵">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Monto label="🥐 Desayuno" valor={cd.desayunoRd} color="orange" />
          <Monto label="🍽 Comida"   valor={cd.comidaRd}   color="orange" />
          <Monto label="🌙 Cena"     valor={cd.cenaRd}     color="orange" />
          <Monto label="🛏 Hotel"    valor={cd.hotelRd}    color="purple" />
        </div>
      </Seccion>
    </>
  );
}

function Seccion({ titulo, icono, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] tracking-widest uppercase text-orange-400 font-bold border-b border-zinc-800 pb-1">
        {icono} {titulo}
      </div>
      <div className="space-y-2 text-zinc-300">{children}</div>
    </div>
  );
}

function Monto({ label, valor, color }) {
  const cls = color === 'purple'
    ? 'bg-purple-950/50 border-purple-900/50 text-purple-200'
    : 'bg-orange-950/50 border-orange-900/50 text-orange-200';
  return (
    <div className={`${cls} border p-2 text-center`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-black">RD$ {formatNum(valor, 0)}</div>
    </div>
  );
}
