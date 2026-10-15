import { useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { OptionCombobox, Spinner, UserAvatar, type ComboboxOption } from '@/components/ds';
import { Button } from '@/components/ui/button';
import type { WorkspaceMember } from '@/features/workspace';
import type { TaskUser } from '../types';

interface AssigneePickerProps {
  /** Selected user ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Workspace members; only available to users who can read users. */
  members: WorkspaceMember[];
  /** False when the user may not list members: the picker is then read-only plus "Assign to me". */
  canListMembers: boolean;
  loading?: boolean;
  /** Users currently assigned to the task (names for ids that are not in `members`). */
  current: TaskUser[];
  currentUser?: { _id: string; name: string } | null;
}

/** Multi-select of workspace members; falls back to the current assignees and "Assign to me". */
const AssigneePicker = ({ value, onChange, members, canListMembers, loading = false, current, currentUser }: AssigneePickerProps) => {
  // Everyone we can name: members first, then assignees the member list does not know
  const directory = useMemo(() => {
    const map = new Map<string, TaskUser>();
    for (const user of current) map.set(user._id, user);
    if (currentUser) map.set(currentUser._id, { ...map.get(currentUser._id), ...currentUser });
    for (const member of members) map.set(member._id, { _id: member._id, name: member.name, avatarUrl: member.avatarUrl });
    return map;
  }, [current, currentUser, members]);

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter(item => item !== id));

  const isMeAssigned = Boolean(currentUser && value.includes(currentUser._id));
  const assignMe = currentUser && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => toggle(currentUser._id, !isMeAssigned)}
      className="h-9 gap-1.5 border-slate-300 text-slate-700"
    >
      <UserPlus className="size-3.5" aria-hidden /> {isMeAssigned ? 'Unassign me' : 'Assign to me'}
    </Button>
  );

  if (canListMembers) {
    // Members first, then assigned ids the member list no longer knows
    const ids = [...members.map(member => member._id), ...value.filter(id => !members.some(member => member._id === id))];
    const options: ComboboxOption[] = ids.map(id => {
      const user = directory.get(id);
      const name = user?.name ?? 'Former member';
      return {
        value: id,
        label: name,
        leading: <UserAvatar name={name} src={user?.avatarUrl || undefined} size="sm" className="size-6 text-[10px]" />,
      };
    });

    return (
      <div className="space-y-2">
        {loading ? (
          <p className="flex items-center gap-2 text-xs italic text-slate-500"><Spinner size="xs" decorative /> Loading members...</p>
        ) : options.length === 0 ? (
          <p className="text-xs italic text-slate-500">No members to assign yet.</p>
        ) : (
          <OptionCombobox
            multiple
            label="Assignees"
            options={options}
            value={value}
            onValueChange={onChange}
            placeholder={value.length === 0 ? 'Search people to assign' : 'Add another'}
            emptyText="No one matches that name."
          />
        )}
        {!isMeAssigned && assignMe}
      </div>
    );
  }

  const selected = value.map(id => directory.get(id)).filter((user): user is TaskUser => Boolean(user));
  return (
    <div className="space-y-2">
      {selected.length === 0 ? (
        <p className="text-xs italic text-slate-500">Nobody is assigned yet.</p>
      ) : (
        <ul aria-label="Assignees" className="flex flex-wrap gap-2">
          {selected.map(user => (
            <li key={user._id} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pr-2.5 pl-0.5 text-sm text-slate-700">
              <UserAvatar name={user.name} src={user.avatarUrl || undefined} size="sm" className="size-6 text-[10px]" />
              {user.name}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Ask an admin to assign other people.</p>
      {assignMe}
    </div>
  );
};

export default AssigneePicker;
