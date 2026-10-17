import { useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, IconTile, Spinner, SwitchField, Tag, UserAvatar } from '@/components/ds';
import { Button } from '@/components/ui/button';
import ConnectionBadge from '@/features/chat/components/ConnectionBadge';
import Composer from '@/features/chat/components/Composer';
import MessageItem from '@/features/chat/components/MessageItem';
import OnlineDot from '@/features/chat/components/OnlineDot';
import TypingIndicator from '@/features/chat/components/TypingIndicator';
import type { ChatMember, ChatMessage } from '@/features/chat/types';
import ReviewResult from '@/features/ai-review/components/ReviewResult';
import VerdictBadge from '@/features/ai-review/components/VerdictBadge';
import type { AiReview, AiVerdict } from '@/features/ai-review/types';
import type { AppLanguage } from '@/i18n/language';
import { cn } from '@/lib/utils';
import { useGuidePreview } from '../previewContext';
import { CodeBlock, DataTable, DoDont, DocSection, Prose, Specimen, SubHeading } from '../kit';

// Patterns → Chat, Realtime and presence, AI features. The chat and AI specimens render the real feature components with
// sample data, so they follow the specimen language. The live-dot and new-changes specimens repeat the classes of
// features/live (LiveIndicator, NewChangesPill), whose stores are bound to the signed-in workspace.

const noop = () => undefined;

// ---------------------------------------------------------------------------
// Chat building blocks
// ---------------------------------------------------------------------------

const ANA = { _id: 'u-ana', name: 'Ana Silva', avatarUrl: '' };
const OMAR = { _id: 'u-omar', name: 'Omar Haddad', avatarUrl: '' };
const MEMBERS: ChatMember[] = [ANA, OMAR];

const message = (id: string, author: ChatMember, text: string, minutesAgo: number, editedAt: string | null = null): ChatMessage => ({
  _id: id,
  channel: 'general',
  author,
  text,
  mentions: [],
  createdAt: new Date(Date.UTC(2026, 9, 16, 9, 40 - minutesAgo)).toISOString(),
  editedAt,
  deleted: false,
});

/** Message text in the specimen language, so a right-to-left preview shows real Arabic text. */
const CHAT_TEXT: Record<AppLanguage, [string, string, string]> = {
  en: ['Sprint 4 starts tomorrow. @Omar Haddad can you check WEB-12 before the planning call?', 'It blocks the login page.', 'On it. I will push a fix this afternoon.'],
  fr: ['Le sprint 4 commence demain. @Omar Haddad peux-tu vérifier WEB-12 avant la réunion de planification ?', 'Elle bloque la page de connexion.', 'Je m’en occupe. Je pousse un correctif cet après-midi.'],
  ar: ['يبدأ السبرينت 4 غدًا. @Omar Haddad هل يمكنك مراجعة WEB-12 قبل اجتماع التخطيط؟', 'إنها تمنع صفحة تسجيل الدخول.', 'سأتولى ذلك. سأرفع إصلاحًا بعد الظهر.'],
};

const sampleMessages = (language: AppLanguage) => {
  const [first, second, third] = CHAT_TEXT[language];
  return [
    { message: message('m1', ANA, first, 10), own: false, showHeader: true },
    { message: message('m2', ANA, second, 9), own: false, showHeader: false },
    { message: message('m3', OMAR, third, 5, new Date(Date.UTC(2026, 9, 16, 9, 38)).toISOString()), own: true, showHeader: true },
  ];
};

const ChatDemo = () => {
  const { t } = useTranslation('chat');
  const { language } = useGuidePreview();
  return (
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-white">
      <ul aria-label={t('messages.listLabel')} className="list-none space-y-0 p-3 pt-6">
        {sampleMessages(language).map(item => (
          <MessageItem key={item.message._id} message={item.message} members={MEMBERS} own={item.own} showHeader={item.showHeader} onEdit={async () => undefined} onRemove={async () => undefined} />
        ))}
      </ul>
      <TypingIndicator names={['Ana Silva']} />
      <Composer channelName="# general" members={MEMBERS} selfId={OMAR._id} initialDraft="" onDraftChange={noop} onSend={async () => undefined} onTyping={noop} />
    </div>
  );
};

