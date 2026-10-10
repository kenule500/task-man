import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TwoFactorRequiredGate from '../TwoFactorRequiredGate';
import { TWO_FACTOR_REQUIRED_EVENT } from '@/utils/twoFactorRequired';

const renderGate = () =>
  render(
    <MemoryRouter>
      <TwoFactorRequiredGate />
    </MemoryRouter>,
  );

describe('TwoFactorRequiredGate', () => {
  it('renders nothing until the API says two-factor is required', () => {
    renderGate();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('shows a blocking screen with a link to Security settings', () => {
    renderGate();
    act(() => {
      window.dispatchEvent(new Event(TWO_FACTOR_REQUIRED_EVENT));
    });
    expect(screen.getByRole('heading', { name: 'Turn on two-factor authentication' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Security settings' })).toHaveAttribute('href', '/settings/security');
  });
});
