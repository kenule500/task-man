import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from '@/components/ds';
import DesignSystemPage from '../DesignSystemPage';

jest.setTimeout(30000);

const renderGuide = () =>
  render(
    <MemoryRouter>
      <DesignSystemPage />
      <Toaster />
    </MemoryRouter>,
  );

describe('DesignSystemPage (living style guide)', () => {
  it('renders every section of the design system', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /taskman design system/i })).toBeInTheDocument();
    for (const section of ['Foundations', 'Layout', 'Feedback', 'Data display', 'Forms', 'Task components']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    }
  });

  it('shows the component variants (alerts, progress, tags, fields)', () => {
    renderGuide();
    expect(screen.getByRole('alert')).toHaveTextContent('This dependency would create a cycle.');
    expect(screen.getByRole('progressbar', { name: /docs progress/i })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace name/i)).toHaveAccessibleDescription('Workspace name is required');
  });

  it('demonstrates toasts, including one with an Undo action', async () => {
    renderGuide();
    await userEvent.click(screen.getByRole('button', { name: /toast with action/i }));
    expect(await screen.findByText('Task deleted')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Task restored')).toBeInTheDocument();
  });
});
