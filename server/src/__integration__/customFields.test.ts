import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Nina Notmember');
});

const url = (id = '') => `/api/workspaces/${slug}/fields${id ? `/${id}` : ''}`;
const list = (user: TestUser = team.owner) => http().get(url()).set(bearer(user.token));
const create = (body: Record<string, unknown>, user: TestUser = team.owner) => http().post(url()).set(bearer(user.token)).send(body);
const patch = (id: string, body: Record<string, unknown>, user: TestUser = team.owner) => http().patch(url(id)).set(bearer(user.token)).send(body);
const remove = (id: string, user: TestUser = team.owner) => http().delete(url(id)).set(bearer(user.token));
const updateTask = (id: string, body: Record<string, unknown>, user: TestUser = team.owner) =>
  http().patch(`${tasksUrl(slug)}/${id}`).set(bearer(user.token)).send(body);
const getTask = async (id: string) => {
  const res = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
  return (res.body as { _id: string; custom?: Record<string, unknown> }[]).find(task => task._id === id);
};
const activityOf = async (taskId: string) =>
  (await http().get(`${tasksUrl(slug)}/${taskId}/activity`).set(bearer(team.owner.token))).body.items as {
    action: string; changes: { field: string; from?: string; to?: string }[];
  }[];

describe('custom fields: access and validation', () => {
  it('requires a session and membership; viewers read but cannot change', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await list(outsider)).status).toBe(403);
    expect((await list(team.viewer)).status).toBe(200);
    expect((await create({ name: 'Nope', type: 'text' }, team.viewer)).status).toBe(403);
    expect((await create({ name: 'Nope', type: 'text' }, team.developer)).status).toBe(403);
    expect((await create({ name: 'Yes', type: 'text' }, team.productOwner)).status).toBe(201);
  });

  it('creates a field with a slug key, the next order and option ids', async () => {
    const res = await create({
      name: 'Story size',
      type: 'select',
      options: [{ label: 'Small', color: 'emerald' }, { label: 'Large', color: 'rose' }, { label: 'Odd' }],
      projects: ['Web', 'Web'],
      required: true,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'story_size', name: 'Story size', type: 'select', projects: ['Web'], required: true, archived: false });
    expect(res.body.options.map((option: { label: string; color: string }) => [option.label, option.color])).toEqual([
      ['Small', 'emerald'], ['Large', 'rose'], ['Odd', 'slate'],
    ]);
    expect(res.body.options[0].id).toMatch(/^[a-z0-9]{4,16}$/);
    expect(res.body.order).toBeGreaterThan(0);
  });

  it('rejects bad input, duplicate keys and options on other types', async () => {
    expect((await create({ type: 'text' })).status).toBe(400);
    expect((await create({ name: 'x'.repeat(41), type: 'text' })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'colour' })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'text', key: 'Bad-Key' })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'text', key: 'a.b' })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'text', required: 'yes' })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'text', options: [{ label: 'A' }] })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'select', options: [{ label: 'A' }, { label: 'a' }] })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'select', options: [{ label: '' }] })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'select', options: [{ label: 'A', color: 'purple' }] })).status).toBe(400);
    expect((await create({ name: 'Ok', type: 'select', options: Array.from({ length: 31 }, (_, i) => ({ label: `O${i}` })) })).status).toBe(400);

    expect((await create({ name: 'Budget', type: 'number', key: 'budget' })).status).toBe(201);
    expect((await create({ name: 'Budget 2', type: 'number', key: 'budget' })).status).toBe(400);
    // Same name gets another key
    const again = await create({ name: 'Budget', type: 'number' });
    expect(again.status).toBe(201);
    expect(again.body.key).toBe('budget_2');
  });

  it('answers 404 for unknown or foreign ids', async () => {
    expect((await patch(unknownId(), { name: 'x' })).status).toBe(404);
    expect((await patch('not-an-id', { name: 'x' })).status).toBe(404);
    expect((await remove(unknownId())).status).toBe(404);
  });
});

