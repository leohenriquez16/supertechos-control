'use client';

import { useMemo, useState } from 'react';

const TARIFARIO = {
  'Reparaciones en membrana impermeabilizante': [
    { desc: 'Parche en membrana asfáltica', unidad: 'm²', precio: 'Cotización individual' },
    { desc: 'Suministro y colocación de lona asfáltica 5 kg mineral', unidad: 'm²', precio: 'Cotización individual' },
    { desc: 'Parche en membrana TPO 60 mil con soldadura caliente', unidad: 'm²', precio: 'Cotización individual' },
    { desc: 'Sellado de junta perimetral con sellador poliuretánico', unidad: 'ml', precio: 'Cotización individual' },
    { desc: 'Sellado de junta con masilla siliconada', unidad: 'ml', precio: 'Cotización individual' },
    { desc: 'Aplicación de silicona reflectiva localizada (Lucas 9600 o equivalente)', unidad: 'm²', precio: 'Cotización individual' },
    { desc: 'Reparación de ampolla / bolsa de aire en membrana (<0.5 m²)', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Re-emboquillamiento de desagüe con lona asfáltica', unidad: 'ud.', precio: 'Cotización individual' },
  ],
  'Penetraciones, desagües y elementos puntuales': [
    { desc: 'Reemplazo completo de pitch pan (penetración HVAC, electricidad, etc.)', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Resellado de pitch pan existente (sin reemplazo)', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Colocación de rejilla plástica nueva para desagüe', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Reemplazo de rejilla plástica para imbornal', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Colocación de rejilla metálica nueva para desagüe', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Reemplazo de rejilla metálica para imbornal', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Reemplazo o instalación de cono PVC para desagüe', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Sellado de escupidor o gárgola (incluye base)', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Instalación de cubre-rejillas (anti-hojas) en imbornal', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Limpieza y resellado de base de antena o equipo en cubierta', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Instalación de pasarela técnica (caminería) sobre membrana', unidad: 'ml', precio: 'Cotización individual' },
  ],
  'Servicios complementarios': [
    { desc: 'Limpieza profunda de imbornal obstruido (con destape)', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Destape de bajante pluvial', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Retiro de equipo fuera de servicio en cubierta', unidad: 'Cotización especial', precio: 'Según peso y acceso' },
    { desc: 'Instalación de tapa de acceso a cubierta', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Rotulación / identificación de zonas técnicas', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Visita de emergencia fuera de horario regular', unidad: 'ud.', precio: 'Cotización individual' },
    { desc: 'Visita técnica adicional bajo solicitud del banco', unidad: 'ud.', precio: 'Cotización individual' },
  ],
};

export default function TarifarioPage() {
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('todas');

  const categorias = Object.keys(TARIFARIO);

  const itemsFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cats = categoria === 'todas' ? categorias : [categoria];
    const result = {};
    cats.forEach(cat => {
      const items = TARIFARIO[cat].filter(item => {
        if (q && !item.desc.toLowerCase().includes(q)) return false;
        return true;
      });
      if (items.length > 0) result[cat] = items;
    });
    return result;
  }, [search, categoria]);

  const totalItems = Object.values(itemsFiltrados).reduce((a, items) => a + items.length, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block w-10 h-0.5 bg-red-600 mb-2" />
          <h1 className="text-2xl font-bold text-zinc-900">
            Tarifario Referencial · <span className="text-red-600">Anexo A</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Catálogo referencial de servicios adicionales · {totalItems} items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold">
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Banner explicativo */}
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-5 text-xs text-amber-900">
        <div className="font-bold uppercase tracking-wider text-[10px] mb-1">⚠ Cómo funciona el tarifario</div>
        <div className="space-y-0.5">
          <div>· El siguiente es un <strong>catálogo referencial</strong> de servicios. Los precios <strong>no están fijados</strong>: cada servicio se cotiza específicamente al momento de su identificación, considerando las condiciones particulares de la oficina y el alcance real del trabajo.</div>
          <div>· Cada Orden de Servicio se documenta en la plataforma con cotización individual y queda pendiente de aprobación expresa del banco antes de ejecutarse en la siguiente visita programada.</div>
          <div>· Los precios cotizados incluyen mano de obra, materiales, equipos, transporte y supervisión técnica. Excluyen ITBIS, que se aplica al momento de la facturación.</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-3 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar servicio (parche, pitch pan, sellado, rejilla…)"
            className="w-full pl-9 pr-8 py-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
          />
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setCategoria('todas')}
            className={`text-xs px-3 py-2 rounded font-medium ${categoria === 'todas' ? 'bg-red-600 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
            Todas
          </button>
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoria(cat)}
              className={`text-xs px-3 py-2 rounded font-medium ${categoria === cat ? 'bg-red-600 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
              {cat.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Tablas por categoría */}
      <div className="space-y-5">
        {Object.entries(itemsFiltrados).map(([cat, items]) => (
          <div key={cat} className="bg-white border border-zinc-200 rounded shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200">
              <div className="text-sm font-semibold text-zinc-900">{cat}</div>
              <div className="text-xs text-zinc-500">{items.length} servicios</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                <tr>
                  <th className="text-left px-4 py-2">Descripción</th>
                  <th className="text-center px-4 py-2 w-32">Unidad</th>
                  <th className="text-right px-4 py-2 w-48">Precio</th>
                  <th className="text-center px-4 py-2 w-32">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((item, i) => (
                  <tr key={i} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 text-zinc-900 text-sm">{item.desc}</td>
                    <td className="px-4 py-2.5 text-center text-zinc-700 text-xs">{item.unidad}</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {item.precio === 'Cotización individual'
                        ? <span className="italic text-zinc-500">Cotización individual</span>
                        : <span className="text-zinc-700">{item.precio}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button className="text-red-600 hover:underline text-xs font-semibold">+ Solicitar cotización</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {totalItems === 0 && (
        <div className="bg-white border border-zinc-200 rounded shadow-sm p-12 text-center text-zinc-500 text-sm">
          No se encontraron servicios que coincidan con la búsqueda.
        </div>
      )}
    </div>
  );
}
