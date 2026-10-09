/** Server limit for one attachment. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export type FileKind = 'image' | 'pdf' | 'spreadsheet' | 'presentation' | 'document' | 'archive' | 'other';

export const isImageMimetype = (mimetype: string): boolean => mimetype.startsWith('image/');

export const fileKindFromMimetype = (mimetype: string): FileKind => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('spreadsheet') || mimetype === 'application/vnd.ms-excel' || mimetype === 'text/csv') return 'spreadsheet';
  if (mimetype.includes('presentation') || mimetype === 'application/vnd.ms-powerpoint') return 'presentation';
  if (mimetype.includes('word') || mimetype === 'text/plain') return 'document';
  if (mimetype.includes('zip')) return 'archive';
  return 'other';
};

/** Client-side check before uploading; returns an error message or `null`. */
export const validateAttachment = (file: { name: string; size: number }): string | null => {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" is larger than 10 MB.`;
  return null;
};

/** Hands a downloaded blob to the browser as a file save (the download needs the auth header, so no plain link). */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
