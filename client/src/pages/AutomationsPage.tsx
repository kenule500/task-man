import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, ShieldAlert, Zap } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SkeletonCards, Surface, toast } from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import {
  MAX_RULES, RuleBuilder, RuleList, TemplateGallery, draftFromRule, draftFromTemplate, emptyDraft, useAutomations,
  type Automation, type AutomationInput, type AutomationTemplate, type RuleDraft,
} from '@/features/automations';
import { useProjects } from '@/features/projects';
import { useWorkspaceMembers } from '@/features/tasks';
import { usePermissions } from '../hooks/usePermissions';

interface BuilderState {
  title: string;
  draft: RuleDraft;
  /** Rule being edited; undefined = a new rule */
  ruleId?: string;
}

const AutomationsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const allowed = can('settings:manage');

  const { rules, templates, loading, error, reload, createRule, updateRule, deleteRule } = useAutomations(workspaceSlug, allowed);
  const { members } = useWorkspaceMembers(workspaceSlug, allowed);
  const { projects } = useProjects(allowed ? workspaceSlug : undefined);

  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const context = useMemo(() => {
    const names = new Map(members.map(member => [member._id, member.name]));
    return { memberName: (id: string) => names.get(id) };
  }, [members]);
  const projectNames = useMemo(
    () => projects.filter(project => !project.archived).map(project => project.name),
    [projects],
  );

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Automations" />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title="Only people who manage settings can edit automations"
            description="Ask an owner or admin of this workspace if you need a new rule."
          />
        </Surface>
      </div>
    );
  }

  const atLimit = rules.length >= MAX_RULES;

  const save = async (input: AutomationInput): Promise<string | null> => {
    try {
      if (builder?.ruleId) {
        await updateRule(builder.ruleId, input);
        toast.success('Rule saved');
      } else {
        await createRule(input);
        toast.success('Rule created');
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'We could not save the rule.';
    }
  };

  const toggle = async (rule: Automation, enabled: boolean) => {
    setBusyId(rule._id);
    try {
      await updateRule(rule._id, { enabled });
      toast.success(enabled ? `"${rule.name}" is on` : `"${rule.name}" is off`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not change the rule.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteRule(deleting._id);
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not delete the rule.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const startFromTemplate = (template: AutomationTemplate) =>
    setBuilder({ title: 'New rule from template', draft: draftFromTemplate(template) });

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <PageHeader
        title="Automations"
        description="Rules that change tasks for you: when something happens, and the conditions match, TaskMan makes the changes and records them in the audit log."
        actions={(
          <Button
            type="button"
            disabled={loading || Boolean(error) || atLimit}
            onClick={() => setBuilder({ title: 'New rule', draft: emptyDraft() })}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            New rule
          </Button>
        )}
      />

      {loading ? (
        <SkeletonCards count={3} columns="grid-cols-1" />
      ) : error ? (
        <Surface>
          <ErrorState
            title="Could not load the automation rules"
            reason={error}
            nextStep="Check your connection and try again."
            action={<Button type="button" onClick={reload} className="h-10 px-4 md:h-9">Try again</Button>}
          />
        </Surface>
      ) : (
        <>
          {rules.length === 0 ? (
            <Surface>
              <EmptyState
                headingLevel="h2"
                icon={<Zap />}
                title="No rules yet"
                description="Automations save repeat work, like making new bugs high priority or assigning whoever starts a task. Pick a template below or build your own."
                action={(
                  <Button type="button" onClick={() => setBuilder({ title: 'New rule', draft: emptyDraft() })} className="h-11 gap-2 px-4 text-sm sm:h-10">
                    <Plus aria-hidden />
                    New rule
                  </Button>
                )}
              />
            </Surface>
          ) : (
            <RuleList
              rules={rules}
              context={context}
              busyId={busyId}
              onToggle={(rule, enabled) => { void toggle(rule, enabled); }}
              onEdit={rule => setBuilder({ title: 'Edit rule', draft: draftFromRule(rule), ruleId: rule._id })}
              onDelete={setDeleting}
            />
          )}

          {atLimit && (
            <p role="status" className="text-sm text-slate-600">
              This workspace has {MAX_RULES} rules, the most it can have. Delete one to add another.
            </p>
          )}

          <TemplateGallery templates={templates} defaultOpen={rules.length === 0} disabled={atLimit} onUse={startFromTemplate} />
        </>
      )}

      {builder && (
        <RuleBuilder
          title={builder.title}
          initial={builder.draft}
          members={members}
          projects={projectNames}
          onSave={save}
          onClose={() => setBuilder(null)}
        />
      )}

      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={open => { if (!open && !deleteBusy) setDeleting(null); }}
        title="Delete this rule?"
        description={deleting ? `"${deleting.name}" will stop running. Changes it already made to tasks stay as they are.` : ''}
        confirmLabel="Delete rule"
        busyLabel="Deleting…"
        busy={deleteBusy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
};

export default AutomationsPage;
