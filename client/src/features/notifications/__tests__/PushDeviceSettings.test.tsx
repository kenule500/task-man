import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pushApi } from '../api';
import PushDeviceSettings from '../components/PushDeviceSettings';
import { unsubscribeThisDevice } from '../hooks/usePushSubscription';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  notificationsApi: {},
  pushApi: { config: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() },
}));

const mockedApi = pushApi as jest.Mocked<typeof pushApi>;

// "AQID" is the base64url of bytes 1, 2, 3
const PUBLIC_KEY = 'AQID';
const ENDPOINT = 'https://push.example/device-1';

const makeSubscription = () => ({
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: jest.fn().mockResolvedValue(true),
});

let existing: ReturnType<typeof makeSubscription> | null;
let subscribeSpy: jest.Mock;
let requestPermission: jest.Mock;

const setupBrowser = (permission: NotificationPermission = 'default') => {
  const created = makeSubscription();
  subscribeSpy = jest.fn().mockResolvedValue(created);
  const registration = {
    pushManager: { getSubscription: jest.fn(async () => existing), subscribe: subscribeSpy },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration), getRegistration: async () => registration },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
  requestPermission = jest.fn().mockResolvedValue('granted');
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: Object.assign(function Notification() {}, { permission, requestPermission }),
  });
  return created;
};

const removeBrowserSupport = () => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
};

beforeEach(() => {
  existing = null;
  mockedApi.config.mockResolvedValue({ publicKey: PUBLIC_KEY, enabled: true });
  mockedApi.subscribe.mockResolvedValue(undefined);
  mockedApi.unsubscribe.mockResolvedValue(undefined);
});
afterEach(removeBrowserSupport);

describe('PushDeviceSettings', () => {
  it('explains an unsupported browser, including the iOS Home Screen rule', async () => {
    removeBrowserSupport();
    render(<PushDeviceSettings />);
    expect(await screen.findByText('Not available in this browser')).toBeInTheDocument();
    expect(screen.getByText(/Home\s+Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mockedApi.config).not.toHaveBeenCalled();
  });

  it('says so when the server has push turned off', async () => {
    setupBrowser();
    mockedApi.config.mockResolvedValue({ publicKey: null, enabled: false });
    render(<PushDeviceSettings />);
    expect(await screen.findByText('Not set up on this server')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells people how to re-enable blocked notifications and offers no button', async () => {
    setupBrowser('denied');
    render(<PushDeviceSettings />);
    expect(await screen.findByText('Notifications are blocked')).toBeInTheDocument();
    expect(screen.getByText(/allow notifications for this site in your browser settings/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never asks for permission on load', async () => {
    setupBrowser();
    render(<PushDeviceSettings />);
    expect(await screen.findByRole('button', { name: 'Turn on for this device' })).toBeEnabled();
    expect(screen.getByText('Push is off on this device.')).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('asks on click, subscribes with the server key and registers the subscription', async () => {
    const created = setupBrowser();
    render(<PushDeviceSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));

    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockedApi.subscribe).toHaveBeenCalledWith(created.toJSON()));
    const options = subscribeSpy.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual([1, 2, 3]);
    expect(await screen.findByText('Push is on for this device.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off on this device' })).toBeInTheDocument();
  });

  it('shows the blocked help when the permission dialog is refused', async () => {
    setupBrowser();
    requestPermission.mockResolvedValue('denied');
    render(<PushDeviceSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await screen.findByText('Notifications are blocked')).toBeInTheDocument();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('stays off with a message when the dialog is dismissed', async () => {
    setupBrowser();
    requestPermission.mockResolvedValue('default');
    render(<PushDeviceSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission was not granted');
    expect(screen.getByText('Push is off on this device.')).toBeInTheDocument();
  });

  it('rolls back the browser subscription when the server rejects it', async () => {
    const created = setupBrowser();
    mockedApi.subscribe.mockRejectedValue({ response: { data: { message: 'Push notifications are not enabled on this server' } } });
    render(<PushDeviceSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('not enabled on this server');
    expect(created.unsubscribe).toHaveBeenCalled();
    expect(screen.getByText('Push is off on this device.')).toBeInTheDocument();
  });

  it('shows on for a device that is already subscribed and turns off on both sides', async () => {
    setupBrowser('granted');
    existing = makeSubscription();
    render(<PushDeviceSettings />);
    expect(await screen.findByText('Push is on for this device.')).toBeInTheDocument();
    // The server is kept in step with the browser
    await waitFor(() => expect(mockedApi.subscribe).toHaveBeenCalledWith(existing?.toJSON()));

    await userEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    await waitFor(() => expect(mockedApi.unsubscribe).toHaveBeenCalledWith(ENDPOINT));
    expect(existing?.unsubscribe).toHaveBeenCalled();
    expect(await screen.findByText('Push is off on this device.')).toBeInTheDocument();
  });

  it('keeps push on and reports the problem when the server cannot be reached', async () => {
    setupBrowser('granted');
    existing = makeSubscription();
    render(<PushDeviceSettings />);
    await screen.findByText('Push is on for this device.');
    mockedApi.unsubscribe.mockRejectedValue(new Error('Network down'));

    await userEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByText('Push is on for this device.')).toBeInTheDocument();
  });
});

describe('unsubscribeThisDevice', () => {
  it('removes the subscription on the server and in the browser, and never throws', async () => {
    setupBrowser('granted');
    existing = makeSubscription();
    await unsubscribeThisDevice();
    expect(mockedApi.unsubscribe).toHaveBeenCalledWith(ENDPOINT);
    expect(existing.unsubscribe).toHaveBeenCalled();

    mockedApi.unsubscribe.mockRejectedValue(new Error('offline'));
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
  });

  it('does nothing without push support', async () => {
    removeBrowserSupport();
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(mockedApi.unsubscribe).not.toHaveBeenCalled();
  });
});
