import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, CornerDownRight, FolderKanban, LogOut, MoveRight, PanelLeft } from 'lucide-react';
import { I18nextProvider } from 'react-i18next';
import { IconTile, Tag } from '@/components/ds';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import i18n from '@/i18n';
import { LOCALES } from '@/i18n/format';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isRtl, type AppLanguage } from '@/i18n/language';
import { CodeBlock, ComponentDoc, DataTable, DoDont, DocSection, Prose, Specimen, SubHeading } from '../kit';
import { useGuidePreview } from '../previewContext';
import { SAMPLES, fillTemplate } from '../samples';

// Foundations → Internationalization and RTL, Content → Writing for three languages, Components → LanguageSwitcher.

/** A run of text in one language, marked up so screen readers and the browser pick the right voice and direction. */
const InLanguage = ({ language, children }: { language: AppLanguage; children: string }) => (
  <span lang={language} dir={isRtl(language) ? 'rtl' : 'ltr'}>{children}</span>
);

const code = (text: string) => <code key={text} className="font-mono text-xs">{text}</code>;

// ---------------------------------------------------------------------------
// Internationalization and RTL
// ---------------------------------------------------------------------------

const NAMESPACES: [string, string][] = [
  ['common', 'Words every screen shares (Save, Cancel, errors, dismiss). The default namespace.'],
  ['nav', 'Sidebar, tab bar, command palette, theme and language menus.'],
  ['auth', 'Sign-in, sign-up, two-factor and single sign-on.'],
  ['dashboard', 'Dashboard widgets and the get-started checklist.'],
  ['settings', 'Profile, security, workspace, roles and audit log settings.'],
  ['tasks', 'Task views, the task dialog, filters, live updates.'],
  ['projects', 'Projects, sprints, backlog.'],
  ['planning', 'Capacity and planning screens.'],
  ['reports', 'Reports and charts (velocity, burndown, flow).'],
  ['admin', 'Administration screens.'],
  ['chat', 'Channels, messages, presence.'],
  ['ai', 'AI code review: settings, progress, results.'],
  ['landing', 'The public landing page.'],
];

const PLURAL_COUNTS = [0, 1, 2, 3, 11, 100, 1000000];

const PluralTable = () => {
  const rules = SUPPORTED_LANGUAGES.map(language => ({ language, rules: new Intl.PluralRules(LOCALES[language]) }));
  return (
    <DataTable
      caption="Plural category per count and language, computed with Intl.PluralRules"
      columns={['Count', ...SUPPORTED_LANGUAGES.map(language => LANGUAGE_NAMES[language])]}
      rows={[
        ...PLURAL_COUNTS.map(count => [
          <span key="c" className="tabular-nums">{count.toLocaleString('en-US')}</span>,
          ...rules.map(item => <code key={item.language} className="font-mono text-xs">_{item.rules.select(count)}</code>),
        ]),
        [
          <span key="l">Keys to write</span>,
          ...rules.map(item => (
            <code key={item.language} className="font-mono text-xs">
              {item.rules.resolvedOptions().pluralCategories.slice().sort().map(category => `_${category}`).join(' ')}
            </code>
          )),
        ],
      ]}
    />
  );
};

const LOGICAL: [string, string, string][] = [
  ['ml-4 · mr-4', 'ms-4 · me-4', 'Margin at the start or end edge'],
  ['pl-4 · pr-4', 'ps-4 · pe-4', 'Padding at the start or end edge'],
  ['left-0 · right-0', 'start-0 · end-0', 'Absolute and fixed positions'],
  ['text-left · text-right', 'text-start · text-end', 'Text alignment'],
  ['border-l · border-r', 'border-s · border-e', 'One-sided borders'],
  ['rounded-l-xl · rounded-r-xl', 'rounded-s-xl · rounded-e-xl', 'Corner radius (rounded-tl becomes rounded-ss, and so on)'],
  ['float-left · float-right', 'float-start · float-end', 'Floats'],
  ['space-x-3', 'space-x-3 (unchanged)', 'Already logical in Tailwind 4: it uses margin-inline'],
  ['-translate-x-1/2 with left-1/2', 'kept physical on purpose', 'Centring is symmetric; safe-area insets and Base UI data-side selectors are physical too'],
];