export const ChatPatternSection = () => (
  <DocSection
    id="p-chat"
    title="Chat building blocks"
    description="Message item, composer, typing indicator, presence dot and connection badge: the pieces of team chat, documented as a pattern."
  >
    <Specimen label="A channel: message runs, typing indicator and composer (real components, sample data)" bare>
      <ChatDemo />
    </Specimen>

    <div className="space-y-3">
      <SubHeading>The pieces</SubHeading>
      <DataTable
        caption="Chat building blocks"
        columns={['Piece', 'Where', 'Rule']}
        rows={[
          [<code key="a" className="font-mono text-xs">MessageItem</code>, 'features/chat/components', 'A run of messages by one author shows the avatar, name and time once (showHeader). Text is always plain text with @mentions highlighted, never HTML. Own messages get edit and delete on hover and focus; delete asks for confirmation.'],
          [<code key="b" className="font-mono text-xs">Composer</code>, 'features/chat/components', 'Enter sends, Shift+Enter adds a line, @ opens a listbox of members (arrows, Enter or Tab, Escape). A failed send keeps the text. A counter appears from 3,500 of 4,000 characters.'],
          [<code key="c" className="font-mono text-xs">TypingIndicator</code>, 'features/chat/components', 'One polite status line that always reserves its height (h-5) so the list never jumps. One name, two names, then “Several people”.'],
          [<code key="d" className="font-mono text-xs">OnlineDot</code>, 'features/chat/components', 'A dot with a screen-reader word (Online, Offline). Success dot for online; the dot never stands alone as the only signal.'],
          [<code key="e" className="font-mono text-xs">ConnectionBadge</code>, 'features/chat/components', 'Live, Connecting, Refreshing, Not connected: a dot and a word, with a hint in the tooltip.'],
        ]}
      />
    </div>

    <div className="space-y-3">
      <SubHeading>Rules</SubHeading>
      <Prose>
        <ul>
          <li><strong>The avatar is decoration.</strong> The name is always written next to it, so the avatar is <code>aria-hidden</code> (<code>ChatAvatar</code>).</li>
          <li><strong>Time is semantic.</strong> <code>&lt;time dateTime&gt;</code> with the full date in the title; display through <code>formatDateTimeIn</code> so it follows the language.</li>
          <li><strong>Direction.</strong> The message list mirrors in Arabic; ids, file names and URLs inside a message keep their own direction.</li>
          <li><strong>Mobile.</strong> The composer pads for the safe area and the keyboard; message actions are always visible on touch.</li>
          <li><strong>Empty, loading, error.</strong> <code>EmptyState</code> (“No messages yet”), <code>SkeletonList</code>, <code>ErrorState</code> with Try again, and a banner when the live connection falls back to polling.</li>
        </ul>
      </Prose>
    </div>
  </DocSection>
);

// ---------------------------------------------------------------------------
// Realtime and presence
// ---------------------------------------------------------------------------

type LiveState = 'live' | 'reconnecting' | 'paused';

const LIVE_DOT: Record<LiveState, string> = { live: 'bg-success-dot', reconnecting: 'bg-warning-dot', paused: 'bg-slate-400' };

const LiveDot = ({ state }: { state: LiveState }) => {
  const { t } = useTranslation('tasks');
  const label = state === 'reconnecting'
    ? t('live.reconnecting')
    : state === 'paused'
      ? t('live.paused')
      : `${t('live.upToDate')}${t('live.updatedAgo', { ago: t('live.secondsAgo', { n: 5 }) })}`;
  return (
    <span role="img" aria-label={label} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-subtle bg-canvas px-2.5 text-xs font-medium text-slate-500">
      <span aria-hidden className={cn('size-2 rounded-full', LIVE_DOT[state])} />
      <span aria-hidden>{state === 'reconnecting' ? t('live.reconnectingShort') : state === 'paused' ? t('live.paused') : t('live.liveShort')}</span>
    </span>
  );
};