describe('custom fields: values on tasks', () => {
  let size: { key: string; options: { id: string; label: string }[] };
  let tags: { key: string; options: { id: string; label: string }[] };

  beforeAll(async () => {
    size = (await list()).body.find((field: { key: string }) => field.key === 'story_size');
    tags = (await create({ name: 'Tags', type: 'multiselect', options: [{ label: 'Front' }, { label: 'Back' }, { label: 'Ops' }] })).body;
    await create({ name: 'Reviewer', type: 'user', key: 'reviewer' });
    await create({ name: 'Due note', type: 'date', key: 'review_by' });
    await create({ name: 'Spec', type: 'url', key: 'spec' });
    await create({ name: 'Blocked', type: 'checkbox', key: 'blocked' });
    await create({ name: 'Memo', type: 'text', key: 'memo' });
  });

  it('enforces required fields on create for the project they apply to, not on update', async () => {
    const missing = await http().post(tasksUrl(slug)).set(bearer(team.owner.token)).send({ title: 'No size', deadline: '2030-06-15', project: 'Web' });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('Story size is required');

    // Another project: the field does not apply
    expect((await createTask(team.owner, slug, { title: 'Elsewhere', project: 'Mobile' }))._id).toBeTruthy();

    const ok = await createTask(team.owner, slug, { title: 'Sized', project: 'Web', custom: { story_size: size.options[0].id } });
    expect(ok.custom).toEqual({ story_size: size.options[0].id });

    // Updates never require
    expect((await updateTask(ok._id, { title: 'Renamed' })).status).toBe(200);
  });

  it('rejects unknown keys and invalid values', async () => {
    const task = await createTask(team.owner, slug, { title: 'Validate me' });
    const bad = async (custom: unknown) => (await updateTask(task._id, { custom })).status;
    expect(await bad({ nope: 'x' })).toBe(400);
    expect(await bad({ 'memo.$x': 'x' })).toBe(400);
    expect(await bad({ memo: 5 })).toBe(400);
    expect(await bad({ memo: 'x'.repeat(501) })).toBe(400);
    expect(await bad({ story_size: 'not-an-option' })).toBe(400);
    expect(await bad({ tags: ['zzzz'] })).toBe(400);
    expect(await bad({ blocked: 'yes' })).toBe(400);
    expect(await bad({ spec: 'javascript:alert(1)' })).toBe(400);
    expect(await bad({ review_by: '2030-13-45' })).toBe(400);
    expect(await bad({ reviewer: unknownId() })).toBe(400);
    expect(await bad({ reviewer: { $ne: null } })).toBe(400);
    expect(await bad(['memo'])).toBe(400);
    expect(await bad('memo')).toBe(400);
  });

  it('stores values, merges updates and clears with null; the activity names the change', async () => {
    const task = await createTask(team.owner, slug, { title: 'Merge me' });
    const first = await updateTask(task._id, {
      custom: {
        story_size: size.options[1].id,
        tags: [tags.options[0].id, tags.options[2].id],
        reviewer: team.developer.id,
        review_by: '2030-07-01',
        spec: 'https://example.com/spec',
        blocked: true,
        memo: '  hello  ',
      },
    });
    expect(first.status).toBe(200);
    expect(first.body.custom).toEqual({
      story_size: size.options[1].id,
      tags: [tags.options[0].id, tags.options[2].id],
      reviewer: team.developer.id,
      review_by: '2030-07-01',
      spec: 'https://example.com/spec',
      blocked: true,
      memo: 'hello',
    });

    const second = await updateTask(task._id, { custom: { memo: null, blocked: false } });
    expect(second.status).toBe(200);
    expect(second.body.custom.memo).toBeUndefined();
    expect(second.body.custom).toMatchObject({ blocked: false, story_size: size.options[1].id, reviewer: team.developer.id });

    // An update without custom leaves the values alone
    expect((await updateTask(task._id, { priority: 'high' })).body.custom).toMatchObject({ story_size: size.options[1].id });

    const stored = await getTask(task._id);
    expect(stored?.custom).toMatchObject({ story_size: size.options[1].id, tags: [tags.options[0].id, tags.options[2].id] });

    const entries = await activityOf(task._id);
    const changes = entries.flatMap(entry => entry.changes);
    expect(changes).toEqual(expect.arrayContaining([
      { field: 'custom.story_size', to: 'Large' },
      { field: 'custom.tags', to: 'Front, Ops' },
      { field: 'custom.memo', from: 'hello' },
      { field: 'custom.blocked', from: 'true', to: 'false' },
    ]));
  });

  it('lets a Team Member style writer edit values but a viewer cannot', async () => {
    const task = await createTask(team.owner, slug, { title: 'Perms' });
    expect((await updateTask(task._id, { custom: { memo: 'by dev' } }, team.developer)).status).toBe(200);
    expect((await updateTask(task._id, { custom: { memo: 'by viewer' } }, team.viewer)).status).toBe(403);
  });

  it('bulk update sets and clears values on several tasks', async () => {
    const a = await createTask(team.owner, slug, { title: 'Bulk A', custom: { memo: 'a' } });
    const b = await createTask(team.owner, slug, { title: 'Bulk B' });
    const res = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.owner.token))
      .send({ ids: [a._id, b._id], patch: { custom: { story_size: size.options[0].id, memo: null } } });
    expect(res.status).toBe(200);
    for (const task of res.body.tasks) {
      expect(task.custom.story_size).toBe(size.options[0].id);
      expect(task.custom.memo).toBeUndefined();
    }
    const bad = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.owner.token))
      .send({ ids: [a._id], patch: { custom: { nope: 1 } } });
    expect(bad.status).toBe(400);
    expect((await activityOf(a._id)).flatMap(entry => entry.changes)).toEqual(expect.arrayContaining([
      { field: 'custom.memo', from: 'a' },
    ]));
  });

  it('filters the task list with ?cf.<key>=<value>', async () => {
    const small = await createTask(team.owner, slug, { title: 'Filter small', custom: { story_size: size.options[0].id, blocked: true } });
    await createTask(team.owner, slug, { title: 'Filter none' });
    const ask = async (query: string) =>
      (await http().get(`${tasksUrl(slug)}?${query}`).set(bearer(team.owner.token))).body as { _id: string; title: string }[];

    const bySize = await ask(`cf.story_size=${size.options[0].id}`);
    expect(bySize.some(task => task._id === small._id)).toBe(true);
    expect(bySize.every(task => task.title !== 'Filter none')).toBe(true);
    expect((await ask('cf.blocked=true')).some(task => task._id === small._id)).toBe(true);
    expect((await ask('cf.story_size=none')).some(task => task.title === 'Filter none')).toBe(true);
    expect((await ask('cf.story_size=none')).some(task => task._id === small._id)).toBe(false);
    // Operators and odd keys are ignored, never injected
    expect((await ask('cf.story_size[$ne]=x')).length).toBeGreaterThan(0);
  });
});