const STAYS_LTR: [string, string][] = [
  ['Board columns (Pending, In progress, Completed)', 'A workflow reads left to right in Arabic product UIs too. The columns are wrapped in dir="ltr" and the cards set the text direction back.'],
  ['Timeline (Gantt) and roadmap', 'Time runs left to right. Task names inside bars use dir="auto" so Arabic names still read correctly.'],
  ['Charts (SVG)', 'Axes, text-anchor and the order of bars keep their meaning: [direction:ltr] on the svg. Labels are translated; the geometry is not mirrored.'],
  ['Code, ids, URLs, file paths, keyboard keys', 'WEB-12, github.com/owner/repo, Ctrl K. Wrap in dir="ltr" (or use a code element) inside Arabic text so punctuation does not jump.'],
  ['Numbers', 'Digits stay left to right inside Arabic text, and Arabic uses Western digits (0-9) so counts, keys and tables line up.'],
];

const MIRRORED_ICONS = [
  { name: 'ChevronLeft', icon: ChevronLeft },
  { name: 'ChevronRight', icon: ChevronRight },
  { name: 'ArrowLeft', icon: ArrowLeft },
  { name: 'ArrowRight', icon: ArrowRight },
  { name: 'MoveRight', icon: MoveRight },
  { name: 'CornerDownRight', icon: CornerDownRight },
  { name: 'PanelLeft', icon: PanelLeft },
  { name: 'LogOut', icon: LogOut },
];

/** Shows start/end alignment, a mirrored chevron and a left-to-right island in whichever language the guide previews. */
const DirectionProbe = () => {
  const { language } = useGuidePreview();
  const copy = SAMPLES[language];
  return (
    <div className="w-full max-w-md space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
        <IconTile><FolderKanban /></IconTile>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-semibold text-text-strong">{copy.projectName}</p>
          <p className="truncate text-xs text-text-subtle">{copy.projectMeta}</p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-text-subtle rtl:-scale-x-100" />
      </div>
      <p className="text-sm text-text-body">
        {fillTemplate(copy.assignedTemplate, { name: 'Ana' })} · <span dir="ltr" className="font-mono text-xs">WEB-12</span> · <Tag tone="danger" size="sm">{copy.overdue}</Tag>
      </p>
      <p className="text-xs text-text-subtle">
        {language === 'ar' ? 'dir="rtl": the chevron points left, the avatar column and the text swap sides, the id keeps its order.' : 'dir="ltr": switch the specimen language above to Arabic to see everything swap sides.'}
      </p>
    </div>
  );
};

const FORMAT_DATE = new Date(2026, 9, 12, 14, 5);

const formatRows: [string, (locale: string) => string][] = [
  ['Number 1234567.89', locale => new Intl.NumberFormat(locale).format(1234567.89)],
  ['Percent 0.42', locale => new Intl.NumberFormat(locale, { style: 'percent' }).format(0.42)],
  ['Date (medium)', locale => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(FORMAT_DATE)],
  ['Time', locale => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(FORMAT_DATE)],
  ['Three days ago', locale => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-3, 'day')],
];

