import { useDragHold } from '../hooks/useDragHold';
import { useLiveChanges } from '../hooks/useLiveChanges';
import NewChangesPill from './NewChangesPill';

interface LiveSyncProps {
  slug: string | undefined;
  /** The role can read tasks (the change feed needs `tasks:read`). */
  enabled: boolean;
  selfId?: string;
}

/** Mount once inside the workspace layout: runs the poller and shows the "new changes" pill. Renders no layout of its own. */
const LiveSync = ({ slug, enabled, selfId }: LiveSyncProps) => {
  useLiveChanges(slug, { enabled, selfId });
  useDragHold();
  return <NewChangesPill />;
};

export default LiveSync;
