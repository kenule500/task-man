import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReleaseFormDialog from '../components/ReleaseFormDialog';
import ReleaseNotesPanel from '../components/ReleaseNotesPanel';
import ReleaseNowDialog from '../components/ReleaseNowDialog';
import type { Release } from '../types';

jest.setTimeout(30000);

const totals = (pending: number, inProgress: number, completed: number) => ({
  pending, 'in-progress': inProgress, completed, total: pending + inProgress + completed,
});

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  _id: 'r1',
  project: 'p1',
  name: 'v1.0.0',
  status: 'unreleased',
  releaseDate: '2030-03-01',
  progress: { counts: totals(1, 1, 2), points: totals(0, 0, 0), overdue: false },
  ...overrides,
});

describe('ReleaseNotesPanel', () => {
  it('renders headings and items as text, never as markup', () => {
    render(<ReleaseNotesPanel markdown={'# v1\n\n## Features\n\n- WEB-1 <img src=x onerror=alert(1)>\n'} />);
    const box = screen.getByTestId('release-notes');
    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(box.querySelector('img')).toBeNull();
    expect(box).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(screen.getByText('WEB-1')).toHaveClass('font-mono');
  });

  it('copies the Markdown source', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReleaseNotesPanel markdown={'# v1\n'} />);
    await userEvent.click(screen.getByRole('button', { name: /copy markdown/i }));
    expect(writeText).toHaveBeenCalledWith('# v1\n');
  });
});

describe('ReleaseNowDialog', () => {
  it('moves unfinished tasks to the next release by default', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(
      <ReleaseNowDialog
        open
        onOpenChange={jest.fn()}
        release={makeRelease()}
        targets={[makeRelease({ _id: 'r2', name: 'v1.1.0' })]}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/2 unfinished tasks/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /move to v1\.1\.0/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(onConfirm).toHaveBeenCalledWith('r2');
  });

  it('sends null to remove them and nothing to keep them', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(<ReleaseNowDialog open onOpenChange={jest.fn()} release={makeRelease()} targets={[]} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('radio', { name: /remove them/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(onConfirm).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole('radio', { name: /leave them/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(onConfirm).toHaveBeenLastCalledWith(undefined);
  });

  it('does not ask when everything is done', () => {
    render(
      <ReleaseNowDialog
        open
        onOpenChange={jest.fn()}
        release={makeRelease({ progress: { counts: totals(0, 0, 3), points: totals(0, 0, 0), overdue: false } })}
        targets={[]}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText(/nothing needs to move/i)).toBeInTheDocument();
  });
});

describe('ReleaseFormDialog', () => {
  it('requires a name and keeps the release date after the start date', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ReleaseFormDialog open onOpenChange={jest.fn()} defaults={{ startDate: '2030-02-01', releaseDate: '2030-01-01' }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create release' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/enter a version name/i)).toBeInTheDocument();
    expect(screen.getByText(/on or after the start date/i)).toBeInTheDocument();
  });

  it('submits trimmed values with empty dates as null', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ReleaseFormDialog open onOpenChange={jest.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/^name/i), '  v2.0  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create release' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'v2.0', description: '', startDate: null, releaseDate: null });
  });
});
