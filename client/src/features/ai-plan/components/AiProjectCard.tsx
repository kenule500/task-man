import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Dashed folder-shaped link on the Projects page that opens "Create a project from a document". */
const AiProjectCard = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation('aiPlan');
  return (
    <li className="flex flex-col">
      <div aria-hidden className="-mb-0.5 h-6 w-[36%] max-w-24 rounded-t-xl border-2 border-b-0 border-dashed border-info-border" />
      <Link
        to={`/${workspaceSlug}/projects/new/ai`}
        className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-2xl rounded-ss-none border-2 border-dashed border-info-border bg-info-bg/60 p-4 text-center text-sm font-semibold text-info-fg transition-colors hover:border-primary hover:bg-info-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-surface-raised">
          <Sparkles className="size-5" />
        </span>
        {t('card.title')}
        <span className="text-xs font-normal text-text-body">{t('card.hint')}</span>
      </Link>
    </li>
  );
};

export default AiProjectCard;
