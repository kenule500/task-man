import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTokenDialog } from '../components/CreateTokenDialog';
import { DeliveriesDialog } from '../components/DeliveriesDialog';
import { SecretReveal } from '../components/SecretReveal';
import { TokenList } from '../components/TokenList';
import { WebhookDialog } from '../components/WebhookDialog';
import { WebhookList } from '../components/WebhookList';
import { grantableScopes } from '../lib/catalog';
import type { ApiToken, Webhook, WebhookDelivery } from '../types';

jest.setTimeout(30000);

const NOW = new Date('2030-01-10T00:00:00Z');

const token = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  _id: 't1', name: 'CI pipeline', prefix: 'aB3dE5fG', scopes: ['tasks:read', 'projects:read'],
  expiresAt: '2030-02-09T00:00:00Z', lastUsedAt: null, createdAt: '2030-01-01T00:00:00Z', ...overrides,
});

const hook = (overrides: Partial<Webhook> = {}): Webhook => ({
  _id: 'w1', name: 'Deploy bot', url: 'https://example.com/hook', events: ['*'], active: true,
  lastDeliveryAt: null, failureCount: 0, createdAt: '2030-01-01T00:00:00Z', ...overrides,
});

const delivery = (overrides: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  _id: 'd1', deliveryId: '00000000-0000-4000-8000-000000000001', event: 'task.created', status: 'success', attempt: 1,
  responseStatus: 200, durationMs: 42, error: '', createdAt: '2030-01-09T23:00:00Z', ...overrides,
});

