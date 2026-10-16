import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { StageDot } from './StageBadges';
import { firstStageOf } from '../lib/stages';
import type { WorkflowStage } from '../types';

interface DeleteStageDialogProps {
  /** Stage being deleted; the dialog is closed while this is null. */
  stage: WorkflowStage | null;
  /** Stages that remain, in order. */
  remaining: readonly WorkflowStage[];
  onCancel: () => void;
  /** Called with the stage that receives the tasks. */
  onConfirm: (stage: WorkflowStage, targetKey: string) => void;
}

const Body = ({ stage, remaining, onCancel, onConfirm }: DeleteStageDialogProps & { stage: WorkflowStage }) => {
  const { t } = useTranslation('tasks');
  const [target, setTarget] = useState(() => firstStageOf(remaining, stage.group).key);
  const options = remaining.map(item => ({ value: item.key, label: item.name.trim() || t('workflow.untitled') }));
  const chosen = remaining.find(item => item.key === target);

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t('workflow.delete.title', { name: stage.name.trim() || t('workflow.delete.thisStage') })}</DialogTitle>
        <DialogDescription>
          {t('workflow.delete.description')}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5 px-1">
        <p className="text-sm font-medium text-slate-700">{t('workflow.delete.moveTo')}</p>
        <OptionSelect
          aria-label={t('workflow.delete.receiver')}
          value={target}
          options={options}
          onChange={setTarget}
          className="h-11 border-slate-300 text-base sm:h-9 sm:text-sm"
        />
        {chosen && chosen.group !== stage.group && (
          <p className="text-xs text-slate-600">
            <StageDot stage={chosen} className="me-1 align-middle" />
            {t('workflow.delete.statusChanges', { name: chosen.name })}
          </p>
        )}
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="h-11 sm:h-9">{t('actions.cancel')}</Button>
        <Button type="button" onClick={() => onConfirm(stage, target)} className="h-11 bg-danger-solid text-white hover:bg-danger-solid-hover sm:h-9">
          {t('workflow.delete.confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** Asks which stage receives the tasks of a stage that is about to be deleted. */
export const DeleteStageDialog = (props: DeleteStageDialogProps) => (
  <Dialog open={props.stage !== null} onOpenChange={open => { if (!open) props.onCancel(); }}>
    {props.stage && <Body key={props.stage.key} {...props} stage={props.stage} />}
  </Dialog>
);
