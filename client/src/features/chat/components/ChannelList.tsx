import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Hash, Lock, MessageSquarePlus, Plus } from 'lucide-react';
import { ErrorState, SkeletonList } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dmPartner, groupChannels } from '../lib/channels';
import type { ChatChannel } from '../types';
import OnlineDot from './OnlineDot';
import ChatAvatar from './ChatAvatar';

interface ChannelListProps {
  channels: ChatChannel[];
  loaded: boolean;
  error: string;
  onRetry: () => void;
  selfId: string;
  activeId?: string;
  online: string[];
  labelOf: (channel: ChatChannel) => string;
  hrefFor: (channel: ChatChannel) => string;
  canCreate: boolean;
  onNewChannel: () => void;
  onNewDm: () => void;
}

const Row = ({
  channel, active, online, label, href, selfId,
}: { channel: ChatChannel; active: boolean; online: boolean; label: string; href: string; selfId: string }) => {
  const { t } = useTranslation('chat');
  const partner = channel.type === 'dm' ? dmPartner(channel, selfId) : null;
  const unread = channel.unread;
  return (
    <li>
      <Link
        to={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary md:min-h-9',
          active ? 'bg-info-bg font-semibold text-info-fg' : 'text-slate-700 hover:bg-slate-100',
          unread > 0 && !active && 'font-semibold text-slate-900',
        )}
      >
        {partner ? (
          <span className="relative shrink-0">
            <ChatAvatar name={partner.name} src={partner.avatarUrl} size="sm" />
            <OnlineDot online={online} className="absolute -bottom-0.5 -end-0.5" />
          </span>
        ) : (
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center text-slate-500">
            {channel.type === 'project' ? <FolderKanban className="size-4" /> : channel.private ? <Lock className="size-4" /> : <Hash className="size-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {label}
          {channel.private && channel.type !== 'dm' && <span className="sr-only"> ({t('channel.private')})</span>}
        </span>
        {unread > 0 && (
          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white">
            <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
            <span className="sr-only">{t('list.unread', { unread })}</span>
          </span>
        )}
      </Link>
    </li>
  );
};

const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="px-2 pb-3">
    <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {action}
    </div>
    <ul className="space-y-0.5">{children}</ul>
  </section>
);

/** Channels grouped Team / Projects / Direct messages with unread counts and online dots. */
const ChannelList = ({
  channels, loaded, error, onRetry, selfId, activeId, online, labelOf, hrefFor, canCreate, onNewChannel, onNewDm,
}: ChannelListProps) => {
  const { t } = useTranslation('chat');
  const groups = groupChannels(channels);
  const onlineSet = new Set(online);

  const row = (channel: ChatChannel) => (
    <Row
      key={channel._id}
      channel={channel}
      active={channel._id === activeId}
      online={channel.type === 'dm' && onlineSet.has(dmPartner(channel, selfId)?._id ?? '')}
      label={labelOf(channel)}
      href={hrefFor(channel)}
      selfId={selfId}
    />
  );

  return (
    <nav aria-label={t('list.label')} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <Button type="button" variant="outline" size="sm" onClick={onNewDm} className="gap-1.5">
          <MessageSquarePlus aria-hidden /> {t('list.newMessage')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
        {!loaded && <div className="p-3"><SkeletonList rows={5} trailing={false} bare label={t("list.loading")} /></div>}
        {loaded && error && channels.length === 0 && (
          <div className="p-3">
            <ErrorState
              title={t('list.errorTitle')}
              reason={error}
              nextStep={t('list.errorNext')}
              action={<Button type="button" onClick={onRetry}>{t('list.retry')}</Button>}
            />
          </div>
        )}
        {loaded && (channels.length > 0 || !error) && (
          <>
            <Section
              title={t('list.team')}
              action={canCreate && (
                <Button type="button" variant="ghost" size="icon-xs" onClick={onNewChannel} aria-label={t('list.newChannel')} title={t('list.newChannel')}>
                  <Plus aria-hidden />
                </Button>
              )}
            >
              {groups.team.map(row)}
            </Section>
            {groups.projects.length > 0 && <Section title={t('list.projects')}>{groups.projects.map(row)}</Section>}
            <Section title={t('list.direct')}>
              {groups.direct.map(row)}
              {groups.direct.length === 0 && <li className="px-2.5 py-1 text-xs text-slate-500">{t('list.noDirect')}</li>}
            </Section>
          </>
        )}
      </div>
    </nav>
  );
};

export default ChannelList;
