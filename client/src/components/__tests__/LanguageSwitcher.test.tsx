import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import i18n from '@/i18n';
import { getStoredLanguage } from '@/utils/session';
import { LanguageSwitcher } from '../LanguageSwitcher';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { put: jest.fn().mockResolvedValue({ data: {} }), get: jest.fn() },
}));

const choose = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: /^Language:|^اللغة|^Langue/ }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name }));
};

beforeEach(async () => {
  localStorage.clear();
  await act(async () => { await i18n.changeLanguage('en'); });
});

afterAll(async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
});

describe('LanguageSwitcher', () => {
  it('names the current language in its own script and lists every language', async () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Language: English' }));
    expect(await screen.findByRole('menuitemradio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Français' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'العربية' })).toBeInTheDocument();
  });

  it('switches to French without a reload and remembers the choice', async () => {
    render(<LanguageSwitcher />);
    await choose('Français');
    await waitFor(() => expect(i18n.language).toBe('fr'));
    expect(document.documentElement).toHaveAttribute('lang', 'fr');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(getStoredLanguage()).toBe('fr');
    expect(screen.getByRole('button', { name: 'Langue: Français' })).toBeInTheDocument();
  });

  it('sets right-to-left for Arabic', async () => {
    render(<LanguageSwitcher />);
    await choose('العربية');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('dir', 'rtl'));
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(getStoredLanguage()).toBe('ar');
    expect(screen.getByRole('button', { name: 'اللغة: العربية' })).toBeInTheDocument();
  });

  it('goes back to left-to-right when English is chosen from Arabic', async () => {
    await act(async () => { await i18n.changeLanguage('ar'); });
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    render(<LanguageSwitcher />);
    await choose('English');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('dir', 'ltr'));
    expect(getStoredLanguage()).toBe('en');
  });

  it('does not call the API when nobody is signed in', async () => {
    render(<LanguageSwitcher />);
    await choose('Français');
    await waitFor(() => expect(i18n.language).toBe('fr'));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('saves the language on the account when signed in', async () => {
    localStorage.setItem('token', 'abc');
    render(<LanguageSwitcher />);
    await choose('العربية');
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/profile', { language: 'ar' }));
  });
});
