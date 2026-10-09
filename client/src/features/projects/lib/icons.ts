import { Bug, BookOpen, Briefcase, CheckSquare, Code2, FlaskConical, Folder, Megaphone, Palette, Rocket, type LucideIcon } from 'lucide-react';
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
  folder: 'Folder',
  rocket: 'Rocket',
  code: 'Code',
  megaphone: 'Megaphone',
  palette: 'Palette',
  bug: 'Bug',
  book: 'Book',
  briefcase: 'Briefcase',
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
  story: { label: 'Story', icon: BookOpen, color: 'text-emerald-600', bar: 'bg-emerald-500' },
  task: { label: 'Task', icon: CheckSquare, color: 'text-blue-600', bar: 'bg-blue-500' },
  bug: { label: 'Bug', icon: Bug, color: 'text-red-600', bar: 'bg-red-500' },
  spike: { label: 'Spike', icon: FlaskConical, color: 'text-violet-600', bar: 'bg-violet-500' },
};
