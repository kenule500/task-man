import { useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import { ChatView } from '@/features/chat';

/** Route screen for /:workspaceSlug/chat and /:workspaceSlug/chat/:channelId. */
const ChatPage = () => {
  const { channelId } = useParams<{ channelId: string }>();

  return (
    <AppShell>
      <ChatView channelId={channelId} />
    </AppShell>
  );
};

export default ChatPage;
