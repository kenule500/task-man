/** Who made a change; `null` for entries without a person (system jobs). */
export interface LiveActor {
  _id: string;
  name: string;
}

export interface LiveField {
  field: string;
  from?: string;
  to?: string;
}

/** One entry of the workspace change feed (`GET /workspaces/:slug/changes`). */
export interface LiveChange {
  id: string;
  /** "<subject>.<verb>", e.g. "task.updated" or "sprint.started". */
  action: string;
  task?: string;
  project?: string;
  sprint?: string;
  actor: LiveActor | null;
  /** Task title / project name at the time. */
  summary: string;
  fields: LiveField[];
  at: string;
}

export interface ChangesResponse {
  cursor: string;
  changes: LiveChange[];
  /** Too many changes piled up: reload everything instead of replaying them. */
  reset?: boolean;
}

/** Changes made by other people, delivered to the caches. */
export interface LiveBatch {
  slug: string;
  changes: LiveChange[];
  /** The caches must reload (feed overflow, or the user pressed Refresh). */
  reset: boolean;
}

export interface Viewer {
  _id: string;
  name: string;
  avatarUrl?: string;
}

/** `off`: not polling; `live`: last poll worked; `reconnecting`: last poll failed; `paused`: tab hidden or user idle. */
export type LiveState = 'off' | 'live' | 'reconnecting' | 'paused';
