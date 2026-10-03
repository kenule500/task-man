import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, IconTile, fieldMessageId } from '@/components/ds';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Building2 } from 'lucide-react';

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
    if (!name.trim()) return;

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
      setError(axiosError.response?.data?.message || 'Failed to create workspace');
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl  gap-0">

        {/* ===================== Header ===================== */}
        <div className="px-4 sm:px-6 pt-6 pb-5 border-b border-gray-200">
          <div className="flex items-start gap-3">
            <IconTile>
              <Building2 />
            </IconTile>
            <div className="min-w-0">
              <DialogHeader className="p-0 space-y-0">
                <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                  Create a new workspace
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Workspaces are shared spaces where your team can collaborate.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* ===================== Body ===================== */}
        <form onSubmit={handleSubmit}>
          <div className="px-4 py-5 space-y-4 sm:px-6">

            {error && <Alert tone="error">{error}</Alert>}

            <Field
              label="Workspace Name"
              htmlFor="workspace-name"
              required
              hint="A URL-safe slug will be generated automatically."
            >
              <Input
                id="workspace-name"
                aria-describedby={fieldMessageId('workspace-name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp, Marketing Team, Personal"
                className="h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                maxLength={60}
                autoFocus
                required
              />
            </Field>
          </div>

          {/* ===================== Footer ===================== */}
          <DialogFooter className="!m-0 px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              className="rounded-lg h-10 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm font-medium shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
            >
              {loading ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkspaceModal;