import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  /** Names the block for assistive technology */
  label: string;
  code: string;
}

/** Read-only code example that scrolls sideways inside itself (never the page) and can be copied. */
export const CodeBlock = ({ label, code }: CodeBlockProps) => (
  <div>
    <div className="flex items-center justify-between gap-2 pb-1.5">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <CopyButton value={code} label={label.toLowerCase()} className="h-10 md:h-8" />
    </div>
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <code>{code}</code>
    </pre>
  </div>
);
