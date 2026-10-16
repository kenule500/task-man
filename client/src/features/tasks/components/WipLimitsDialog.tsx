import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ds';
import { fieldMessageId } from '@/components/ds/variants';
import { TASK_STATUSES } from '../constants';
import { MAX_WIP_LIMIT, parseWipInput, type WipLimits } from '../lib/wip';
import type { TaskStatus } from '../types';

interface WipLimitsDialogProps {
  limits: WipLimits;
  /** Column whose field receives focus (the one whose menu was used). */
  focusStatus: TaskStatus;
  onClose: () => void;
  /** Resolves to an error message, or `null` once saved. */
  onSave: (limits: WipLimits) => Promise<string | null>;
}

/** Soft limits per column: an empty field means "no limit". Mount it only while it is open. */
const WipLimitsDialog = ({ limits, focusStatus, onClose, onSave }: WipLimitsDialogProps) => {
  const { t } = useTranslation('tasks');
  const [values, setValues] = useState<Record<TaskStatus, string>>(
    () => Object.fromEntries(TASK_STATUSES.map(status => [status, limits[status]?.toString() ?? ''])) as Record<TaskStatus, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<TaskStatus, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const focusRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = { ...limits };
    const found: Partial<Record<TaskStatus, string>> = {};
    for (const status of TASK_STATUSES) {
      const parsed = parseWipInput(values[status]);
      if (parsed === undefined) found[status] = t('wip.error', { max: MAX_WIP_LIMIT });
      else next[status] = parsed;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setFailure(null);
    const message = await onSave(next);
    setSaving(false);
    if (message) setFailure(message);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent initialFocus={focusRef} className="sm:max-w-sm">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('wip.title')}</DialogTitle>
            <DialogDescription>
              {t('wip.description')}
            </DialogDescription>
          </DialogHeader>

          {TASK_STATUSES.map(status => {
            const id = `wip-limit-${status}`;
            return (
              <Field key={status} label={t(`status.${status}`)} htmlFor={id} error={errors[status]}>
                <Input
                  ref={status === focusStatus ? focusRef : undefined}
                  id={id}
                  inputMode="numeric"
                  placeholder={t('wip.noLimit')}
                  value={values[status]}
                  onChange={event => setValues(prev => ({ ...prev, [status]: event.target.value }))}
                  aria-invalid={Boolean(errors[status])}
                  aria-describedby={errors[status] ? fieldMessageId(id) : undefined}
                  className="h-11 text-base sm:h-9 sm:text-sm"
                />
              </Field>
            );
          })}

          {failure && <p role="alert" className="text-sm text-danger-fg">{failure}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-8">{t('actions.cancel')}</Button>
            <Button type="submit" disabled={saving} className="h-11 sm:h-8">{saving ? t('actions.saving') : t('wip.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WipLimitsDialog;
