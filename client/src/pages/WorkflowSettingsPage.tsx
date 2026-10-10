import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Plus, ShieldAlert } from 'lucide-react';
import {
  Alert, EmptyState, ErrorState, PageHeader, SectionHeader, SkeletonCards, Surface, toast,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getApiErrorMessage } from '@/utils/api';
import {
  BoardPreview, DeleteStageDialog, StageRow, useWorkflow,
  MAX_STAGES, NEW_KEY_PREFIX, STAGE_TEMPLATES, hasProblems, moveItem, prepareSave, validateStages,
  type StageTemplate, type WorkflowStage,
} from '@/features/workflow';
import { usePermissions } from '../hooks/usePermissions';

const sameStages = (a: readonly WorkflowStage[], b: readonly WorkflowStage[]) => JSON.stringify(a) === JSON.stringify(b);

const WorkflowSettingsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const allowed = can('settings:manage');

  const { stages: saved, loaded, save, reload } = useWorkflow(allowed ? workspaceSlug : undefined);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState<WorkflowStage[] | null>(null);
  // removed saved stage key -> stage key that receives its tasks
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<WorkflowStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [counter, setCounter] = useState(1);

  // Always ask the API once: the shared cache may be older than the workspace
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void reload().finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [allowed, reload]);

  const working = draft ?? saved;
  const dirty = draft !== null && !sameStages(draft, saved);
  const problems = useMemo(() => validateStages(working), [working]);
  const invalid = hasProblems(problems);
  const savedKeys = useMemo(() => new Set(saved.map(stage => stage.key)), [saved]);

  if (!allowed) {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Workflow" />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title="Only people who manage settings can edit the workflow"
            description="Ask an owner or admin of this workspace if you need a new stage."
          />
        </Surface>
      </div>
    );
  }

  const update = (next: WorkflowStage[]) => {
    setDraft(next);
    setError('');
  };

  const changeStage = (key: string, patch: Partial<WorkflowStage>) =>
    update(working.map(stage => (stage.key === key ? { ...stage, ...patch } : stage)));

  const addStage = () => {
    if (working.length >= MAX_STAGES) return;
    const key = `${NEW_KEY_PREFIX}${counter}`;
    setCounter(count => count + 1);
    // New stages start in the middle group, which is the usual home for extra steps (In review, QA...)
    const group = 'in-progress' as const;
    const lastOfGroup = working.reduce((found, stage, index) => (stage.group === group ? index : found), -1);
    const next = [...working];
    next.splice(lastOfGroup + 1 || next.length, 0, { key, name: '', group, color: 'violet', wipLimit: 0 });
    update(next);
  };

  const applyTemplate = (template: StageTemplate) => {
    // Keys already in use keep their tasks; the rest of the old stages are removed (the API places their tasks)
    update(template.stages.map(stage => ({ ...stage })));
    setMoves({});
    toast.success(`${template.label.split(' (')[0]} template applied. Save to keep it.`);
  };

  const removeStage = (stage: WorkflowStage, targetKey: string) => {
    update(working.filter(item => item.key !== stage.key));
    if (savedKeys.has(stage.key)) setMoves(current => ({ ...current, [stage.key]: targetKey }));
    setDeleting(null);
  };

  const askDelete = (stage: WorkflowStage) => {
    // A stage that was never saved has no tasks
    if (!savedKeys.has(stage.key)) update(working.filter(item => item.key !== stage.key));
    else setDeleting(stage);
  };

  const cancel = () => {
    setDraft(null);
    setMoves({});
    setError('');
  };

  const submit = async () => {
    if (!draft || invalid) return;
    setSaving(true);
    setError('');
    try {
      const request = prepareSave(draft, saved, moves);
      await save(request);
      setDraft(null);
      setMoves({});
      toast.success('Workflow saved');
    } catch (err) {
      setError(getApiErrorMessage(err, 'We could not save the workflow. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const groupCount = (group: WorkflowStage['group']) => working.filter(stage => stage.group === group).length;

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <Link
        to={`/${workspaceSlug}/settings`}
        className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Workspace settings
      </Link>

      <PageHeader
        title="Workflow"
        description="The columns of your board. Every stage belongs to a group (Pending, In Progress or Completed), so reports, burndown and integrations keep working."
        actions={(
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" disabled={!loaded} className="h-11 gap-2 px-4 text-sm sm:h-10" />}
            >
              Use a template
              <ChevronDown aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {STAGE_TEMPLATES.map(template => (
                <DropdownMenuItem key={template.id} onClick={() => applyTemplate(template)} className="min-h-11 text-slate-700 md:min-h-0">
                  {template.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      {!loaded && !checked ? (
        <SkeletonCards count={3} columns="grid-cols-1" />
      ) : !loaded ? (
        <Surface>
          <ErrorState
            title="Could not load the workflow"
            reason="The server did not answer."
            nextStep="Check your connection and try again."
            action={<Button type="button" onClick={() => { setChecked(false); void reload().finally(() => setChecked(true)); }} className="h-10 px-4 md:h-9">Try again</Button>}
          />
        </Surface>
      ) : (
        <>
          <Surface padding="md" className="space-y-4">
            <SectionHeader title="Stages" count={working.length} />
            {problems.list && <Alert tone="warning">{problems.list}</Alert>}
            <ol className="space-y-3" aria-label="Workflow stages">
              {working.map((stage, index) => (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  index={index}
                  total={working.length}
                  problem={problems.byKey[stage.key]}
                  lastOfGroup={groupCount(stage.group) <= 1}
                  onChange={patch => changeStage(stage.key, patch)}
                  onMove={direction => update(moveItem(working, index, index + direction))}
                  onDelete={() => askDelete(stage)}
                />
              ))}
            </ol>
            <Button
              type="button"
              variant="outline"
              disabled={working.length >= MAX_STAGES}
              onClick={addStage}
              className="h-11 gap-2 px-4 text-sm sm:h-10"
            >
              <Plus aria-hidden />
              Add stage
            </Button>
            {working.length >= MAX_STAGES && (
              <p role="status" className="text-sm text-slate-600">A workflow can have at most {MAX_STAGES} stages.</p>
            )}
          </Surface>

          <Surface padding="md" className="space-y-3">
            <SectionHeader title="Board preview" />
            <BoardPreview stages={working} />
          </Surface>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!dirty || invalid || saving}
              onClick={() => { void submit(); }}
              className="h-11 flex-1 px-4 text-sm sm:h-10 sm:flex-none"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || saving}
              onClick={cancel}
              className="h-11 flex-1 px-4 text-sm sm:h-10 sm:flex-none"
            >
              Cancel
            </Button>
          </div>
        </>
      )}

      <DeleteStageDialog
        stage={deleting}
        remaining={working.filter(stage => stage.key !== deleting?.key)}
        onCancel={() => setDeleting(null)}
        onConfirm={removeStage}
      />
    </div>
  );
};

export default WorkflowSettingsPage;
