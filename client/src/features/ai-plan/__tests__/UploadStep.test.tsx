import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { settings } from '@/features/ai-review/__tests__/fixtures';
import type { AiSettings } from '@/features/ai-review/types';
import { UploadStep } from '../components/UploadStep';
import type { PlanApiError } from '../types';
import { makeAiPlan } from './fixtures';

jest.setTimeout(30000);

interface Overrides {
  settings?: AiSettings | null;
  settingsLoading?: boolean;
  settingsError?: string;
  canManageSettings?: boolean;
  busy?: boolean;
  error?: PlanApiError | null;
  failure?: string;
  recent?: ReturnType<typeof makeAiPlan>[];
}

const setup = (overrides: Overrides = {}) => {
  const props = {
    onStart: jest.fn(),
    onOpenRecent: jest.fn(),
    onOpenActive: jest.fn(),
    onRetrySettings: jest.fn(),
  };
  render(
    <MemoryRouter>
      <UploadStep
        slug="demo"
        settings={overrides.settings === undefined ? settings() : overrides.settings}
        settingsLoading={overrides.settingsLoading ?? false}
        settingsError={overrides.settingsError ?? ''}
        canManageSettings={overrides.canManageSettings ?? true}
        initial={null}
        busy={overrides.busy ?? false}
        error={overrides.error ?? null}
        failure={overrides.failure ?? ''}
        recent={overrides.recent ?? []}
        {...props}
      />
    </MemoryRouter>,
  );
  return props;
};

const pdf = (name = 'bookshop.pdf', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });
const dropzone = () => screen.getByLabelText(/Drop your document here/);
const analyze = () => screen.getByRole('button', { name: /Analyze document|Uploading/ });

describe('UploadStep', () => {
  it('AC-006/AC-012: tells what is sent, where, and what is kept before anything is uploaded', () => {
    setup();
    const notice = screen.getByRole('heading', { name: 'What happens to your document' }).closest('div') as HTMLElement;
    expect(within(notice).getByText(/sent to the configured AI provider \(qwen-max\)/)).toBeInTheDocument();
    expect(within(notice).getByText(/never stored/)).toBeInTheDocument();
    expect(within(notice).getByText(/AI is on for this workspace\. 2 of 20 project plans used today\./)).toBeInTheDocument();
  });

  it('TEST-002 AC-001/AC-002: starts only when a document is chosen, and sends the file with the options', async () => {
    const user = userEvent.setup();
    const { onStart } = setup();
    expect(analyze()).toBeDisabled();
    expect(screen.getByText('Choose a document to continue.')).toBeInTheDocument();

    const file = pdf();
    await user.upload(dropzone(), file);
    expect(screen.getByText('bookshop.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 kB')).toBeInTheDocument();
    expect(analyze()).toBeEnabled();

    await user.type(screen.getByLabelText('Project name'), 'Online Bookshop');
    await user.type(screen.getByLabelText('Project key'), 'bo-ok');
    expect(screen.getByLabelText('Project key')).toHaveValue('BOOK');
    await user.type(screen.getByLabelText('Team size'), '6');
    await user.type(screen.getByLabelText('Extra instructions'), 'Mobile first');
    await user.click(screen.getByRole('radio', { name: '3 weeks' }));
    await user.click(analyze());

    expect(onStart).toHaveBeenCalledTimes(1);
    const [sent, options] = onStart.mock.calls[0];
    expect(sent).toBe(file);
    expect(options).toMatchObject({
      projectName: 'Online Bookshop', projectKey: 'BOOK', sprintLengthWeeks: 3, teamSize: '6', extraInstructions: 'Mobile first', language: 'en',
    });
    expect(options.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('AC-001: lets the person remove the chosen file', async () => {
    const user = userEvent.setup();
    setup();
    await user.upload(dropzone(), pdf());
    await user.click(screen.getByRole('button', { name: 'Remove bookshop.pdf' }));
    expect(screen.queryByText('bookshop.pdf')).not.toBeInTheDocument();
    expect(analyze()).toBeDisabled();
  });

  it('TEST-001 AC-001: refuses files it can already tell are wrong, with the reason', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onStart } = setup();
    await user.upload(dropzone(), pdf('photo.png'));
    expect(screen.getByText(/This file type is not supported/)).toBeInTheDocument();
    await user.upload(dropzone(), pdf('old.doc'));
    expect(screen.getByText(/Old Word files \(\.doc\) are not supported/)).toBeInTheDocument();
    await user.upload(dropzone(), new File([], 'empty.txt'));
    expect(screen.getByText('This file is empty.')).toBeInTheDocument();
    await user.upload(dropzone(), pdf('huge.pdf', 4 * 1024 * 1024 + 1));
    expect(screen.getByText(/too large\. The limit is 4\.2 MB/)).toBeInTheDocument();
    expect(analyze()).toBeDisabled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('explains that AI is off and where to turn it on, and does not allow the upload', async () => {
    const user = userEvent.setup();
    setup({ settings: settings({ enabled: false }) });
    expect(screen.getByText('AI is turned off for this workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workspace settings' })).toHaveAttribute('href', '/demo/settings');
    await user.upload(dropzone(), pdf());
    expect(analyze()).toBeDisabled();
  });

  it('asks people who cannot manage settings to ask an admin', () => {
    setup({ settings: settings({ enabled: false }), canManageSettings: false });
    expect(screen.queryByRole('link', { name: 'Open workspace settings' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ask an owner or admin to turn it on/)).toBeInTheDocument();
  });

  it('says so when the server has no AI key', () => {
    setup({ settings: settings({ available: false }) });
    expect(screen.getByText('AI is not set up for this workspace')).toBeInTheDocument();
  });

  it('AC-001: blocks the upload at the daily limit', async () => {
    const user = userEvent.setup();
    setup({ settings: settings({ plan: { dailyLimit: 20, usedToday: 20, maxChars: 60_000, maxBytes: 4 * 1024 * 1024 } }) });
    expect(screen.getByText('Daily limit reached')).toBeInTheDocument();
    await user.upload(dropzone(), pdf());
    expect(analyze()).toBeDisabled();
  });

  it('shows the settings check while it runs and a retry when it fails', async () => {
    const user = userEvent.setup();
    const { onRetrySettings } = setup({ settings: null, settingsError: 'We could not load the AI settings.' });
    expect(screen.getByText('We could not load the AI settings.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetrySettings).toHaveBeenCalled();
  });

  it('AC-002/AC-006: shows a refused upload in the interface language and offers to open the plan already running', async () => {
    const user = userEvent.setup();
    const { onOpenActive } = setup({ error: { status: 409, code: 'PLAN_IN_PROGRESS', message: 'raw english', suggestion: '' } });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/already being analyzed for you/)).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Open it' }));
    expect(onOpenActive).toHaveBeenCalled();
  });

  it('AC-006: shows why the last generation failed', () => {
    setup({ failure: 'The AI provider is limiting requests. Try again later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The AI provider is limiting requests');
  });

  it('AC-006: offers to continue a recent plan', async () => {
    const user = userEvent.setup();
    const recent = makeAiPlan({ _id: 'plan-9', source: { fileName: 'old-spec.docx', mimeType: 'x', size: 1, chars: 1, truncated: false } });
    const { onOpenRecent } = setup({ recent: [recent] });
    expect(screen.getByText('Ready to review')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open\s+old-spec\.docx/ }));
    expect(onOpenRecent).toHaveBeenCalledWith(recent);
  });
});
