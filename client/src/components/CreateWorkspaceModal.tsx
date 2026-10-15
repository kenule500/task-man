import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import api from '../utils/api';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import FormDialog from './FormDialog';

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const CreateWorkspaceModal = ({ open, onOpenChange, onCreated }: CreateWorkspaceModalProps) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the workspace a name.');
      document.getElementById('workspace-name')?.focus();
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.post('/workspaces', { name: name.trim() });
      const newWorkspace = response.data;

      setName('');
      onOpenChange(false);
      if (onCreated) onCreated();
      navigate(`/${newWorkspace.slug}/dashboard`, { replace: true });
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'We could not create the workspace. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setName('');
      setError('');
    }
    onOpenChange(isOpen);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      icon={<Building2 aria-hidden />}
      title="Create a new workspace"
      description="Workspaces are shared spaces where your team can collaborate."
      onSubmit={handleSubmit}
      submitLabel="Create workspace"
      submittingLabel="Creating..."
      submitting={loading}
      error={error}
    >
      <Field
        label="Workspace name"
        htmlFor="workspace-name"
        required
        hint="A URL-safe slug is generated automatically."
      >
        <Input
          id="workspace-name"
          aria-describedby={fieldMessageId('workspace-name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Corp, Marketing Team, Personal"
          className="h-11 rounded-lg border-slate-300 bg-white text-base shadow-none placeholder:text-slate-500 md:text-sm"
          maxLength={60}
          autoComplete="off"
          autoFocus
          required
        />
      </Field>
    </FormDialog>
  );
};

export default CreateWorkspaceModal;
