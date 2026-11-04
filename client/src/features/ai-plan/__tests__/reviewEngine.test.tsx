import { useMemo, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from '@/components/ds';
import i18n from '@/i18n';
import { planActions } from '../components/actions';
import { ReviewStep } from '../components/ReviewStep';
import type { AiPlan, PlanContent } from '../types';
import { makeAiPlan, makePlan } from './fixtures';

// The engine line under the plan: which engine produced it, what it is called, and the honest
// usage state. Widths and the full RTL layout are checked in the browser pass (CON-703); these
// tests cover the copy, the direction and the keyboard entry point.

jest.setTimeout(30000);

const Harness = ({ plan = makeAiPlan(), initial = makePlan() }: { plan?: AiPlan; initial?: PlanContent }) => {
  const [draft] = useState(initial);
  const actions = useMemo(() => planActions(() => undefined), []);
  return (
    <>
      <ReviewStep
        plan={plan}
        draft={draft}
        dirty={false}
        actions={actions}
        creating={false}
        createError={null}
        canRegenerate
        onCreate={jest.fn()}
        onRegenerate={jest.fn()}
        onDiscard={jest.fn()}
        onDismissError={jest.fn()}
      />
      <Toaster />
    </>
  );
};

const text = (part: string) => screen.getByText(content => content.includes(part));

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('the engine line in the review step', () => {
  it('AC-056: names DocuMind, its model, and that it reports no usage', () => {
    render(<Harness plan={makeAiPlan({ analyzer: 'documind', model: 'documind-x' })} />);

    expect(text('Generated with DocuMind')).toBeInTheDocument();
    expect(text('documind-x')).toBeInTheDocument();
    expect(text('Usage not reported by this engine')).toBeInTheDocument();
  });

  it('AC-056: names the workspace provider when the v1 path produced the plan', () => {
    render(<Harness plan={makeAiPlan({ analyzer: 'ai', model: 'qwen-plus' })} />);

    expect(text('Generated with your workspace AI')).toBeInTheDocument();
    expect(text('qwen-plus')).toBeInTheDocument();
    // No usage disclaimer: the provider does report token counts
    expect(screen.queryByText(content => content.includes('Usage not reported by this engine'))).toBeNull();
  });

  it('AC-056: translates the line into French', async () => {
    await i18n.changeLanguage('fr');
    render(<Harness plan={makeAiPlan({ analyzer: 'documind', model: 'documind-x' })} />);

    expect(text('Généré avec DocuMind')).toBeInTheDocument();
    expect(text('Consommation non communiquée par ce moteur')).toBeInTheDocument();
  });

  it('AC-056: translates the line into Arabic and renders right to left', async () => {
    await i18n.changeLanguage('ar');
    render(<Harness plan={makeAiPlan({ analyzer: 'documind', model: 'documind-x' })} />);

    expect(text('DocuMind')).toBeInTheDocument();
    expect(text('لا يوفّر هذا المحرّك بيانات الاستهلاك')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('AC-056: keeps the create action reachable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness plan={makeAiPlan({ analyzer: 'documind', model: 'documind-x' })} />);

    const [create] = screen.getAllByRole('button', { name: /Create project/ });
    expect(create).toBeEnabled();
    expect(create).not.toHaveAttribute('tabindex', '-1');

    // The review is reachable without a pointer: tab lands on an interactive element
    await user.tab();
    expect(document.activeElement).toBeInstanceOf(HTMLElement);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest('[role="dialog"]') ?? null).toBeNull();
  });
});
