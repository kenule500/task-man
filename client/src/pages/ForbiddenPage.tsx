import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

interface ForbiddenPageProps {
  requiredPermission?: string;
}

const ForbiddenPage = ({ requiredPermission }: ForbiddenPageProps) => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { role } = usePermissions();

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Access Denied
        </h1>
        <p className="text-slate-500 mb-6 text-sm leading-relaxed">
          You don't have permission to view this page
          {role ? (
            <>
              {' '}with your current role:{' '}
              <span className="font-semibold text-slate-700">{role.name}</span>
            </>
          ) : null}
          .
        </p>

        {requiredPermission && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 inline-flex items-center gap-2 mb-8">
            <span className="text-xs text-slate-500">Required:</span>
            <code className="text-xs font-mono font-semibold text-slate-700">
              {requiredPermission}
            </code>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate(`/${workspaceSlug}/dashboard`)}
            className="rounded-xl gap-2 bg-primary hover:bg-primary-hover text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Need more access? Ask a workspace owner to update your role.
        </p>
      </div>
    </div>
  );
};

export default ForbiddenPage;