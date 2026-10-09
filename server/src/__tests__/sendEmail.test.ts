import { sendEmail } from '../utils/sendEmail.js';
import { invitationTemplate } from '../utils/emailTemplates.js';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail })) },
}));

const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_HOST', 'EMAIL_FROM', 'NODE_ENV'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const email = { to: 'ada@example.com', subject: 'Verify your TaskMan account', text: 'Open https://app.test/verify/abc' };

beforeEach(() => {
  ENV_KEYS.forEach(key => { savedEnv[key] = process.env[key]; delete process.env[key]; });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  ENV_KEYS.forEach(key => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
  jest.restoreAllMocks();
});

describe('sendEmail', () => {
  it('sends through the Resend API when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));

    await sendEmail(email);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'TaskMan <onboarding@resend.dev>',
      to: ['ada@example.com'],
      subject: email.subject,
      text: email.text,
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('uses EMAIL_FROM as the sender when a domain is verified', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'TaskMan <noreply@taskman.app>';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await sendEmail(email);

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).from).toBe('TaskMan <noreply@taskman.app>');
  });

  it('throws a clear error when Resend rejects the email', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 }));

    await expect(sendEmail(email)).rejects.toThrow(/Resend rejected the email \(403\)/);
  });

  it('falls back to SMTP when only EMAIL_HOST is set', async () => {
    process.env.EMAIL_HOST = 'smtp.example.com';
    sendMail.mockResolvedValue({});
    const fetchMock = jest.spyOn(global, 'fetch');

    await sendEmail(email);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', subject: email.subject }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prints the email in development when no provider is configured', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await sendEmail(email);
    expect(log.mock.calls[0][0]).toContain('https://app.test/verify/abc');
  });

  it('refuses to silently drop emails in production without a provider', async () => {
    process.env.NODE_ENV = 'production';
    await expect(sendEmail(email)).rejects.toThrow(/No email provider configured/);
  });
});

describe('invitationTemplate', () => {
  it('escapes user-controlled names in the HTML body but keeps the plain-text subject readable', () => {
    const template = invitationTemplate('<script>alert(1)</script> & Co', 'Developer', 'Eve "Admin"', 'https://app.test/accept-invite/x');

    expect(template.html).not.toContain('<script>');
    expect(template.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(template.html).toContain('Eve &quot;Admin&quot;');
    expect(template.subject).toBe("You've been invited to join <script>alert(1)</script> & Co on TaskMan");
    expect(template.text).toContain('https://app.test/accept-invite/x');
  });
});
