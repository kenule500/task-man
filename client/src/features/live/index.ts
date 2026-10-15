// Live updates between teammates without websockets: one poller per workspace layout (see lib/liveStore.ts).
export type { LiveChange, LiveBatch, LiveState, Viewer } from './types';
export { liveApi } from './api';
export { default as LiveSync } from './components/LiveSync';
export { default as LiveIndicator } from './components/LiveIndicator';
export { default as NewChangesPill } from './components/NewChangesPill';
export { default as PresenceBar } from './components/PresenceBar';
export { useLiveChanges } from './hooks/useLiveChanges';
export { useLiveHold } from './hooks/useLiveHold';
export { useLiveRefresh } from './hooks/useLiveRefresh';
export { useOpenTaskChanges } from './hooks/useOpenTaskChanges';
export { useTaskPresence } from './hooks/useTaskPresence';
