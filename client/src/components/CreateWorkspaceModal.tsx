import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Building2 } from 'lucide-react';

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
        <div className="px-6 pt-6 pb-5 border-b border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
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
          <div className="px-6 py-5 space-y-4">

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="workspace-name"
                className="text-sm font-medium text-slate-700"
              >
                Workspace Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp, Marketing Team, Personal"
                className="h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                maxLength={60}
                autoFocus
                required
              />
              <p className="text-xs text-slate-400">
                A URL-safe slug will be generated automatically.
              </p>
            </div>
          </div>

          {/* ===================== Footer ===================== */}
          <DialogFooter className="!m-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 sm:gap-2">
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