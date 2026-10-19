import { Types } from 'mongoose';
import ChatChannel from '../models/chatChannelModel.js';
import Project from '../models/projectModel.js';
import { createMessageInChannel } from '../controllers/chatMessageController.js';
import { contextOf } from '../realtime/socket.js';
import { registerChatEvents } from '../realtime/chatEvents.js';

jest.mock('../realtime/socket.js', () => ({ __esModule: true, contextOf: jest.fn() }));
jest.mock('../models/chatChannelModel.js', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../models/projectModel.js', () => ({
  __esModule: true,
  default: { exists: jest.fn(), find: jest.fn() },
}));
jest.mock('../controllers/chatMessageController.js', () => ({
  __esModule: true,
  createMessageInChannel: jest.fn(),
  messageView: (message: unknown) => message,
}));

const ChatChannelMock = ChatChannel as unknown as Record<string, jest.Mock>;
const ProjectMock = Project as unknown as Record<string, jest.Mock>;
const contextMock = contextOf as unknown as jest.Mock;
const createMessageMock = createMessageInChannel as unknown as jest.Mock;

const workspaceId = new Types.ObjectId();
const channelId = new Types.ObjectId();
const me = new Types.ObjectId();

const ctx = {
  userId: String(me),
  workspaceId: String(workspaceId),
  slug: 'acme',
  permissions: ['chat:read', 'chat:write'],
};

const setup = () => {
  const handlers: Record<string, (payload?: unknown, ack?: (response: unknown) => void) => Promise<void>> = {};
  const roomEmit = jest.fn();
  const socket = {
    id: 'socket-1',
    on: jest.fn((event: string, handler: typeof handlers[string]) => {
      handlers[event] = handler;
    }),
    to: jest.fn(() => ({ emit: roomEmit })),
    join: jest.fn(async () => undefined),
    leave: jest.fn(async () => undefined),
  };
  registerChatEvents({} as never, socket as never);
  return { handlers, socket, roomEmit };
};

beforeEach(() => {
  Object.values(ChatChannelMock).forEach(fn => fn.mockReset?.());
  Object.values(ProjectMock).forEach(fn => fn.mockReset?.());
  contextMock.mockReset();
  contextMock.mockReturnValue(ctx);
});

describe('chat:typing', () => {
  it('AC-022: broadcasts to the channel room without persisting or echoing to the sender', async () => {
    ChatChannelMock.findOne.mockResolvedValue({
      _id: channelId,
      workspace: workspaceId,
      kind: 'team',
      participants: [],
      archived: false,
    });
    const { handlers, socket, roomEmit } = setup();

    await handlers['chat:typing']({ channelId: channelId.toString() });

    expect(socket.to).toHaveBeenCalledWith(`channel:${String(channelId)}`);
    expect(roomEmit).toHaveBeenCalledWith('chat:typing', {
      channelId: String(channelId),
      userId: String(me),
    });
    // Typing is ephemeral: no message is written and the sender's own socket is not addressed
    expect(createMessageMock).not.toHaveBeenCalled();
    expect(ChatChannelMock.findOne).toHaveBeenCalledWith({
      _id: String(channelId),
      workspace: ctx.workspaceId,
    });
  });
});