const NewChangesPillDemo = () => {
  const { t } = useTranslation('tasks');
  const [pending, setPending] = useState(3);
  if (pending === 0) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setPending(3)}>Show the pill again</Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPending(0)}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-info-border bg-info-bg px-4 text-sm font-medium text-info-fg shadow-floating outline-none hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <RefreshCw className="size-4" aria-hidden />
      <span className="tabular-nums">{t('live.newChanges', { count: pending })}</span>
      <span className="text-info-fg/80">{t('live.refreshSuffix')}</span>
    </button>
  );
};

export const RealtimePatternSection = () => (
  <DocSection
    id="p-realtime"
    title="Realtime and presence"
    description="Other people’s changes arrive on their own. Say that it is live, show who is here, and never move something under a person’s hand."
  >
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Live indicator: dot and words, three states" bare>
        <div className="flex flex-wrap gap-2">
          <LiveDot state="live" />
          <LiveDot state="reconnecting" />
          <LiveDot state="paused" />
        </div>
      </Specimen>
      <Specimen label="Presence: online dot with a hidden word">
        <span className="inline-flex items-center gap-2 text-sm text-text-body">
          <span className="relative inline-flex"><UserAvatar name="Ana Silva" size="sm" /><OnlineDot online className="absolute -bottom-0.5 -end-0.5" /></span>
          Ana Silva
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-text-body">
          <span className="relative inline-flex"><UserAvatar name="Omar Haddad" size="sm" /><OnlineDot online={false} className="absolute -bottom-0.5 -end-0.5" /></span>
          Omar Haddad
        </span>
      </Specimen>
      <Specimen label="Typing indicator: one, two, several" bare>
        <div className="space-y-1">
          <TypingIndicator names={['Ana']} />
          <TypingIndicator names={['Ana', 'Omar']} />
          <TypingIndicator names={['Ana', 'Omar', 'Lea']} />
        </div>
      </Specimen>
      <Specimen label="Connection badge: live, connecting, polling">
        <ConnectionBadge status="connected" />
        <ConnectionBadge status="connecting" />
        <ConnectionBadge status="offline" />
      </Specimen>
    </div>
    <Specimen label="New-changes pill: held-back updates, applied on request">
      <NewChangesPillDemo />
    </Specimen>

    <div className="space-y-3">
      <SubHeading>Rules</SubHeading>
      <Prose>
        <ul>
          <li><strong>Words and a dot.</strong> A colored dot never carries the state alone: “Live”, “Reconnecting”, “Paused”, “Online”. Success dot for fine, warning dot for degraded, neutral for idle.</li>
          <li><strong>Polite, not assertive.</strong> Presence and typing use <code>role=&quot;status&quot;</code> with <code>aria-live=&quot;polite&quot;</code>. Only real failures use <code>role=&quot;alert&quot;</code>.</li>
          <li><strong>Never move content under a hand.</strong> While someone drags a card or has an unsaved form open, incoming changes are held and a <strong>“3 new changes”</strong> pill offers to apply them. Reserve the space of live lines (typing indicator) so lists do not jump.</li>
          <li><strong>Pause when nobody looks.</strong> Hidden tabs and idle screens stop polling and show “Paused”; the next focus catches up at once.</li>
          <li><strong>Degrade quietly.</strong> If the live connection drops, fall back to polling and say so once in a banner; do not spam toasts.</li>
          <li><strong>Time moves.</strong> “Updated 5 s ago” re-renders every five seconds so it never lies; use <code>&lt;time&gt;</code> for absolute times.</li>
          <li><strong>Language.</strong> Counts use plural keys (<code>live.newChanges_one/_other</code>, six forms in Arabic); the pill sits at the end of its row and mirrors in Arabic.</li>
        </ul>
      </Prose>
    </div>

    <DoDont
      doText="Hold live updates while a person is mid-action, tell them how many are waiting, and apply them on one press."
      dontText="Re-render a list under a drag, announce every presence change to screen readers, or show a lone green dot with no word."
    />
  </DocSection>
);

// ---------------------------------------------------------------------------
// AI features
// ---------------------------------------------------------------------------

