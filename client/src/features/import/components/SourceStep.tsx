import { useId } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText } from 'lucide-react';
import { IconTile, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SOURCES, sourceInfo } from '../lib/sources';
import { csvTemplate, downloadTextFile } from '../lib/template';
import type { ImportSource } from '../types';

const ICONS = { trello: FileJson, jira: FileSpreadsheet, csv: FileText } as const;

interface SourceStepProps {
  source: ImportSource;
  onChange: (source: ImportSource) => void;
}

/** Step 1: which tool the work comes from, with the short "how to export" help of the chosen one. */
export const SourceStep = ({ source, onChange }: SourceStepProps) => {
  const name = useId();
  const info = sourceInfo(source);
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-text-strong">Where is your work now?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {SOURCES.map(item => {
            const Icon = ICONS[item.id];
            return (
              <label
                key={item.id}
                className={cn(
                  'relative flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors',
                  'hover:bg-slate-50 has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2',
                  source === item.id && 'border-primary bg-info-bg',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={item.id}
                  checked={source === item.id}
                  onChange={() => onChange(item.id)}
                  className="peer sr-only"
                />
                <IconTile size="sm" tone={source === item.id ? 'primary' : 'neutral'}><Icon /></IconTile>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-strong">{item.label}</span>
                  <span className="block text-xs text-text-body">{item.fileKind}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Surface as="section" aria-labelledby="import-help" padding="sm" className="space-y-3 shadow-none">
        <h2 id="import-help" className="text-sm font-semibold text-text-strong">How to export from {info.label}</h2>
        <p className="text-sm text-text-body">{info.summary}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-body marker:text-text-subtle">
          {info.steps.map(step => <li key={step}>{step}</li>)}
        </ol>
        <p className="text-xs text-text-subtle">{info.carries}</p>
        {source === 'csv' && (
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => downloadTextFile('taskman-import-template.csv', csvTemplate())}
          >
            <Download aria-hidden /> Download the CSV template
          </Button>
        )}
      </Surface>
    </div>
  );
};
