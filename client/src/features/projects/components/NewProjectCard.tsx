import { Plus } from 'lucide-react';

/** Dashed outline folder that opens the create dialog. */
const NewProjectCard = ({ onClick }: { onClick: () => void }) => (
  <li className="flex flex-col">
    <div aria-hidden className="-mb-0.5 h-6 w-[36%] max-w-24 rounded-t-xl border-2 border-b-0 border-dashed border-slate-300" />
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-2xl rounded-tl-none border-2 border-dashed border-slate-300 bg-white/60 p-4 text-sm font-semibold text-slate-600 transition-colors hover:border-primary hover:bg-white hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-slate-100">
        <Plus className="size-5" />
      </span>
      New project
    </button>
  </li>
);

export default NewProjectCard;
