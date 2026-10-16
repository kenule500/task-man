import i18n from '@/i18n';
import { MAX_IMPORT_BYTES, type ImportSource } from '../types';

export interface SourceInfo {
  id: ImportSource;
  label: string;
  /** What the person uploads, in a few words. */
  fileKind: string;
  /** File extensions the picker offers. */
  extensions: string[];
  summary: string;
  /** How to get the file out of the other tool. */
  steps: string[];
  /** What carries over. */
  carries: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: 'trello',
    label: 'Trello',
    get fileKind() { return i18n.t('admin:import.sources.trello.fileKind'); },
    extensions: ['.json'],
    get summary() { return i18n.t('admin:import.sources.trello.summary'); },
    get steps() { return [1, 2, 3].map(n => i18n.t(`admin:import.sources.trello.step${n}`)); },
    get carries() { return i18n.t('admin:import.sources.trello.carries'); },
  },
  {
    id: 'jira',
    label: 'Jira',
    get fileKind() { return i18n.t('admin:import.sources.jira.fileKind'); },
    extensions: ['.csv'],
    get summary() { return i18n.t('admin:import.sources.jira.summary'); },
    get steps() { return [1, 2, 3].map(n => i18n.t(`admin:import.sources.jira.step${n}`)); },
    get carries() { return i18n.t('admin:import.sources.jira.carries'); },
  },
  {
    id: 'csv',
    get label() { return i18n.t('admin:import.sources.csv.label'); },
    get fileKind() { return i18n.t('admin:import.sources.csv.fileKind'); },
    extensions: ['.csv', '.tsv', '.txt'],
    get summary() { return i18n.t('admin:import.sources.csv.summary'); },
    get steps() { return [1, 2, 3].map(n => i18n.t(`admin:import.sources.csv.step${n}`)); },
    get carries() { return i18n.t('admin:import.sources.csv.carries'); },
  },
];

export const sourceInfo = (source: ImportSource): SourceInfo => SOURCES.find(item => item.id === source) ?? SOURCES[2];

export const formatBytes = (bytes: number): string => {
  if (bytes < 1000) return i18n.t('admin:import.bytes', { n: bytes });
  if (bytes < 1_000_000) return i18n.t('admin:import.kilobytes', { n: (bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0) });
  return i18n.t('admin:import.megabytes', { n: (bytes / 1_000_000).toFixed(1) });
};

/** Why a file cannot be used, or null when it can. */
export const checkImportFile = (file: { name: string; size: number }, source: ImportSource): string | null => {
  if (file.size === 0) return i18n.t('admin:import.fileEmpty');
  if (file.size > MAX_IMPORT_BYTES) return i18n.t('admin:import.fileTooBig', { size: formatBytes(file.size) });
  const extensions = sourceInfo(source).extensions;
  const name = file.name.toLowerCase();
  if (!extensions.some(extension => name.endsWith(extension))) {
    return i18n.t('admin:import.fileWrongType', { extensions: extensions.join(i18n.t('admin:import.fileOr')), label: sourceInfo(source).label });
  }
  return null;
};

/** The text of a file; falls back to FileReader where Blob.text is missing (older browsers, jsdom). */
export const readFileText = (file: Blob): Promise<string> => {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(i18n.t('admin:import.readError')));
    reader.readAsText(file);
  });
};
