import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AnimatedNumber, CheckBurst, DotsLoader, FadeIn, PageLoader, Pressable, Spinner, Stagger, StaggerItem, Surface, Tag,
  TiltCard, TopProgressBar,
} from '@/components/ds';
import { DURATION, SPRING } from '@/lib/motion';
import { ComponentDoc, DataTable, DocSection, Prose, Specimen } from '../kit';

const REPLAY_BUTTON = 'Replay';

const TOKEN_ROWS: [string, string, string][] = [
  ['DURATION.fast · --motion-fast', `${DURATION.fast * 1000}ms`, 'Press feedback, exits, small fades'],
  ['DURATION.base · --motion-base', `${DURATION.base * 1000}ms`, 'Hover lift, entrances of small elements'],
  ['DURATION.slow · --motion-slow', `${DURATION.slow * 1000}ms`, 'Page and list entrances, the largest single move'],
  ['SPRING.snappy', `stiffness ${SPRING.snappy.stiffness}, damping ${SPRING.snappy.damping}`, 'Press, toggle and drag-release feedback'],
  ['SPRING.gentle', `stiffness ${SPRING.gentle.stiffness}, damping ${SPRING.gentle.damping}`, 'Tilt, layout moves between columns'],
  ['--ease-spring-bouncy / -soft', 'CSS linear() curves', 'Toast entrance and check pop (bouncy); sheets and panels (soft)'],
];

export const MotionComponentsSection = () => {
  const [replay, setReplay] = useState(0);
  const [count, setCount] = useState(128);
  const [burst, setBurst] = useState(0);

  return (
    <DocSection
      id="motion-components"
      title="Motion components"
      description="Entrances, counters, tilt, press and completion feedback. Everything is reduced-motion safe and never blocks input."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <DataTable caption="Motion tokens (lib/motion.ts and index.css)" columns={['Token', 'Value', 'Use']} rows={TOKEN_ROWS.map(row => row.map((cell, index) => (index === 0 ? <code key="c" className="font-mono text-xs">{cell}</code> : cell)))} />
        <Surface padding="sm" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">The reduced-motion rule</h3>
          <Prose>
            <ul>
              <li><code>prefers-reduced-motion: reduce</code> is the only switch (the app has no separate motion setting). <code>useReducedMotionSafe()</code> reads it live.</li>
              <li>CSS animations and transitions collapse to 0.01ms through one global rule in <code>index.css</code>; content is always at its final state.</li>
              <li>JavaScript effects check the hook: no tilt, no scale on press, no layout glides, no count-up, no burst. Opacity is the only thing that may still change.</li>
              <li>Touch and coarse pointers skip pointer-driven effects (<code>useFinePointer()</code>).</li>
              <li>State is never carried by motion alone: a counter has its final value for screen readers, a loader has a text label.</li>
            </ul>
          </Prose>
        </Surface>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Specimen label="FadeIn, Stagger and StaggerItem (first mount only)" bare>
          <div className="space-y-3">
            <Stagger key={replay} className="grid grid-cols-3 gap-2">
              {['Plan', 'Build', 'Ship'].map(label => (
                <StaggerItem key={label} className="rounded-lg border border-border-subtle bg-surface-raised p-3 text-center text-sm font-medium text-text-strong">{label}</StaggerItem>
              ))}
            </Stagger>
            <FadeIn key={`fade-${replay}`} delay={150} className="text-sm text-text-body">Content fades in and rises 8px.</FadeIn>
            <Button variant="outline" size="sm" onClick={() => setReplay(value => value + 1)}>{REPLAY_BUTTON}</Button>
          </div>
        </Specimen>

        <Specimen label="AnimatedNumber (counts up when scrolled into view)" bare>
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold text-text-strong"><AnimatedNumber value={count} /></p>
            <Button variant="outline" size="sm" onClick={() => setCount(value => value + 37)}>Add 37</Button>
          </div>
        </Specimen>

        <Specimen label="TiltCard (fine pointer only; focus gives a lift)" bare>
          <TiltCard className="relative max-w-xs rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-raised">
            <p className="text-sm font-semibold text-text-strong">Move the pointer over me</p>
            <p className="mt-1 text-xs text-text-subtle">At most 6 degrees of tilt and a light sheen that follows the pointer.</p>
            <Button variant="outline" size="sm" className="mt-3">Focusable child</Button>
          </TiltCard>
        </Specimen>

        <Specimen label="Pressable and CheckBurst" bare>
          <div className="flex flex-wrap items-center gap-4">
            <Pressable><Button>Press me</Button></Pressable>
            <div className="relative flex size-10 items-center justify-center">
              {burst > 0 && <CheckBurst key={burst} />}
              <Button variant="outline" size="sm" onClick={() => setBurst(value => value + 1)}>Done</Button>
            </div>
          </div>
        </Specimen>
      </div>
    </DocSection>
  );
};

export const LoadersDoc = () => {
  const [loading, setLoading] = useState(false);
  const [showBar, setShowBar] = useState(false);

  return (
    <ComponentDoc
      id="c-loaders"
      name="Loaders"
      source="@/components/ds"
      maturity="beta"
      purpose="Spinner, DotsLoader, TopProgressBar and PageLoader, plus the Button loading state. Use skeletons for content, loaders for actions and route changes."
      anatomy={['Spinner / dots', 'Top progress bar', 'Branded page loader', 'Button loading']}
      variants={
        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-4 text-primary">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <DotsLoader />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={loading} onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 1800); }}>Save changes</Button>
            <Button variant="outline" onClick={() => { setShowBar(true); window.setTimeout(() => setShowBar(false), 1800); }}>Show top bar</Button>
            {showBar && <TopProgressBar />}
          </div>
          <div className="overflow-hidden rounded-xl border border-border-subtle md:col-span-2">
            <PageLoader fullscreen={false} className="min-h-0 py-10" />
          </div>
        </div>
      }
      states={[
        { label: 'Button loading: keeps width, aria-busy, disabled', node: <Button loading>Create task</Button> },
        { label: 'Reduced motion: static ring, label stays', node: <Tag tone="neutral">Spinner stops, text remains</Tag> },
      ]}
      a11y={[
        'Spinner is role="status" with a label (default “Loading”); inside a control use decorative, the control carries aria-busy.',
        'TopProgressBar is a progressbar with a label and appears after 160ms so fast loads never flash it.',
        'PageLoader is a polite status with visible “Loading…” text; the 3D tile is aria-hidden.',
        'Button loading keeps the label in the accessibility tree and sets aria-busy and disabled.',
      ]}
      doText="Show a loader only when the wait may exceed about a second; otherwise change nothing."
      dontText="Stack a spinner on top of a skeleton or loop an animation after the data has arrived."
      code={`<Button loading={saving}>Save changes</Button>\n<Spinner label="Loading members" />\n<Suspense fallback={<PageLoader />}>…</Suspense>`}
      props={[
        { name: 'Spinner size', type: "'xs' | 'sm' | 'md' | 'lg'", default: "'sm'", description: 'Ring size; uses currentColor.' },
        { name: 'Spinner decorative', type: 'boolean', default: 'false', description: 'Hide from assistive technology (inside a busy control).' },
        { name: 'PageLoader fullscreen', type: 'boolean', default: 'true', description: 'Fill the viewport or just the parent.' },
        { name: 'Button loading', type: 'boolean', default: 'false', description: 'Shows a spinner, keeps width, sets aria-busy, disables.' },
      ]}
    />
  );
};
