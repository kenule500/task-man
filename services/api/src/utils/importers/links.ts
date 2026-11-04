// Decides which parent / epic links of an import can be kept under the task rules: epics are containers
// (no parent, no epic), subtasks are one level deep, a subtask inherits the epic of its parent.
import { plural, WarningBag } from './sheet.js';

export interface LinkInput {
  externalId: string;
  parentExternalId: string | null;
  epicExternalId: string | null;
}

export interface ResolvedLinks {
  parent: string | null;
  epic: string | null;
}

export const resolveLinks = (
  items: readonly LinkInput[],
  // Final task type per external id ('epic' makes an item a container)
  typeOf: (externalId: string) => string,
): { links: Map<string, ResolvedLinks>; warnings: string[] } => {
  const byId = new Map(items.map(item => [item.externalId, item]));
  const isEpic = (id: string) => typeOf(id) === 'epic';
  const warnings = new WarningBag();

  // The parent an item asks for, when that is a real, different, non-epic item
  const requestedParent = (item: LinkInput): string | null => {
    const id = item.parentExternalId;
    if (!id || id === item.externalId || !byId.has(id) || isEpic(item.externalId)) return null;
    return isEpic(id) ? null : id;
  };

  const links = new Map<string, ResolvedLinks>();
  for (const item of items) {
    let parent: string | null = null;
    let epic: string | null = null;

    if (isEpic(item.externalId)) {
      if (item.parentExternalId || item.epicExternalId) {
        warnings.add('epic-links', n => `${plural(n, 'epic')} had a parent or epic link that was dropped (epics are top level)`);
      }
      links.set(item.externalId, { parent, epic });
      continue;
    }

    const asked = item.parentExternalId;
    if (asked) {
      if (!byId.has(asked) || asked === item.externalId) {
        warnings.add('parent-missing', n => `${plural(n, 'item')} had a parent that is not in the import and ${n === 1 ? 'was' : 'were'} imported without it`);
      } else if (isEpic(asked)) {
        // A "parent" that is an epic is really the epic the item belongs to
        epic = asked;
      } else if (requestedParent(byId.get(asked) as LinkInput)) {
        warnings.add('too-deep', n => `${plural(n, 'subtask')} of a subtask ${n === 1 ? 'was' : 'were'} imported as top-level tasks (subtasks are one level deep)`);
      } else {
        parent = asked;
      }
    }

    if (item.epicExternalId && !epic) {
      if (byId.has(item.epicExternalId) && isEpic(item.epicExternalId)) epic = item.epicExternalId;
      else warnings.add('epic-missing', n => `${plural(n, 'item')} pointed to an epic that is not in the import and ${n === 1 ? 'was' : 'were'} imported without it`);
    }
    links.set(item.externalId, { parent, epic });
  }

  // Subtasks always follow the epic of their parent
  for (const link of links.values()) {
    if (link.parent) link.epic = links.get(link.parent)?.epic ?? null;
  }
  return { links, warnings: warnings.toArray() };
};
