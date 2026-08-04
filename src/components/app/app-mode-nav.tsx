'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/teacher', label: 'Panel docente' },
  { href: '/student', label: 'Vista estudiante' },
  { href: '/plush', label: 'Modo peluche' },
];

type AppModeNavProps = {
  currentLabel?: string;
};

export function AppModeNav({ currentLabel }: AppModeNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-coral">
          Navegacion del proyecto
        </p>
        <p className="text-sm text-ink/70">
          {currentLabel ||
            'Elige el modo correcto para no mezclar panel docente, alumno y telefono del peluche.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== '/' && pathname?.startsWith(link.href));

          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'rounded-full px-4 py-2 text-sm font-bold transition',
                active
                  ? 'bg-ink text-white shadow-card'
                  : 'border border-ink/10 bg-white text-ink/75 hover:border-coral hover:text-coral',
              ].join(' ')}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
