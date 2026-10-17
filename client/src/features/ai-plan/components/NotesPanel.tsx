import type { ReactNode } from 'react';
import { Lightbulb, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Surface } from '@/components/ds';

interface NotesPanelProps {
  assumptions: string[];
  risks: string[];
}

const NoteList = ({ icon, title, notes, empty }: { icon: ReactNode; title: string; notes: string[]; empty: string }) => (
  <div className="min-w-0 space-y-2">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-text-strong">{icon} {title}</h3>
    {notes.length === 0 ? (
      <p className="text-sm text-text-subtle">{empty}</p>
    ) : (
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-text-body marker:text-text-faint">
        {notes.map((note, index) => <li key={index} className="break-words">{note}</li>)}
      </ul>
    )}
  </div>
);

/** What the AI had to assume and what could go wrong; shown so the plan is not taken for more certain than it is. */
export const NotesPanel = ({ assumptions, risks }: NotesPanelProps) => {
  const { t } = useTranslation('aiPlan');
  return (
    <Surface as="section" aria-label={t('notes.label')} padding="md" className="grid gap-5 md:grid-cols-2">
      <NoteList icon={<Lightbulb aria-hidden className="size-4 text-warning-fg" />} title={t('notes.assumptions')} notes={assumptions} empty={t('notes.noAssumptions')} />
      <NoteList icon={<ShieldAlert aria-hidden className="size-4 text-danger-fg" />} title={t('notes.risks')} notes={risks} empty={t('notes.noRisks')} />
    </Surface>
  );
};
