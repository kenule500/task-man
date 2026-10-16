import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { UserAvatar } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  actionMeta, actorName, areaLabel, describeEntry, describeUserAgent, entryLink, fieldLabel, formatFullDateTime,
} from '../lib/format';
import type { AuditEntry } from '../types';
import { ActionBadge } from './ActionBadge';

interface AuditEntrySheetProps {
  entry: AuditEntry | null;
  slug: string;
  /** Phones get a bottom sheet, wider screens a side panel. */
  phone: boolean;
  onClose: () => void;
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-0.5 py-2.5 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
    <dd className="min-w-0 text-sm text-slate-900 [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

const Mono = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-xs tabular-nums text-slate-800">{children}</code>
);

const Value = ({ children }: { children?: string }) => {
  const { t } = useTranslation('settings');
  return children ? <span>{children}</span> : <span className="italic text-slate-600">{t('audit.change.none')}</span>;
};

/** Every field of one audit entry: when, who, what, where, the full list of changes and ids. */
export const AuditEntrySheet = ({ entry, slug, phone, onClose }: AuditEntrySheetProps) => {
  const { t } = useTranslation('settings');
  const link = entry ? entryLink(slug, entry) : null;
  const device = describeUserAgent(entry?.userAgent);

  return (
    <Sheet open={entry !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side={phone ? 'bottom' : 'right'}
        className={cn(
          'overflow-y-auto overscroll-contain bg-white pb-[env(safe-area-inset-bottom)]',
          phone ? 'max-h-[88dvh] rounded-t-2xl' : 'data-[side=right]:w-full data-[side=right]:sm:max-w-md',
        )}
      >
        {entry && (
          <>
            <SheetHeader className="gap-2 pe-12">
              <ActionBadge action={entry.action} className="w-fit" />
              <SheetTitle className="text-base font-semibold text-slate-900">{actionMeta(entry.action).label}</SheetTitle>
              <SheetDescription className="text-sm text-slate-700">{describeEntry(entry)}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-6">
              {link && (
                <Link to={link.href} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 w-fit gap-2 px-4 text-sm md:h-9')} onClick={onClose}>
                  <ExternalLink aria-hidden />
                  {link.label}
                </Link>
              )}

              <dl className="divide-y divide-slate-100 border-y border-slate-100">
                <Row label={t('audit.sheet.when')}>
                  <time dateTime={entry.createdAt} className="tabular-nums">{formatFullDateTime(entry.createdAt)}</time>
                </Row>
                <Row label={t('audit.sheet.actor')}>
                  <span className="flex items-center gap-2">
                    <UserAvatar name={actorName(entry)} src={entry.actor?.avatarUrl} size="sm" />
                    {actorName(entry)}
                  </span>
                </Row>
                <Row label={t('audit.sheet.action')}><Mono>{entry.action}</Mono></Row>
                <Row label={t('audit.sheet.area')}>{areaLabel(entry.action)}</Row>
                <Row label={t('audit.sheet.subject')}>{entry.summary || <span className="italic text-slate-600">{t('audit.change.none')}</span>}</Row>
                <Row label={t('audit.sheet.ip')}>{entry.ip ? <Mono>{entry.ip}</Mono> : <span className="italic text-slate-600">{t('audit.sheet.notRecorded')}</span>}</Row>
                <Row label={t('audit.sheet.device')}>
                  {entry.userAgent ? (
                    <>
                      <span className="block">{device}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">{entry.userAgent}</span>
                    </>
                  ) : <span className="italic text-slate-600">{t('audit.sheet.notRecorded')}</span>}
                </Row>
              </dl>

              <section aria-labelledby="audit-changes-heading">
                <h3 id="audit-changes-heading" className="mb-2 text-sm font-semibold text-slate-900">
                  {t('audit.sheet.changes')}{entry.changes.length > 0 && <span className="ms-1.5 font-normal tabular-nums text-slate-600">({entry.changes.length})</span>}
                </h3>
                {entry.changes.length === 0 ? (
                  <p className="text-sm text-slate-600">{t('audit.sheet.noChanges')}</p>
                ) : (
                  <ul className="space-y-2">
                    {entry.changes.map((change, index) => (
                      <li key={`${change.field}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                        <p className="font-medium capitalize text-slate-900">{fieldLabel(change.field)}</p>
                        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-slate-800 [overflow-wrap:anywhere]">
                          <span className="text-xs text-slate-600">{t('audit.sheet.from')}</span>
                          <Value>{change.from}</Value>
                          <span aria-hidden className="text-slate-500">{t('audit.arrow')}</span>
                          <span className="text-xs text-slate-600">{t('audit.sheet.to')}</span>
                          <Value>{change.to}</Value>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="audit-ids-heading">
                <h3 id="audit-ids-heading" className="mb-1 text-sm font-semibold text-slate-900">{t('audit.sheet.identifiers')}</h3>
                <dl className="divide-y divide-slate-100">
                  <Row label={t('audit.sheet.entry')}><Mono>{entry._id}</Mono></Row>
                  {entry.actor && <Row label={t('audit.sheet.actor')}><Mono>{entry.actor._id}</Mono></Row>}
                  {entry.task && <Row label={t('audit.sheet.task')}><Mono>{entry.task}</Mono></Row>}
                  {entry.project && <Row label={t('audit.sheet.project')}><Mono>{entry.project}</Mono></Row>}
                  {entry.sprint && <Row label={t('audit.sheet.sprint')}><Mono>{entry.sprint}</Mono></Row>}
                </dl>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
