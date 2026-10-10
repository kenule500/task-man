import { KeyRound, Trash2 } from 'lucide-react';
import { Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { describeExpiry } from '../lib/snippets';
import type { ApiToken } from '../types';

interface TokenListProps {
  tokens: ApiToken[];
  now?: Date;
  onRevoke: (token: ApiToken) => void;
}

/** Active tokens as cards: name, `tm_abcd…` prefix, scope count, last use and expiry. */
export const TokenList = ({ tokens, now, onRevoke }: TokenListProps) => (
  <ul aria-label="API tokens" className="space-y-3">
    {tokens.map(token => {
      const expiry = describeExpiry(token.expiresAt, now);
      const lastUsed = token.lastUsedAt ? `Last used ${formatRelativeTime(token.lastUsedAt, now)}` : 'Never used';
      return (
        <li key={token._id}>
          <Surface as="article" radius="xl" padding="sm" className="flex items-start gap-3 sm:p-4" aria-label={token.name}>
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-sm font-semibold text-slate-900">{token.name}</h3>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">tm_{token.prefix}…</code>
                {expiry === 'Expired' && <Tag tone="danger">Expired</Tag>}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                <span>{token.scopes.length} {token.scopes.length === 1 ? 'scope' : 'scopes'}</span>
                <span aria-hidden> · </span>
                <span>{lastUsed}</span>
                <span aria-hidden> · </span>
                <span>{expiry}</span>
              </p>
              <p className="sr-only">Scopes: {token.scopes.join(', ')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onRevoke(token)}
              className="h-10 shrink-0 gap-1.5 px-3 text-sm md:h-9"
            >
              <Trash2 aria-hidden />
              Revoke<span className="sr-only"> {token.name}</span>
            </Button>
          </Surface>
        </li>
      );
    })}
  </ul>
);
