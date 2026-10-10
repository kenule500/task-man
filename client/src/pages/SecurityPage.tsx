import { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, Surface, Spinner } from '@/components/ds';
import PasswordField from '@/components/auth/PasswordField';
import { useFormValidation } from '@/components/auth/useFormValidation';
import {
  validateConfirmPassword, validateNewPassword, validateRequiredPassword,
} from '@/components/auth/validation';
import { SignedInDevices, TwoFactorCard } from '@/features/account';
import { Lock } from 'lucide-react';

const validators = {
  currentPassword: (value: string) => validateRequiredPassword(value),
  newPassword: (value: string) => validateNewPassword(value),
  confirmPassword: (value: string, all: { newPassword: string; currentPassword: string; confirmPassword: string }) =>
    validateConfirmPassword(value, all.newPassword),
};

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

const SecurityPage = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordData, setPasswordData] = useState(EMPTY);
  const { errorFor, touch, validateAll, reset } = useFormValidation(passwordData, validators);

  // Success messages fade after a few seconds; errors stay until the next attempt
  useEffect(() => {
    if (message?.type !== 'success') return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const setField = (field: keyof typeof EMPTY) => (value: string) =>
    setPasswordData((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!validateAll()) return;

    setSaving(true);
    try {
      await api.put('/profile/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData(EMPTY);
      reset();
      setMessage({ type: 'success', text: 'Password changed. Your other devices have been signed out.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to change password. Check your current password and try again.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {message && <Alert tone={message.type}>{message.text}</Alert>}

      <Surface padding="lg">
        <div className="mb-6">
          <h2 className="font-semibold text-slate-900">Change password</h2>
          <p className="mt-1 text-sm text-slate-600">Update your password to keep your account secure.</p>
        </div>

        <div className="max-w-md space-y-5">
          <PasswordField
            id="currentPassword"
            label="Current password"
            value={passwordData.currentPassword}
            onChange={setField('currentPassword')}
            onBlur={() => touch('currentPassword')}
            error={errorFor('currentPassword')}
            autoComplete="current-password"
          />
          <PasswordField
            id="newPassword"
            label="New password"
            value={passwordData.newPassword}
            onChange={setField('newPassword')}
            onBlur={() => touch('newPassword')}
            error={errorFor('newPassword')}
            autoComplete="new-password"
            showStrength
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            value={passwordData.confirmPassword}
            onChange={setField('confirmPassword')}
            onBlur={() => touch('confirmPassword')}
            error={errorFor('confirmPassword')}
            autoComplete="new-password"
          />
        </div>
      </Surface>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-11 w-full gap-2 rounded-lg bg-primary px-6 text-white hover:bg-primary-hover sm:w-auto"
        >
          {saving ? <Spinner decorative /> : <Lock className="size-4" aria-hidden />}
          {saving ? 'Updating...' : 'Update password'}
        </Button>
      </div>
    </form>
    <TwoFactorCard />
    <SignedInDevices />
    </div>
  );
};

export default SecurityPage;
