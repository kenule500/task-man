import { TagInput } from '@/components/ds';
import { MAX_LABELS, MAX_LABEL_LENGTH } from '../types';
import { LabelChip } from './TaskChips';

interface LabelInputProps {
  value: string[];
  onChange: (labels: string[]) => void;
  /** Labels already used in the workspace, offered as suggestions. */
  suggestions?: string[];
  id?: string;
  className?: string;
}

/** Label chip input (design-system TagInput with the deterministic label colors). */
const LabelInput = ({ value, onChange, suggestions = [], id, className }: LabelInputProps) => (
  <TagInput
    value={value}
    onChange={onChange}
    suggestions={suggestions}
    id={id}
    className={className}
    noun="label"
    max={MAX_LABELS}
    maxLength={MAX_LABEL_LENGTH}
    renderTag={(label, onRemove) => (
      <LabelChip label={label} onRemove={onRemove} className={onRemove ? undefined : 'cursor-pointer hover:brightness-95'} />
    )}
  />
);

export default LabelInput;
