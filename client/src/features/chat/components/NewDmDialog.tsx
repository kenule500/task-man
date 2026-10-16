import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';
import { SearchInput, toast } from '@/components/ds';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/utils/api';
import type { ChatMember } from '../types';
import OnlineDot from './OnlineDot';
import ChatAvatar from './ChatAvatar';

interface NewDmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: ChatMember[];
  selfId: string;
  online: string[];
  onPick: (member: ChatMember) => Promise<void>;
}

/** Pick a colleague to message directly (opens the same conversation every time). */
const NewDmDialog = ({ open, onOpenChange, members, selfId, online, onPick }: NewDmDialogProps) => {
  const { t } = useTranslation('chat');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const list = members.filter(member => member._id !== selfId && member.name.toLowerCase().includes(needle));
  const onlineSet = new Set(online);

  const pick = async (member: ChatMember) => {
    setBusyId(member._id);
    try {
      await onPick(member);
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('newDm.failed')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) setQuery(''); onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 border border-slate-200 bg-white sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <MessageSquarePlus className="size-5 text-primary" aria-hidden /> {t('newDm.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{t('newDm.description')}</DialogDescription>
        </DialogHeader>
        <SearchInput label={t('newDm.search')} value={query} onValueChange={setQuery} />
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" aria-label={t('newDm.listLabel')}>
          {list.map(member => (
            <li key={member._id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void pick(member)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-start text-sm text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              >
                <span className="relative shrink-0">
                  <ChatAvatar name={member.name} src={member.avatarUrl} size="sm" />
                  <OnlineDot online={onlineSet.has(member._id)} className="absolute -bottom-0.5 -end-0.5" />
                </span>
                <span className="truncate">{member.name}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-slate-500">{t('newDm.empty')}</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default NewDmDialog;
