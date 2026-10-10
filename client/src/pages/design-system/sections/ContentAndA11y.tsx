import { CheckCircle2, CircleAlert, CircleDashed } from 'lucide-react';
import { Alert, Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
import { contrastRatio, formatRatio } from '../contrast';
import { DataTable, DoDont, DocSection, Prose, Specimen } from '../kit';

export const VoiceSection = () => (
  <DocSection id="content-voice" title="Voice and tone" description="Professional, literal and brief. The interface informs; it does not perform.">
    <Prose>
      <ul>
        <li><strong>Professional:</strong> plain business English, no slang, no jokes in errors.</li>
        <li><strong>Literal:</strong> name things as they are (“Sprint”, “Backlog”). One word per concept everywhere.</li>
        <li><strong>Sentence case</strong> for titles, buttons, tabs and menu items. Capitals only for proper nouns and acronyms.</li>
        <li><strong>No exclamation marks.</strong> Celebrate quietly: “Sprint 4 completed.”</li>
        <li>Address the person as “you”; refer to the product as “TaskMan” or by name of the feature, never “we” for UI that did nothing.</li>
        <li>Say what the person can do, not what the system cannot: “Add a due date” rather than “No due date set”.</li>
      </ul>
    </Prose>
    <DataTable
      caption="Tone examples"
      columns={['Instead of', 'Write']}
      rows={[
        ['Oops! Something went wrong!', 'We could not save your changes.'],
        ['Welcome back, superstar!', 'Welcome back, Ada.'],
        ['Delete This Task', 'Delete task'],
        ['You have 0 tasks', 'No tasks yet'],
        ['Sprint successfully completed!!!', 'Sprint 4 completed.'],
      ]}
    />
  </DocSection>
);

export const ErrorMessagesSection = () => (
  <DocSection id="content-errors" title="Error messages" description="Three parts, in this order: what happened, why, what to do.">
    <Specimen label="Formula" bare>
      <p className="text-sm text-text-body"><strong className="text-text-strong">What happened</strong> · <strong className="text-text-strong">why</strong> · <strong className="text-text-strong">what to do</strong></p>
    </Specimen>
    <div className="grid gap-3">
      <Alert tone="error" title="We could not save your changes">You are offline. Reconnect and try again.</Alert>
      <Alert tone="error" title="Start date is after the due date">Choose a start date on or before the due date.</Alert>
      <Alert tone="error" title="This invite link has expired">Ask an admin to send you a new invite.</Alert>
    </div>
    <Prose>
      <ul>
        <li>Keep each part to one short sentence. Skip “why” only when it is obvious from “what happened”.</li>
        <li>Never blame the person (“You entered an invalid date”): describe the field (“Enter a date like 2026-10-12”).</li>
        <li>Never show raw API errors, status codes or stack traces. Log them; show a human sentence.</li>
        <li>The message sits where the problem is: under the field, on the card, or at the top of the page.</li>
      </ul>
    </Prose>
    <DoDont
      doText="“We could not load your tasks. The server did not respond. Check your connection and try again.”"
      dontText="“Error 500”, “Something went wrong”, or “Invalid input”."
    />
  </DocSection>
);

export const ButtonLabelsSection = () => (
  <DocSection id="content-buttons" title="Button and link labels" description="Start with a verb; say what will happen.">
    <DataTable
      caption="Label rules"
      columns={['Rule', 'Good', 'Avoid']}
      rows={[
        ['Verb first, then the object', 'Create task, Start sprint', 'Task, New'],
        ['Match the dialog title', 'Dialog “Create project” → button “Create project”', 'OK, Submit, Yes'],
        ['Name the destructive result', 'Delete task, Remove member', 'Confirm, Continue'],
        ['Cancel dismisses, never “No”', 'Cancel', 'No, Close without saying what is lost'],
        ['Links say where they go', 'View sprint report', 'Click here, Read more'],
        ['Busy labels keep the verb', 'Saving…, Creating…', 'Please wait'],
        ['Two to four words', 'Add comment', 'Add a new comment to this task now'],
      ]}
    />
  </DocSection>
);

const Sample = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border-subtle bg-canvas p-3">
    <p className="text-xs text-text-subtle">{label}</p>
    <p className="mt-0.5 text-sm font-medium tabular-nums text-text-strong">{value}</p>
  </div>
);

