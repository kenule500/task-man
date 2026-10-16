import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert, Zap } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SkeletonList, Surface, toast } from '@/components/ds';
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
  const { t } = useTranslation('admin');
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
        <PageHeader title={t('automations.page.title')} />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title={t('automations.page.restrictedTitle')}
            description={t('automations.page.restrictedBody')}
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
        toast.success(t('automations.page.ruleSaved'));
      } else {
        await createRule(input);
        toast.success(t('automations.page.ruleCreated'));
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t('automations.errors.save');
    }
  };

  const toggle = async (rule: Automation, enabled: boolean) => {
    setBusyId(rule._id);
    try {
      await updateRule(rule._id, { enabled });
      toast.success(enabled ? t('automations.page.isOn', { name: rule.name }) : t('automations.page.isOff', { name: rule.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('automations.errors.change'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteRule(deleting._id);
      toast.success(t('automations.page.deleted', { name: deleting.name }));
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('automations.errors.delete'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const startFromTemplate = (template: AutomationTemplate) =>
    setBuilder({ title: t('automations.page.newFromTemplate'), draft: draftFromTemplate(template) });

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <PageHeader
        title={t('automations.page.title')}
        description={t('automations.page.description')}
        actions={(
          <Button
            type="button"
            disabled={loading || Boolean(error) || atLimit}
            onClick={() => setBuilder({ title: t('automations.page.newRule'), draft: emptyDraft() })}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            {t('automations.page.newRule')}
          </Button>
        )}
      />

      {loading ? (
        <SkeletonList label={t('automations.page.loading')} rows={3} avatar={false} />
      ) : error ? (
        <Surface>
          <ErrorState
            title={t('automations.page.loadFailed')}
            reason={error}
            nextStep={t('automations.page.checkConnection')}
            action={<Button type="button" onClick={reload} className="h-10 px-4 md:h-9">{t('actions.retry')}</Button>}
          />
        </Surface>
      ) : (
        <>
          {rules.length === 0 ? (
            <Surface>
              <EmptyState
                headingLevel="h2"
                icon={<Zap />}
                title={t('automations.page.emptyTitle')}
                description={t('automations.page.emptyBody')}
                action={(
                  <Button type="button" onClick={() => setBuilder({ title: t('automations.page.newRule'), draft: emptyDraft() })} className="h-11 gap-2 px-4 text-sm sm:h-10">
                    <Plus aria-hidden />
                    {t('automations.page.newRule')}
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
              onEdit={rule => setBuilder({ title: t('automations.page.editRule'), draft: draftFromRule(rule), ruleId: rule._id })}
              onDelete={setDeleting}
            />
          )}

          {atLimit && (
            <p role="status" className="text-sm text-slate-600">
              {t('automations.page.limit', { max: MAX_RULES })}
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
        title={t('automations.page.deleteTitle')}
        description={deleting ? t('automations.page.deleteBody', { name: deleting.name }) : ''}
        confirmLabel={t('automations.page.deleteConfirm')}
        busyLabel={t('automations.page.deleting')}
        busy={deleteBusy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
};

export default AutomationsPage;
