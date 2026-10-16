import { useMemo, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, SectionHeader, SkeletonList, Surface, toast } from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { grantableScopes } from '../lib/catalog';
import { curlSnippet } from '../lib/snippets';
import { MAX_ACTIVE_TOKENS, type ApiToken, type ApiTokenInput, type CreatedApiToken } from '../types';
import { CodeBlock } from './CodeBlock';
import { CreateTokenDialog } from './CreateTokenDialog';
import { SecretReveal } from './SecretReveal';
import { TokenList } from './TokenList';

interface TokensSectionProps {
  slug: string;
  apiUrl: string;
  /** The person's own permissions: they bound the scopes a token can get */
  permissions: string[];
  tokens: ApiToken[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onCreate: (input: ApiTokenInput) => Promise<CreatedApiToken>;
  onRevoke: (id: string) => Promise<void>;
}

/** Personal API tokens: list, create (with a one-time reveal), revoke, and a short usage example. */
export const TokensSection = ({ slug, apiUrl, permissions, tokens, loading, error, onReload, onCreate, onRevoke }: TokensSectionProps) => {
  const { t } = useTranslation('admin');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<CreatedApiToken | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);
  const [busy, setBusy] = useState(false);
  const scopes = useMemo(() => grantableScopes(permissions), [permissions]);
  const atLimit = tokens.length >= MAX_ACTIVE_TOKENS;

  const create = async (input: ApiTokenInput): Promise<string | null> => {
    try {
      const created = await onCreate(input);
      setCreating(false);
      setRevealed(created);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t('developers.tokenCreateError');
    }
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await onRevoke(revoking._id);
      toast.success(t('developers.tokenRevoked', { name: revoking.name }));
      setRevoking(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('developers.tokenRevokeError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface radius="xl" className="space-y-4 sm:p-6">
      <SectionHeader
        title={t('developers.tokensTitle')}
        icon={<KeyRound aria-hidden className="size-4 text-slate-500" />}
        count={loading || error ? undefined : tokens.length}
        className="mb-0"
        action={(
          <Button
            type="button"
            disabled={loading || Boolean(error) || atLimit || scopes.length === 0}
            onClick={() => setCreating(true)}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            {t('developers.newTokenButton')}
          </Button>
        )}
      />
      <p className="text-sm text-slate-600">
        {t('developers.tokensIntro')}
      </p>

      {loading ? (
        <SkeletonList label={t('developers.tokensLoading')} rows={2} avatar={false} />
      ) : error ? (
        <ErrorState
          title={t('developers.tokensLoadFailed')}
          reason={error}
          nextStep={t('developers.checkConnection')}
          action={<Button type="button" onClick={onReload} className="h-10 px-4 md:h-9">{t('actions.retry')}</Button>}
        />
      ) : tokens.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          icon={<KeyRound />}
          title={t('developers.noTokens')}
          description={t('developers.noTokensBody')}
        />
      ) : (
        <TokenList tokens={tokens} onRevoke={setRevoking} />
      )}
      {atLimit && (
        <p role="status" className="text-sm text-slate-600">
          {t('developers.tokenLimit', { max: MAX_ACTIVE_TOKENS })}
        </p>
      )}

      <CodeBlock label={t('developers.howToUseToken')} code={curlSnippet(apiUrl, slug)} />

      {creating && <CreateTokenDialog scopes={scopes} onCreate={create} onClose={() => setCreating(false)} />}
      {revealed && (
        <SecretReveal title={t('developers.newTokenSecretTitle')} noun={t('developers.nounToken')} isToken secret={revealed.token} onClose={() => setRevealed(null)} />
      )}
      <ConfirmActionDialog
        open={Boolean(revoking)}
        onOpenChange={open => { if (!open && !busy) setRevoking(null); }}
        title={t('developers.revokeTitle')}
        description={revoking ? t('developers.revokeBody', { name: revoking.name }) : ''}
        confirmLabel={t('developers.revokeConfirm')}
        busyLabel={t('developers.revoking')}
        busy={busy}
        onConfirm={() => { void confirmRevoke(); }}
      />
    </Surface>
  );
};
