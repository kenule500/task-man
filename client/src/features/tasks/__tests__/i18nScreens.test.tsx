import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import api from '@/utils/api';
import { resetCustomFieldsCache } from '@/features/fields/hooks/useCustomFields';
import { SprintCard } from '@/features/projects';
import { makeSprint } from '@/features/projects/__tests__/fixtures';
import ListView from '../views/ListView';
import BoardView from '../views/BoardView';
import type { TaskViewProps } from '../views/types';
import { describeActivity } from '../lib/activityText';
import { describeRule } from '@/features/automations/lib/describe';
import { makeTask } from './fixtures';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;
const noop = () => undefined;

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/acme/tasks']}>
      <Routes>
        <Route
          path="/:workspaceSlug/tasks"
          element={<ListView tasks={[makeTask({ title: 'Alpha', status: 'in-progress', priority: 'high' })]} totalCount={1} {...handlers()} />}
        />
      </Routes>
    </MemoryRouter>,
  );

const renderSprint = () =>
  render(
    <MemoryRouter initialEntries={['/demo/projects/p1']}>
      <Routes>
        <Route
          path="/:workspaceSlug/projects/:projectId"
          element={(
            <SprintCard
              sprint={makeSprint({ _id: 's1', project: 'p1', name: 'Sprint 1', status: 'active' })}
              projectName="Web"
              tasks={[]}
              subtasks={new Map()}
              expanded={false}
              onToggle={noop}
              canManage
              canWriteTasks
              blockedByActive={false}
              onStart={noop}
              onComplete={noop}
              onEdit={noop}
              onDelete={noop}
              onOpenTask={noop}
              onToggleSubtask={noop}
              onQuickAdd={async () => undefined}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  resetCustomFieldsCache();
  Object.values(mockedApi).forEach(mock => (mock as jest.Mock).mockReset());
  mockedApi.get.mockResolvedValue({ data: [] });
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('feature screens in French', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr');
  });

  it('translates the list table: headers, status and priority of a row', () => {
    renderList();
    const table = within(screen.getByTestId('list-table'));
    expect(table.getByText('Nom de la tâche')).toBeInTheDocument();
    expect(table.getByText('Statut')).toBeInTheDocument();
    expect(table.getByText('Priorité')).toBeInTheDocument();
    expect(table.getByText('Échéance')).toBeInTheDocument();
    expect(table.getByRole('button', { name: 'Marquer « Alpha » comme terminée' })).toBeInTheDocument();
  });

  it('translates the board column headers and empty state', () => {
    render(<BoardView tasks={[]} {...handlers()} />);
    expect(screen.getByRole('heading', { name: 'En attente' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'En cours' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Terminée' })).toBeInTheDocument();
    expect(screen.getAllByText('Aucune tâche').length).toBeGreaterThan(0);
  });

  it('translates a sprint card with plurals and interpolation', () => {
    renderSprint();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('0 tâche')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le tableau pour Sprint 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terminer le sprint/ })).toBeInTheDocument();
  });

  it('builds sentences from keys, not concatenation', () => {
    expect(describeActivity({
      _id: 'e', action: 'task.updated', createdAt: '2026-10-01T00:00:00.000Z', actor: null,
      changes: [{ field: 'status', from: 'pending', to: 'completed' }],
    } as never).headline).toBe('a modifié le statut de En attente à Terminée');
    expect(describeRule({ trigger: { type: 'task.created' }, conditions: [], actions: [{ type: 'move_to_backlog', value: '' }] }))
      .toBe('Quand une tâche est créée, la déplacer vers le carnet de produit');
  });
});

describe('feature screens in Arabic', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });

  it('translates the list table headers', () => {
    renderList();
    const table = within(screen.getByTestId('list-table'));
    expect(table.getByText('اسم المهمة')).toBeInTheDocument();
    expect(table.getByText('الحالة')).toBeInTheDocument();
    expect(table.getByText('الأولوية')).toBeInTheDocument();
  });

  it('translates the board column headers', () => {
    render(<BoardView tasks={[]} {...handlers()} />);
    expect(screen.getByRole('heading', { name: 'قيد الانتظار' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'قيد التنفيذ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'مكتملة' })).toBeInTheDocument();
  });

  it('uses the Arabic plural forms on a sprint card', () => {
    renderSprint();
    expect(screen.getByText('نشط')).toBeInTheDocument();
    expect(screen.getByText('0 مهام')).toBeInTheDocument();
    expect(i18n.t('projects:sprint.tasksCount', { count: 1 })).toBe('مهمة واحدة');
    expect(i18n.t('projects:sprint.tasksCount', { count: 2 })).toBe('مهمتين');
    expect(i18n.t('projects:sprint.tasksCount', { count: 5 })).toBe('5 مهام');
    expect(i18n.t('projects:sprint.tasksCount', { count: 11 })).toBe('11 مهمة');
  });
});

describe('language reset', () => {
  it('goes back to English after a test changed the language', () => {
    expect(i18n.language).toBe('en');
    render(<BoardView tasks={[]} {...handlers()} />);
    expect(screen.getByRole('heading', { name: 'Pending' })).toBeInTheDocument();
  });
});
