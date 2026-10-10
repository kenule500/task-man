
// Replace the guards with tagged stubs so the router stack reveals which permission each route needs
jest.mock('../middleware/permissionMiddleware.js', () => ({
  requirePermission: (permission: string) => Object.assign(() => undefined, { permission }),
}));
jest.mock('../middleware/authMiddleware.js', () => ({ protect: Object.assign(() => undefined, { isProtect: true }) }));
jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  MAX_LABELS: 10,
  MAX_LABEL_LENGTH: 40,
  MAX_COMMENT_LENGTH: 2000,
  MAX_ATTACHMENTS: 20,
  default: {},
}));

import router from '../routes/taskRoutes.js';

type Layer = {
  name: string;
  handle: { isProtect?: boolean };
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: { permission?: string } }[] };
};

const stack = (router as unknown as { stack: Layer[] }).stack;

const permissionFor = (method: string, path: string): string | undefined => {
  const layer = stack.find(l => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`Route not found: ${method} ${path}`);
  return layer.route.stack[0].handle.permission;
};

describe('task routes permissions', () => {
  it('requires authentication before any route', () => {
    expect(stack[0].handle.isProtect).toBe(true);
  });

  it.each([
    ['get', '/', 'tasks:read'],
    ['post', '/', 'tasks:write'],
    ['put', '/:id', 'tasks:write'],
    ['patch', '/:id', 'tasks:write'],
    ['delete', '/:id', 'tasks:delete'],
    ['patch', '/bulk', 'tasks:write'],
    ['post', '/bulk-delete', 'tasks:delete'],
    ['post', '/:id/comments', 'tasks:write'],
    ['delete', '/:id/comments/:commentId', 'tasks:write'],
    ['post', '/:id/attachments', 'tasks:write'],
    ['get', '/:id/attachments/:attachmentId', 'tasks:read'],
    ['delete', '/:id/attachments/:attachmentId', 'tasks:write'],
  ])('%s %s needs %s', (method, path, permission) => {
    expect(permissionFor(method, path)).toBe(permission);
  });

  it('registers the bulk routes before the /:id routes', () => {
    const index = (method: string, path: string) =>
      stack.findIndex(l => l.route?.path === path && l.route.methods[method]);
    expect(index('patch', '/bulk')).toBeLessThan(index('patch', '/:id'));
  });

  it('guards every route with a permission before its handler', () => {
    const routes = stack.filter(l => l.route);
    expect(routes.length).toBe(13);
    for (const layer of routes) {
      expect(layer.route?.stack[0].handle.permission).toMatch(/^tasks:(read|write|delete)$/);
    }
  });
});
