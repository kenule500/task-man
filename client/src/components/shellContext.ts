import { createContext } from 'react';

/**
 * True below WorkspaceLayout, which already renders the sidebar and content column.
 * AppShell reads it so pages that wrap themselves in AppShell do not nest a second sidebar.
 */
export const InsideWorkspaceShellContext = createContext(false);
