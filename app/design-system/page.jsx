'use client';

// Guía de estilo viva del ERP Super Techos.
// Documenta los tokens (tailwind.config) y los componentes/patrones reales
// del producto. Es la referencia única para mantener consistencia entre
// módulos y medir componentes nuevos. Ruta pública: /design-system
//
// Extraída del código real: lib tailwind.config.js + components/common/*.
// Cuando se conecte Claude Design (claude.ai/design), estos mismos bloques
// se suben como cards del design-system.

import React, { useState } from 'react';
import { Plus, Minimize2, Maximize2, X, Save } from 'lucide-react';
import Badge, { BadgeEmpresa } from '../../components/common/Badge';

const Label = ({ children }) => (
  <div className="text-[11px] tracking-[0.18em] uppercase text-zinc-400 font-bold mb-3">{children}</div>
);

const Section = ({ n, title, children }) => (
  <section className="border-t border-zinc-800 pt-6 mt-6">
    <Label>{n} · {title}</Label>
    {children}
  </section>
);

const Swatch = ({ color, name, hex, border }) => (
  <div className="flex-1 min-w-[88px]">
    <div className="h-10 rounded-card" style={{ background: color, border: border ? '1px solid #27272a' : 'none' }} />
    <div className="text-[11px] mt-1 text-zinc-200">{name} {hex && <span className="text-zinc-500">{hex}</span>}</div>
  </div>
);

