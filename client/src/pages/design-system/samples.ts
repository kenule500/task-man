import type { AppLanguage } from '@/i18n/language';

// Sample copy in the three product languages, for the guide's specimens (direction probe, writing guide).
// Wording follows the product glossary in DESIGN.md: tâche / مهمة, sprint / سبرينت. The product name is never translated.

export interface SampleCopy {
  createTask: string;
  saveChanges: string;
  deleteTask: string;
  overdue: string;
  backlog: string;
  projectName: string;
  projectMeta: string;
  emptyTitle: string;
  emptyBody: string;
  /** Word order differs by language, so each language has its own template. */
  progressTemplate: string;
  assignedTemplate: string;
}

export const SAMPLES: Record<AppLanguage, SampleCopy> = {
  en: {
    createTask: 'Create task',
    saveChanges: 'Save changes',
    deleteTask: 'Delete task',
    overdue: 'Overdue',
    backlog: 'Backlog',
    projectName: 'Website v1',
    projectMeta: 'Sprint 4 · 6 days left',
    emptyTitle: 'No tasks yet',
    emptyBody: 'Create a task to start planning this sprint.',
    progressTemplate: '{{done}} of {{total}} tasks done',
    assignedTemplate: 'Assigned to {{name}}',
  },
  fr: {
    createTask: 'Créer une tâche',
    saveChanges: 'Enregistrer les modifications',
    deleteTask: 'Supprimer la tâche',
    overdue: 'En retard',
    backlog: 'Backlog',
    projectName: 'Site web v1',
    projectMeta: 'Sprint 4 · 6 jours restants',
    emptyTitle: 'Aucune tâche pour le moment',
    emptyBody: 'Créez une tâche pour commencer à planifier ce sprint.',
    progressTemplate: '{{done}} tâches sur {{total}} terminées',
    assignedTemplate: 'Assignée à {{name}}',
  },
  ar: {
    createTask: 'إنشاء مهمة',
    saveChanges: 'حفظ التغييرات',
    deleteTask: 'حذف المهمة',
    overdue: 'متأخرة',
    backlog: 'الأعمال المتراكمة',
    projectName: 'الموقع الإلكتروني v1',
    projectMeta: 'سبرينت 4 · بقي 6 أيام',
    emptyTitle: 'لا توجد مهام بعد',
    emptyBody: 'أنشئ مهمة لبدء تخطيط هذا السبرينت.',
    progressTemplate: 'تم إنجاز {{done}} من أصل {{total}} مهام',
    assignedTemplate: 'مُسندة إلى {{name}}',
  },
};

/** Fills `{{name}}` placeholders. Only for the guide's samples; the app uses i18next. */
export const fillTemplate = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
