import i18n from '@/i18n';
import { Bug, BookOpen, Briefcase, CheckSquare, Code2, FlaskConical, Folder, Megaphone, Palette, Rocket, Zap, type LucideIcon } from 'lucide-react';
import type { TaskType } from '@/features/tasks';
import type { ProjectIcon } from '../types';

export const PROJECT_ICON_COMPONENTS: Record<ProjectIcon, LucideIcon> = {
  folder: Folder,
  rocket: Rocket,
  code: Code2,
  megaphone: Megaphone,
  palette: Palette,
  bug: Bug,
  book: BookOpen,
  briefcase: Briefcase,
};

export const PROJECT_ICON_LABELS: Record<ProjectIcon, string> = {
  get folder() { return i18n.t('projects:icons.folder'); },
  get rocket() { return i18n.t('projects:icons.rocket'); },
  get code() { return i18n.t('projects:icons.code'); },
  get megaphone() { return i18n.t('projects:icons.megaphone'); },
  get palette() { return i18n.t('projects:icons.palette'); },
  get bug() { return i18n.t('projects:icons.bug'); },
  get book() { return i18n.t('projects:icons.book'); },
  get briefcase() { return i18n.t('projects:icons.briefcase'); },
};

export const iconOf = (icon: string | undefined): LucideIcon =>
  PROJECT_ICON_COMPONENTS[icon as ProjectIcon] ?? Folder;

interface TypeMeta {
  label: string;
  icon: LucideIcon;
  /** Icon color (AA on white) */
  color: string;
  /** Bar fill for charts */
  bar: string;
}

export const TASK_TYPE_META: Record<TaskType, TypeMeta> = {
  story: { get label() { return i18n.t('tasks:type.story'); }, icon: BookOpen, color: 'text-success-fg', bar: 'bg-success-dot' },
  task: { get label() { return i18n.t('tasks:type.task'); }, icon: CheckSquare, color: 'text-blue-600', bar: 'bg-blue-500' },
  bug: { get label() { return i18n.t('tasks:type.bug'); }, icon: Bug, color: 'text-danger-fg', bar: 'bg-danger-dot' },
  spike: { get label() { return i18n.t('tasks:type.spike'); }, icon: FlaskConical, color: 'text-violet-600', bar: 'bg-violet-500' },
  epic: { get label() { return i18n.t('tasks:type.epic'); }, icon: Zap, color: 'text-fuchsia-700', bar: 'bg-fuchsia-500' },
};
