import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessagesSquare } from 'lucide-react';
import { toast } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import { useChatState } from '../hooks/useChatSocket';
import { chatClient } from '../lib/chatClient';

const CLASSES = 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none sm:h-9';

/**
 * "Project chat" on the project page: opens the project's channel, creating it the first time.
 * People who cannot create channels only see the button once the channel exists.
 */
const OpenProjectChatButton = ({ slug, projectName }: { slug: string; projectName: string }) => {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { channels } = useChatState();
  const [opening, setOpening] = useState(false);

  const existing = channels.find(channel => channel.type === 'project' && channel.project.toLowerCase() === projectName.toLowerCase());
  const href = (id: string) => `/${slug}/chat/${id}`;

  if (existing) {
    return (
      <Link to={href(existing._id)} className={buttonVariants({ variant: 'outline', className: CLASSES })}>
        <MessagesSquare className="size-4" aria-hidden /> {t('project.open')}
      </Link>
    );
  }
  if (!can('tasks:write')) return null;

  const open = async () => {
    setOpening(true);
    try {
      const channel = await chatApi.createChannel(slug, { type: 'project', project: projectName });
      chatClient.upsertChannel(channel);
      navigate(href(channel._id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('project.failed')));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={() => void open()} disabled={opening} className={CLASSES}>
      <MessagesSquare className="size-4" aria-hidden /> {opening ? t('project.opening') : t('project.open')}
    </Button>
  );
};

export default OpenProjectChatButton;
