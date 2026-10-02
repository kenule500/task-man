import { SERVER_ORIGIN } from '../../utils/api';

export const resolveFileUrl = (url: string): string =>
  url.startsWith('http') ? url : `${SERVER_ORIGIN}${url}`;

export const isImageMimetype = (mimetype: string): boolean => mimetype.startsWith('image/');

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export type FileKind = 'image' | 'pdf' | 'spreadsheet' | 'presentation' | 'document' | 'archive' | 'other';

export const fileKindFromMimetype = (mimetype: string): FileKind => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('spreadsheet') || mimetype === 'application/vnd.ms-excel') return 'spreadsheet';
  if (mimetype.includes('presentation')) return 'presentation';
  if (mimetype.includes('word') || mimetype === 'text/plain') return 'document';
  if (mimetype.includes('zip')) return 'archive';
  return 'other';
};