export const I18nRtlSection = () => (
  <DocSection
    id="i18n-rtl"
    title="Internationalization and RTL"
    description="TaskMan ships in English, French and Arabic (right to left). Strings, plurals, direction, icons, fonts and formats are all part of the design system."
  >
    <Prose>
      <p>
        The language is chosen with <code>LanguageSwitcher</code> (app header, landing, sign-in) or <strong>Settings → Profile → Language</strong>. It applies at once with
        no reload, is kept in this browser (<code>taskman.language</code>) and on the account (<code>language</code> on <code>PUT /api/profile</code>). A first visit follows
        <code> navigator.languages</code>. <code>&lt;html lang dir&gt;</code> follows the language, so the browser, screen readers and the CSS logical properties all agree.
        Use the <strong>Specimen language</strong> control at the top of this guide to preview any specimen on this page in each language.
      </p>
    </Prose>

    <Specimen label="Direction probe: change the specimen language in the header" bare>
      <DirectionProbe />
    </Specimen>

    <div className="space-y-3">
      <SubHeading>Adding a string</SubHeading>
      <Prose>
        <p>
          Every visible string, accessible name and toast goes through i18next. One JSON file per namespace and language lives in <code>client/src/i18n/locales/&lt;lng&gt;/&lt;ns&gt;.json</code>.
          Components call <code>useTranslation(&apos;&lt;ns&gt;&apos;)</code>; plain helpers import <code>t</code> from <code>@/i18n</code>. English is the fallback, and
          <code> i18n/__tests__/translations.test.ts</code> fails when French or Arabic lack a key, a plural form or a placeholder that English has.
        </p>
      </Prose>
      <CodeBlock
        label="Add a plural string"
        code={`// 1. i18n/locales/en/tasks.json — then the same key in fr/tasks.json and ar/tasks.json
{
  "overdue_one": "{{count}} task overdue",
  "overdue_other": "{{count}} tasks overdue"
}

// 2. In a component
const { t } = useTranslation('tasks');
<p>{t('overdue', { count })}</p>

// 3. Outside React (validators, toasts, helpers)
import { t } from '@/i18n';
toast.error(t('tasks:saveFailed'));

// New namespace: add the three JSON files, import them in i18n/resources.ts
// and add the name to NAMESPACES.`}
      />
      <DataTable
        caption="Translation namespaces"
        columns={['Namespace', 'Holds']}
        rows={NAMESPACES.map(([name, holds]) => [code(name), holds])}
      />
    </div>

    <div className="space-y-3">
      <SubHeading>Plural rules</SubHeading>
      <Prose>
        <p>
          English needs <code>_one</code> and <code>_other</code>. French adds <code>_many</code> (for millions: “1 million de tâches”). Arabic needs all six:
          <code> _zero _one _two _few _many _other</code>. Never branch on <code>count === 1</code> in code; give i18next the count and write every form the language needs.
          The table below is computed live by the browser, so it is exactly what i18next will pick.
        </p>
      </Prose>
      <PluralTable />
    </div>

    <div className="space-y-3">
      <SubHeading>Logical classes: physical to logical</SubHeading>
      <Prose>
        <p>
          Layout uses <strong>logical</strong> utilities only, so a screen mirrors in Arabic with no extra classes. Do not write <code>ml-</code>, <code>pr-</code>, <code>left-</code> or
          <code> text-left</code> for layout.
        </p>
      </Prose>
      <DataTable
        caption="Physical Tailwind utilities and the logical class to use instead"
        columns={['Instead of', 'Write', 'Notes']}
        rows={LOGICAL.map(([physical, logical, note]) => [code(physical), code(logical), note])}
      />
    </div>

    <div className="space-y-3">
      <SubHeading>Mirrored icons</SubHeading>
      <Specimen label="Icons that point carry rtl:-scale-x-100" bare>
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
          {MIRRORED_ICONS.map(item => (
            <li key={item.name} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-canvas px-3 py-2">
              <item.icon aria-hidden className="size-4 shrink-0 text-text-body rtl:-scale-x-100" />
              <span className="min-w-0 truncate font-mono text-xs text-text-subtle">{item.name}</span>
            </li>
          ))}
        </ul>
      </Specimen>
      <Prose>
        <p>
          An expand chevron that also rotates uses <code>expanded ? &apos;rotate-90&apos; : &apos;rtl:-scale-x-100&apos;</code>: flipping and rotating together would point it up.
          Icons that do not point (check, plus, search, trash) are never mirrored. Sheets and the sidebar follow the reading direction: <code>side=&quot;left&quot;</code> means
          the start edge and opens from the right in Arabic (<code>physicalSide</code> in <code>i18n/useIsRtl.ts</code>).
        </p>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>What stays left to right, and why</SubHeading>
      <DataTable
        caption="Areas that keep left-to-right order in Arabic"
        columns={['Area', 'Why']}
        rows={STAYS_LTR.map(([area, why]) => [area, why])}
      />
      <Prose>
        <p>
          Wrap such an area in <code>dir=&quot;ltr&quot;</code> and set its text back with <code>useDir()</code> or <code>dir=&quot;auto&quot;</code>, so task names, cards and labels inside
          it still read in their own direction.
        </p>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>Arabic typography</SubHeading>
      <Prose>
        <ul>
          <li><strong>Font:</strong> Inter for Latin, <strong>Noto Sans Arabic</strong> for <code>:lang(ar)</code> (same Google Fonts origin, so the CSP is unchanged; the browser downloads only the Arabic subset).</li>
          <li><strong>No case, no tracking:</strong> <code>uppercase</code> and <code>tracking-*</code> are reset under <code>:lang(ar)</code>, so overline labels still read well.</li>
          <li><strong>Line height:</strong> Arabic has taller marks above and below the line. Do not tighten <code>leading</code> on Arabic text and do not clamp a single line to a fixed height.</li>
          <li><strong>Terms:</strong> tâche / مهمة, sprint / سبرينت, tableau / لوحة (board), backlog / الأعمال المتراكمة. The product name TaskMan is never translated.</li>
        </ul>
      </Prose>
    </div>

    <div className="space-y-3">
      <SubHeading>Numbers and dates</SubHeading>
      <Prose>
        <p>
          Display goes through <code>i18n/format.ts</code> (<code>currentLocale</code>, <code>formatNumber</code>, <code>localeFormatter</code>, <code>formatRelative</code>).
          Calendar days stay <code>YYYY-MM-DD</code> on the wire and in <code>features/tasks/lib/date.ts</code>; only the display changes. Arabic uses the
          <code> ar-u-nu-latn</code> locale: Western digits and the Gregorian calendar. English keeps the US pattern (the audit log keeps en-GB).
        </p>
      </Prose>
      <DataTable
        caption="The same value formatted for each language"
        columns={['Value', ...SUPPORTED_LANGUAGES.map(language => `${LANGUAGE_NAMES[language]} (${LOCALES[language]})`)]}
        rows={formatRows.map(([label, format]) => [
          label,
          ...SUPPORTED_LANGUAGES.map(language => <InLanguage key={language} language={language}>{format(LOCALES[language])}</InLanguage>),
        ])}
      />
    </div>

    <DoDont
      doText={<>Write <code>ms-2</code>, <code>text-start</code> and <code>rtl:-scale-x-100</code> on pointing icons, then check the screen in Arabic: no sideways scroll, nothing clipped, the primary action still on the end side.</>}
      dontText={<>Use <code>ml-2</code> or <code>text-left</code>, build a sentence by joining strings, hard-code <code>en-US</code> in a formatter, or mirror a chart or the board.</>}
    />
  </DocSection>
);

