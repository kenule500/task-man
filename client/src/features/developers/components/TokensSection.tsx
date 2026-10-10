import { useMemo, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { EmptyState, ErrorState, SectionHeader, SkeletonCards, Surface, toast } from '@/components/ds';
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
      return err instanceof Error ? err.message : 'We could not create the token.';
    }
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await onRevoke(revoking._id);
      toast.success(`"${revoking.name}" revoked`);
      setRevoking(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not revoke the token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface radius="xl" className="space-y-4 sm:p-6">
      <SectionHeader
        title="API tokens"
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
            New token
          </Button>
        )}
      />
      <p className="text-sm text-slate-600">
        Personal tokens let scripts and tools call the TaskMan API as you in this workspace. They only work here, only with the scopes you give them, and never beyond your own role.
      </p>

      {loading ? (
        <SkeletonCards count={2} columns="grid-cols-1" />
      ) : error ? (
        <ErrorState
          title="Could not load your API tokens"
          reason={error}
          nextStep="Check your connection and try again."
          action={<Button type="button" onClick={onReload} className="h-10 px-4 md:h-9">Try again</Button>}
        />
      ) : tokens.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          icon={<KeyRound />}
          title="No API tokens yet"
          description="Create a token to call the API from a script, a CI job or another tool."
        />
      ) : (
        <TokenList tokens={tokens} onRevoke={setRevoking} />
      )}
      {atLimit && (
        <p role="status" className="text-sm text-slate-600">
          You have {MAX_ACTIVE_TOKENS} active tokens, the most you can have here. Revoke one to create another.
        </p>
      )}

      <CodeBlock label="How to use a token" code={curlSnippet(apiUrl, slug)} />

      {creating && <CreateTokenDialog scopes={scopes} onCreate={create} onClose={() => setCreating(false)} />}
      {revealed && (
        <SecretReveal title="Your new API token" noun="API token" secret={revealed.token} onClose={() => setRevealed(null)} />
      )}
      <ConfirmActionDialog
        open={Boolean(revoking)}
        onOpenChange={open => { if (!open && !busy) setRevoking(null); }}
        title="Revoke this token?"
        description={revoking ? `"${revoking.name}" stops working right away. Anything that uses it will get an authorization error.` : ''}
        confirmLabel="Revoke token"
        busyLabel="Revoking…"
        busy={busy}
        onConfirm={() => { void confirmRevoke(); }}
      />
    </Surface>
  );
};
