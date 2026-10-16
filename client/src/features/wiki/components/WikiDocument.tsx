import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, FilePlus, History, MoreHorizontal, Pencil, Trash2,
} from 'lucide-react';
import { Breadcrumbs, Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { describeLastEdit } from '../lib/mentions';
import { canAddChild, planMove } from '../lib/tree';
import type { WikiMoveKind, WikiPage, WikiPageSummary } from '../types';
import MarkdownView from './MarkdownView';

interface WikiDocumentProps {
  workspaceSlug: string;
  page: WikiPage;
  /** Every page of this wiki (for breadcrumbs and which moves are possible). */
  pages: readonly WikiPageSummary[];
  /** Name of the wiki: "Wiki" or the project name. */
  scopeLabel: string;
  canWrite: boolean;
  canDelete: boolean;
  pathFor: (id: string) => string;
  rootPath: string;
  ancestors: readonly WikiPageSummary[];
  onEdit: () => void;
  onHistory: () => void;
  onNewSubpage: () => void;
  onMove: (kind: WikiMoveKind) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

const ITEM = 'min-h-11 md:min-h-0';

/** Reading view of a page: breadcrumbs, title, last edit, actions and the rendered Markdown. */
const WikiDocument = ({
  workspaceSlug, page, pages, scopeLabel, canWrite, canDelete, pathFor, rootPath, ancestors,
  onEdit, onHistory, onNewSubpage, onMove, onToggleArchive, onDelete,
}: WikiDocumentProps) => {
  const { t } = useTranslation('projects');
  const moves: { kind: WikiMoveKind; label: string; icon: typeof ArrowUp }[] = [
    { kind: 'up', label: t('wiki.doc.moveUp'), icon: ArrowUp },
    { kind: 'down', label: t('wiki.doc.moveDown'), icon: ArrowDown },
    { kind: 'indent', label: t('wiki.doc.indent'), icon: ChevronsRight },
    { kind: 'outdent', label: t('wiki.doc.outdent'), icon: ChevronsLeft },
  ];

  return (
    <Surface padding="none" radius="xl" className="overflow-hidden">
      <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <Breadcrumbs
          label={t('wiki.doc.pagePath')}
          items={[
            { label: scopeLabel, href: rootPath },
            ...ancestors.map(ancestor => ({ label: ancestor.title, href: pathFor(ancestor._id) })),
            { label: page.title },
          ]}
          renderLink={(item, className) => <Link to={item.href} className={className}>{item.label}</Link>}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="text-2xl font-bold tracking-tight break-words text-text-strong">{page.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-subtle">
              <span>{describeLastEdit(page)}</span>
              {page.archived && <Tag tone="warning" size="sm">{t('wiki.archivedTag')}</Tag>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canWrite && (
              <Button type="button" onClick={onEdit} className="h-11 bg-primary px-4 text-white hover:bg-primary-hover md:h-9">
                <Pencil aria-hidden /> {t('wiki.doc.edit')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onHistory} className="h-11 gap-1.5 md:h-9">
              <History aria-hidden /> {t('wiki.doc.history')}
            </Button>
            {(canWrite || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button type="button" variant="outline" size="icon" aria-label={t('wiki.doc.moreActions')} className="size-11 md:size-9" />}
                >
                  <MoreHorizontal aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {canWrite && (
                    <>
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={onNewSubpage} disabled={!canAddChild(pages, page._id)} className={ITEM}>
                          <FilePlus /> {t('wiki.newSubpage')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        {moves.map(({ kind, label, icon: Icon }) => (
                          <DropdownMenuItem key={kind} onClick={() => onMove(kind)} disabled={!planMove(pages, page._id, kind)} className={ITEM}>
                            <Icon /> {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onToggleArchive} className={ITEM}>
                        {page.archived ? <ArchiveRestore /> : <Archive />} {page.archived ? t('wiki.doc.restoreFromArchive') : t('wiki.doc.archive')}
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      {canWrite && <DropdownMenuSeparator />}
                      <DropdownMenuItem variant="destructive" onClick={onDelete} className={ITEM}>
                        <Trash2 /> {t('wiki.doc.deletePage')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-6">
        {page.content.trim() ? (
          <MarkdownView source={page.content} workspaceSlug={workspaceSlug} mentions={page.mentions} />
        ) : (
          <p className="text-sm text-text-subtle">
            {t('wiki.doc.empty')}{canWrite ? t('wiki.doc.chooseEdit') : ''}
          </p>
        )}
      </div>
    </Surface>
  );
};

export default WikiDocument;
