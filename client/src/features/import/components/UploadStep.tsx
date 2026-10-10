import { useId, useState, type DragEvent } from 'react';
import { FileUp, X } from 'lucide-react';
import { Alert, Spinner } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBytes, sourceInfo } from '../lib/sources';
import type { PickedFile } from '../hooks/useImportWizard';
import type { ImportSource } from '../types';

interface UploadStepProps {
  source: ImportSource;
  file: PickedFile | null;
  reading: boolean;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
}

/** Step 2: drop a file or pick one. The text is read in the browser and checked by the server (nothing is saved yet). */
export const UploadStep = ({ source, file, reading, error, onFile, onClear }: UploadStepProps) => {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const info = sourceInfo(source);

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor={inputId}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition-colors',
          'hover:border-primary hover:bg-info-bg has-focus-visible:border-primary has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2',
          dragging && 'border-primary bg-info-bg',
        )}
      >
        <FileUp aria-hidden className="size-8 text-text-subtle" />
        <span className="text-sm font-medium text-text-strong">Drop your {info.fileKind.toLowerCase()} here, or choose a file</span>
        <span className="text-xs text-text-subtle">{info.extensions.join(', ')} up to 2 MB, at most 2,000 items</span>
        <input
          id={inputId}
          type="file"
          accept={info.extensions.join(',')}
          className="sr-only"
          onChange={event => {
            const chosen = event.target.files?.[0];
            if (chosen) onFile(chosen);
            // The same file can be chosen again after a fix
            event.target.value = '';
          }}
        />
      </label>

      {reading && (
        <div role="status" className="flex items-center gap-2 text-sm text-text-body">
          <Spinner decorative /> Reading {file?.name ?? 'the file'}…
        </div>
      )}

      {file && !reading && !error && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-strong">{file.name}</span>
            <span className="block text-xs text-text-subtle tabular-nums">{formatBytes(file.size)}</span>
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label={`Remove ${file.name}`}>
            <X aria-hidden />
          </Button>
        </div>
      )}

      {error && <Alert tone="error" title="This file cannot be imported">{error}</Alert>}
    </div>
  );
};