// ---------------------------------------------------------------------------
// Writing for three languages
// ---------------------------------------------------------------------------

const EXPANSION_KEYS: { label: string; pick: (copy: (typeof SAMPLES)[AppLanguage]) => string }[] = [
  { label: 'Primary button', pick: copy => copy.createTask },
  { label: 'Long button', pick: copy => copy.saveChanges },
  { label: 'Destructive button', pick: copy => copy.deleteTask },
  { label: 'Status', pick: copy => copy.overdue },
  { label: 'Empty state title', pick: copy => copy.emptyTitle },
  { label: 'Empty state body', pick: copy => copy.emptyBody },
];

const ExpansionTable = () => (
  <DataTable
    caption="The same interface strings in three languages and their length"
    columns={['String', ...SUPPORTED_LANGUAGES.map(language => LANGUAGE_NAMES[language])]}
    rows={EXPANSION_KEYS.map(({ label, pick }) => {
      const english = pick(SAMPLES.en);
      return [
        label,
        ...SUPPORTED_LANGUAGES.map(language => {
          const text = pick(SAMPLES[language]);
          const change = Math.round((text.length / english.length - 1) * 100);
          return (
            <div key={language} className="space-y-0.5">
              <InLanguage language={language}>{text}</InLanguage>
              <p className="text-xs tabular-nums text-text-subtle">
                {text.length} characters{language === 'en' ? '' : ` (${change > 0 ? '+' : ''}${change}%)`}
              </p>
            </div>
          );
        }),
      ];
    })}
  />
);

