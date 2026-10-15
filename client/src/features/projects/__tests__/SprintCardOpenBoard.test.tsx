import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SprintCard, type Sprint } from '@/features/projects';
import { makeSprint } from './fixtures';

const noop = () => undefined;

const renderCard = (sprint: Sprint, projectName?: string) =>
  render(
    <MemoryRouter initialEntries={['/demo/projects/p1']}>
      <Routes>
        <Route
          path="/:workspaceSlug/projects/:projectId"
          element={(
            <SprintCard
              sprint={sprint}
              projectName={projectName}
              tasks={[]}
              subtasks={new Map()}
              expanded={false}
              onToggle={noop}
              canManage={false}
              canWriteTasks={false}
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

describe('SprintCard open board', () => {
  it.each(['active', 'planned'] as const)('opens the board of a %s sprint scoped to project and sprint', status => {
    renderCard(makeSprint({ _id: 's9', project: 'p1', name: 'Sprint 9', status }), 'Web app');
    expect(screen.getByRole('link', { name: 'Open board for Sprint 9' }))
      .toHaveAttribute('href', '/demo/tasks?view=board&project=Web+app&sprint=s9');
  });

  it('scopes by the sprint alone when the project name is unknown', () => {
    renderCard(makeSprint({ _id: 's4', name: 'Sprint 4', status: 'active' }));
    expect(screen.getByRole('link', { name: 'Open board for Sprint 4' })).toHaveAttribute('href', '/demo/tasks?view=board&sprint=s4');
  });

  it('has no board link for a completed sprint', () => {
    renderCard(makeSprint({ name: 'Sprint 1', status: 'completed' }), 'Web');
    expect(screen.queryByRole('link', { name: /Open board/ })).not.toBeInTheDocument();
  });
});
