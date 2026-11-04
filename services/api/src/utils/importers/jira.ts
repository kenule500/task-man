// Jira CSV export ("Export issues" > CSV, all fields or current fields). Column names repeat for Labels, Sprint and
// Comment, so every field is read from all of its columns.
import { allCells, columnsOf, firstCell, plural, readSheet, uniqueExternalId, WarningBag } from './sheet.js';
import {
  cleanText, exceeds, looksLikeEmail, normalizePriority, parseCalendarDate, parseDateTime, parseStoryPoints, splitList,
} from './text.js';
import { IMPORT_LIMITS, ImportParseError, type ImportComment, type ImportItem, type ParsedImport } from './types.js';

const NO_STATUS = 'No status';

/** "12/Mar/24 9:30 AM;5b10a28;Looks good" → date, author id, text (the text may hold more semicolons). */
const parseJiraComment = (raw: string): ImportComment | null => {
  const first = raw.indexOf(';');
  const second = first < 0 ? -1 : raw.indexOf(';', first + 1);
  if (first < 0 || second < 0) {
    const text = cleanText(raw, IMPORT_LIMITS.comment, true);
    return text ? { authorEmail: '', text, createdAt: null } : null;
  }
  const createdAt = parseDateTime(raw.slice(0, first));
  const author = raw.slice(first + 1, second).trim();
  const text = cleanText(raw.slice(second + 1), IMPORT_LIMITS.comment, true);
  if (!text) return null;
  // Jira writes an opaque account id here, which means nothing outside Jira; keep only readable names and emails
  const readable = looksLikeEmail(author) || /\s/.test(author) ? author : '';
  return { authorEmail: cleanText(readable, IMPORT_LIMITS.person), text, createdAt };
};

