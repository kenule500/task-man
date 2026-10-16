import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OptionSelect } from '@/features/tasks';
import {
  DEFAULT_EXPIRY, EXPIRY_OPTIONS, defaultScopes, groupScopes, scopeGroupLabel, type ScopeOption,
} from '../lib/catalog';
import { MAX_TOKEN_NAME, type ApiTokenInput } from '../types';
import { CheckGroups } from './CheckGroups';
import { DialogActions, DialogBody, DialogShell } from './DialogShell';

interface CreateTokenDialogProps {
  /** Scopes the person may grant (the ones their own role holds) */
  scopes: ScopeOption[];
  /** Resolves to an error message, or `null` once created. */
  onCreate: (input: ApiTokenInput) => Promise<string | null>;
  onClose: () => void;
}

/** Name, expiry and scopes of a new personal API token. Mount only while open. */
export const CreateTokenDialog = ({ scopes, onCreate, onClose }: CreateTokenDialogProps) => {
  const { t } = useTranslation('admin');
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY);
  const [selected, setSelected] = useState<string[]>(() => defaultScopes(scopes));
  const [nameError, setNameError] = useState('');
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const groups = useMemo(
    () => groupScopes(scopes).map(({ group, scopes: items }) => ({ id: group, label: scopeGroupLabel(group), items: items.map(({ key, label }) => ({ key, label })) })),
    [scopes],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('developers.tokenNameRequired'));
      nameRef.current?.focus();
      return;
    }
    if (selected.length === 0) {
      setFailure(t('developers.chooseScope'));
      return;
    }
    setSaving(true);
    setFailure('');
    const days = EXPIRY_OPTIONS.find(option => option.value === expiry)?.days ?? null;
    const message = await onCreate({ name: trimmed, scopes: selected, expiresInDays: days });
    setSaving(false);
    if (message) setFailure(message);
  };

  return (
    <DialogShell
      title={t('developers.newToken')}
      description={t('developers.newTokenDescription')}
      icon={<KeyRound />}
      onClose={onClose}
      initialFocus={nameRef}
    >
      <form onSubmit={event => { void submit(event); }} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          {failure && <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{failure}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('developers.name')} htmlFor={`${uid}-name`} required error={nameError}>
              <Input
                ref={nameRef}
                id={`${uid}-name`}
                value={name}
                maxLength={MAX_TOKEN_NAME}
                onChange={event => { setName(event.target.value); setNameError(''); }}
                placeholder={t('developers.tokenNamePlaceholder')}
                aria-invalid={Boolean(nameError)}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>
            <Field label={t('developers.expires')} htmlFor={`${uid}-expiry`}>
              <OptionSelect
                id={`${uid}-expiry`}
                aria-label={t('developers.expires')}
                value={expiry}
                options={EXPIRY_OPTIONS.map(({ value, label }) => ({ value, label }))}
                onChange={setExpiry}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-900">{t('developers.scopesHeading')}</p>
            <p className="mb-3 text-xs text-slate-600">
              {t('developers.scopesHint')}
            </p>
            <CheckGroups groups={groups} selected={selected} showKeys onChange={setSelected} />
            <p className="mt-2 text-xs text-slate-600" aria-live="polite">
              {t('developers.scopesSelected', { count: selected.length })}
            </p>
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-9">{t('actions.cancel')}</Button>
          <Button type="submit" disabled={saving} className="h-11 sm:h-9">{saving ? t('developers.creating') : t('developers.createToken')}</Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
};
