import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stepperMarkerVariants } from './variants';

export interface StepperStep {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Link or button for this step ("Invite teammate"). Shown under the description. */
  action?: ReactNode;
  /** Mark done regardless of position, e.g. when a checklist item is satisfied out of order. */
  complete?: boolean;
}

interface StepperProps {
  steps: StepperStep[];
  /** Index (0-based) of the current step. Steps before it are complete, steps after are upcoming. */
  current: number;
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md';
  /** Names the list, e.g. "Onboarding progress". */
  label: string;
  className?: string;
}

const stateOf = (step: StepperStep, index: number, current: number) =>
  step.complete || index < current ? 'complete' : index === current ? 'current' : 'upcoming';

const STATE_TEXT = { complete: 'completed', current: 'current step', upcoming: 'not started' } as const;

/**
 * Progress through a fixed sequence of steps. An ordered list; the current step has
 * `aria-current="step"` and every step states its status in visually hidden text (color is never the only cue).
 */
export const Stepper = ({ steps, current, orientation = 'horizontal', size = 'md', label, className }: StepperProps) => {
  const vertical = orientation === 'vertical';
  return (
    <ol aria-label={label} className={cn('flex', vertical ? 'flex-col' : 'items-start', className)}>
      {steps.map((step, index) => {
        const state = stateOf(step, index, current);
        const isLast = index === steps.length - 1;
        const nextState = isLast ? 'upcoming' : stateOf(steps[index + 1], index + 1, current);
        const connectorDone = state === 'complete' && nextState !== 'upcoming';
        return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex min-w-0', vertical ? 'gap-3' : 'flex-col items-start gap-2 text-left', !vertical && !isLast && 'flex-1')}
            >
              <div className={cn('flex items-center', vertical ? 'flex-col self-stretch' : 'w-full')}>
                <span aria-hidden className={stepperMarkerVariants({ state, size })}>
                  {state === 'complete' ? <Check className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={3} /> : index + 1}
                </span>
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'bg-slate-200 transition-colors duration-(--duration-base) motion-reduce:transition-none',
                      vertical ? 'my-1 min-h-6 w-0.5 flex-1' : 'mx-2 h-0.5 flex-1',
                      connectorDone && 'bg-primary',
                    )}
                  />
                )}
              </div>
              <div className={cn('min-w-0', vertical ? 'pb-5' : 'px-1')}>
                <p className={cn('text-sm font-medium', state === 'upcoming' ? 'text-text-subtle' : 'text-text-strong')}>
                  {step.title}
                  <span className="sr-only">, {STATE_TEXT[state]}</span>
                </p>
                {step.description && <p className="mt-0.5 text-xs text-text-subtle">{step.description}</p>}
                {step.action && <div className="mt-2">{step.action}</div>}
              </div>
            </li>
        );
      })}
    </ol>
  );
};
