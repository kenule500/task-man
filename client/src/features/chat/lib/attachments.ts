/**
 * Describing an attachment for display.
 *
 * The stored MIME type is a hint for how to render, never proof of content (NFR-040): the upload
 * allow-list remains the only gate, and a mislabelled image simply fails to decode and falls back to
 * the file card.
 */

/** How an attachment is presented: a bounded thumbnail, or a file chip with name and size. */
export type AttachmentKind = 'image' | 'file';

/**
 * Image or file, decided from the stored MIME type (FR-084, AC-087).
 * An empty type is treated as a file: rendering an unknown blob as an image would only produce a
 * broken thumbnail.
 */
export const kindOf = (type: string | null | undefined): AttachmentKind => {
  const value = (type ?? '').trim().toLowerCase();
  if (!value) return 'file';
  // SVG is deliberately included: it is an allowed upload type and renders in an <img>
  return value.startsWith('image/') ? 'image' : 'file';
};

/** Human size, e.g. `512 B`, `3 KB`, `1.4 MB`. An unusable number renders as an empty string. */
export const humanSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10} GB`;
};

/** Characters that cannot appear in a filename on Windows, plus path separators and control codes. */
// The control range is deliberate: a stored name must never smuggle a terminal escape into a download
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * A filename safe to hand to a download link, derived from the stored name (FR-084, AC-087).
 *
 * A name is stored sanitised on upload, but this is the last hop before the browser writes it to disk,
 * so it is normalised again: no directories, no control characters, no empty name.
 */
export const downloadName = (name: string | null | undefined, fallback = 'attachment'): string => {
  const cleaned = (name ?? '')
    .replace(UNSAFE_NAME, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot would create a hidden file; a trailing dot is invalid on Windows
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  if (!cleaned) return fallback;
  // Long names are truncated on a character boundary, keeping the extension
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  if (dot <= 0 || dot < cleaned.length - 12) return cleaned.slice(0, 120);
  return `${cleaned.slice(0, 120 - (cleaned.length - dot))}${cleaned.slice(dot)}`;
};