import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '@/utils/api';
import Composer from '../components/Composer';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const post = api.post as jest.Mock;

const members = [
  { _id: 'me', name: 'Me' },
  { _id: 'ada', name: 'Ada Lovelace' },
  { _id: 'grace', name: 'Grace Hopper' },
];

const renderComposer = (overrides: Partial<React.ComponentProps<typeof Composer>> = {}) => {
  const props = {
    slug: 'acme',
    channelId: 'c1',
    members,
    currentUserId: 'me',
    disabled: false,
    placeholder: 'Message Team Chat',
    onSend: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const view = render(<Composer {...props} />);
  return { ...props, container: view.container };
};

beforeEach(() => {
  post.mockReset();
  // Each upload resolves with the file it actually received, so several attachments are distinct
  post.mockImplementation((_url: string, form: FormData) => {
    const file = form.get('file') as File;
    return Promise.resolve({
      data: { attachment: { id: `a-${file.name}`, name: file.name, size: file.size, type: file.type } },
    });
  });
});

describe('Composer', () => {
  it('AC-049: keeps the signed-in user out of the mention menu', async () => {
    renderComposer();
    const field = screen.getByRole('textbox', { name: 'Message' });

    await userEvent.type(field, '@');

    const menu = screen.getByRole('listbox', { name: 'Mention a teammate' });
    expect(within(menu).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(menu).queryByText('Me')).not.toBeInTheDocument();
  });

  it('AC-053: uploads several files independently and attaches each one', async () => {
    const { container } = renderComposer();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(['a'], 'one.png', { type: 'image/png' });
    const second = new File(['b'], 'two.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [first, second] } });

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('one.png')).toBeInTheDocument();
  });

  it('EC-007: refuses to send an empty message', async () => {
    const props = renderComposer();

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('AC-007: sends trimmed text and clears the field', async () => {
    const props = renderComposer();
    const field = screen.getByRole('textbox', { name: 'Message' });

    await userEvent.type(field, '  hello  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(props.onSend).toHaveBeenCalledWith('hello', expect.objectContaining({ mentionIds: [], attachmentIds: [] }));
    expect(field).toHaveValue('');
  });

  it('AC-008: a disabled composer cannot send', async () => {
    const props = renderComposer({ disabled: true, disabledReason: 'You cannot post in this channel' });

    const field = screen.getByRole('textbox', { name: 'Message' });
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute('placeholder', 'You cannot post in this channel');
    expect(props.onSend).not.toHaveBeenCalled();
  });
});
