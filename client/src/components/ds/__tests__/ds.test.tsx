import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alert, Field, PageHeader, ProgressBar, SectionHeader, Tag } from '../primitives';
import { fieldMessageId, getInitials } from '../variants';

describe('getInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['mohamed reda ali', 'MA'],
    ['Plato', 'PL'],
    ['   ', '?'],
  ])('%s → %s', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});

describe('Alert', () => {
  it('announces errors immediately and other tones politely', () => {
    const { rerender } = render(<Alert tone="error">Broken</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');

    rerender(<Alert tone="info">Heads up</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Heads up');
  });

  it('can be dismissed', async () => {
    const onDismiss = jest.fn();
    render(<Alert tone="warning" onDismiss={onDismiss}>Offline</Alert>);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('ProgressBar', () => {
  it('clamps and exposes its value', () => {
    render(<ProgressBar value={140} label="Website progress" showValue />);
    const bar = screen.getByRole('progressbar', { name: 'Website progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('links the label and shows the error instead of the hint', () => {
    render(
      <Field label="Name" htmlFor="name" required hint="Your full name" error="Name is required">
        <input id="name" aria-describedby={fieldMessageId('name')} />
      </Field>,
    );
    const input = screen.getByLabelText(/Name/);
    expect(input).toHaveAccessibleDescription('Name is required');
    expect(screen.queryByText('Your full name')).not.toBeInTheDocument();
  });
});

describe('layout primitives', () => {
  it('renders a single page heading with actions', () => {
    render(<PageHeader title="Reports" description="Analytics" actions={<button>Export</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('shows section counts and tags', () => {
    render(<><SectionHeader title="Overdue" count={2} /><Tag tone="danger">Blocked</Tag></>);
    expect(screen.getByRole('heading', { name: /Overdue/ })).toHaveTextContent('2');
    expect(screen.getByText('Blocked')).toHaveClass('bg-danger-bg');
  });
});
