import { Suspense, lazy, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { toast } from '@/components/ds';
import { cn } from '@/lib/utils';
import { extensionOf, shouldHighlight } from '../lib/code';

// The highlighter is a separate chunk: a workspace that never pastes code never downloads it (NFR-032)
const CodeHighlighter = lazy(() => import('./CodeHighlighter'));

interface CodeCardProps {
  code: string;
  /** A language the highlighter knows, or `text`. */
  language: string;
  /** Label shown in the header, e.g. `typescript`. */
  label?: string;
  className?: string;
}

/**
 * Plain monospace body: the fallback while the highlighter loads, for an unknown language, and for a
 * snippet above the highlight cap (AC-086, NFR-032). It keeps the same Copy/Download header, so a
 * large block is still usable.
 */
const PlainCode = ({ code }: { code: string }) => (
  <pre className="overflow-x-auto p-3 text-xs leading-5 text-slate-100">
    <code>{code}</code>
  </pre>
);

/**
 * A code block in a message: language label on the left, Copy and Download on the right, a body that
 * scrolls its own horizontal overflow rather than widening the conversation (FR-081, FR-082, NFR-034).
 *
 * Both actions work without the message being editable: they act on the raw code, never on the
 * rendered tokens, and neither of them requires edit mode (AC-085).
 */
export const CodeCard = ({ code, language, label, className }: CodeCardProps) => {
  const [copied, setCopied] = useState(false);
  const shown = (label ?? language ?? 'text').trim() || 'text';

  const copy = async () => {
    try {
      // Fences are not part of the code, so what lands on the clipboard pastes back cleanly (AC-085)
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied');
      // The tick is a confirmation, not a state: it returns to the copy icon on its own
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard permission is not an error worth a red toast, but it must not be silent
      toast.error('Could not copy the code. Select it and copy manually.');
    }
  };

  const download = () => {
    try {
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `snippet.${extensionOf(language)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Released immediately: the click has already handed the bytes to the browser
      URL.revokeObjectURL(url);
      toast.success(`Snippet downloaded as ${link.download}`);
    } catch {
      toast.error('Could not download the snippet.');
    }
  };

  return (
    <figure
      className={cn(
        'mt-1 max-w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900',
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-3 py-1.5">
        <span className="truncate font-mono text-[11px] uppercase tracking-wide text-slate-400">{shown}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy ${shown} code`}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-slate-300 outline-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={download}
            aria-label={`Download ${shown} code`}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-slate-300 outline-none hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Download className="size-3.5" aria-hidden />
            <span>Download</span>
          </button>
        </span>
      </figcaption>

      {/* The body owns its horizontal scroll, so a long line never widens the message (NFR-034) */}
      <div className="max-w-full overflow-x-auto">
        {shouldHighlight(code, language) ? (
          <Suspense fallback={<PlainCode code={code} />}>
            <CodeHighlighter code={code} language={language} />
          </Suspense>
        ) : (
          <PlainCode code={code} />
        )}
      </div>
    </figure>
  );
};

export default CodeCard;