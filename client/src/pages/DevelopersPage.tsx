import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ds';
import { API_URL } from '@/config';
import { TokensSection, WebhooksSection, useTokens, useWebhooks } from '@/features/developers';
import { usePermissions } from '../hooks/usePermissions';

const DevelopersPage = () => {
  const { t } = useTranslation('admin');
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can, permissions } = usePermissions();
  const canManage = can('settings:manage');

  const tokens = useTokens(workspaceSlug);
  const webhooks = useWebhooks(workspaceSlug, canManage);

  if (!workspaceSlug) return null;

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <PageHeader
        title={t('developers.pageTitle')}
        description={t('developers.pageDescription')}
      />

      <TokensSection
        slug={workspaceSlug}
        apiUrl={API_URL}
        permissions={permissions}
        tokens={tokens.tokens}
        loading={tokens.loading}
        error={tokens.error}
        onReload={tokens.reload}
        onCreate={tokens.createToken}
        onRevoke={tokens.revokeToken}
      />

      {canManage && (
        <WebhooksSection
          hooks={webhooks.hooks}
          loading={webhooks.loading}
          error={webhooks.error}
          onReload={webhooks.reload}
          onCreate={webhooks.createHook}
          onUpdate={webhooks.updateHook}
          onDelete={webhooks.deleteHook}
          onRotate={webhooks.rotateSecret}
          onTest={webhooks.sendTest}
          loadDeliveries={webhooks.loadDeliveries}
          onRedeliver={webhooks.redeliver}
        />
      )}
    </div>
  );
};

export default DevelopersPage;
