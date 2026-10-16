import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Composer from '../components/Composer';
import { MAX_MESSAGE_LENGTH } from '../lib/limits';
import { ANA, BEN, SAM } from './fixtures';

const members = [ANA, BEN, SAM];

const setup = (overrides: Partial<React.ComponentProps<typeof Composer>> = {}) => {
  const onSend = jest.fn().mockResolvedValue(undefined);
  const onDraftChange = jest.fn();
  const onTyping = jest.fn();
  render(
    <Composer
      channelName="# general"
      members={members}
      selfId={ANA._id}
      initialDraft=""
      onDraftChange={onDraftChange}
      onSend={onSend}
      onTyping={onTyping}
      {...overrides}
    />,
  );
  const field = screen.getByRole('combobox') as HTMLTextAreaElement;
  return { field, onSend, onDraftChange, onTyping, user: userEvent.setup() };
};

describe('Composer', () => {
  it('sends on Enter, clears the box and keeps Shift+Enter for new lines', async () => {
    const { field, onSend, user } = setup();
    await user.type(field, 'first line{Shift>}{Enter}{/Shift}second line');
    expect(field.value).toBe('first line\nsecond line');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('first line\nsecond line'));
    await waitFor(() => expect(field.value).toBe(''));
  });

  it('does not send an empty or whitespace-only message', async () => {
    const { field, onSend, user } = setup();
    await user.type(field, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the text when sending fails', async () => {
    const { field, user } = setup({ onSend: jest.fn().mockRejectedValue(new Error('offline')) });
    await user.type(field, 'important{Enter}');
    await waitFor(() => expect(field.disabled).toBe(false));
    expect(field.value).toBe('important');
  });

  it('announces typing and remembers the draft', async () => {
    const { field, onTyping, onDraftChange, user } = setup();
    await user.type(field, 'hi');
    expect(onTyping).toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenLastCalledWith('hi');
  });

  it('suggests members after @, picks with the keyboard and never suggests yourself', async () => {
    const { field, onSend, user } = setup();
    await user.type(field, 'hello @');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName(BEN.name);
    expect(options[1]).toHaveAccessibleName(SAM.name);
    expect(field).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowDown}{Enter}');
    expect(field.value).toBe('hello @Sam Rivera ');
    expect(screen.queryByRole('listbox')).toBeNull();
    // Enter picked the member; it did not send
    expect(onSend).not.toHaveBeenCalled();
  });

  it('filters while typing, closes with Escape and picks with the mouse', async () => {
    const { field, user } = setup();
    await user.type(field, '@ben');
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.clear(field);
    await user.type(field, '@sa');
    await user.click(await screen.findByRole('option', { name: SAM.name }));
    expect(field.value).toBe('@Sam Rivera ');
  });

  it('blocks messages over the limit and shows the overflow', async () => {
    const { field } = setup({ initialDraft: 'x'.repeat(MAX_MESSAGE_LENGTH + 5) });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText('5 characters too many')).toBeInTheDocument();
  });

  it('shows the counter only when the message is getting long', () => {
    setup({ initialDraft: 'x'.repeat(3600) });
    expect(screen.getByText(`3600 / ${MAX_MESSAGE_LENGTH}`)).toBeInTheDocument();
  });
});