export const FormatsSection = () => {
  const date = new Date(2026, 9, 12);
  return (
    <DocSection id="content-formats" title="Dates and numbers" description="Calendar days are strings; formatting happens at the edge, in the person’s locale.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Sample label="Date (short)" value={date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
        <Sample label="Date, no year (this year)" value={date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
        <Sample label="Number" value={new Intl.NumberFormat('en-US').format(12847)} />
        <Sample label="Percentage" value={new Intl.NumberFormat('en-US', { style: 'percent' }).format(0.62)} />
        <Sample label="Story points" value="21 of 34 points" />
        <Sample label="Duration" value="6 days left" />
        <Sample label="Relative time" value="2 hours ago" />
        <Sample label="Wire format" value="2026-10-12" />
      </div>
      <Prose>
        <ul>
          <li><strong>Dates are calendar days.</strong> Send and receive <code>YYYY-MM-DD</code>. Parse and format with <code>lib/date.ts</code> (<code>parseDateKey</code>, <code>toDateKey</code>, <code>dateKeyOf</code>); never <code>new Date('YYYY-MM-DD')</code> for display, which shifts days across time zones.</li>
          <li>Use <code>Intl</code> for locale formatting. Show the year only when it is not the current year.</li>
          <li>Numbers that change or align use <code>tabular-nums</code>. Counts above 999 use separators.</li>
          <li>Pluralize correctly (“1 task”, “2 tasks”) and never write “task(s)”.</li>
          <li>Relative times (“2 hours ago”) carry the absolute time in a <code>title</code> or <code>time</code> element.</li>
          <li>Overdue is stated in words: “Overdue by 3 days”, not only a red date.</li>
        </ul>
      </Prose>
    </DocSection>
  );
};

// ---------------------------------------------------------------------------
// Accessibility checklist
// ---------------------------------------------------------------------------

type Status = 'pass' | 'partial' | 'todo';

interface Check {
  id: string;
  title: string;
  criterion: string;
  status: Status;
  how: string;
}

const subtle = formatRatio(contrastRatio('#64748B', '#FFFFFF'));
const mediumMarker = formatRatio(contrastRatio('#B8801A', '#FFFFFF'));
const mediumText = formatRatio(contrastRatio('#8A5B0F', '#FFFFFF'));
const primaryOnWhite = formatRatio(contrastRatio('#2563EB', '#FFFFFF'));

const CHECKS: Check[] = [
  { id: 'keyboard', title: 'Keyboard operable', criterion: '2.1.1', status: 'pass', how: 'Every control is a native element or a Base UI primitive. Drag interactions have a menu or arrow-key alternative. Ctrl/Cmd+K opens the command palette.' },
  { id: 'focus', title: 'Focus visible and not obscured', criterion: '2.4.7 · 2.4.11', status: 'pass', how: 'Focus rings (3px ring or 2px primary outline) on every interactive element.' },
  { id: 'contrast', title: 'Contrast', criterion: '1.4.3 · 1.4.11', status: 'pass', how: `Text tokens pass: text-subtle ${subtle}, primary ${primaryOnWhite}, priority labels use the -fg tones (warning-fg ${mediumText}, danger-fg, success-fg). Marker colors such as warning-dot (${mediumMarker}) are kept for dots and bars only, next to a text label.` },
  { id: 'labels', title: 'Labels and instructions', criterion: '1.3.1 · 3.3.2', status: 'pass', how: 'Field pairs a visible label with hint or error via aria-describedby. Placeholders never replace labels.' },
  { id: 'landmarks', title: 'Landmarks and one h1', criterion: '1.3.1 · 2.4.1', status: 'pass', how: 'Each page has one h1 (PageHeader), a main landmark, labelled navs and a skip link on this guide.' },
  { id: 'motion', title: 'Reduced motion', criterion: '2.3.3', status: 'pass', how: 'A global prefers-reduced-motion rule collapses animations and transitions. No autoplay.' },
  { id: 'zoom', title: 'Zoom 200% and reflow', criterion: '1.4.4 · 1.4.10', status: 'pass', how: 'Layouts are mobile first with no horizontal page scroll at 360px; wide tables and code scroll inside their own box. Type and spacing use rem.' },
  { id: 'targets', title: 'Touch target size', criterion: '2.5.8', status: 'partial', how: 'Tab bar, inputs, disclosure triggers and dialogs meet 44px on phones. Compact 28–32px desktop buttons in dense tables meet the 24px minimum but not 44px.' },
  { id: 'names', title: 'Names for assistive tech', criterion: '4.1.2', status: 'pass', how: 'Icon-only buttons have aria-label; progress, groups and charts expose a name and value; decorative icons are aria-hidden.' },
  { id: 'forced', title: 'Forced colors', criterion: '1.4.11', status: 'todo', how: 'Borders carry most shape, but selected states that rely on background color alone (SegmentedControl) are not yet audited in Windows high contrast.' },
];

const STATUS_META: Record<Status, { label: string; tone: 'success' | 'warning' | 'neutral'; icon: typeof CheckCircle2; className: string }> = {
  pass: { label: 'Pass', tone: 'success', icon: CheckCircle2, className: 'text-success-fg' },
  partial: { label: 'Partial', tone: 'warning', icon: CircleAlert, className: 'text-warning-fg' },
  todo: { label: 'To audit', tone: 'neutral', icon: CircleDashed, className: 'text-text-subtle' },
};

export const AccessibilitySection = () => {
  const passing = CHECKS.filter(check => check.status === 'pass').length;
  return (
    <DocSection id="a11y" title="WCAG 2.2 AA checklist" description={`WCAG 2.2 AA. ${passing} of ${CHECKS.length} checks pass today; the rest have a named gap.`}>
      <ol className="grid gap-3 md:grid-cols-2">
        {CHECKS.map((check, index) => {
          const meta = STATUS_META[check.status];
          return (
            <li key={check.id} className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-strong"><span className="mr-1.5 tabular-nums text-text-subtle">{index + 1}.</span>{check.title}</h3>
                <Tag tone={meta.tone} size="sm"><meta.icon aria-hidden className={cn('size-3', meta.className)} />{meta.label}</Tag>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-text-subtle">WCAG {check.criterion}</p>
              <p className="mt-2 text-sm text-text-body">{check.how}</p>
            </li>
          );
        })}
      </ol>
      <Prose>
        <p>Run before merging: keyboard-only pass of the new screen, 200% zoom, 360px width, reduced motion on, and a screen reader skim of headings and landmarks. Component pages in this guide list the specific keyboard map and roles for each component.</p>
      </Prose>
      <DoDont
        doText="Fix the gap and update its status here in the same pull request."
        dontText="Mark a check as passing without testing it."
      />
    </DocSection>
  );
};
