import { PROJECT_ICON_COMPONENTS } from '../lib/icons';
import type { ProjectIcon as ProjectIconName } from '../types';

/** Decorative icon of a project (falls back to the folder for unknown names). */
const ProjectIcon = ({ icon, className }: { icon: string | undefined; className?: string }) => {
  const Icon = PROJECT_ICON_COMPONENTS[icon as ProjectIconName] ?? PROJECT_ICON_COMPONENTS.folder;
  return <Icon aria-hidden className={className} />;
};

export default ProjectIcon;
