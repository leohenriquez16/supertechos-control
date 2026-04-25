'use client';

import React from 'react';
import { UserCircle, LogOut } from 'lucide-react';
import { APP_VERSION } from '../../lib/constants';

/**
 * Sidebar lateral del ERP.
 * v8.10.3: Extraído de page.jsx
 *
 * Recibe TODAS sus dependencias como props (no toca estado global).
 * El padre (page.jsx) sigue calculando itemsMenu, proyectosMenu, etc.
 * porque dependen de estado y permisos del usuario.
 */
export default function Sidebar({
  usuario,
  esAdmin,
  vista,
  setVista,
  setProyectoActivo,
  sidebarAbierta,
  setSidebarAbierta,
  itemsMenu,
  proyectosMenu,
  seccionesColapsadas,
  toggleSeccion,
  onCerrarSesion,
}) {
  return (
    <>
      <aside className={`fixed top-0 left-0 h-[100dvh] w-60 bg-black border-r-2 border-red-600 z-50 transform transition-transform md:translate-x-0 flex flex-col ${sidebarAbierta ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b-2 border-red-600/30 flex-shrink-0">
          <button
            onClick={() => {
              if (esAdmin) setVista('dashboard');
              else setVista('misProyectos');
              setSidebarAbierta(false);
            }}
            className="flex items-center gap-2"
          >
            <div className="w-9 h-9 bg-red-600 flex items-center justify-center font-black text-white text-lg" style={{ transform: 'skewX(-12deg)' }}>
              <span style={{ transform: 'skewX(12deg)' }}>ST</span>
            </div>
            <div className="text-left">
              <div className="font-black tracking-tight text-sm leading-none">SUPER TECHOS</div>
              <div className="text-[9px] text-zinc-500 tracking-widest uppercase">Control de Obras</div>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 min-h-0">
          {itemsMenu.map(grupo => {
            const estaColapsada = grupo.colapsable && seccionesColapsadas[grupo.seccion];
            return (
              <div key={grupo.seccion} className="mb-4">
                {grupo.colapsable ? (
                  <button
                    onClick={() => toggleSeccion(grupo.seccion)}
                    className="w-full flex items-center justify-between px-4 py-1 text-[9px] tracking-widest text-zinc-600 font-bold hover:text-zinc-400"
                  >
                    <span>{grupo.seccion}</span>
                    <span className="text-zinc-600">{estaColapsada ? '▶' : '▼'}</span>
                  </button>
                ) : (
                  <div className="px-4 text-[9px] tracking-widest text-zinc-600 font-bold mb-1">{grupo.seccion}</div>
                )}
                {!estaColapsada && grupo.items.map(it => {
                  const Icon = it.icon;
                  // v8.9.22: Proyectos como enlace simple (sin desplegar lista)
                  if (it.esProyectos) {
                    const activo = vista === 'proyectos';
                    return (
                      <button
                        key={it.id}
                        onClick={() => { setVista('proyectos'); setSidebarAbierta(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm border-l-2 ${activo ? 'bg-red-600/20 text-red-400 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 border-transparent'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{it.label}</span>
                        <span className="text-zinc-600 text-[10px]">{proyectosMenu.length}</span>
                      </button>
                    );
                  }
                  // Ítem normal
                  const activo = vista === it.vista;
                  return (
                    <button
                      key={it.id}
                      onClick={() => { setVista(it.vista); setSidebarAbierta(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${activo ? 'bg-red-600/20 text-red-400 border-l-2 border-red-600' : 'text-zinc-400 hover:bg-zinc-900 border-l-2 border-transparent'}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="flex-1">{it.label}</span>
                      {it.badge > 0 && <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{it.badge}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800 p-3 bg-black flex-shrink-0">
          <button
            onClick={() => { setVista('miPerfil'); setSidebarAbierta(false); }}
            className="w-full flex items-center gap-2 text-left text-xs p-2 hover:bg-zinc-900"
          >
            {usuario.foto2x2 ? (
              <img src={usuario.foto2x2} alt="" className="w-7 h-7 object-cover" />
            ) : (
              <UserCircle className="w-7 h-7 text-zinc-500" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{usuario.nombre.split(' ')[0]}</div>
              <div className="text-[9px] text-zinc-500 uppercase truncate">{esAdmin ? 'Admin' : 'Campo'}</div>
            </div>
          </button>
          <button
            onClick={onCerrarSesion}
            className="w-full flex items-center gap-2 text-left text-xs p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-900"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
          <div className="text-center text-[9px] text-zinc-600 tracking-widest uppercase mt-1 pt-1 border-t border-zinc-900">v{APP_VERSION}</div>
        </div>
      </aside>

      {/* Overlay móvil */}
      {sidebarAbierta && (
        <div
          onClick={() => setSidebarAbierta(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
        />
      )}
    </>
  );
}