const CONCAT_ROWS = SUPPORTED_LANGUAGES.map(language => ({ language, template: SAMPLES[language].progressTemplate }));

/** A card narrow enough to make long translations wrap, written in the specimen language. */
const StressCard = () => {
  const { language } = useGuidePreview();
  const copy = SAMPLES[language];
  return (
    <div className="w-full max-w-64 space-y-3 rounded-xl border border-border bg-white p-3">
      <p className="text-sm font-semibold text-text-strong">{copy.emptyTitle}</p>
      <p className="text-sm text-text-body">{copy.emptyBody}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm">{copy.saveChanges}</Button>
        <Button size="sm" variant="outline">{copy.deleteTask}</Button>
      </div>
      <Tag tone="danger" size="sm">{copy.overdue}</Tag>
    </div>
  );
};

export const WritingSection = () => (
  <DocSection
    id="content-three-languages"
    title="Writing for three languages"
    description="English is the source, French runs longer, Arabic runs in the other direction and has six plural forms. Write strings so that all three just work."
  >
    <div className="space-y-3">
      <SubHeading>Length expansion</SubHeading>
      <Prose>
        <p>
          Plan for <strong>+40%</strong> over English: French is usually 15 to 35% longer, German-style compounds and short Arabic words can swing either way, and a button label that
          fits in English can wrap in French. Design controls to grow: no fixed widths on labels, wrap instead of clipping, <code>min-w-0</code> with <code>truncate</code> only where the full
          text is available on hover or focus.
        </p>
      </Prose>
      <ExpansionTable />
      <Specimen label="Stress test: a 16rem card in the specimen language" bare>
        <StressCard />
      </Specimen>
    </div>

    <div className="space-y-3">
      <SubHeading>Never concatenate</SubHeading>
      <Prose>
        <p>
          Word order, gender and number agreement differ by language, so a sentence is one string with placeholders. Compare the same sentence in three languages: the numbers
          move, and the Arabic noun changes form with the count.
        </p>
      </Prose>
      <DataTable
        caption="One sentence, three word orders"
        columns={['Language', 'Template', 'Rendered with done = 3 and total = 8']}
        rows={CONCAT_ROWS.map(row => [
          LANGUAGE_NAMES[row.language],
          <code key="t" dir="ltr" className="font-mono text-xs [unicode-bidi:plaintext]">{row.template}</code>,
          <InLanguage key="r" language={row.language}>{fillTemplate(row.template, { done: 3, total: 8 })}</InLanguage>,
        ])}
      />
      <CodeBlock
        label="Wrong and right"
        code={`// Wrong: the order is fixed to English, and "tasks" never agrees with the number
<p>{done} {t('of')} {total} {t('tasksDone')}</p>

// Right: one key with placeholders (and plural forms where a noun follows a count)
<p>{t('progress', { done, total, count: total })}</p>

// Markup inside a sentence: <Trans>, not string pieces
<Trans i18nKey="tasks:assignedBy" values={{ name }} components={{ strong: <strong /> }} />`}
      />
    </div>

    <div className="space-y-3">
      <SubHeading>Rules</SubHeading>
      <Prose>
        <ul>
          <li><strong>Whole sentences.</strong> Keep a full sentence in one key, with <code>{'{{placeholders}}'}</code> for names, numbers and dates.</li>
          <li><strong>Plural keys</strong> for anything that follows a count, even when English looks fine with “(s)”.</li>
          <li><strong>No text in images or icons.</strong> Charts and illustrations get a translated text alternative.</li>
          <li><strong>No idioms, jokes or slang.</strong> They do not translate; sentence case, plain verbs, no exclamation marks, as in Voice and tone.</li>
          <li><strong>Avoid gendered wording</strong> in English source text (“assignee” rather than “he or she”) so French and Arabic can choose a neutral form.</li>
          <li><strong>Do not abbreviate</strong> where the abbreviation is English-only. Use words, or units the language knows (<code>Intl</code> formats them).</li>
          <li><strong>Sort and compare</strong> with <code>localeCompare</code> and <code>Intl.Collator</code>, never with <code>&lt;</code> on strings.</li>
          <li><strong>Context for translators.</strong> Name keys by meaning (<code>tasks.empty.title</code>), not by English wording.</li>
        </ul>
      </Prose>
    </div>

    <DoDont
      doText="Give a card room to grow: let the title wrap, let buttons stack, and check the narrowest layout in French and Arabic before shipping."
      dontText="Size a button to its English label, cut a sentence in two keys, or read a count and decide the plural in code."
    />
  </DocSection>
);

