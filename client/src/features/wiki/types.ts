export const MAX_PAGE_TITLE = 120;
// Markdown source, in characters
export const MAX_PAGE_CONTENT = 100_000;
// Root = level 1
export const MAX_PAGE_DEPTH = 3;

export interface WikiUser {
  _id: string;
  name: string;
  avatarUrl?: string;
}

/** A page as listed in the tree (no content). */
export interface WikiPageSummary {
  _id: string;
  /** Project name; '' = workspace wiki */
  project: string;
  parent: string | null;
  title: string;
  slug: string;
  position: number;
  version: number;
  archived: boolean;
  createdBy: WikiUser | null;
  updatedBy: WikiUser | null;
  createdAt: string;
  updatedAt: string;
}

/** A task key written in the page ("WEB-12") that matches a real task. */
export interface WikiMention {
  key: string;
  id: string;
  title: string;
  status: string;
}

export interface WikiPage extends WikiPageSummary {
  content: string;
  mentions: WikiMention[];
}

export interface WikiSearchHit {
  _id: string;
  title: string;
  project: string;
  snippet: string;
  updatedAt: string;
}

export interface WikiVersionSummary {
  version: number;
  title: string;
  editedBy: WikiUser | null;
  createdAt: string;
}

export interface WikiVersionList {
  /** Version number of the live page */
  current: number;
  /** Earlier versions, newest first */
  versions: WikiVersionSummary[];
}

export interface WikiVersion extends WikiVersionSummary {
  content: string;
}

export interface WikiCreateInput {
  title: string;
  content?: string;
  project?: string;
  parent?: string | null;
}

export interface WikiPatch {
  title?: string;
  content?: string;
  archived?: boolean;
}

export type WikiSaveResult =
  | { kind: 'saved'; page: WikiPage }
  | { kind: 'conflict'; page: WikiPage };

export type WikiMoveKind = 'up' | 'down' | 'indent' | 'outdent';

export interface WikiMovePlan {
  parent: string | null;
  index: number;
}
