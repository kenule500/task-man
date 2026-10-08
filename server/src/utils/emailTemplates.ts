/**
 * Email template functions.
 * Each function returns { subject, text, html } so controllers can spread
 * them directly into `sendEmail({ to, ...template(link) })`.
 */

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// Shared HTML wrapper — the frame around every email
const wrap = (content: string) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
    ${content}
  </div>
`;

// Shared brand header — the TaskMan logo block
const brandHeader = () => `
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: #2563EB; border-radius: 12px; color: white; font-size: 20px; font-weight: bold; line-height: 48px;">T</div>
  </div>
`;

// Shared CTA button
const ctaButton = (href: string, label: string) => `
  <div style="text-align: center; margin: 32px 0;">
    <a href="${href}" style="display: inline-block; padding: 14px 32px; background: #2563EB; color: white; text-decoration: none; border-radius: 10px; font-weight: 600;">${label}</a>
  </div>
`;

// ================================================================
// Verify Email (sent on signup + resend)
// ================================================================
export const verifyEmailTemplate = (verifyLink: string): EmailTemplate => ({
  subject: 'Verify your TaskMan account',
  text: `Click the link below to verify your account:\n\n${verifyLink}\n\nThis link expires in 24 hours.`,
  html: wrap(`
    ${brandHeader()}
    <h2 style="color: #0f172a; margin: 0 0 16px;">Welcome to TaskMan!</h2>
    <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
      Click the button below to verify your email address and activate your account.
    </p>

    ${ctaButton(verifyLink, 'Verify Email')}

    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
      Or copy this link into your browser:
    </p>
    <p style="color: #2563EB; font-size: 13px; word-break: break-all; margin: 8px 0 0;">
      ${verifyLink}
    </p>

    <p style="color: #94a3b8; font-size: 12px; margin: 32px 0 0; padding-top: 24px; border-top: 1px solid #e2e8f0;">
      This link expires in 24 hours. If you didn't sign up for TaskMan, you can safely ignore this email.
    </p>
  `),
});

// ================================================================
// Reset Password (sent on forgot-password)
// ================================================================
export const resetPasswordTemplate = (resetLink: string): EmailTemplate => ({
  subject: 'Reset your TaskMan password',
  text: `Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 1 hour.`,
  html: wrap(`
    ${brandHeader()}
    <h2 style="color: #0f172a; margin: 0 0 16px;">Reset your password</h2>
    <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
      We received a request to reset your TaskMan password. Click the button below to choose a new one.
    </p>

    ${ctaButton(resetLink, 'Reset Password')}

    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
      Or copy this link into your browser:
    </p>
    <p style="color: #2563EB; font-size: 13px; word-break: break-all; margin: 8px 0 0;">
      ${resetLink}
    </p>

    <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin: 24px 0;">
      <p style="color: #92400e; font-size: 13px; margin: 0;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.
      </p>
    </div>
  `),
});


// ================================================================
// Workspace Invitation (sent when a member is invited)
// ================================================================
export const invitationTemplate = (
  workspaceName: string,
  roleName: string,
  inviterName: string,
  acceptLink: string
): EmailTemplate => ({
  subject: `You've been invited to join ${workspaceName} on TaskMan`,
  text: `${inviterName} has invited you to join the workspace "${workspaceName}" as a ${roleName}.\n\nAccept your invitation:\n${acceptLink}\n\nThis link expires in 3 days.`,
  html: wrap(`
    ${brandHeader()}
    <h2 style="color: #0f172a; margin: 0 0 16px;">You've been invited!</h2>
    <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
      <strong style="color: #0f172a;">${inviterName}</strong> has invited you to join the workspace
      <strong style="color: #0f172a;">${workspaceName}</strong> as a
      <strong style="color: #0f172a;">${roleName}</strong>.
    </p>

    ${ctaButton(acceptLink, 'Accept Invitation')}

    <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
      Or copy this link into your browser:
    </p>
    <p style="color: #2563EB; font-size: 13px; word-break: break-all; margin: 8px 0 0;">
      ${acceptLink}
    </p>

    <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin: 24px 0;">
      <p style="color: #92400e; font-size: 13px; margin: 0;">
        This invitation expires in 3 days. If you don't recognize ${inviterName}, you can safely ignore this email.
      </p>
    </div>
  `),
});