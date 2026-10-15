import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AtSign, Bold, Code, Heading2, Italic, Link2, List, ListChecks, type LucideIcon,
} from 'lucide-react';
import { Alert, Field, SegmentedControl, Spinner, TooltipHint } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { applyToolbarAction, insertTaskKey, type TextEdit, type ToolbarAction } from '../lib/markdown';
import { MAX_PAGE_CONTENT, MAX_PAGE_TITLE, type WikiMention } from '../types';
import MarkdownView from './MarkdownView';
import TaskMentionPicker from './TaskMentionPicker';

interface PageEditorProps {
  workspaceSlug: string;
  title: string;
  content: string;
  /** Task keys known from the saved page, so the preview can link them. */
  mentions: readonly WikiMention[];
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  dirty: boolean;
  error?: string;
}

const ACTIONS: { action: ToolbarAction; label: string; icon: LucideIcon; shortcut?: string }[] = [
  { action: 'bold', label: 'Bold', icon: Bold, shortcut: 'Ctrl+B' },
  { action: 'italic', label: 'Italic', icon: Italic, shortcut: 'Ctrl+I' },
  { action: 'heading', label: 'Heading', icon: Heading2 },
  { action: 'list', label: 'Bulleted list', icon: List },
  { action: 'checklist', label: 'Checklist', icon: ListChecks },
  { action: 'code', label: 'Code', icon: Code },
  { action: 'link', label: 'Link', icon: Link2 },
];

const TOOL = 'size-10 text-text-body md:size-8';

/** Split editor: Markdown textarea with a formatting toolbar and a live preview (tabs on phones). Ctrl/Cmd+S saves. */
const PageEditor = ({
  workspaceSlug, title, content, mentions, onTitleChange, onContentChange, onSave, onCancel, saving, dirty, error,
}: PageEditorProps) => {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [pane, setPane] = useState<'write' | 'preview'>('write');
  const [pickerOpen, setPickerOpen] = useState(false);

  // Restore the selection after React has written the new text into the textarea
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (!selection || !textarea.current) return;
    pendingSelection.current = null;
    textarea.current.focus();
    textarea.current.setSelectionRange(selection.start, selection.end);
  });

  const apply = (edit: (text: string, start: number, end: number) => TextEdit) => {
    const field = textarea.current;
    const start = field?.selectionStart ?? content.length;
    const end = field?.selectionEnd ?? content.length;
    const result = edit(content, start, end);
    if (result.text.length > MAX_PAGE_CONTENT) return;
    pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd };
    onContentChange(result.text);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      if (!saving) onSave();
    } else if (event.target === textarea.current && (key === 'b' || key === 'i')) {
      event.preventDefault();
      apply((text, start, end) => applyToolbarAction(key === 'b' ? 'bold' : 'italic', text, start, end));
    }
  };

  const titleId = `${id}-title`;
  const contentId = `${id}-content`;
  const tooLong = content.length > MAX_PAGE_CONTENT;
  const canSave = dirty && !saving && title.trim().length > 0 && !tooLong;

  return (
    <div onKeyDown={onKeyDown} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Field label="Title" htmlFor={titleId} required>
        <Input
          id={titleId}
          value={title}
          maxLength={MAX_PAGE_TITLE}
          onChange={event => onTitleChange(event.target.value)}
          autoComplete="off"
          className="h-12 text-lg font-semibold md:h-11"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
          {ACTIONS.map(({ action, label, icon: Icon, shortcut }) => (
            <TooltipHint key={action} label={shortcut ? `${label} (${shortcut})` : label}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={label}
                onClick={() => apply((text, start, end) => applyToolbarAction(action, text, start, end))}
                className={TOOL}
              >
                <Icon aria-hidden />
              </Button>
            </TooltipHint>
          ))}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button type="button" variant="ghost" size="icon" aria-label="Mention a task" title="Mention a task" className={TOOL}>
                  <AtSign aria-hidden />
                </Button>
              }
            />
            <PopoverContent aria-label="Mention a task" width="lg" className="max-w-[calc(100vw-1.5rem)]">
              <TaskMentionPicker
                workspaceSlug={workspaceSlug}
                onPick={key => {
                  setPickerOpen(false);
                  apply((text, start, end) => insertTaskKey(text, start, end, key));
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <SegmentedControl
          aria-label="Editor view"
          size="sm"
          value={pane}
          onValueChange={setPane}
          options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]}
          className="lg:hidden"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(pane === 'preview' && 'hidden lg:block')}>
          <label htmlFor={contentId} className="sr-only">Page content (Markdown)</label>
          <textarea
            id={contentId}
            ref={textarea}
            value={content}
            onChange={event => onContentChange(event.target.value)}
            spellCheck
            placeholder="Write in Markdown. Use the toolbar or type ## for headings, - for lists and WEB-12 to mention a task."
            aria-invalid={tooLong}
            className="block min-h-[50dvh] w-full resize-y rounded-lg border border-slate-300 bg-white p-3 font-mono text-base leading-6 text-text-strong outline-none placeholder:text-text-subtle focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
          <p className={cn('mt-1 text-right text-xs tabular-nums', tooLong ? 'text-danger-fg' : 'text-text-subtle')}>
            {content.length.toLocaleString('en-US')} / {MAX_PAGE_CONTENT.toLocaleString('en-US')} characters
          </p>
        </div>

        <section
          aria-label="Preview"
          className={cn('min-h-[50dvh] rounded-lg border border-slate-200 bg-white p-4', pane === 'write' && 'hidden lg:block')}
        >
          {content.trim()
            ? <MarkdownView source={content} workspaceSlug={workspaceSlug} mentions={mentions} />
            : <p className="text-sm text-text-subtle">Nothing to preview yet.</p>}
        </section>
      </div>

      <div className="sticky bottom-0 z-(--z-sticky) -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <span className="mr-auto hidden text-xs text-text-subtle sm:inline" aria-live="polite">{dirty ? 'Unsaved changes' : 'No changes yet'}</span>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="h-11 flex-1 sm:h-9 sm:flex-none">Cancel</Button>
        <Button type="button" onClick={onSave} disabled={!canSave} className="h-11 flex-1 bg-primary px-4 text-white hover:bg-primary-hover sm:h-9 sm:flex-none">
          {saving ? <><Spinner decorative /> Saving</> : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default PageEditor;
