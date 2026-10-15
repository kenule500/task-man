import type { ReactNode } from 'react';
import { IconTile, Surface } from '@/components/ds';
import type { IconTileVariants } from '@/components/ds/variants';
import { cn } from '@/lib/utils';

/** Centered card used by every single-purpose auth screen (one `main` landmark per page). */
export const AuthPageShell = ({ children, wide = false }: { children: ReactNode; wide?: boolean }) => (
  <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <Surface padding="lg" className={cn('w-full border-slate-200 shadow-xl', wide ? 'max-w-2xl rounded-3xl' : 'max-w-md')}>
      {children}
    </Surface>
  </main>
);

interface AuthStatusHeaderProps {
  icon: ReactNode;
  tone?: IconTileVariants['tone'];
  title: string;
  description?: ReactNode;
  /** Spin the icon (loading states) unless the user prefers reduced motion */
  spin?: boolean;
}

/** Icon, `h1` and description: the heading block of auth status and form screens. */
export const AuthStatusHeader = ({ icon, tone = 'primary', title, description, spin = false }: AuthStatusHeaderProps) => (
  <div className="mb-6 text-center">
    <IconTile tone={tone} size="lg" className={cn('mx-auto mb-5 size-16 rounded-2xl [&_svg]:size-8', spin && '[&_svg]:motion-safe:animate-spin')}>
      {icon}
    </IconTile>
    <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
    {description && <p className="text-sm leading-relaxed text-slate-600">{description}</p>}
  </div>
);