describe('TokenList', () => {
  it('shows the prefix, scope count, last use and expiry, and reports revoke', async () => {
    const onRevoke = jest.fn();
    const item = token({ lastUsedAt: '2030-01-09T00:00:00Z' });
    render(<TokenList tokens={[item, token({ _id: 't2', name: 'Old', expiresAt: null })]} now={NOW} onRevoke={onRevoke} />);

    expect(screen.getAllByText('tm_aB3dE5fG…')).toHaveLength(2);
    expect(screen.getAllByText('2 scopes')).toHaveLength(2);
    expect(screen.getByText('Last used 1 day ago')).toBeInTheDocument();
    expect(screen.getByText('Never used')).toBeInTheDocument();
    expect(screen.getByText('Expires in 30 days')).toBeInTheDocument();
    expect(screen.getByText('Never expires')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Revoke CI pipeline' }));
    expect(onRevoke).toHaveBeenCalledWith(item);
  });
});

describe('CreateTokenDialog', () => {
  const scopes = grantableScopes(['tasks:read', 'tasks:write', 'projects:read']);

  it('preselects read scopes, validates the name and sends the choices', async () => {
    const onCreate = jest.fn().mockResolvedValue(null);
    render(<CreateTokenDialog scopes={scopes} onCreate={onCreate} onClose={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: /View tasks/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Create and edit tasks/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Delete tasks/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(screen.getByText('Give the token a name so you can recognise it later.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Name/), '  Deploy script ');
    await userEvent.click(screen.getByRole('checkbox', { name: /Create and edit tasks/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Deploy script', scopes: ['projects:read', 'tasks:read', 'tasks:write'].sort(), expiresInDays: 90,
    });
  });

  it('shows the server message when creating fails', async () => {
    const onCreate = jest.fn().mockResolvedValue('You can have up to 10 active tokens. Revoke one first.');
    render(<CreateTokenDialog scopes={scopes} onCreate={onCreate} onClose={jest.fn()} />);
    await userEvent.type(screen.getByLabelText(/Name/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 10 active tokens');
  });
});

describe('SecretReveal', () => {
  it('shows the secret with a once-only warning', async () => {
    const onClose = jest.fn();
    render(<SecretReveal title="Your new API token" noun="API token" secret={`tm_${'a'.repeat(40)}`} onClose={onClose} />);
    expect(screen.getByText(`tm_${'a'.repeat(40)}`)).toBeInTheDocument();
    expect(screen.getByText('You will not see this API token again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WebhookDialog', () => {
  it('validates, then sends all events by default', async () => {
    const onSave = jest.fn().mockResolvedValue(null);
    render(<WebhookDialog onSave={onSave} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Create webhook' }));
    expect(screen.getByText('Give the webhook a name.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a full URL/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Deploy bot');
    await userEvent.type(screen.getByLabelText(/Payload URL/), 'https://example.com/hooks/taskman');
    await userEvent.click(screen.getByRole('button', { name: 'Create webhook' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ name: 'Deploy bot', url: 'https://example.com/hooks/taskman', events: ['*'] });
  });

  it('lets you pick events once "All events" is off', async () => {
    const onSave = jest.fn().mockResolvedValue(null);
    render(<WebhookDialog webhook={hook({ events: ['task.created'] })} onSave={onSave} onClose={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: /All events/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Task created' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Task deleted' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ name: 'Deploy bot', url: 'https://example.com/hook', events: ['task.created', 'task.deleted'] });
  });

  it('asks for at least one event', async () => {
    const onSave = jest.fn();
    render(<WebhookDialog webhook={hook({ events: ['task.created'] })} onSave={onSave} onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Task created' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose at least one event, or send all events.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('WebhookList', () => {
  it('shows state and reports each action for the right webhook', async () => {
    const handlers = {
      onToggle: jest.fn(), onEdit: jest.fn(), onTest: jest.fn(), onRotate: jest.fn(), onDeliveries: jest.fn(), onDelete: jest.fn(),
    };
    const item = hook({ failureCount: 3, lastDeliveryAt: '2030-01-09T00:00:00Z' });
    render(<WebhookList hooks={[item, hook({ _id: 'w2', name: 'Quiet', active: false, events: ['task.created', 'task.deleted'] })]} now={NOW} {...handlers} />);

    expect(screen.getByText('All events')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(screen.getByText('3 failed in a row')).toBeInTheDocument();
    expect(screen.getByText('Last delivery 1 day ago')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Deploy bot is on' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Quiet is off' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'Deploy bot is on' }));
    expect(handlers.onToggle).toHaveBeenCalledWith(item, false);
    await userEvent.click(screen.getByRole('button', { name: 'Send test to Deploy bot' }));
    expect(handlers.onTest).toHaveBeenCalledWith(item);
    await userEvent.click(screen.getByRole('button', { name: 'Rotate secret of Deploy bot' }));
    expect(handlers.onRotate).toHaveBeenCalledWith(item);
    await userEvent.click(screen.getByRole('button', { name: 'Deliveries of Deploy bot' }));
    expect(handlers.onDeliveries).toHaveBeenCalledWith(item);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Deploy bot' }));
    expect(handlers.onEdit).toHaveBeenCalledWith(item);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Deploy bot' }));
    expect(handlers.onDelete).toHaveBeenCalledWith(item);
  });
});

describe('DeliveriesDialog', () => {
  it('lists deliveries and redelivers one', async () => {
    const load = jest.fn().mockResolvedValue([
      delivery(),
      delivery({ _id: 'd2', deliveryId: '00000000-0000-4000-8000-000000000002', event: 'task.deleted', status: 'failed', responseStatus: 500, attempt: 2 }),
    ]);
    const redeliver = jest.fn().mockResolvedValue(delivery({ attempt: 3 }));
    render(<DeliveriesDialog webhook={hook()} load={load} redeliver={redeliver} now={NOW} onClose={jest.fn()} />);

    expect(await screen.findByText('Task created')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getAllByText('42 ms')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /Redeliver Task deleted, attempt 2/ }));
    await waitFor(() => expect(redeliver).toHaveBeenCalledWith('w1', '00000000-0000-4000-8000-000000000002'));
  });

  it('explains an empty log and a failed load', async () => {
    const { unmount } = render(<DeliveriesDialog webhook={hook()} load={jest.fn().mockResolvedValue([])} redeliver={jest.fn()} onClose={jest.fn()} />);
    expect(await screen.findByText('No deliveries yet')).toBeInTheDocument();
    unmount();

    render(<DeliveriesDialog webhook={hook()} load={jest.fn().mockRejectedValue(new Error('We could not load the deliveries.'))} redeliver={jest.fn()} onClose={jest.fn()} />);
    expect(await screen.findByText('Could not load the deliveries')).toBeInTheDocument();
  });
});
