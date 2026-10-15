import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SprintCard, type Sprint } from '@/features/projects';
import { makeSprint } from '@/features/projects/__tests__/fixtures';

const noop = () => undefined;

const renderCard = (sprint: Sprint) =>
  render(
    <MemoryRouter initialEntries={['/demo/projects/p1']}>
      <Routes>
        <Route
          path="/:workspaceSlug/projects/:projectId"
          element={(
            <SprintCard
              sprint={sprint}
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

describe('SprintCard report link', () => {
  it.each(['active', 'completed'] as const)('links a %s sprint to its report', status => {
    renderCard(makeSprint({ _id: 's9', project: 'p1', name: 'Sprint 9', status }));
    expect(screen.getByRole('link', { name: 'Sprint report for Sprint 9' })).toHaveAttribute('href', '/demo/projects/p1/sprints/s9/report');
  });

  it('has no report for a sprint that has not started', () => {
    renderCard(makeSprint({ name: 'Sprint 10', status: 'planned' }));
    expect(screen.queryByRole('link', { name: /Sprint report/ })).not.toBeInTheDocument();
  });
});
