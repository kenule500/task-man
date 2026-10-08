import { useNavigate, useParams } from 'react-router-dom';
import { Construction, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlaceholderPageProps {
  title: string;
}

const PlaceholderPage = ({ title }: PlaceholderPageProps) => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  return (
    <div className="flex flex-1 items-center justify-center min-h-[70vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 text-primary">
          <Construction className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">{title}</h1>
        <p className="text-slate-500 mb-8">
          This page is currently under construction. We're working hard to bring you this feature soon!
        </p>
        <Button
          onClick={() => navigate(`/${workspaceSlug}/dashboard`)}
          className="rounded-xl gap-2 bg-primary hover:bg-primary-hover text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default PlaceholderPage;