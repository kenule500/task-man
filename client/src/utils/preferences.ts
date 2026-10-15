// Single place that knows how per-browser view preferences are stored (never read localStorage in components).
// Preferences are cosmetic: a missing, unreadable or malformed value just means "use the defaults".

const LIST_COLUMNS_PREFIX = 'taskman.listColumns.';
const MAX_COLUMNS = 60;
const MAX_COLUMN_ID = 60;

const isColumnList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_COLUMNS && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= MAX_COLUMN_ID);

/** The task list's visible column ids chosen in a workspace, or null when the person never changed them. */
export const readListColumns = (workspaceSlug: string): string[] | null => {
  try {
    const raw = localStorage.getItem(LIST_COLUMNS_PREFIX + workspaceSlug);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isColumnList(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Remembers the visible columns of a workspace; `null` forgets the choice (back to the defaults). */
export const writeListColumns = (workspaceSlug: string, columns: readonly string[] | null): void => {
  try {
    if (columns === null) localStorage.removeItem(LIST_COLUMNS_PREFIX + workspaceSlug);
    else localStorage.setItem(LIST_COLUMNS_PREFIX + workspaceSlug, JSON.stringify(columns.slice(0, MAX_COLUMNS)));
  } catch {
    // Private mode or a full quota: the choice lasts until the page closes
  }
};
