// Deterministic label -> color mapping so the same label name always renders
// with the same pill color across cards, without needing a color picker.
const PALETTE = [
  { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-100' },
  { bg: 'bg-pink-50', text: 'text-pink-700', ring: 'ring-pink-100' },
  { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-100' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-100' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-100' },
  { bg: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-100' },
  { bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-200' },
];

export const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const getLabelStyle = (label: string) => PALETTE[hashString(label) % PALETTE.length];

// Hex values (not Tailwind classes) applied via inline style — avatar colors
// are picked per-person at render time, so a static class name wouldn't be
// visible to Tailwind's build-time scanner.
const AVATAR_PALETTE = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#F43F5E', '#06B6D4', '#6366F1', '#EC4899',
];

export const getAvatarColor = (name: string): string => AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
