'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { label: 'Dashboard',  href: '/banreservas' },
  { label: 'Oficinas',   href: '/banreservas/sucursales' },
  { label: 'Calendario', href: '/banreservas/calendario' },
  { label: 'Visitas',    href: '/banreservas/visitas' },
  { label: 'Hallazgos',  href: '/banreservas/hallazgos' },
  { label: 'Reportes',   href: '/banreservas/reportes' },
  { label: 'Garantías',  href: '/banreservas/garantias' },
  { label: 'Tarifario',  href: '/banreservas/tarifario' },
  { label: 'App Campo',  href: '/banreservas/movil' },
];

export default function Topbar() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-6 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/banreservas" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-super-techos.png" alt="Super Techos" className="h-9 w-auto" />
            </Link>
          </div>
          <div className="text-[11px] text-zinc-500">
            <span className="font-semibold text-zinc-700">PNM · Banco de Reservas</span>
            <span className="mx-2 text-zinc-300">|</span>
            <span>Programa Nacional de Mantenimiento</span>
            <span className="mx-2 text-zinc-300">|</span>
            <span className="text-zinc-400">v8.9.27</span>
          </div>
        </div>

        <nav className="flex items-center gap-6 mt-3 -mb-[1px]">
          {NAV.map((item) => {
            const active = pathname === item.href ||
              (item.href !== '/banreservas' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm pb-2.5 border-b-2 transition ${
                  active
                    ? 'text-red-600 border-red-600 font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900 border-transparent'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