export default function DesignSystemPage() {
  const [densidad, setDensidad] = useState('compacto');
  const [precio, setPrecio] = useState('100.00');

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-5 py-8">

        {/* Encabezado */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-9 h-8 bg-red-600 text-white font-black text-sm rounded -skew-x-6">ST</span>
          <div>
            <div className="text-[15px] font-semibold tracking-wide">SUPER TECHOS</div>
            <div className="text-[11px] text-zinc-500 tracking-[0.18em]">DESIGN SYSTEM · guía viva</div>
          </div>
        </div>

        {/* 1 · Color tokens */}
        <Section n="1" title="Color tokens">
          <div className="text-[11px] text-zinc-500 mb-2">Marca</div>
          <div className="flex gap-2 flex-wrap mb-4">
            <Swatch color="#dc2626" name="brand" hex="#dc2626" />
            <Swatch color="#b91c1c" name="hover" hex="#b91c1c" />
            <Swatch color="#7f1d1d" name="soft" hex="#7f1d1d" />
          </div>
          <div className="text-[11px] text-zinc-500 mb-2">Superficies</div>
          <div className="flex gap-2 flex-wrap mb-4">
            <Swatch color="#09090b" name="base" border />
            <Swatch color="#18181b" name="card" border />
            <Swatch color="#1f1f23" name="elevated" border />
            <Swatch color="#27272a" name="border" />
          </div>
          <div className="text-[11px] text-zinc-500 mb-2">Estados de proyecto</div>
          <div className="flex gap-2 flex-wrap">
            <Swatch color="#06b6d4" name="aprobado" />
            <Swatch color="#3b82f6" name="planificado" />
            <Swatch color="#ef4444" name="ejecución" />
            <Swatch color="#eab308" name="parado" />
            <Swatch color="#f97316" name="pendiente" />
            <Swatch color="#22c55e" name="completo" />
          </div>
        </Section>

        {/* 2 · Botones */}
        <Section n="2" title="Botones">
          <div className="flex gap-3 flex-wrap items-center">
            <button className="bg-red-600 hover:bg-red-700 text-white rounded-card px-4 py-2.5 font-bold text-[13px] tracking-wide inline-flex items-center gap-1.5 transition-colors"><Plus className="w-4 h-4" /> Nuevo corte</button>
            <button className="bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-card px-4 py-2.5 font-medium text-[13px] hover:border-zinc-600 transition-colors">Secundario</button>
            <button className="bg-transparent text-zinc-400 border border-zinc-800 rounded-card px-4 py-2.5 text-[13px] hover:text-white transition-colors">Ghost</button>
            <button disabled className="bg-zinc-900 text-zinc-700 border border-zinc-800 rounded-card px-4 py-2.5 text-[13px] cursor-not-allowed">Deshabilitado</button>
          </div>
        </Section>

        {/* 3 · Badges */}
        <Section n="3" title="Badges">
          <div className="flex gap-2 flex-wrap items-center mb-3">
            <Badge tone="neutral">neutral</Badge>
            <Badge tone="brand">brand</Badge>
            <Badge tone="success">success</Badge>
            <Badge tone="info">info</Badge>
            <Badge tone="warning">warning</Badge>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] text-zinc-500 mr-1">Empresa:</span>
            <BadgeEmpresa empresa="super_techos" />
            <BadgeEmpresa empresa="prouco" />
            <span className="text-[11px] text-zinc-500 mx-1 ml-3">Pago:</span>
            <Badge tone="brand">M² fijo</Badge>
            <Badge tone="neutral">Tarea</Badge>
          </div>
        </Section>

        {/* 4 · Campo + Input + Toggle densidad */}
        <Section n="4" title="Campo + Input · Toggle densidad">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Precio por m²</div>
              <input value={precio} onChange={e => setPrecio(e.target.value)} className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-card focus:border-red-600 outline-none px-3 py-2.5 text-white placeholder-zinc-600 transition-colors" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-[11px] tracking-widest uppercase text-zinc-400 font-bold mb-1">Foco (rojo)</div>
              <input defaultValue="texto" className="w-full bg-zinc-900 border-2 border-red-600 rounded-card outline-none px-3 py-2.5 text-white transition-colors" />
            </div>
          </div>
          <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden mt-3">
            <button onClick={() => setDensidad('compacto')} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${densidad === 'compacto' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}><Minimize2 className="w-3 h-3" /> Compacto</button>
            <button onClick={() => setDensidad('detallado')} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${densidad === 'detallado' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}><Maximize2 className="w-3 h-3" /> Detallado</button>
          </div>
        </Section>

        {/* 5 · KPIs */}
        <Section n="5" title="Tarjetas KPI">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="bg-red-600 rounded-card p-3"><div className="text-[11px] text-red-200 tracking-wider font-bold">EN EJECUCIÓN</div><div className="text-2xl font-black leading-tight">16</div><div className="text-[11px] text-red-200">proyectos activos</div></div>
            <div className="bg-blue-600 rounded-card p-3"><div className="text-[11px] text-blue-200 tracking-wider font-bold">PERSONAL EN OBRA</div><div className="text-2xl font-black leading-tight">42</div><div className="text-[11px] text-blue-200">8 obras</div></div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-card p-3"><div className="text-[11px] text-zinc-500 tracking-wider font-bold">PRODUCCIÓN</div><div className="text-xl font-black leading-tight text-green-500">RD$1.9M</div><div className="text-[11px] text-zinc-600">este mes</div></div>
          </div>
        </Section>

        {/* 6 · Tarjeta de proyecto */}
        <Section n="6" title="Tarjeta de proyecto">
          <div className="bg-zinc-900 border border-zinc-800 border-l-[3px] rounded-r-card p-3" style={{ borderLeftColor: '#06b6d4' }}>
            <div className="flex justify-between items-center mb-0.5"><span className="text-[11px] text-zinc-500">PG-C1247</span><BadgeEmpresa empresa="super_techos" /></div>
            <div className="text-sm font-medium">IUSBEL CONSTRUCTIONS</div>
            <div className="text-[11px] text-zinc-500 mb-2">San Francisco Piso Aséptico Z2N1</div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5"><div className="h-full bg-green-500" style={{ width: '62%' }} /></div>
            <div className="flex justify-between items-center"><span className="text-green-500 font-bold text-[13px]">RD$119,376.82 <span className="text-[10px] text-zinc-600">cot</span></span><span className="text-[11px] text-zinc-400">20d · Adrian</span></div>
          </div>
        </Section>

        {/* 7 · Fila de tabla editable */}
        <Section n="7" title="Fila de tabla (editable inline)">
          <div className="bg-zinc-900 border border-zinc-800 rounded-card overflow-hidden">
            <div className="grid gap-2 px-2.5 py-2 bg-zinc-950 text-[10px] tracking-wider text-zinc-500 font-bold" style={{ gridTemplateColumns: '64px 1fr 70px 96px' }}>
              <span>REF</span><span>CLIENTE</span><span>M²</span><span>MAESTRO</span>
            </div>
            {[['ST-C5391', 'Banco de Reservas', '450', 'Gerardo', false], ['PG-C0746', 'C&A Consulting', '634', '— Sin —', true]].map(([ref, cli, m2, maestro, alt]) => (
              <div key={ref} className={`grid gap-2 px-2.5 py-2.5 items-center border-t border-zinc-800 text-xs ${alt ? 'bg-zinc-800/40' : ''}`} style={{ gridTemplateColumns: '64px 1fr 70px 96px' }}>
                <span className="text-zinc-500">{ref}</span><span>{cli}</span><span>{m2}</span>
                <select defaultValue={maestro} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-white text-[11px]"><option>{maestro}</option></select>
              </div>
            ))}
          </div>
        </Section>

        {/* 8 · Modal */}
        <Section n="8" title="Modal">
          <div className="rounded-card flex items-center justify-center p-4" style={{ minHeight: 200, background: 'rgba(0,0,0,0.55)' }}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-card w-full max-w-[340px] overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800"><span className="font-medium text-sm">Editar proyecto</span><X className="w-4 h-4 text-zinc-500" /></div>
              <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-card m-3 text-xs text-zinc-400">Un solo precio/m². Cada tarea ejecutada paga su peso % del precio.</div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-800">
                <button className="bg-transparent text-zinc-400 border border-zinc-800 rounded-card px-3.5 py-2 text-xs">Cancelar</button>
                <button className="bg-red-600 text-white rounded-card px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Guardar</button>
              </div>
            </div>
          </div>
        </Section>

        <div className="text-[11px] text-zinc-600 mt-8 pt-6 border-t border-zinc-800">
          Extraído de <code className="text-zinc-400">tailwind.config.js</code> y <code className="text-zinc-400">components/common/*</code>. Guía viva — al agregar un componente nuevo, documéntalo aquí.
        </div>
      </div>
    </div>
  );
}
