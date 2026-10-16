import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
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
      setError(getApiErrorMessage(err, t('workspace.security.changeFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface as="section" aria-labelledby="workspace-security-heading" className="space-y-4 sm:p-6">
      <SectionHeader className="mb-0" title={<span id="workspace-security-heading">{t('workspace.security.title')}</span>} />

      {lacksTwoFactor && canManage && (
        <Alert tone="warning" title={t('workspace.security.ownFirstTitle')}>
          {t('workspace.security.ownFirst')}{' '}
          <Link to="/settings/security" className="font-semibold underline underline-offset-2">
            {t('workspace.security.setItUp')}
          </Link>
          .
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <SwitchField
        label={t('workspace.security.requireLabel')}
        description={t('workspace.security.requireDescription')}
        checked={require2fa}
        disabled={!canManage || saving || (!require2fa && lacksTwoFactor)}
        onCheckedChange={(checked) => void toggle(checked)}
      />
      {!canManage && (
        <p className="text-xs text-slate-600">{t('workspace.security.ownersOnly')}</p>
      )}
    </Surface>
  );
};
