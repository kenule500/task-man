import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import { Field, SwitchField } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/utils/api';
import { MAX_CHANNEL_NAME } from '../lib/limits';
import type { ChatMember } from '../types';
import ChatAvatar from './ChatAvatar';

interface NewChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ChatMember[];
  selfId: string;
  onCreate: (input: { name: string; private: boolean; members: string[] }) => Promise<void>;
}

/** Name a new team channel, optionally private to chosen members. */
const NewChannelDialog = ({ open, onOpenChange, members, selfId, onCreate }: NewChannelDialogProps) => {
  const { t } = useTranslation('chat');
  const id = useId();
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const others = members.filter(member => member._id !== selfId);
  const trimmed = name.trim();

  const reset = () => {
    setName('');
    setIsPrivate(false);
    setChosen([]);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) {
      setError(t('newChannel.nameRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onCreate({ name: trimmed, private: isPrivate, members: isPrivate ? chosen : [] });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t('newChannel.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (memberId: string) =>
    setChosen(current => (current.includes(memberId) ? current.filter(value => value !== memberId) : [...current, memberId]));

  return (
    <FormDialog
      open={open}
      onOpenChange={next => {
        if (!next) reset();
        onOpenChange(next);
      }}
      icon={<Hash />}
      title={t('newChannel.title')}
      description={t('newChannel.description')}
      onSubmit={event => { void submit(event); }}
      submitLabel={t('newChannel.create')}
      submittingLabel={t('newChannel.creating')}
      submitting={submitting}
      submitDisabled={!trimmed}
      error={error}
    >
      <Field label={t('newChannel.nameLabel')} htmlFor={`${id}-name`} required hint={t('newChannel.nameHint')}>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={MAX_CHANNEL_NAME}
          autoFocus
          autoComplete="off"
          placeholder={t('newChannel.namePlaceholder')}
          onChange={event => setName(event.target.value)}
        />
      </Field>

      <SwitchField
        label={t('newChannel.privateLabel')}
        description={t('newChannel.privateHelp')}
        checked={isPrivate}
        onCheckedChange={setIsPrivate}
      />

      {isPrivate && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">{t('newChannel.membersLabel')}</legend>
          {others.length === 0 && <p className="text-sm text-slate-500">{t('newChannel.noMembers')}</p>}
          <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1">
            {others.map(member => (
              <li key={member._id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-slate-800 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={chosen.includes(member._id)}
                    onChange={() => toggle(member._id)}
                    className="size-4 accent-primary"
                  />
                  <ChatAvatar name={member.name} src={member.avatarUrl} size="sm" />
                  <span className="truncate">{member.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </FormDialog>
  );
};

export default NewChannelDialog;
