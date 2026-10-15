import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useFinePointer, useReducedMotionSafe } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Decorative 3D product mock for the landing hero: a board as a stack of tilted cards that follows the pointer and
// floats gently. Loaded after first paint (LandingPage), so it never competes with the headline for LCP.

const COLUMNS = [
  { name: 'To do', dot: 'bg-slate-400', lift: 0, cards: [{ title: 'Design onboarding', tone: 'bg-priority-high' }, { title: 'Write release notes', tone: 'bg-priority-low' }] },
  { name: 'In progress', dot: 'bg-primary', lift: 28, cards: [{ title: 'Checkout redesign', tone: 'bg-priority-high' }, { title: 'API integration tests', tone: 'bg-priority-medium' }, { title: 'Sprint review deck', tone: 'bg-priority-low' }] },
  { name: 'Done', dot: 'bg-success-dot', lift: 56, cards: [{ title: 'Update brand colors', tone: 'bg-priority-medium' }] },
];

const REST_X = 22;
const REST_Y = -16;

const BoardStack3D = () => {
  const frame = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduced = useReducedMotionSafe();
  const interactive = fine && !reduced;
  const stack = useRef<HTMLDivElement>(null);

  // The pointer position becomes two CSS variables (no re-render); CSS smooths the rotation
  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !frame.current || !stack.current) return;
    const box = frame.current.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
    stack.current.style.setProperty('--ry', `${REST_Y + x * 12}deg`);
    stack.current.style.setProperty('--rx', `${REST_X - y * 8}deg`);
  };
  const reset = () => {
    stack.current?.style.removeProperty('--ry');
    stack.current?.style.removeProperty('--rx');
  };

  return (
    <div
      ref={frame}
      aria-hidden
      onPointerMove={track}
      onPointerLeave={reset}
      className="relative flex h-full items-center justify-center motion-safe:animate-tm-rise [perspective:1100px]"
    >
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-56 w-[min(640px,90%)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-100/60 blur-3xl" />
      <div className="motion-safe:animate-tm-float [transform-style:preserve-3d]">
        <div
          ref={stack}
          style={{ transform: `rotateX(var(--rx, ${REST_X}deg)) rotateY(var(--ry, ${REST_Y}deg))`, transformStyle: 'preserve-3d' }}
          className="grid w-[min(620px,88vw)] grid-cols-3 gap-3 transition-transform duration-300 ease-(--ease-spring-soft) motion-reduce:transition-none sm:gap-4"
        >
          {COLUMNS.map(column => (
            <div
              key={column.name}
              style={{ transform: `translateZ(${column.lift}px)` }}
              className="rounded-2xl border border-slate-200 bg-slate-50/90 p-2.5 shadow-floating [transform-style:preserve-3d] sm:p-3"
            >
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 sm:text-xs">
                <span className={cn('size-2 rounded-full', column.dot)} />
                {column.name}
              </div>
              <div className="space-y-2 [transform-style:preserve-3d]">
                {column.cards.map(card => (
                  <div
                    key={card.title}
                    style={{ transform: 'translateZ(14px)' }}
                    className="rounded-xl border border-slate-200/80 bg-white p-2 shadow-raised sm:p-2.5"
                  >
                    <div className={cn('mb-1.5 h-0.5 w-8 rounded-full', card.tone)} />
                    <p className="text-[10px] font-medium leading-snug text-slate-900 sm:text-xs">{card.title}</p>
                    <div className="mt-2 h-1 w-3/5 rounded-full bg-slate-100" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BoardStack3D;
