import { UserAvatar } from '@/components/ds';

type ChatAvatarProps = Parameters<typeof UserAvatar>[0];

/** Profile picture that screen readers skip: the person's name is always written next to it. */
const ChatAvatar = (props: ChatAvatarProps) => (
  <span aria-hidden className="contents">
    <UserAvatar {...props} />
  </span>
);

export default ChatAvatar;
