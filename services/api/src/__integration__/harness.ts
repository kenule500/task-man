// Shared helpers for the integration tests. Import setupEnv first (jest `setupFiles` does it).
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import app, { ensureReady } from '../app.js';
import type { CapturedEmail } from './setupEnv.js';

export const PASSWORD = 'Sup3r-secret-pw';

export const http = () => request(app);

/** Connects the app to the throwaway database (seeds the system roles). */
export const startApp = async (): Promise<void> => {
  await ensureReady();
};

/** Drops the per-file database and closes the connection. */
export const stopApp = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
};

// ----------------------------------------------------------------
// Emails captured by the sendEmail mock
// ----------------------------------------------------------------
const outbox = (): CapturedEmail[] =>
  (globalThis as { __sentEmails?: CapturedEmail[] }).__sentEmails ?? [];

export const emailsTo = (to: string): CapturedEmail[] => outbox().filter(mail => mail.to === to);

/** Token of the most recent email to `to` containing a /<kind>/<token> link. */
export const latestToken = (to: string, kind: 'verify-email' | 'reset-password' | 'accept-invite'): string | null => {
  const matches = emailsTo(to)
    .map(mail => new RegExp(`/${kind}/([a-f0-9]{64})`).exec(mail.text)?.[1])
    .filter((token): token is string => Boolean(token));
  return matches.at(-1) ?? null;
};

// ----------------------------------------------------------------
// Users
// ----------------------------------------------------------------
let counter = 0;
export const uniqueEmail = (prefix = 'user'): string =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${crypto.randomBytes(2).toString('hex')}@example.com`;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
  token: string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const signup = (body: Record<string, unknown>) => http().post('/api/auth/signup').send(body);
export const login = (email: string, password = PASSWORD) =>
  http().post('/api/auth/login').send({ email, password });

/** Signup + e-mail verification via the captured link (no login: use `registerUser` for that). */
export const signupVerified = async (name: string, email = uniqueEmail(name.toLowerCase().replace(/\W+/g, ''))) => {
  const created = await signup({ name, email, password: PASSWORD });
  if (created.status !== 201) throw new Error(`signup failed: ${created.status} ${JSON.stringify(created.body)}`);
  const token = latestToken(email, 'verify-email');
  if (!token) throw new Error('no verification email captured');
  const verified = await http().get(`/api/auth/verify-email/${token}`);
  if (verified.status !== 200) throw new Error(`verification failed: ${verified.status}`);
  return { id: String(created.body._id), name, email, password: PASSWORD };
};

/** Signup, verify and log in through the real endpoints. */
export const registerUser = async (name: string): Promise<TestUser> => {
  const user = await signupVerified(name);
  const session = await login(user.email, user.password);
  if (session.status !== 200) throw new Error(`login failed: ${session.status} ${JSON.stringify(session.body)}`);
  return { ...user, token: session.body.token as string };
};

// ----------------------------------------------------------------
// Workspaces and roles
// ----------------------------------------------------------------
export interface TestWorkspace {
  id: string;
  slug: string;
  name: string;
  inviteCode: string;
}

export const createWorkspace = async (owner: TestUser, name: string): Promise<TestWorkspace> => {
  const res = await http().post('/api/workspaces').set(bearer(owner.token)).send({ name });
  if (res.status !== 201) throw new Error(`createWorkspace failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body._id, slug: res.body.slug, name: res.body.name, inviteCode: res.body.inviteCode };
};

export type SystemRoleName = 'Product Owner' | 'Scrum Master' | 'Developer' | 'Team Member' | 'Viewer';

/** System role name -> id (roles are global, so any workspace works). */
export const systemRoleIds = async (user: TestUser, slug: string): Promise<Record<SystemRoleName, string>> => {
  const res = await http().get(`/api/workspaces/${slug}/roles`).set(bearer(user.token));
  if (res.status !== 200) throw new Error(`roles failed: ${res.status}`);
  const ids: Record<string, string> = {};
  for (const role of res.body as { _id: string; name: string; isSystem: boolean }[]) {
    if (role.isSystem) ids[role.name] = role._id;
  }
  return ids as Record<SystemRoleName, string>;
};

/** Joins `user` through the invite code (always Viewer) and lets the owner promote them. */
export const joinAs = async (
  workspace: TestWorkspace,
  owner: TestUser,
  user: TestUser,
  role: SystemRoleName | string,
): Promise<void> => {
  const joined = await http().post('/api/workspaces/join').set(bearer(user.token)).send({ inviteCode: workspace.inviteCode });
  if (joined.status !== 200) throw new Error(`join failed: ${joined.status} ${JSON.stringify(joined.body)}`);
  if (role === 'Viewer') return;
  const ids = await systemRoleIds(owner, workspace.slug);
  const roleId = (ids as Record<string, string>)[role] ?? role;
  const changed = await http()
    .put(`/api/workspaces/${workspace.slug}/members/${user.id}/role`)
    .set(bearer(owner.token))
    .send({ roleId });
  if (changed.status !== 200) throw new Error(`role change failed: ${changed.status} ${JSON.stringify(changed.body)}`);
};

/** A workspace with one user per system role, created through the real API. */
export const createTeam = async () => {
  const owner = await registerUser('Olivia Owner');
  const workspace = await createWorkspace(owner, `Team ${crypto.randomBytes(3).toString('hex')}`);
  const viewer = await registerUser('Vera Viewer');
  const developer = await registerUser('Dan Developer');
  const productOwner = await registerUser('Pat Product');
  await joinAs(workspace, owner, viewer, 'Viewer');
  await joinAs(workspace, owner, developer, 'Developer');
  await joinAs(workspace, owner, productOwner, 'Product Owner');
  return { owner, viewer, developer, productOwner, workspace };
};

// ----------------------------------------------------------------
// Tasks
// ----------------------------------------------------------------
export const tasksUrl = (slug: string) => `/api/workspaces/${slug}/tasks`;

export const createTask = async (
  user: TestUser,
  slug: string,
  overrides: Record<string, unknown> = {},
) => {
  const res = await http()
    .post(tasksUrl(slug))
    .set(bearer(user.token))
    .send({ title: 'Write the report', deadline: '2030-06-15', ...overrides });
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { _id: string; [key: string]: any };
};

/** A random 24-hex id that does not exist. */
export const unknownId = () => crypto.randomBytes(12).toString('hex');
