export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'user'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Same palette as workflow stages. */
export const FIELD_COLORS = ['slate', 'blue', 'violet', 'amber', 'emerald', 'rose', 'cyan'] as const;
export type FieldColor = (typeof FIELD_COLORS)[number];

export interface FieldOption {
  /** Assigned by the server; new options in a form have none. */
  id?: string;
  label: string;
  color: FieldColor;
}

/** What a task stores for one field: text, number, `YYYY-MM-DD`, option id, option ids, boolean, link or user id. */
export type CustomValue = string | number | boolean | string[];
/** `task.custom`: values by field key. */
export type CustomValues = Record<string, CustomValue>;
/** A request: `null` clears a value. */
export type CustomValuesInput = Record<string, CustomValue | null>;

export interface CustomField {
  _id: string;
  /** Slug under `task.custom`; never changes. */
  key: string;
  name: string;
  type: FieldType;
  options: (FieldOption & { id: string })[];
  /** Project names the field applies to; empty = every project. */
  projects: string[];
  required: boolean;
  order: number;
  archived: boolean;
}

/** POST /workspaces/:slug/fields */
export interface CustomFieldInput {
  name: string;
  type: FieldType;
  options?: FieldOption[];
  projects?: string[];
  required?: boolean;
}

/** PATCH /workspaces/:slug/fields/:id (type and key never change). */
export interface CustomFieldPatch {
  name?: string;
  /** Options with an id are kept (renamed, recolored); the ones left out are removed from tasks. */
  options?: FieldOption[];
  projects?: string[];
  required?: boolean;
  archived?: boolean;
}
