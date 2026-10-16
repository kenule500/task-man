// Team chat: channels, direct messages, live messages over Socket.IO with a REST polling fallback.
// One connection per signed-in session (lib/chatClient.ts), started by useChatSocket in the workspace layout.
export type {
  ChannelType, ChatActivity, ChatChannel, ChatMember, ChatMessage, ChatUser, ConnectionStatus,
} from './types';
export { chatApi } from './api';
export { chatClient } from './lib/chatClient';
export { canManageChannel } from './lib/channels';
export { useChatSocket, useChatState, useChatUnread } from './hooks/useChatSocket';
export { useChatMembers } from './hooks/useChatMembers';
export { useChannelLabel } from './hooks/useChannelLabel';
export { default as ChannelList } from './components/ChannelList';
export { default as ChannelView } from './components/ChannelView';
export { default as NewChannelDialog } from './components/NewChannelDialog';
export { default as NewDmDialog } from './components/NewDmDialog';
export { default as OpenProjectChatButton } from './components/OpenProjectChatButton';
