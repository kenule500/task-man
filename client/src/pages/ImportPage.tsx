import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import { EmptyState, PageHeader, SkeletonList, Surface } from '@/components/ds';
import { ImportWizard, useImportWizard } from '@/features/import';
import { useProjects } from '@/features/projects';
import { usePermissions } from '../hooks/usePermissions';

const ImportPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const allowed = can('tasks:write');
  const canCreateProject = can('projects:write');

  const { projects, loading, reload } = useProjects(allowed ? workspaceSlug : undefined);
  const wizard = useImportWizard(workspaceSlug, { canCreateProject, projects, onImported: () => { void reload(); } });

  if (!workspaceSlug) return null;

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <Link
        to={`/${workspaceSlug}/settings`}
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-text-body outline-none hover:text-text-strong focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4" /> Workspace settings
      </Link>

      <PageHeader
        title="Import"
        description="Bring tasks over from Trello, Jira or a spreadsheet. You choose where each status, person and type goes before anything is saved."
      />

      {!allowed ? (
        <Surface>
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title="You cannot import tasks here"
            description="Importing creates tasks, which needs permission to create and edit them. Ask an owner or admin of this workspace."
          />
        </Surface>
      ) : loading && projects.length === 0 ? (
        <SkeletonList rows={4} />
      ) : (
        <ImportWizard slug={workspaceSlug} wizard={wizard} projects={projects} canCreateProject={canCreateProject} />
      )}
    </div>
  );
};

export default ImportPage;
