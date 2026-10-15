// Generic CSV: one task per row, columns found by name (title, description, status, priority, type, labels,
// assignee_email, due_date, start_date, story_points, parent_id, id...). Also reads most spreadsheet exports.
import { allCells, columnsOf, firstCell, plural, readSheet, uniqueExternalId, WarningBag } from './sheet.js';
import { cleanText, exceeds, normalizePriority, parseCalendarDate, parseStoryPoints, splitList } from './text.js';
import { IMPORT_LIMITS, ImportParseError, type ImportItem, type ParsedImport } from './types.js';

export const NO_STATUS = 'No status';

export const CSV_TEMPLATE_HEADERS = [
  'title', 'description', 'status', 'priority', 'type', 'labels', 'assignee_email', 'due_date', 'start_date',
  'story_points', 'parent_id', 'id',
] as const;

export const parseGenericCsv = (content: string): ParsedImport => {
  const sheet = readSheet(content);
  const col = {
    title: columnsOf(sheet, 'title', 'summary', 'name', 'task', 'tasktitle', 'subject'),
    description: columnsOf(sheet, 'description', 'details', 'notes', 'body'),
    status: columnsOf(sheet, 'status', 'state', 'column', 'list', 'stage'),
    priority: columnsOf(sheet, 'priority'),
    type: columnsOf(sheet, 'type', 'issuetype', 'kind'),
    labels: columnsOf(sheet, 'labels', 'label', 'tags', 'tag'),
    assignees: columnsOf(sheet, 'assigneeemail', 'assigneeemails', 'assignee', 'assignees', 'owner'),
    due: columnsOf(sheet, 'duedate', 'due', 'deadline'),
    start: columnsOf(sheet, 'startdate', 'start'),
    points: columnsOf(sheet, 'storypoints', 'points', 'storypointestimate', 'estimate'),
    parent: columnsOf(sheet, 'parentid', 'parent', 'parentkey'),
    id: columnsOf(sheet, 'id', 'key', 'issuekey', 'externalid'),
    epic: columnsOf(sheet, 'epicid', 'epic', 'epiclink'),
    sprint: columnsOf(sheet, 'sprint', 'iteration'),
  };
  if (col.title.length === 0) {
    throw new ImportParseError('No title column found. Name one column "title" (or "summary" / "name").');
  }

  const warnings = new WarningBag();
  const items: ImportItem[] = [];
  const columns: string[] = [];
  const seenIds = new Set<string>();
  let skipped = 0;

  sheet.rows.forEach((row, index) => {
    const title = cleanText(firstCell(row, col.title), IMPORT_LIMITS.title);
    if (!title) {
      skipped++;
      warnings.add('no-title', n => `${plural(n, 'row')} without a title ${n === 1 ? 'was' : 'were'} skipped`);
      return;
    }
    const rawDescription = firstCell(row, col.description);
    if (exceeds(rawDescription, IMPORT_LIMITS.description)) {
      warnings.add('long-description', n => `${plural(n, 'description')} longer than ${IMPORT_LIMITS.description} characters ${n === 1 ? 'was' : 'were'} cut`);
    }
    if (exceeds(firstCell(row, col.title), IMPORT_LIMITS.title)) {
      warnings.add('long-title', n => `${plural(n, 'title')} longer than ${IMPORT_LIMITS.title} characters ${n === 1 ? 'was' : 'were'} cut`);
    }

    const status = cleanText(firstCell(row, col.status), IMPORT_LIMITS.status) || NO_STATUS;
    if (!columns.includes(status)) columns.push(status);

    const rawPriority = firstCell(row, col.priority);
    const priority = normalizePriority(rawPriority);
    if (rawPriority && !priority) warnings.add('priority', n => `${plural(n, 'priority value')} not recognised; ${n === 1 ? 'it was' : 'they were'} left as medium`);

    const dateOf = (columnList: number[]): string | null => {
      const raw = firstCell(row, columnList);
      if (!raw) return null;
      const day = parseCalendarDate(raw);
      if (!day) warnings.add('date', n => `${plural(n, 'date')} could not be read; use YYYY-MM-DD`);
      return day;
    };

    const rawPoints = firstCell(row, col.points);
    const storyPoints = parseStoryPoints(rawPoints);
    if (rawPoints && storyPoints === null) warnings.add('points', n => `${plural(n, 'story point value')} ignored (use a number from 0 to 100)`);

    const assignees = allCells(row, col.assignees).flatMap(value => splitList(value))
      .map(value => cleanText(value, IMPORT_LIMITS.person)).filter(Boolean);

    items.push({
      externalId: uniqueExternalId(cleanText(firstCell(row, col.id), IMPORT_LIMITS.externalId) || `row-${index + 2}`, seenIds, warnings),
      title,
      description: cleanText(rawDescription, IMPORT_LIMITS.description, true),
      status,
      priority,
      type: cleanText(firstCell(row, col.type), IMPORT_LIMITS.type),
      labels: allCells(row, col.labels).flatMap(value => splitList(value)).map(value => cleanText(value, IMPORT_LIMITS.label)).filter(Boolean),
      assigneeEmails: [...new Set(assignees)],
      dueDate: dateOf(col.due),
      startDate: dateOf(col.start),
      storyPoints,
      parentExternalId: cleanText(firstCell(row, col.parent), IMPORT_LIMITS.externalId) || null,
      epicExternalId: cleanText(firstCell(row, col.epic), IMPORT_LIMITS.externalId) || null,
      sprintName: cleanText(firstCell(row, col.sprint), IMPORT_LIMITS.sprint) || null,
      checklist: [],
      comments: [],
    });
  });

  return { items, columns, warnings: warnings.toArray(), skipped };
};

/** The CSV the import page offers as a template (header plus two example rows). */
export const csvTemplate = (): string => [
  CSV_TEMPLATE_HEADERS.join(','),
  'Design the login page,"Wireframes and a clickable prototype",In progress,high,story,"design,ux",ada@example.com,2030-06-15,2030-06-01,5,,T-1',
  'Review the copy,,To do,medium,task,content,,2030-06-20,,,T-1,T-2',
].join('\r\n') + '\r\n';
