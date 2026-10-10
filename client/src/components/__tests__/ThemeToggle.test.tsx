import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import { ThemeToggle } from '../ThemeToggle';
import { getThemePreference, setThemePreference, THEME_STORAGE_KEY } from '@/lib/theme';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { put: jest.fn().mockResolvedValue({ data: {} }), get: jest.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn(),
  }));
  setThemePreference('light');
});

describe('ThemeToggle', () => {
  it('names the current mode and the next one', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Theme: Light. Switch to dark' })).toBeInTheDocument();
  });

  it('cycles light, dark, system and applies each choice', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    expect(getThemePreference()).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Theme: Dark. Switch to system' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(getThemePreference()).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');

    await userEvent.click(screen.getByRole('button'));
    expect(getThemePreference()).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('saves to the account only when signed in', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    expect(api.put).not.toHaveBeenCalled();

    localStorage.setItem('token', 'abc');
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/profile', { theme: 'system' }));
  });
});