const SAMPLE_REVIEW: AiReview = {
  _id: 'sample',
  task: 'WEB-12',
  pr: { repo: 'acme/web', number: 42, url: 'https://github.com/acme/web/pull/42', title: 'Add login form', headSha: 'abc1234' },
  status: 'completed',
  verdict: 'partial',
  summary: 'The form signs people in, but a wrong password still shows no message.',
  criteriaSource: 'explicit',
  counts: { met: 1, partial: 1, missing: 1, issues: 2 },
  truncated: true,
  omittedFiles: ['package-lock.json', 'src/generated/schema.ts'],
  model: 'qwen-max',
  usage: { inputTokens: 5200, outputTokens: 640 },
  error: '',
  requestedBy: { _id: 'u-ana', name: 'Ana Silva' },
  createdAt: '2026-10-16T10:00:00.000Z',
  startedAt: '2026-10-16T10:00:01.000Z',
  completedAt: '2026-10-16T10:01:12.000Z',
  criteria: [
    { text: 'A user can sign in with email and password', status: 'met', evidence: [{ file: 'src/login.ts', note: 'The form posts to /api/login.' }], explanation: 'Implemented in the login form.' },
    { text: 'The session lasts seven days', status: 'partial', evidence: [{ file: 'src/session.ts', note: 'The cookie lasts one day.' }], explanation: 'The expiry is shorter than asked.' },
    { text: 'A wrong password shows an error message', status: 'missing', evidence: [], explanation: 'No error state is rendered.' },
  ],
  issues: [
    { severity: 'high', category: 'security', file: 'src/login.ts', line: 12, message: 'The password is written to the log in clear text.' },
    { severity: 'low', category: 'tests', file: '', line: null, message: 'No test covers an empty password.' },
  ],
};

const OptInDemo = () => {
  const { t } = useTranslation('ai');
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <IconTile size="sm" tone="neutral"><Bot /></IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-strong">Alibaba Cloud Model Studio</p>
          <p className="text-xs text-text-subtle">{t('settings.model', { model: 'qwen-max' })}</p>
        </div>
      </div>
      <Alert tone="warning" title={t('settings.notice.title')}>{t('settings.notice.body')}</Alert>
      <SwitchField label={t('settings.enable.label')} description={t('settings.enable.description')} checked={enabled} onCheckedChange={setEnabled} />
    </div>
  );
};

const ProgressDemo = () => {
  const { t } = useTranslation('ai');
  return (
    <div className="w-full max-w-xl space-y-3">
      <div role="status" className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info-bg p-3 text-sm text-info-fg">
        <Spinner decorative />
        <p>{t('panel.progress.queued')}</p>
      </div>
      <div role="status" className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info-bg p-3 text-sm text-info-fg">
        <Spinner decorative />
        <p>{t('panel.progress.running')}</p>
      </div>
      <Alert tone="error" title={t('panel.failed.title')}>{t('panel.failed.fallback')}</Alert>
    </div>
  );
};

const VERDICTS: AiVerdict[] = ['match', 'partial', 'mismatch'];

