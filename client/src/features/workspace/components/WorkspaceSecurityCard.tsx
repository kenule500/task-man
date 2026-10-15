import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, SectionHeader, Surface, SwitchField } from '@/components/ds';
import { useTwoFactorStatus } from '@/features/account/hooks/useTwoFactorStatus';
import { getApiErrorMessage } from '@/utils/api';
import { workspaceApi } from '../api';

interface WorkspaceSecurityCardProps {
  workspaceSlug: string;
  /** Current policy value */
  require2fa: boolean;
  /** Only people with settings:manage (owners and admins) can change it */
  canManage: boolean;
  onChange: (require2fa: boolean) => void;
}

/** "Security" section of the workspace settings: require two-factor authentication for every member. */
export const WorkspaceSecurityCard = ({ workspaceSlug, require2fa, canManage, onChange }: WorkspaceSecurityCardProps) => {
  const { status } = useTwoFactorStatus();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // While the status loads we do not claim the person lacks two-factor
  const lacksTwoFactor = status !== null && !status.enabled;

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError('');
    try {
      const updated = await workspaceApi.update(workspaceSlug, { require2fa: next });
      onChange(Boolean(updated.security?.require2fa));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'We could not change this setting. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface as="section" aria-labelledby="workspace-security-heading" className="space-y-4 sm:p-6">
      <SectionHeader className="mb-0" title={<span id="workspace-security-heading">Security</span>} />

      {lacksTwoFactor && canManage && (
        <Alert tone="warning" title="Turn on two-factor authentication for your own account first">
          You would be locked out of this workspace otherwise.{' '}
          <Link to="/settings/security" className="font-semibold underline underline-offset-2">
            Set it up in Security settings
          </Link>
          .
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <SwitchField
        label="Require two-factor authentication"
        description="Members without two-factor authentication cannot open this workspace until they turn it on. They can do that in their own Security settings, and they cannot turn it off while this is on."
        checked={require2fa}
        disabled={!canManage || saving || (!require2fa && lacksTwoFactor)}
        onCheckedChange={(checked) => void toggle(checked)}
      />
      {!canManage && (
        <p className="text-xs text-slate-600">Only owners and admins can change this setting.</p>
      )}
    </Surface>
  );
};