export const parseJiraCsv = (content: string): ParsedImport => {
  const sheet = readSheet(content);
  const col = {
    title: columnsOf(sheet, 'summary'),
    key: columnsOf(sheet, 'issuekey', 'key'),
    id: columnsOf(sheet, 'issueid', 'id'),
    type: columnsOf(sheet, 'issuetype', 'type'),
    status: columnsOf(sheet, 'status'),
    priority: columnsOf(sheet, 'priority'),
    assignee: columnsOf(sheet, 'assigneeemail', 'assignee'),
    due: columnsOf(sheet, 'duedate', 'due'),
    start: columnsOf(sheet, 'startdate', 'customfieldstartdate', 'customfieldtargetstart'),
    labels: columnsOf(sheet, 'labels'),
    parent: columnsOf(sheet, 'parent', 'parentid', 'parentkey'),
    epicLink: columnsOf(sheet, 'epiclink', 'customfieldepiclink'),
    sprint: columnsOf(sheet, 'sprint'),
    points: columnsOf(sheet, 'storypoints', 'customfieldstorypoints', 'storypointestimate', 'customfieldstorypointestimate'),
    description: columnsOf(sheet, 'description'),
    comments: columnsOf(sheet, 'comment', 'comments'),
  };
  if (col.title.length === 0) {
    throw new ImportParseError('This does not look like a Jira CSV export: there is no "Summary" column');
  }

  const warnings = new WarningBag();
  const seenIds = new Set<string>();
  const columns: string[] = [];
  const items: ImportItem[] = [];
  // Jira refers to parents by issue id or by key
  const keyById = new Map<string, string>();
  const typeByKey = new Map<string, string>();
  const parentRefs = new Map<string, string>();
  let skipped = 0;

  sheet.rows.forEach((row, index) => {
    const title = cleanText(firstCell(row, col.title), IMPORT_LIMITS.title);
    if (!title) {
      skipped++;
      warnings.add('no-title', n => `${plural(n, 'row')} without a summary ${n === 1 ? 'was' : 'were'} skipped`);
      return;
    }
    if (exceeds(firstCell(row, col.title), IMPORT_LIMITS.title)) {
      warnings.add('long-title', n => `${plural(n, 'summary', 'summaries')} longer than ${IMPORT_LIMITS.title} characters ${n === 1 ? 'was' : 'were'} cut`);
    }
    const rawDescription = firstCell(row, col.description);
    if (exceeds(rawDescription, IMPORT_LIMITS.description)) {
      warnings.add('long-description', n => `${plural(n, 'description')} longer than ${IMPORT_LIMITS.description} characters ${n === 1 ? 'was' : 'were'} cut`);
    }

    const key = cleanText(firstCell(row, col.key), IMPORT_LIMITS.externalId) || `row-${index + 2}`;
    const externalId = uniqueExternalId(key, seenIds, warnings);
    const issueId = firstCell(row, col.id);
    if (issueId) keyById.set(issueId, externalId);

    const type = cleanText(firstCell(row, col.type), IMPORT_LIMITS.type);
    typeByKey.set(externalId, type);

    const status = cleanText(firstCell(row, col.status), IMPORT_LIMITS.status) || NO_STATUS;
    if (!columns.includes(status)) columns.push(status);

    const dateOf = (columnList: number[]): string | null => {
      const raw = firstCell(row, columnList);
      if (!raw) return null;
      const day = parseCalendarDate(raw);
      if (!day) warnings.add('date', n => `${plural(n, 'date')} could not be read and ${n === 1 ? 'was' : 'were'} left empty`);
      return day;
    };

    const rawPoints = firstCell(row, col.points);
    const storyPoints = parseStoryPoints(rawPoints);
    if (rawPoints && storyPoints === null) warnings.add('points', n => `${plural(n, 'story point value')} ignored (use a number from 0 to 100)`);

    // A rolled-over issue lists every sprint it was in; the last one is where it stands now
    const sprints = allCells(row, col.sprint);
    const parentRef = firstCell(row, col.parent);
    if (parentRef) parentRefs.set(externalId, parentRef);

    const comments = allCells(row, col.comments)
      .map(parseJiraComment)
      .filter((comment): comment is ImportComment => comment !== null)
      .slice(0, IMPORT_LIMITS.comments);

    items.push({
      externalId,
      title,
      description: cleanText(rawDescription, IMPORT_LIMITS.description, true),
      status,
      priority: normalizePriority(firstCell(row, col.priority)),
      type,
      labels: allCells(row, col.labels).flatMap(value => splitList(value, /[,\s]+/))
        .map(value => cleanText(value, IMPORT_LIMITS.label)).filter(Boolean),
      assigneeEmails: splitList(firstCell(row, col.assignee), /;/).map(value => cleanText(value, IMPORT_LIMITS.person)).filter(Boolean),
      dueDate: dateOf(col.due),
      startDate: dateOf(col.start),
      storyPoints,
      parentExternalId: null,
      epicExternalId: cleanText(firstCell(row, col.epicLink), IMPORT_LIMITS.externalId) || null,
      sprintName: cleanText(sprints[sprints.length - 1] ?? '', IMPORT_LIMITS.sprint) || null,
      checklist: [],
      comments,
    });
  });

  // Second pass: a parent that is an epic is an epic link, any other parent makes the issue a subtask
  for (const item of items) {
    const ref = parentRefs.get(item.externalId);
    if (!ref) continue;
    const parentKey = seenIds.has(ref) ? ref : keyById.get(ref);
    if (!parentKey) {
      warnings.add('parent-missing', n => `${plural(n, 'issue')} point${n === 1 ? 's' : ''} to a parent that is not in the file; ${n === 1 ? 'it is' : 'they are'} imported without it`);
      continue;
    }
    if (/epic/i.test(typeByKey.get(parentKey) ?? '')) item.epicExternalId ??= parentKey;
    else item.parentExternalId = parentKey;
  }

  return { items, columns, warnings: warnings.toArray(), skipped };
};
