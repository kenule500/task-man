import { Link, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { IconTile, Surface, Tag } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { usePermissions } from '../hooks/usePermissions';
import { roleDisplayName } from '../components/settings/rbac';

interface ForbiddenPageProps {
  requiredPermission?: string;
}

const ForbiddenPage = ({ requiredPermission }: ForbiddenPageProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { role } = usePermissions();
  const { t } = useTranslation('nav');

  return (
    <Surface padding="lg" className="mx-auto mt-6 w-full max-w-lg text-center sm:mt-12">
      <IconTile tone="danger" size="lg" className="mx-auto mb-5 size-16 rounded-2xl [&_svg]:size-8">
        <ShieldAlert />
      </IconTile>

      <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">{t('forbidden.title')}</h1>
      <p className="mb-6 text-sm leading-relaxed text-slate-600">
        {role ? (
          <Trans t={t} i18nKey="forbidden.descriptionRole" values={{ role: roleDisplayName(role) }} components={{ r: <span className="font-semibold text-slate-800" /> }} />
        ) : (
          t('forbidden.description')
        )}
      </p>

      {requiredPermission && (
        <p className="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
          {t('forbidden.requiredPermission')}
          <Tag tone="neutral">
            <code className="font-mono">{requiredPermission}</code>
          </Tag>
        </p>
      )}

      <Link
        to={workspaceSlug ? `/${workspaceSlug}/dashboard` : '/'}
        className={buttonVariants({ className: 'h-11 gap-2 rounded-lg bg-primary px-5 text-white hover:bg-primary-hover' })}
      >
        <ArrowLeft className="rtl:-scale-x-100" aria-hidden /> {t('forbidden.back')}
      </Link>
    </Surface>
  );
};

export default ForbiddenPage;
