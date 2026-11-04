// Trello board JSON export (Menu > Print and export > Export as JSON). Lists become statuses, cards become
// tasks, checklists become the task checklist, labels and members carry over, comments come from the actions.
import { plural, WarningBag } from './sheet.js';
import { cleanText, exceeds, parseCalendarDate, parseDateTime } from './text.js';
import { IMPORT_LIMITS, ImportParseError, type ImportChecklistItem, type ImportComment, type ImportItem, type ParsedImport } from './types.js';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** How the source names a person: an email when the export has one, else the full name, else the username. */
const personName = (member: Json | undefined): string => {
  if (!member) return '';
  return cleanText(str(member.email) || str(member.fullName) || str(member.username), IMPORT_LIMITS.person);
};

export const parseTrelloJson = (content: string): ParsedImport => {
  let board: unknown;
  try {
    board = JSON.parse(content);
  } catch {
    throw new ImportParseError('This is not valid JSON. Export the board with "Export as JSON" in Trello.');
  }
  if (!isRecord(board) || !Array.isArray(board.cards) || !Array.isArray(board.lists)) {
    throw new ImportParseError('This does not look like a Trello board export (it has no "lists" and "cards")');
  }

  const warnings = new WarningBag();
  const lists = records(board.lists);
  const listById = new Map(lists.map(list => [str(list.id), list]));
  const memberById = new Map(records(board.members).map(member => [str(member.id), member]));

  const checklistsByCard = new Map<string, Json[]>();
  for (const checklist of records(board.checklists)) {
    const cardId = str(checklist.idCard);
    checklistsByCard.set(cardId, [...(checklistsByCard.get(cardId) ?? []), checklist]);
  }

  const commentsByCard = new Map<string, ImportComment[]>();
  for (const action of records(board.actions)) {
    if (action.type !== 'commentCard' || !isRecord(action.data)) continue;
    const card = isRecord(action.data.card) ? action.data.card : {};
    const text = cleanText(action.data.text, IMPORT_LIMITS.comment, true);
    const cardId = str(card.id);
    if (!text || !cardId) continue;
    const author = isRecord(action.memberCreator) ? action.memberCreator : memberById.get(str(action.idMemberCreator));
    commentsByCard.set(cardId, [...(commentsByCard.get(cardId) ?? []), {
      authorEmail: personName(author),
      text,
      createdAt: parseDateTime(str(action.date)),
    }]);
  }

  const openCards = records(board.cards).filter(card => !card.closed && !(listById.get(str(card.idList))?.closed));
  let skipped = records(board.cards).length - openCards.length;
  if (skipped > 0) warnings.note(`${plural(skipped, 'archived card')} (or in an archived list) ${skipped === 1 ? 'was' : 'were'} skipped`);

  // Board order: lists left to right, cards top to bottom
  const listPosition = (card: Json) => num(listById.get(str(card.idList))?.pos);
  openCards.sort((a, b) => listPosition(a) - listPosition(b) || num(a.pos) - num(b.pos));

  const columns: string[] = [];
  const items: ImportItem[] = [];
  const seenIds = new Set<string>();

  for (const card of openCards) {
    const title = cleanText(card.name, IMPORT_LIMITS.title);
    if (!title) {
      skipped++;
      warnings.add('no-title', n => `${plural(n, 'card')} without a name ${n === 1 ? 'was' : 'were'} skipped`);
      continue;
    }
    if (exceeds(str(card.name), IMPORT_LIMITS.title)) {
      warnings.add('long-title', n => `${plural(n, 'card name')} longer than ${IMPORT_LIMITS.title} characters ${n === 1 ? 'was' : 'were'} cut`);
    }
    if (exceeds(str(card.desc), IMPORT_LIMITS.description)) {
      warnings.add('long-description', n => `${plural(n, 'description')} longer than ${IMPORT_LIMITS.description} characters ${n === 1 ? 'was' : 'were'} cut`);
    }

    const status = cleanText(listById.get(str(card.idList))?.name, IMPORT_LIMITS.status) || 'No list';
    if (!columns.includes(status)) columns.push(status);

    const id = cleanText(card.id, IMPORT_LIMITS.externalId) || `card-${seenIds.size + 1}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const labels = records(card.labels)
      .map(label => cleanText(str(label.name) || str(label.color), IMPORT_LIMITS.label))
      .filter(Boolean);

    const assignees = Array.isArray(card.idMembers)
      ? card.idMembers.map(memberId => personName(memberById.get(str(memberId)))).filter(Boolean)
      : [];

    const checklists = checklistsByCard.get(str(card.id)) ?? [];
    const checklist: ImportChecklistItem[] = checklists.flatMap(list => records(list.checkItems)
      .map(item => ({
        text: cleanText(checklists.length > 1 && str(list.name) ? `${str(list.name)}: ${str(item.name)}` : str(item.name), IMPORT_LIMITS.checklistText),
        done: item.state === 'complete',
      }))
      .filter(item => item.text));
    if (checklist.length > IMPORT_LIMITS.checklistItems) {
      warnings.add('checklist', n => `${plural(n, 'checklist')} with more than ${IMPORT_LIMITS.checklistItems} items ${n === 1 ? 'was' : 'were'} cut`);
    }

    const dueRaw = str(card.due);
    const dueDate = parseCalendarDate(dueRaw);
    if (dueRaw && !dueDate) warnings.add('date', n => `${plural(n, 'date')} could not be read and ${n === 1 ? 'was' : 'were'} left empty`);

    items.push({
      externalId: id,
      title,
      description: cleanText(card.desc, IMPORT_LIMITS.description, true),
      status,
      priority: null,
      type: '',
      labels,
      assigneeEmails: [...new Set(assignees)],
      dueDate,
      startDate: parseCalendarDate(str(card.start)),
      storyPoints: null,
      parentExternalId: null,
      epicExternalId: null,
      sprintName: null,
      checklist: checklist.slice(0, IMPORT_LIMITS.checklistItems),
      comments: (commentsByCard.get(str(card.id)) ?? [])
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
        .slice(0, IMPORT_LIMITS.comments),
    });
  }

  return { items, columns, warnings: warnings.toArray(), skipped };
};
