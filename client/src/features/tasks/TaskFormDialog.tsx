import { useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle, Clapperboard, ClipboardList, File as FileIcon, FileArchive, FileSpreadsheet,
  FileText, Image as ImageIcon, ImagePlus, Link2, Paperclip, Tag, Upload, X,
} from 'lucide-react';
import type { Task, TaskAttachment, TaskInput, TaskMember, TaskPriority, TaskStatus } from './types';
import { formatStatusLabel, SUGGESTED_LABELS } from './types';
import { getLabelStyle } from './labelColors';
import { fileKindFromMimetype, formatFileSize, resolveFileUrl } from './fileHelpers';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaultStatus?: TaskStatus;
  members: TaskMember[];
  allTasks: Task[];
  onCreate: (input: TaskInput) => Promise<Task>;
  onUpdate: (taskId: string, input: TaskInput) => Promise<Task>;
  onUploadCoverImage: (taskId: string, file: File) => Promise<Task>;
  onRemoveCoverImage: (taskId: string) => Promise<Task>;
  onAddAttachment: (taskId: string, file: File) => Promise<Task>;
  onRemoveAttachment: (taskId: string, attachmentId: string) => Promise<Task>;
}

const toDateInputValue = (iso?: string) => {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

const FILE_KIND_ICON: Record<string, typeof FileIcon> = {
  image: ImageIcon,
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Clapperboard,
  document: FileText,
  archive: FileArchive,
  other: FileIcon,
};

const TaskFormDialog = ({
  open, onOpenChange, task, defaultStatus, members, allTasks,
  onCreate, onUpdate, onUploadCoverImage, onRemoveCoverImage, onAddAttachment, onRemoveAttachment,
}: TaskFormDialogProps) => {
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [dependsOnEnabled, setDependsOnEnabled] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');

  const [existingCover, setExistingCover] = useState<Task['coverImage']>(undefined);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [removeCoverFlag, setRemoveCoverFlag] = useState(false);

  const [existingAttachments, setExistingAttachments] = useState<TaskAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form fields whenever the dialog transitions from closed to
  // open, picking up whichever `task`/`defaultStatus` triggered this open.
  // Adjusted during render (not an effect) per React's "you might not need
  // an effect" guidance for resetting state on prop changes.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setStatus(task?.status ?? defaultStatus ?? 'pending');
      setPriority(task?.priority ?? 'medium');
      setStartDate(toDateInputValue(task?.startDate));
      setDeadline(toDateInputValue(task?.deadline));
      setAssignees(task?.assignees?.map(a => a._id) ?? []);
      setDependencies(task?.dependencies?.map(d => d._id) ?? []);
      setDependsOnEnabled((task?.dependencies?.length ?? 0) > 0);
      setLabels(task?.labels ?? []);
      setLabelInput('');
      setExistingCover(task?.coverImage);
      setCoverFile(null);
      setCoverPreview(null);
      setRemoveCoverFlag(false);
      setExistingAttachments(task?.attachments ?? []);
      setPendingFiles([]);
      setRemovedAttachmentIds([]);
      setError('');
      setSubmitted(false);
    }
  }

  const titleInvalid = submitted && !title.trim();

  const toggleAssignee = (id: string) => {
    setAssignees(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleDependency = (taskId: string) => {
    setDependencies(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleToggleDependsOn = () => {
    setDependsOnEnabled(prev => {
      const next = !prev;
      if (!next) setDependencies([]);
      return next;
    });
  };

  const addLabel = (value: string) => {
    const clean = value.trim();
    if (!clean || labels.includes(clean) || labels.length >= 10) return;
    setLabels(prev => [...prev, clean]);
    setLabelInput('');
  };

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setRemoveCoverFlag(false);
    e.target.value = '';
  };

  const handleRemoveCover = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(null);
    setCoverPreview(null);
    if (existingCover) setRemoveCoverFlag(true);
  };

  const handleFilesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const coverThumb = coverPreview ?? (existingCover && !removeCoverFlag ? resolveFileUrl(existingCover.url) : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!title.trim()) return;

    setError('');
    setLoading(true);
    try {
      const input: TaskInput = {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        startDate: startDate || null,
        deadline: deadline || null,
        assignees,
        dependencies,
        labels,
      };

      const saved = isEdit && task ? await onUpdate(task._id, input) : await onCreate(input);

      if (removeCoverFlag) await onRemoveCoverImage(saved._id);
      if (coverFile) await onUploadCoverImage(saved._id, coverFile);
      for (const attachmentId of removedAttachmentIds) {
        await onRemoveAttachment(saved._id, attachmentId);
      }
      for (const file of pendingFiles) {
        await onAddAttachment(saved._id, file);
      }

      onOpenChange(false);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  const dependencyOptions = allTasks.filter(t => t._id !== task?._id);
  const labelSuggestions = SUGGESTED_LABELS.filter(l => !labels.includes(l));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl gap-0 max-h-[88vh] flex flex-col">
        <div className="px-6 pt-6 pb-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogHeader className="p-0 space-y-0">
                <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                  {isEdit ? 'Edit task' : 'Create a new task'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed">
                  {isEdit ? 'Update the details below.' : 'Fill in the details to add it to your workspace.'}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Cover image */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Cover image</Label>
              {coverThumb ? (
                <div className="relative h-32 rounded-xl overflow-hidden border border-gray-200 group">
                  <img src={coverThumb} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="h-8 px-3 rounded-lg bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 shadow-sm"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveCover}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 shadow-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-24 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-xs">Add a cover image</span>
                </button>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-sm font-medium text-slate-700">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Design the onboarding flow"
                className="h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                maxLength={200}
                autoFocus
              />
              {titleInvalid && (
                <p className="text-xs text-red-600">Give this task a title so your team knows what it is.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description" className="text-sm font-medium text-slate-700">
                Description
              </Label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more context (optional)"
                maxLength={2000}
                rows={3}
                className="w-full bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none p-3 resize-none"
              />
            </div>

            {/* Labels / category */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" /> Category / labels
              </Label>
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {labels.map(label => {
                    const { bg, text } = getLabelStyle(label);
                    return (
                      <span key={label} className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
                        {label}
                        <button type="button" onClick={() => setLabels(prev => prev.filter(l => l !== label))} className="hover:opacity-70">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addLabel(labelInput); }
                  }}
                  placeholder="Type a category and press Enter"
                  maxLength={40}
                  className="h-9 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                />
              </div>
              {labelSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {labelSuggestions.slice(0, 6).map(label => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => addLabel(label)}
                      className="text-[11px] px-2 py-1 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-status" className="text-sm font-medium text-slate-700">Status</Label>
                <select
                  id="task-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 px-3 outline-none cursor-pointer"
                >
                  <option value="pending">{formatStatusLabel('pending')}</option>
                  <option value="in-progress">{formatStatusLabel('in-progress')}</option>
                  <option value="completed">{formatStatusLabel('completed')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-priority" className="text-sm font-medium text-slate-700">Priority</Label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 px-3 outline-none cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-start" className="text-sm font-medium text-slate-700">Start date</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={deadline || undefined}
                  className="h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-deadline" className="text-sm font-medium text-slate-700">Due date</Label>
                <Input
                  id="task-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  min={startDate || undefined}
                  className="h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none"
                />
              </div>
            </div>

            {/* Assignees */}
            {members.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Assignees</Label>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {members.map(m => (
                    <label key={m._id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignees.includes(m._id)}
                        onChange={() => toggleAssignee(m._id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer"
                      />
                      <span className="truncate flex-1">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" /> Attachments
              </Label>
              <div className="space-y-1.5">
                {existingAttachments.filter(a => !removedAttachmentIds.includes(a._id)).map(a => {
                  const Icon = FILE_KIND_ICON[fileKindFromMimetype(a.mimetype)];
                  return (
                    <div key={a._id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <a href={resolveFileUrl(a.url)} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-slate-700 hover:underline">
                        {a.originalName}
                      </a>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(a.size)}</span>
                      <button type="button" onClick={() => setRemovedAttachmentIds(prev => [...prev, a._id])} className="text-slate-400 hover:text-red-600 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {pendingFiles.map((file, i) => {
                  const Icon = FILE_KIND_ICON[fileKindFromMimetype(file.type)];
                  return (
                    <div key={`${file.name}-${i}`} className="flex items-center gap-2 border border-dashed border-primary/30 bg-primary/5 rounded-lg px-3 py-2 text-sm">
                      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="truncate flex-1 text-slate-700">{file.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(file.size)}</span>
                      <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-10 rounded-lg border border-dashed border-gray-300 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Attach a file or PDF
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesPick} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
            </div>

            {/* Depends on */}
            {dependencyOptions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-slate-400" /> Depends on another task
                  </Label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dependsOnEnabled}
                    onClick={handleToggleDependsOn}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${dependsOnEnabled ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${dependsOnEnabled ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                  </button>
                </div>
                {dependsOnEnabled ? (
                  <>
                    <p className="text-xs text-slate-400">
                      This task stays locked until the ones you select are completed.
                    </p>
                    <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {dependencyOptions.map(t => (
                        <label
                          key={t._id}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={dependencies.includes(t._id)}
                            onChange={() => toggleDependency(t._id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary cursor-pointer"
                          />
                          <span className="truncate flex-1">{t.title}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{formatStatusLabel(t.status)}</span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Off — this task won't wait on anything and starts in {formatStatusLabel('pending')}.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="!m-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg h-10 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm font-medium shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
            >
              {loading ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TaskFormDialog;