describe('custom fields: change definitions', () => {
  it('renames, recolors, adds and removes options; removing clears the tasks', async () => {
    const field = (await create({ name: 'Risk', type: 'select', options: [{ label: 'Low' }, { label: 'High' }] })).body;
    const multi = (await create({ name: 'Areas', type: 'multiselect', options: [{ label: 'UI' }, { label: 'API' }] })).body;
    const [low, high] = field.options;
    const [ui, api] = multi.options;
    const task = await createTask(team.owner, slug, { title: 'Risky', custom: { risk: high.id, areas: [ui.id, api.id] } });
    const other = await createTask(team.owner, slug, { title: 'Safe', custom: { risk: low.id, areas: [ui.id] } });

    const renamed = await patch(field._id, {
      name: 'Risk level',
      options: [{ id: low.id, label: 'Minor', color: 'cyan' }, { label: 'Severe', color: 'rose' }],
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: 'risk', type: 'select', name: 'Risk level' });
    expect(renamed.body.options[0]).toEqual({ id: low.id, label: 'Minor', color: 'cyan' });
    expect(renamed.body.options[1].label).toBe('Severe');
    expect(renamed.body.options[1].id).not.toBe(high.id);
    // "High" was removed: its value is gone, "Low" (renamed) stays
    expect((await getTask(task._id))?.custom?.risk).toBeUndefined();
    expect((await getTask(other._id))?.custom?.risk).toBe(low.id);

    const trimmed = await patch(multi._id, { options: [{ id: ui.id, label: 'UI' }] });
    expect(trimmed.status).toBe(200);
    expect((await getTask(task._id))?.custom?.areas).toEqual([ui.id]);
    // Unknown option ids are refused
    expect((await patch(multi._id, { options: [{ id: 'nope1234', label: 'X' }] })).status).toBe(400);
    expect((await patch(multi._id, { options: [{ id: ui.id, label: 'UI' }, { id: ui.id, label: 'UI 2' }] })).status).toBe(400);
  });

  it('keeps key and type immutable and ignores them in a patch', async () => {
    const field = (await create({ name: 'Fixed', type: 'text', key: 'fixed' })).body;
    const res = await patch(field._id, { key: 'other', type: 'number', name: 'Fixed too', required: true, projects: ['Web', 'Mobile'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: 'fixed', type: 'text', name: 'Fixed too', required: true, projects: ['Web', 'Mobile'] });
    expect((await patch(field._id, { options: [{ label: 'A' }] })).status).toBe(400);
  });

  it('archives a field: values stay, new values are refused, and it frees a slot', async () => {
    const field = (await create({ name: 'Old', type: 'text', key: 'old_field' })).body;
    const task = await createTask(team.owner, slug, { title: 'Has old', custom: { old_field: 'keep' } });
    expect((await patch(field._id, { archived: true })).body.archived).toBe(true);
    expect((await getTask(task._id))?.custom?.old_field).toBe('keep');
    expect((await updateTask(task._id, { custom: { old_field: 'new' } })).status).toBe(400);
    expect((await updateTask(task._id, { custom: { old_field: null } })).status).toBe(200);
    expect((await patch(field._id, { archived: false })).body.archived).toBe(false);
  });

  it('reorders fields', async () => {
    const all = (await list()).body as { _id: string }[];
    const ids = all.map(field => field._id);
    const reversed = [...ids].reverse();
    const res = await http().put(url('order')).set(bearer(team.owner.token)).send({ ids: reversed });
    expect(res.status).toBe(200);
    expect(res.body.map((field: { _id: string }) => field._id)).toEqual(reversed);
    expect((await list()).body.map((field: { _id: string }) => field._id)).toEqual(reversed);
    expect((await http().put(url('order')).set(bearer(team.owner.token)).send({ ids: [unknownId()] })).status).toBe(400);
    expect((await http().put(url('order')).set(bearer(team.viewer.token)).send({ ids })).status).toBe(403);
  });

  it('deletes a field and removes its values from the tasks', async () => {
    const field = (await create({ name: 'Scratch', type: 'text', key: 'scratch' })).body;
    const task = await createTask(team.owner, slug, { title: 'Scratchy', custom: { scratch: 'x', memo: 'stay' } });
    expect((await remove(field._id, team.developer)).status).toBe(403);
    expect((await remove(field._id)).status).toBe(200);
    const stored = await getTask(task._id);
    expect(stored?.custom?.scratch).toBeUndefined();
    expect(stored?.custom?.memo).toBe('stay');
    expect((await list()).body.some((item: { key: string }) => item.key === 'scratch')).toBe(false);
    // The key can be reused afterwards and the old value does not come back
    const reused = await create({ name: 'Scratch', type: 'text', key: 'scratch' });
    expect(reused.status).toBe(201);
    expect((await getTask(task._id))?.custom?.scratch).toBeUndefined();
  });

  it('allows at most 30 active fields', async () => {
    const active = (await list()).body.filter((field: { archived: boolean }) => !field.archived).length;
    for (let i = active; i < 30; i += 1) {
      expect((await create({ name: `Filler ${i}`, type: 'text', key: `filler_${i}` })).status).toBe(201);
    }
    const over = await create({ name: 'One too many', type: 'text' });
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/at most 30/);
  });

  it('records field.created, field.updated and field.deleted in the audit log', async () => {
    const audit = await http().get(`/api/workspaces/${slug}/activity?area=field&limit=100`).set(bearer(team.owner.token));
    expect(audit.status).toBe(200);
    const actions = new Set((audit.body.items as { action: string }[]).map(item => item.action));
    expect([...actions].sort()).toEqual(['field.created', 'field.deleted', 'field.updated']);
  });
});