export const AiPatternSection = () => (
  <DocSection
    id="p-ai"
    title="AI features"
    description="AI output is a suggestion from an outside processor: ask before sending anything, show progress honestly, say when a result is partial, and treat what comes back as untrusted text."
  >
    <div className="space-y-3">
      <SubHeading>Opt-in notice</SubHeading>
      <Specimen label="Before anything leaves the workspace: say what is sent, to whom, then ask" bare>
        <OptInDemo />
      </Specimen>
      <Prose>
        <ul>
          <li>The notice is a <code>warning</code> <code>Alert</code> <strong>above</strong> the switch, in plain words: what is sent (the diff and the ticket text), to which processor, and what is not (nothing while it is off).</li>
          <li>Off by default, per workspace, switched with <code>SwitchField</code> by someone with settings permission. Opting out takes effect at once.</li>
          <li>If the server has no key, say so (<code>Alert warning</code>) and disable the switch; do not hide the feature.</li>
        </ul>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>Progress and failure</SubHeading>
      <Specimen label="Waiting, running, failed" bare>
        <ProgressDemo />
      </Specimen>
      <Prose>
        <ul>
          <li>An AI run takes a minute or two: show a <code>role=&quot;status&quot;</code> block with a <code>Spinner</code> and one sentence of what is happening, not a bare spinner. Poll quietly; keep the rest of the page usable.</li>
          <li>Failures use <code>Alert tone=&quot;error&quot;</code> with what happened and a Try again action. Never show a raw provider error.</li>
          <li>Keep earlier results (history) available while a new run is in progress.</li>
        </ul>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>Verdict colors</SubHeading>
      <Specimen label="Always an icon and a word">
        {VERDICTS.map(verdict => <VerdictBadge key={verdict} verdict={verdict} />)}
      </Specimen>
      <DataTable
        caption="Verdict, criterion and severity tones"
        columns={['Meaning', 'Tone', 'Words', 'Rule']}
        rows={[
          ['Verdict', <Tag key="v1" tone="success" size="sm">success</Tag>, 'Match', 'Only when every criterion is met, there is no high-severity issue and the review was complete (capped in code on the server).'],
          ['', <Tag key="v2" tone="warning" size="sm">warning</Tag>, 'Partial', 'Part of the ticket is implemented, or the review itself was partial.'],
          ['', <Tag key="v3" tone="danger" size="sm">danger</Tag>, 'Mismatch', 'The pull request does not implement the ticket.'],
          ['Criterion', <span key="c" className="text-xs text-text-subtle">success · warning · danger</span>, 'Completed · Partial · Missing', 'A “met” criterion without evidence counts as partial.'],
          ['Issue severity', <span key="s" className="text-xs text-text-subtle">danger · warning · success</span>, 'High · Medium · Low', 'Grouped most severe first; category as a neutral tag.'],
        ]}
      />
    </div>

    <div className="space-y-3">
      <SubHeading>Result card with a partial-results banner</SubHeading>
      <Specimen label="ReviewResult: verdict, counts, summary, criteria, issues (sample data)" bare>
        <div className="w-full max-w-2xl"><ReviewResult review={SAMPLE_REVIEW} headingLevel={5} /></div>
      </Specimen>
      <Prose>
        <p>
          When part of the input could not be sent (<code>truncated</code>), a <code>warning</code> banner titled “Partial review” sits <strong>above</strong> the summary and lists the omitted files,
          because the result may miss problems. The banner is never dismissible. <code>ReviewResult</code> takes a <code>headingLevel</code> so it continues the outline of the page it sits in.
        </p>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>Untrusted content</SubHeading>
      <Prose>
        <ul>
          <li><strong>Plain text only.</strong> Model output and the ticket and pull request text it quotes are rendered as text: no <code>dangerouslySetInnerHTML</code>, no Markdown with raw HTML, no auto-run links. Wrap long strings with <code>[overflow-wrap:anywhere]</code>.</li>
          <li><strong>Server validates first.</strong> The answer must pass a schema, statuses and categories are whitelisted, criterion text comes from the ticket (not from the model), and evidence paths that are not files of the pull request are dropped.</li>
          <li><strong>Mark paths and ids left to right.</strong> File names and line numbers use <code>dir=&quot;ltr&quot;</code> and a <code>code</code> element, also inside Arabic text.</li>
          <li><strong>It is advice.</strong> Label results as AI, show the model and the time, never apply a change on its own, and keep a human action (a button) between a result and any consequence.</li>
          <li><strong>No secrets in the prompt or the UI.</strong> Tokens are write-only fields (never shown again), and the settings card says so.</li>
        </ul>
      </Prose>
    </div>

    <CodeBlock
      label="AI result states"
      code={`{!settings.enabled ? <OptInNotice />        // Alert warning + SwitchField, off by default
 : isActive(review) ? <ProgressStatus />   // role="status" + Spinner + one sentence
 : review.status === 'failed' ? <Alert tone="error" title={t('panel.failed.title')}>…</Alert>
 : <ReviewResult review={review} />}       // partial banner, verdict, counts, criteria, issues`}
    />

    <DoDont
      doText="Ask first, name the processor, show progress in words, flag partial results above the summary, and render every answer as text."
      dontText="Turn an AI feature on by default, show a spinner with no explanation, hide that a review was cut short, or render model output as HTML."
    />
  </DocSection>
);
