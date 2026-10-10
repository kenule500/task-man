import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Clapperboard, Download, File as FileIcon, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon,
  Loader2, Paperclip, Trash2, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressBar, SectionHeader, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage, type UploadOptions } from '../api';
import { formatRelativeTime } from '../lib/date';
import {
  MAX_ATTACHMENT_BYTES, fileKindFromMimetype, formatFileSize, isImageMimetype, saveBlob, validateAttachment,
  type FileKind,
} from '../lib/files';
import type { TaskAttachment } from '../types';

const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  image: ImageIcon,
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Clapperboard,
  document: FileText,
  archive: FileArchive,
  other: FileIcon,
};

interface ThumbnailProps {
  attachment: TaskAttachment;
  load: (attachmentId: string) => Promise<Blob>;
}

/** Image preview fetched as a blob (the endpoint needs the auth header); the blob URL is revoked on unmount. */
const Thumbnail = ({ attachment, load }: ThumbnailProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    let cancelled = false;
    let url: string | null = null;

    loadRef.current(attachment._id)
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => { /* the file icon stays as the fallback */ });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment._id]);

  if (!src) return <ImageIcon className="size-5 text-slate-500" aria-hidden />;
  return <img src={src} alt={`Preview of ${attachment.originalName}`} className="size-full object-cover" />;
};

interface UploadEntry {
  key: string;
  name: string;
  percent: number;
}

export interface TaskAttachmentsProps {
  attachments: TaskAttachment[];
  /** User names by id, to show who uploaded a file. */
  userNames: Map<string, string>;
  /** Upload and delete controls need `tasks:write`. */
  canWrite: boolean;
  onUpload: (file: File, options: UploadOptions) => Promise<void>;
  onRemove: (attachmentId: string) => Promise<void>;
  onDownload: (attachmentId: string) => Promise<Blob>;
}

const TaskAttachments = ({ attachments, userNames, canWrite, onUpload, onRemove, onDownload }: TaskAttachmentsProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchUpload = (key: string, percent: number) =>
    setUploads(current => current.map(entry => (entry.key === key ? { ...entry, percent } : entry)));

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      const problem = validateAttachment(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setUploads(current => [...current, { key, name: file.name, percent: 0 }]);
      try {
        await onUpload(file, { onProgress: percent => patchUpload(key, percent) });
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(getApiErrorMessage(err, `Could not upload ${file.name}.`));
      } finally {
        setUploads(current => current.filter(entry => entry.key !== key));
      }
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void uploadFiles(files);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (canWrite) void uploadFiles(Array.from(event.dataTransfer.files));
  };

  const download = async (attachment: TaskAttachment) => {
    setBusyId(attachment._id);
    try {
      saveBlob(await onDownload(attachment._id), attachment.originalName);
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Could not download ${attachment.originalName}.`));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (attachment: TaskAttachment) => {
    setBusyId(attachment._id);
    try {
      await onRemove(attachment._id);
      toast.success(`Removed ${attachment.originalName}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Could not remove ${attachment.originalName}.`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Attachments">
      <SectionHeader title="Attachments" count={attachments.length} icon={<Paperclip className="size-4 text-slate-500" aria-hidden />} className="mb-2" />

      {attachments.length === 0 && uploads.length === 0 && (
        <p className="mb-2 text-sm text-slate-500">No attachments yet.</p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map(attachment => {
            const kind = fileKindFromMimetype(attachment.mimetype);
            const Icon = KIND_ICON[kind];
            const uploader = typeof attachment.uploadedBy === 'object'
              ? attachment.uploadedBy?.name
              : attachment.uploadedBy && userNames.get(attachment.uploadedBy);
            const busy = busyId === attachment._id;

            return (
              <li key={attachment._id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 sm:px-3">
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                  {isImageMimetype(attachment.mimetype)
                    ? <Thumbnail attachment={attachment} load={onDownload} />
                    : <Icon className="size-5 text-slate-500" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={attachment.originalName}>{attachment.originalName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {formatFileSize(attachment.size)}
                    {uploader && <> &middot; {uploader}</>}
                    {attachment.uploadedAt && <> &middot; {formatRelativeTime(attachment.uploadedAt)}</>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${attachment.originalName}`}
                  disabled={busy}
                  onClick={() => void download(attachment)}
                  className="size-10 text-slate-500 hover:bg-slate-100 sm:size-8"
                >
                  {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}
                </Button>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${attachment.originalName}`}
                    disabled={busy}
                    onClick={() => void remove(attachment)}
                    className="size-10 text-slate-500 hover:bg-red-50 hover:text-red-600 sm:size-8"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {uploads.length > 0 && (
        <ul className="mt-2 space-y-2" aria-label="Uploading">
          {uploads.map(entry => (
            <li key={entry.key} className="rounded-lg border border-dashed border-slate-300 px-3 py-2">
              <p className="truncate text-xs text-slate-600">Uploading {entry.name}</p>
              <ProgressBar value={entry.percent} label={`Uploading ${entry.name}`} showValue className="mt-1" />
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div
          data-testid="attachment-dropzone"
          onDragOver={event => {
            event.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={handleDrop}
          className={cn(
            'mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-4 text-center transition-colors sm:flex-row sm:justify-between sm:text-left',
            dragging ? 'border-primary bg-blue-50/60' : 'border-slate-300 bg-slate-50/50',
          )}
        >
          <p className="text-xs text-slate-500">
            Drag files here or choose them. Up to {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB each: images, PDF, Office, text, CSV or ZIP.
          </p>
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="h-10 shrink-0 gap-1.5 border-slate-300 text-slate-700 sm:h-9">
            <Upload className="size-4" aria-hidden /> Upload file
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="Choose files to upload"
            onChange={handleInput}
            className="sr-only"
            tabIndex={-1}
          />
        </div>
      )}
    </section>
  );
};

export default TaskAttachments;