// ---------------------------------------------------------------------------
// LanguageSwitcher
// ---------------------------------------------------------------------------

export const LanguageSwitcherDoc = () => (
  <ComponentDoc
    id="c-language-switcher"
    name="LanguageSwitcher"
    source="@/components/LanguageSwitcher"
    maturity="stable"
    purpose="The globe button that changes the interface language between English, Français and العربية. The choice applies at once, is kept in this browser and, when signed in, saved on the account. It sits in the app header, the landing page and the sign-in pages."
    anatomy={['Globe icon', 'Language name (from lg, or always)', 'Menu', 'Radio items, each in its own script']}
    variants={
      // The live switcher changes the real app language, so it reads the app's own i18n instance, not the preview language
      <I18nextProvider i18n={i18n}>
        <LanguageSwitcher labelFrom="always" />
        <LanguageSwitcher labelFrom="lg" />
      </I18nextProvider>
    }
    states={[
      { label: 'Closed: names the current language', node: <I18nextProvider i18n={i18n}><LanguageSwitcher labelFrom="always" /></I18nextProvider> },
      { label: 'Icon only below lg (labelFrom="lg")', node: <I18nextProvider i18n={i18n}><LanguageSwitcher /></I18nextProvider> },
    ]}
    a11y={[
      'The trigger is a button named “Language: English” (the current language in its own script); the menu is a radio group, so arrows move, Enter selects and Escape closes.',
      'Every option is written in its own script with its own lang and dir attributes (العربية is rtl), so screen readers use the right voice.',
      'Choosing a language closes the menu and updates <html lang dir> immediately: no reload, focus stays on the button.',
      'If saving on the account fails, a toast says it applies on this device only; the choice still works.',
      'Targets are 40px tall below md.',
    ]}
    doText="Show the language in its own script (Français, العربية) and put the switcher where people look first: header, sign-in, landing."
    dontText="Use flags for languages (a flag is a country), translate the language names, or hide the control inside a settings page only."
    code={`<LanguageSwitcher />               {/* name shown from lg up */}
<LanguageSwitcher labelFrom="always" />  {/* landing and sign-in */}`}
    props={[
      { name: 'labelFrom', type: "'always' | 'lg'", default: "'lg'", description: 'When the language name shows next to the globe; below that only the icon.' },
      { name: 'className', type: 'string', description: 'Extra classes for the trigger button.' },
    ]}
  />
);
