import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordField from '../PasswordField';

const Harness = ({ error }: { error?: string }) => {
  const [value, setValue] = useState('');
  return (
    <PasswordField id="password" label="New password" value={value} onChange={setValue} error={error} autoComplete="new-password" showStrength />
  );
};

describe('PasswordField', () => {
  it('toggles visibility and exposes the autocomplete token', async () => {
    render(<Harness />);
    const input = screen.getByLabelText(/New password/);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the minimum hint, then the strength as the user types', async () => {
    render(<Harness />);
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/New password/), 'abc');
    expect(screen.getByText('Strength: Too short')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/New password/), 'defghiJ1!x');
    expect(screen.getByText('Strength: Strong')).toBeInTheDocument();
  });

  it('marks the input invalid and links the error message', () => {
    render(<Harness error="Use at least 8 characters." />);
    const input = screen.getByLabelText(/New password/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain('password-message');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
  });
});
